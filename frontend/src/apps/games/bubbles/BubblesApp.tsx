import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import shell from '../gameShell.module.css';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import {
  COLORS,
  HEIGHT,
  R,
  ROW_H,
  SHOTS_PER_ROW,
  WIDTH,
  aimPath,
  center,
  createGame,
  pathLength,
  pointAlong,
  shoot,
} from './bubbles';
import type { Point, ShooterGame } from './bubbles';
import styles from './BubblesApp.module.css';

/** Board units per millisecond — fast enough to feel like a throw, slow enough to see. */
const FLIGHT_SPEED = 1.25;
const MIN_FLIGHT_MS = 110;

/** Half of "+160" is this wide, so a burst in the corner keeps its number on board. */
const GAIN_MARGIN = R * 8;

/** Directions the shards of a burst fly in. Fixed, so a burst never jitters between renders. */
const SHARDS = [
  [1, 0],
  [0.5, 0.87],
  [-0.5, 0.87],
  [-1, 0],
  [-0.5, -0.87],
  [0.5, -0.87],
];

const word = (popped: number): string | null =>
  popped >= 12 ? 'Rozwałka!' : popped >= 8 ? 'Ekstra!' : popped >= 5 ? 'Seria!' : null;

/** Six shards and a ring, drawn at the spot where a bubble used to be. */
function Burst({ at, color, index }: { at: Point; color: string; index: number }) {
  return (
    <g
      className={styles.burst}
      transform={`translate(${at.x} ${at.y})`}
      style={{ '--i': index } as CSSProperties}
    >
      <circle r={R} className={styles.ring} />
      {SHARDS.map(([dx, dy], i) => (
        <circle key={i} cx={dx * R * 0.9} cy={dy * R * 0.9} r={R * 0.24} fill={color} />
      ))}
    </g>
  );
}

/** A bubble that lost its grip: it falls out of the board and fades on the way. */
function Dropout({ at, color, index }: { at: Point; color: string; index: number }) {
  return (
    <g
      className={styles.fall}
      transform={`translate(${at.x} ${at.y})`}
      style={{ '--i': index } as CSSProperties}
    >
      <circle r={R - 1} fill={color} className={styles.bubble} />
    </g>
  );
}

/** Points that arrive where the shot landed, with a word for the bigger chains. */
function Gain({ at, gained, popped }: { at: Point; gained: number; popped: number }) {
  const caption = word(popped);
  // A burst in the corner must not push the number off the board, and it needs
  // room above it to float up in.
  const x = Math.max(GAIN_MARGIN, Math.min(WIDTH - GAIN_MARGIN, at.x));
  const y = Math.max(R * 6, Math.min(HEIGHT - R * 2, at.y));
  return (
    <g className={styles.gain} transform={`translate(${x} ${y})`}>
      <text textAnchor="middle" className={styles.gainText}>
        +{gained}
      </text>
      {caption && (
        <text textAnchor="middle" y={-18} className={styles.gainWord}>
          {caption}
        </text>
      )}
    </g>
  );
}

/** Bąbelki: celuj, trafiaj, strącaj to, co wisi na jednym bąbelku. */
export function BubblesApp() {
  const [game, setGame] = useState<ShooterGame>(() => createGame(randomRng()));
  const [aim, setAim] = useState<Point>({ x: WIDTH / 2, y: 40 });
  const [flight, setFlight] = useState<{ path: Point[]; color: string } | null>(null);
  const [travelled, setTravelled] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  // Where the shot has to be booked once the bubble has flown there.
  const pending = useRef<Point | null>(null);

  const origin = { x: WIDTH / 2, y: HEIGHT + R };
  const guide = useMemo(() => aimPath(game, origin, aim).path, [game, aim.x, aim.y]);

  const fire = useCallback(
    (target: Point) => {
      if (flight) return; // one bubble in the air at a time
      setFlight({ path: aimPath(game, origin, target, false).path, color: game.current });
      pending.current = target;
    },
    // `origin` is a constant of the board, so nothing extra belongs in here.
    [flight, game, setFlight],
  );

  // The bubble actually travels: the guide line becomes its route, and the shot
  // is booked only when it gets there.
  useEffect(() => {
    if (!flight) return undefined;
    const total = pathLength(flight.path);
    const duration = Math.max(MIN_FLIGHT_MS, total / FLIGHT_SPEED);
    const started = performance.now();
    let frame = 0;

    const advance = (now: number) => {
      const part = Math.min(1, (now - started) / duration);
      setTravelled(total * part);
      if (part < 1) {
        frame = requestAnimationFrame(advance);
        return;
      }
      const target = pending.current;
      pending.current = null;
      setFlight(null);
      setTravelled(0);
      if (target) setGame((current) => shoot(current, target, randomRng()));
    };

    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [flight]);

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

  const bubbles = useMemo(
    () =>
      game.grid.flatMap((row, y) =>
        row.map((color, x) => {
          if (!color) return null;
          const cx = x * R * 2 + R + ((y + game.parity) % 2 === 1 ? R : 0);
          const cy = y * ROW_H + R;
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
    [game.grid, game.parity],
  );

  const restart = () => {
    pending.current = null;
    setFlight(null);
    setTravelled(0);
    setGame(createGame(randomRng()));
  };

  const toNextRow = SHOTS_PER_ROW - (game.shots % SHOTS_PER_ROW);
  const outcome = game.last;
  // Popped cells are remembered from the shot, and the ceiling push flips the
  // sheet right after it — so effects are drawn with the parity the shot saw.
  const shotParity = outcome?.pushed ? 1 - game.parity : game.parity;
  const flying = flight
    ? [0, 10, 20, 30].map((back, i) => ({
        point: pointAlong(flight.path, Math.max(0, travelled - back)),
        ghost: i > 0,
      }))
    : [];

  return (
    <div className={shell.shell} data-testid="bubbles">
      <div className={shell.hud}>
        <span key={game.score} className={styles.score}>
          Punkty <strong>{game.score}</strong>
        </span>
        <span className={toNextRow === 1 ? styles.soon : undefined}>
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
          <line
            x1={0}
            y1={HEIGHT * 0.78}
            x2={WIDTH}
            y2={HEIGHT * 0.78}
            className={`${styles.danger} ${toNextRow === 1 ? styles.dangerClose : ''}`}
          />
          {guide.length > 1 && !flight && (
            <polyline
              points={guide.map((point) => `${point.x},${point.y}`).join(' ')}
              className={styles.guide}
            />
          )}

          {/* The sheet slides in when the ceiling pushes a row down. */}
          <g
            key={outcome?.pushed ? `push-${game.shots}` : 'sheet'}
            className={outcome?.pushed ? styles.sheet : undefined}
          >
            {bubbles}
          </g>

          {/* Recoil of the launcher, once per shot. */}
          <g key={`launcher-${game.shots}`} className={styles.recoil}>
            <circle
              cx={origin.x}
              cy={origin.y - R}
              r={R - 1}
              fill={game.current}
              className={styles.loaded}
            />
          </g>

          {/* What the last shot destroyed: bursts, drops, points. */}
          {outcome && (
            <g key={outcome.seq} className={styles.fx} data-testid="shot-fx">
              {outcome.dropped.map((gone, index) => (
                <Dropout
                  key={`drop-${gone.row}-${gone.col}`}
                  at={center(gone.row, gone.col, shotParity)}
                  color={gone.color}
                  index={index}
                />
              ))}
              {outcome.popped.map((gone, index) => (
                <Burst
                  key={`pop-${gone.row}-${gone.col}`}
                  at={center(gone.row, gone.col, shotParity)}
                  color={gone.color}
                  index={index}
                />
              ))}
              {outcome.gained > 0 && (
                <Gain at={outcome.landing} gained={outcome.gained} popped={outcome.popped.length} />
              )}
            </g>
          )}

          {flight && (
            <g data-testid="flying-bubble" className={styles.fx}>
              {flying.map(({ point, ghost }, i) =>
                ghost ? (
                  <circle
                    key={i}
                    cx={point.x}
                    cy={point.y}
                    r={(R - 1) * (0.8 - i * 0.14)}
                    fill={flight.color}
                    className={styles.trail}
                  />
                ) : (
                  <circle
                    key={i}
                    cx={point.x}
                    cy={point.y}
                    r={R - 1}
                    fill={flight.color}
                    className={styles.loaded}
                  />
                ),
              )}
            </g>
          )}

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
        <span>Trzy takie same pękają, pęknięte ściąga to co pod nimi.</span>
      </div>
      <p className={shell.hint}>Przesuń palcem albo myszą, żeby celować; puść, żeby strzelić.</p>
    </div>
  );
}
