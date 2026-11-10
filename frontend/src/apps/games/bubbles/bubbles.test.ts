import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import {
  COLS,
  HEIGHT,
  ROWS,
  WIDTH,
  aimPath,
  cluster,
  colsIn,
  createGame,
  emptyGrid,
  hanging,
  landingCell,
  neighbours,
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

  it('co szóstki strzałów dokłada wiersz od góry', () => {
    let game = { ...createGame(rng(), 0), grid: emptyGrid(), shots: 5 };
    game = shoot(game, { x: WIDTH / 2, y: 0 }, rng());
    expect(game.shots).toBe(6);
    // Wiersz wsunięty na górę jest pusty, więc wszystko przesunęło się w dół.
    expect(game.grid[0].every((cell) => !cell)).toBe(true);
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
