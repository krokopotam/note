import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import shell from '../gameShell.module.css';
import { boardStyle } from '../shared/board';
import {
  BALL_R,
  CUE_ID,
  POCKETS,
  RAIL,
  TABLE,
  bookShot,
  createRack,
  cueBall,
  leftToPot,
  predict,
  resting,
  speedOf,
  step,
  strike,
} from '../billiards/billiards';
import type { Ball, Point, World } from '../billiards/billiards';
import styles from './Billiards2dApp.module.css';

/** How far the pointer has to be pulled for full power. */
const PULL = BALL_R * 20;
/** Radians one arrow key press turns the cue. */
const AIM_KEY = 0.02;
const CAP_RY = BALL_R * 0.42;

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Pull distance → power, with a dead zone so a tremble is not a shot. */
const pull = (drag: number): number =>
  Math.max(0, Math.min(1, (drag - BALL_R * 2) / (PULL - BALL_R * 2)));

const strzały = (count: number): string =>
  count === 1 ? 'w 1 strzale' : count < 5 ? `w ${count} strzały` : `w ${count} strzałach`;

/** A mark that fades where something happened. */
interface Spark {
  id: number;
  at: Point;
  kind: 'cushion' | 'click' | 'pot';
}

/** Wooden frame, green cloth, six holes and the sights on the rails. */
function Table() {
  return (
    <g>
      <rect
        x={-RAIL}
        y={-RAIL}
        width={TABLE.width + RAIL * 2}
        height={TABLE.height + RAIL * 2}
        rx={14}
        className={styles.wood}
      />
      <rect x={-2.5} y={-2.5} width={TABLE.width + 5} height={TABLE.height + 5} rx={5} className={styles.cushion} />
      <rect x={0} y={0} width={TABLE.width} height={TABLE.height} className={styles.felt} />
      {[0.125, 0.25, 0.375, 0.625, 0.75, 0.875].map((part) => (
        <circle key={`v${part}`} cx={TABLE.width * part} cy={-RAIL / 2} r={1.3} className={styles.sight} />
      ))}
      {[0.25, 0.5, 0.75].map((part) => (
        <circle key={`h${part}`} cx={-RAIL / 2} cy={TABLE.height * part} r={1.3} className={styles.sight} />
      ))}
      {POCKETS.map((pocket, index) => (
        <circle key={index} cx={pocket.x} cy={pocket.y} r={BALL_R * 2.15} className={styles.pocket} />
      ))}
    </g>
  );
}

/** One ball: colour, highlight, two white caps when it is a striped one. */
function BallView({ ball }: { ball: Ball }) {
  return (
    <g className={`${styles.ball} ${ball.potted ? styles.sink : ''}`} data-testid={`ball-${ball.id}`}>
      <ellipse
        cx={ball.x + BALL_R * 0.3}
        cy={ball.y + BALL_R * 0.45}
        rx={BALL_R * 0.98}
        ry={BALL_R * 0.72}
        className={styles.shadow}
      />
      <circle cx={ball.x} cy={ball.y} r={BALL_R} fill={ball.color} className={styles.rim} />
      {ball.striped && (
        <>
          <ellipse cx={ball.x} cy={ball.y - BALL_R * 0.72} rx={BALL_R * 0.74} ry={CAP_RY} fill="#f7f3e8" />
          <ellipse cx={ball.x} cy={ball.y + BALL_R * 0.72} rx={BALL_R * 0.74} ry={CAP_RY} fill="#f7f3e8" />
        </>
      )}
      <circle
        cx={ball.x - BALL_R * 0.32}
        cy={ball.y - BALL_R * 0.36}
        r={BALL_R * 0.3}
        className={styles.gloss}
      />
      {ball.cue && <circle cx={ball.x} cy={ball.y} r={BALL_R * 0.16} className={styles.cueDot} />}
    </g>
  );
}

/** Bilard 2D: widok z góry, kij, przymiar z kulą-duchem i sześć łuz. */
export function Billiards2dApp() {
  const [world, setWorld] = useState<World>(() => createRack());
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(0.6);
  const [dragging, setDragging] = useState(false);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const worldRef = useRef(world);
  worldRef.current = world;
  const grab = useRef<Point | null>(null);
  // Power of the drag in progress. A tap that never pulled the cue is not a shot,
  // so it cannot borrow the strength left over from the keyboard.
  const loaded = useRef(0);
  const potted = useRef<{ id: number; color: string; pocket: number; at: Point }[]>([]);
  const cushions = useRef(0);
  const sparkId = useRef(0);

  const cue = cueBall(world);
  const moving = !resting(world);
  const plan = useMemo(
    () => (moving || cue.potted || world.won ? null : predict(world, aim)),
    [world, aim, moving, cue.potted],
  );

  // The table runs on animation frames: a shot keeps its own tempo and stops
  // exactly when the last ball stops rolling.
  useEffect(() => {
    if (!moving) return undefined;
    let frame = 0;
    let last = performance.now();

    const advance = (now: number) => {
      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
      last = now;

      const next = step(worldRef.current, dt);
      const fresh: Spark[] = [];
      for (const event of next.events.cushions) {
        fresh.push({ id: sparkId.current++, at: event.at, kind: 'cushion' });
        cushions.current += 1;
      }
      for (const event of next.events.clicks) {
        if (event.energy > 30) fresh.push({ id: sparkId.current++, at: event.a, kind: 'click' });
      }
      for (const event of next.events.potted) {
        potted.current.push({
          id: event.ball.id,
          color: event.ball.color,
          pocket: event.pocket,
          at: event.at,
        });
        fresh.push({ id: sparkId.current++, at: event.at, kind: 'pot' });
      }

      worldRef.current = next.world;
      setWorld(resting(next.world) ? bookShot(next.world, potted.current, cushions.current) : next.world);
      if (fresh.length > 0) setSparks((older) => [...older, ...fresh].slice(-22));
      frame = requestAnimationFrame(advance);
    };

    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  // The balls of a booked shot are remembered by the report, not by us.
  useEffect(() => {
    if (moving) return;
    potted.current = [];
    cushions.current = 0;
  }, [moving]);

  /** Screen pixels into the table's own units. */
  const where = (event: { clientX: number; clientY: number }): Point => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: cue.x + 10, y: cue.y };
    return {
      x: ((event.clientX - box.left) / box.width) * (TABLE.width + RAIL * 2) - RAIL,
      y: ((event.clientY - box.top) / box.height) * (TABLE.height + RAIL * 2) - RAIL,
    };
  };

  const shoot = useCallback((angle: number, strength: number) => {
    const struck = strike(worldRef.current, angle, strength);
    worldRef.current = struck;
    setWorld(struck);
  }, []);

  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (moving || cue.potted || world.won) return;
    const point = where(event);
    grab.current = point;
    loaded.current = 0;
    setPower(0);
    setAim(Math.atan2(point.y - cue.y, point.x - cue.x));
    setDragging(true);
    svg.current?.setPointerCapture?.(event.pointerId);
  };

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (moving) return;
    const point = where(event);
    // While the pointer is down the direction is locked and the drag only loads
    // the cue — that is what lets a soft shot be a soft shot.
    if (grab.current) {
      loaded.current = pull(distance(point, grab.current));
      setPower(loaded.current);
    }
    else setAim(Math.atan2(point.y - cue.y, point.x - cue.x));
  };

  const onUp = () => {
    if (!grab.current) return;
    const strength = loaded.current;
    grab.current = null;
    loaded.current = 0;
    setDragging(false);
    shoot(aim, strength);
  };

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (moving) return;
    if (event.key === 'ArrowLeft') setAim((a) => a - AIM_KEY);
    else if (event.key === 'ArrowRight') setAim((a) => a + AIM_KEY);
    else if (event.key === 'ArrowUp') setPower((p) => Math.min(1, p + 0.08));
    else if (event.key === 'ArrowDown') setPower((p) => Math.max(0, p - 0.08));
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      shoot(aim, power);
      return;
    } else return;
    event.preventDefault();
  };

  const restart = () => {
    grab.current = null;
    potted.current = [];
    cushions.current = 0;
    setSparks([]);
    const fresh = createRack();
    worldRef.current = fresh;
    setWorld(fresh);
  };

  const ghost = plan?.ghost ?? null;
  const target = plan?.target ?? null;
  const pullBack = BALL_R + 1.5 + power * 18;
  const back = { x: Math.cos(aim + Math.PI), y: Math.sin(aim + Math.PI) };
  const stickStart = { x: cue.x + back.x * pullBack, y: cue.y + back.y * pullBack };
  const stickEnd = { x: stickStart.x + back.x * 80, y: stickStart.y + back.y * 80 };
  const score = world.last?.potted.filter((entry) => entry.id !== CUE_ID) ?? [];

  return (
    <div className={shell.shell} data-testid="billiard2d">
      <div className={shell.hud}>
        <span key={world.score} className={styles.score}>
          Punkty <strong>{world.score}</strong>
        </span>
        <span>
          Strzały <strong>{world.shots}</strong>
        </span>
        <span>
          Do wbicia <strong>{leftToPot(world)}</strong>
        </span>
        <span className={world.fouls > 0 ? styles.fouls : undefined}>
          Faule <strong>{world.fouls}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <span className={styles.powerLabel}>
          Siła
          <span className={styles.powerBar}>
            <span
              className={styles.powerFill}
              style={{ width: `${Math.round(power * 100)}%` }}
              data-testid="power-fill"
            />
          </span>
        </span>
        <button type="button" className={shell.action} onClick={restart}>
          Nowy bilard
        </button>
      </div>

      <div className={shell.stage}>
        <svg
          ref={svg}
          className={`${shell.board} ${styles.board}`}
          style={boardStyle((TABLE.width + RAIL * 2) / (TABLE.height + RAIL * 2))}
          viewBox={`${-RAIL} ${-RAIL} ${TABLE.width + RAIL * 2} ${TABLE.height + RAIL * 2}`}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKeyDown}
          data-testid="billiard-table"
        >
          <title>Stół bilardowy: rusz myszą, aby celować, przeciągnij, aby uderzyć</title>
          <Table />

          {plan && plan.path.length > 1 && (
            <>
              <polyline
                points={plan.path.map((point) => `${point.x},${point.y}`).join(' ')}
                className={styles.guide}
                data-testid="aim-guide"
              />
              {ghost && <circle cx={ghost.x} cy={ghost.y} r={BALL_R} className={styles.ghost} data-testid="ghost-ball" />}
              {ghost && target && (
                <line
                  x1={target.x}
                  y1={target.y}
                  x2={target.x + (target.x - ghost.x) * 4}
                  y2={target.y + (target.y - ghost.y) * 4}
                  className={styles.tangent}
                />
              )}
            </>
          )}

          {world.balls.map((ball) =>
            speedOf(ball) > 130 ? (
              <ellipse
                key={`streak-${ball.id}`}
                cx={ball.x - ball.vx * 0.014}
                cy={ball.y - ball.vy * 0.014}
                rx={BALL_R * 2}
                ry={BALL_R * 0.7}
                fill={ball.color}
                className={styles.streak}
                transform={`rotate(${(Math.atan2(ball.vy, ball.vx) * 180) / Math.PI} ${ball.x} ${ball.y})`}
              />
            ) : null,
          )}

          {world.balls.map((ball) => (
            <BallView key={ball.id} ball={ball} />
          ))}

          {!moving && !cue.potted && !world.won && (
            <g className={dragging ? undefined : styles.stickIdle} data-testid="cue-stick">
              <line x1={stickStart.x} y1={stickStart.y} x2={stickEnd.x} y2={stickEnd.y} className={styles.stickShadow} />
              <line x1={stickStart.x} y1={stickStart.y} x2={stickEnd.x} y2={stickEnd.y} className={styles.stick} />
              <circle cx={stickStart.x} cy={stickStart.y} r={BALL_R * 0.44} className={styles.tip} />
            </g>
          )}

          <g className={styles.fx} data-testid="billiard-fx">
            {sparks.map((spark) => (
              <circle
                key={spark.id}
                cx={spark.at.x}
                cy={spark.at.y}
                r={spark.kind === 'pot' ? BALL_R * 2.3 : spark.kind === 'click' ? BALL_R * 1.3 : BALL_R * 0.8}
                className={`${styles.spark} ${spark.kind === 'pot' ? styles.sparkPot : ''} ${
                  spark.kind === 'click' ? styles.sparkClick : ''
                }`}
              />
            ))}
            {score.map((entry, index) => (
              <text
                key={`gain-${entry.id}`}
                x={entry.at.x}
                y={entry.at.y - BALL_R * 2.6}
                textAnchor="middle"
                className={styles.gain}
              >
                +{10 * (index + 1)}
              </text>
            ))}
            {world.last?.foul && (
              <text x={TABLE.width / 2} y={TABLE.height / 2 + 16} textAnchor="middle" className={styles.foulText}>
                Fał! −20
              </text>
            )}
          </g>

          {cue.potted && !moving && !world.won && (
            <text x={TABLE.width / 2} y={8} textAnchor="middle" className={styles.scratch}>
              Biała wpadła — wraca na start
            </text>
          )}

          {world.won && (
            <g>
              <rect
                x={-RAIL}
                y={-RAIL}
                width={TABLE.width + RAIL * 2}
                height={TABLE.height + RAIL * 2}
                rx={14}
                className={styles.dim}
              />
              <text x={TABLE.width / 2} y={TABLE.height / 2 - 8} textAnchor="middle" className={styles.overText}>
                Stół sprzątnięty!
              </text>
              <text x={TABLE.width / 2} y={TABLE.height / 2 + 16} textAnchor="middle" className={styles.overScore}>
                {world.score} punktów {strzały(world.shots)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <p className={shell.hint}>
        Celuj ruchem myszy albo palcem, przeciągnij i puść, aby uderzyć. Strzałki obracają kij i dobierają siłę,
        spacja uderza.
      </p>
    </div>
  );
}
