import { useCallback, useMemo, useRef, useState } from 'react';
import shell from '../gameShell.module.css';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import {
  COLORS,
  HEIGHT,
  R,
  SHOTS_PER_ROW,
  WIDTH,
  aimPath,
  createGame,
  shoot,
} from './bubbles';
import type { Point, ShooterGame } from './bubbles';
import styles from './BubblesApp.module.css';

/** Bąbelki: celuj, trafiaj, strącaj to, co wisi na jednym bąbelku. */
export function BubblesApp() {
  const [game, setGame] = useState<ShooterGame>(() => createGame(randomRng()));
  const [aim, setAim] = useState<Point>({ x: WIDTH / 2, y: 40 });
  const svg = useRef<SVGSVGElement>(null);

  const fire = useCallback((target: Point) => {
    setGame((current) => shoot(current, target, randomRng()));
  }, []);

  /** Screen pixels into the board's own coordinates. */
  const where = (event: { clientX: number; clientY: number }): Point => {
    const box = svg.current?.getBoundingClientRect();
    // A hidden window reports a zero-size box: dividing by it would aim at NaN.
    if (!box || box.width === 0 || box.height === 0) return aim;
    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    };
  };

  const origin = { x: WIDTH / 2, y: HEIGHT + R };
  const guide = useMemo(() => aimPath(game, origin, aim).path, [game, aim.x, aim.y]);

  const bubbles = useMemo(
    () =>
      game.grid.flatMap((row, y) =>
        row.map((color, x) => {
          if (!color) return null;
          const cx = x * R * 2 + R + ((y + game.parity) % 2 === 1 ? R : 0);
          const cy = y * Math.round(R * 1.74) + R;
          return (
            <circle
              key={`${y}-${x}`}
              className={styles.bubble}
              cx={cx}
              cy={cy}
              r={R - 1}
              fill={color}
              data-testid="bubble"
            />
          );
        }),
      ),
    [game.grid],
  );

  const restart = () => setGame(createGame(randomRng()));
  const toNextRow = SHOTS_PER_ROW - (game.shots % SHOTS_PER_ROW);

  return (
    <div className={shell.shell} data-testid="bubbles">
      <div className={shell.hud}>
        <span>
          Punkty <strong>{game.score}</strong>
        </span>
        <span>
          Strzały do nowego wiersza <strong>{toNextRow}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <span className={styles.swatchLabel}>
          Następny
          <span className={styles.swatch} style={{ background: game.next }} />
        </span>
        <button type="button" className={shell.action} onClick={restart}>
          Nowa gra
        </button>
      </div>

      <div className={shell.stage}>
        <svg
          ref={svg}
          className={`${shell.board} ${styles.board}`}
          style={boardStyle(WIDTH / HEIGHT)}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          onPointerMove={(event) => setAim(where(event))}
          onPointerDown={(event) => setAim(where(event))}
          onPointerUp={() => !game.over && fire(aim)}
          data-testid="bubbles-board"
        >
          <line x1={0} y1={HEIGHT * 0.78} x2={WIDTH} y2={HEIGHT * 0.78} className={styles.danger} />
          {guide.length > 1 && (
            <polyline
              points={guide.map((point) => `${point.x},${point.y}`).join(' ')}
              className={styles.guide}
            />
          )}
          {bubbles}
          <circle cx={origin.x} cy={origin.y - R} r={R - 1} fill={game.current} className={styles.loaded} />
          {(game.over || game.won) && (
            <g>
              <rect x={0} y={0} width={WIDTH} height={HEIGHT} className={styles.dim} />
              <text x={WIDTH / 2} y={HEIGHT / 2 - 8} textAnchor="middle" className={styles.overText}>
                {game.won ? 'Plansza czysta!' : 'Zaszedł za nisko'}
              </text>
              <text x={WIDTH / 2} y={HEIGHT / 2 + 16} textAnchor="middle" className={styles.overScore}>
                {game.score} punktów
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className={shell.hud}>
        <span className={styles.legend}>
          {COLORS.map((color) => (
            <span key={color} className={styles.legendDot} style={{ background: color }} />
          ))}
        </span>
        <span className={shell.hudSpacer} />
        <span>Trzy takie same pękają.</span>
      </div>
      <p className={shell.hint}>Przesuń palcem albo myszą, żeby celować; puść, żeby strzelić.</p>
    </div>
  );
}
