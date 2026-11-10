import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import {
  COLS,
  HEIGHT,
  R,
  ROWS,
  WIDTH,
  aimPath,
  cluster,
  colsIn,
  center,
  createGame,
  emptyGrid,
  hanging,
  landingCell,
  neighbours,
  pathLength,
  pointAlong,
  shoot,
} from './bubbles';

const rng = () => rngFrom(9);

describe('bąbelki', () => {
  it('naprzemienne wiersze mają o jeden bąbelek mniej', () => {
    expect(colsIn(0)).toBe(COLS);
    expect(colsIn(1)).toBe(COLS - 1);
  });

  it('każdy bąbelek ma sześciu sąsiadów w środku planszy', () => {
    expect(neighbours(4, 4)).toHaveLength(6);
  });

  it('strzelany prosto w górę ląduje pod sufitem', () => {
    const game = { ...createGame(rng(), 0), grid: emptyGrid() };
    const shot = shoot(game, { x: WIDTH / 2, y: 0 }, rng());
    const placed = shot.grid[0]?.filter(Boolean).length ?? 0;
    expect(placed).toBe(1);
  });

  it('odbija się od ściany', () => {
    const game = { ...createGame(rng(), 0), grid: emptyGrid() };
    // Prawie poziomo w prawo: tor załamuje się na ścianach, potem trafia w sufit.
    const { stop, path } = aimPath(game, { x: WIDTH / 2, y: HEIGHT }, { x: WIDTH - 1, y: HEIGHT - 2 });
    expect(path.length).toBeGreaterThan(2);
    expect(path.filter((point) => point.x === 16 || point.x === WIDTH - 16).length).toBeGreaterThan(0);
    expect(stop.y).toBe(16);
  });

  it('nie strzela w podłogę', () => {
    const game = { ...createGame(rng(), 0), grid: emptyGrid() };
    const { stop } = aimPath(game, { x: WIDTH / 2, y: HEIGHT }, { x: WIDTH / 2 + 100, y: HEIGHT + 50 });
    expect(stop.y).toBeLessThan(HEIGHT);
  });

  it('znajduje wolne pole przy sąsiedzie', () => {
    const grid = emptyGrid();
    grid[0][4] = '#fff';
    const [row, col] = landingCell({ ...createGame(rng(), 0), grid }, { x: 200, y: 60 });
    expect(grid[row][col]).toBe(null);
    expect(neighbours(row, col).some(([ry, cx]) => row !== ry && grid[ry]?.[cx])).toBe(true);
  });

  it('znajduje połączoną grupę tego samego koloru', () => {
    const grid = emptyGrid();
    grid[0][2] = '#f00';
    grid[0][3] = '#f00';
    grid[1][2] = '#f00';
    grid[0][5] = '#0f0';
    expect(cluster(grid, 0, 2)).toHaveLength(3);
  });

  it('odcina to, co wisi w powietrzu', () => {
    const grid = emptyGrid();
    grid[0][2] = '#f00';
    grid[3][3] = '#00f';
    expect(hanging(grid)).toEqual([[3, 3]]);
  });

  it('trzy takie same pękają, a to co pod nimi spada', () => {
    const grid = emptyGrid();
    grid[0][4] = '#f00';
    grid[0][5] = '#f00';
    grid[3][2] = '#f00'; // trzyma się nieba z łaski, poza torem strzału
    const game = { ...createGame(rng(), 0), grid, current: '#f00', next: '#0f0' };
    const shot = shoot(game, { x: 4 * 32 + 16, y: 0 }, rng());
    expect(shot.grid[0][4]).toBe(null);
    expect(shot.grid[0][5]).toBe(null);
    expect(shot.grid[3][2]).toBe(null);
    expect(shot.score).toBeGreaterThanOrEqual(50);
  });

  it('mówi widokowi, co pękło i co spadło', () => {
    const grid = emptyGrid();
    grid[0][4] = '#f00';
    grid[0][5] = '#f00';
    grid[3][2] = '#f00';
    const game = { ...createGame(rng(), 0), grid, current: '#f00', next: '#0f0' };

    const shot = shoot(game, { x: 4 * 32 + 16, y: 0 }, rng());

    const last = shot.last as NonNullable<typeof shot.last>;
    expect(last.popped).toHaveLength(3);
    expect(last.popped.every((gone) => gone.color === '#f00')).toBe(true);
    expect(last.dropped).toEqual([{ row: 3, col: 2, color: '#f00' }]);
    expect(last.gained).toBe(shot.score);
    expect(last.landing.y).toBeGreaterThan(0);
    expect(last.pushed).toBe(false);
  });

  it('numeruje kolejne strzały, żeby efekt odpalał się od nowa', () => {
    let game = createGame(rng(), 2);
    game = shoot(game, { x: 40, y: 0 }, rng());
    const first = game.last?.seq;
    game = shoot(game, { x: 300, y: 0 }, rng());

    expect(first).toBe(1);
    expect(game.last?.seq).toBe(2);
  });

  it('zgłasza dociśnięcie sufitu', () => {
    const game = { ...createGame(rng(), 2), shots: 5 };
    expect(shoot(game, { x: WIDTH / 2, y: 0 }, rng()).last?.pushed).toBe(true);
  });

  it('seria od pięciu kulek płaci podwójnie', () => {
    const burst = (count: number) => {
      const grid = emptyGrid();
      for (let col = 0; col < count - 1; col += 1) grid[0][4 + col] = '#f00';
      const game = { ...createGame(rng(), 0), grid, current: '#f00', next: '#0f0' };
      return shoot(game, { x: WIDTH / 2, y: 0 }, rng());
    };

    const four = burst(4);
    const five = burst(5);

    expect(four.last?.popped).toHaveLength(4);
    expect(four.score).toBe(40);
    expect(five.last?.popped).toHaveLength(5);
    // Pięć to już seria: dziesiątka za kulkę i tyleż premii.
    expect(five.score).toBe(100);
  });

  it('długość i punkt na łamanej — kula leci dokładnie tam, gdzie linia celowania', () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(pathLength(straight)).toBe(100);
    expect(pointAlong(straight, 25)).toEqual({ x: 25, y: 0 });

    const bounced = [
      { x: 10, y: 200 },
      { x: 20, y: 100 },
      { x: 40, y: 100 },
    ];
    expect(pathLength(bounced)).toBeCloseTo(Math.hypot(10, 100) + 20);
    // Poza końcem łamanej nie ma czego szukać — zostaje ostatni punkt.
    expect(pointAlong(bounced, 10_000)).toEqual({ x: 40, y: 100 });
    expect(pointAlong(bounced, 0)).toEqual({ x: 10, y: 200 });
  });

  it('co szóstki strzałów dokłada wiersz od góry, nie psując rusztu', () => {
    const game = { ...createGame(rng(), 3), shots: 5 };

    const shot = shoot(game, { x: WIDTH / 2, y: 0 }, rng());

    expect(shot.shots).toBe(6);
    expect(shot.grid).toHaveLength(ROWS);
    expect(shot.grid[0].some(Boolean)).toBe(true);
    // Każdy wiersz nadal ma dokładnie tyle miejsc, ile mówi jego parzystość.
    shot.grid.forEach((row, index) => expect(row).toHaveLength(colsIn(index, shot.parity)));
    // Ściana wciąż wisi na suficie — nic nie zostało odcięte.
    expect(hanging(shot.grid, shot.parity)).toEqual([]);
  });

  it('dociśnięcie sufitu nie przesuwa kulek w bok', () => {
    const grid = emptyGrid();
    grid[0][0] = '#f00';
    grid[0][10] = '#f00';
    grid[1][0] = '#0f0';
    const game = { ...createGame(rng(), 0), grid, shots: 5, current: '#abc', next: '#abc' };
    const beforeLeft = center(0, 0, game.parity).x;
    const beforeRight = center(0, 10, game.parity).x;

    const shot = shoot(game, { x: 20, y: 0 }, rng());

    // Ta sama kulka jeden wiersz niżej: ten sam pion, nie przeskok o promień.
    expect(center(1, 0, shot.parity).x).toBe(beforeLeft);
    expect(center(1, 10, shot.parity).x).toBe(beforeRight);
    expect(shot.grid[1][0]).toBe('#f00');
    expect(shot.grid[1][10]).toBe('#f00');
  });

  it('po sześćdziesięciu strzałach każda kulka jest wciąż w środku planszy', () => {
    let game = createGame(rng(), 5);
    for (let i = 0; i < 60 && !game.over && !game.won; i += 1) {
      game = shoot(game, { x: 20 + ((i * 37) % (WIDTH - 40)), y: (i * 53) % 220 }, rng());
      game.grid.forEach((row, r) => {
        expect(row).toHaveLength(colsIn(r, game.parity));
        row.forEach((cell, c) => {
          if (!cell) return;
          const here = center(r, c, game.parity);
          expect(here.x).toBeGreaterThanOrEqual(R);
          expect(here.x).toBeLessThanOrEqual(WIDTH - R);
        });
      });
      // Ściana nie może się sama odciąć od sufitu — to był ten „znikający ekran".
      expect(hanging(game.grid, game.parity)).toEqual([]);
    }
    expect(game.grid.some((row) => row.some(Boolean))).toBe(true);
  });

  it('gra kończy się, gdy bąbelki zejdą za nisko', () => {
    const grid = emptyGrid();
    grid[ROWS - 2][1] = '#f00';
    const game = { ...createGame(rng(), 0), grid, shots: 5, current: '#0f0', next: '#0f0' };
    expect(shoot(game, { x: WIDTH / 2, y: 0 }, rng()).over).toBe(true);
  });

  it('rozdaje tylko kolory, które są na planszy', () => {
    const grid = emptyGrid();
    grid[0][0] = '#abc';
    grid[0][1] = '#abc';
    const game = shoot({ ...createGame(rng(), 0), grid, current: '#abc', next: '#abc' }, { x: 16, y: 0 }, rng());
    expect(['#abc']).toContain(game.current);
  });
});
