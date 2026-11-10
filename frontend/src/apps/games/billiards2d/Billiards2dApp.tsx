import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import shell from '../gameShell.module.css';
import { usePhone } from '../../../shell/viewport';
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
import { ControlStrip } from '../billiards/ControlStrip';
import {
  afterAimTap,
  clamp,
  dragEffect,
  loadControls,
  saveControls,
  screenToTable,
  strikesOnRelease,
  turnedBox,
  viewDrag,
  viewRotation,
  ZOOM,
} from '../billiards/controls';
import type { AimMode, CameraWanted, Controls, Trigger } from '../billiards/controls';
import styles from './Billiards2dApp.module.css';

/**
 * Co panel mówi o aktualnym trybie. Jedno zdanie, ale zmienia się w zależności
 * od wybranych widełek — gracz ma przeczytać to, czego właśnie używa.
 */
function stripHint(aiming: boolean, turning: boolean, trigger: Trigger): string {
  if (!aiming) {
    return 'Palec obraca kadr i przybliża, a celowanie śpi. Stuknij „Kij” albo „Stół”, aby wrócić — kadr zostanie jako „Własny”.';
  }
  const steer = turning
    ? 'Przeciągnij w bok, aby obrócić stół, i w dół, aby nabrać siłę. Strzałki też obracają stół.'
    : 'Przeciągnij w bok, aby ruszyć kijem, i w dół, aby nabrać siłę. Myszka celuje po wskazanym punkcie.';
  return trigger === 'button'
    ? `${steer} Przy „Guziku” uderza tylko przycisk „Uderz”.`
    : `${steer} Puszczenie palca uderza, spacja też.`;
}

/** Radians one arrow key press turns the cue. */
const AIM_KEY = 0.02;
const CAP_RY = BALL_R * 0.42;

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
  const [controls, setControls] = useState<Controls>(() => loadControls());
  // Kamera: `auto` sama pilnuje kadru, `free` oddaje ekran palcu (celowanie śpi),
  // `placed` trzyma to, co gracz ustawił, a kij celuje w zamrożonym kadrze.
  const [camera, setCamera] = useState<CameraWanted>('auto');
  // Telefon trzymany pionowo ma wysoki ekran i szeroką stolicę — na `auto`
  // obracamy stół wzdłuż pionu, żeby nie grać w kopertę.
  const phone = usePhone();
  const [view, setView] = useState({ angle: 0, zoom: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const worldRef = useRef(world);
  worldRef.current = world;
  // Where the finger came down, in screen pixels: the pull is measured on screen,
  // so the same gesture asks for the same strength on a phone and on a monitor.
  const grab = useRef<Point | null>(null);
  const aimAtGrab = useRef(0);
  const viewGrab = useRef<Point | null>(null);
  const frameAtGrab = useRef({ angle: 0, zoom: 1 });
  // Strength right now. A tap that never pulled the cue is not a shot, so it must
  // not borrow the force left over from the keyboard.
  const powerRef = useRef(0.6);
  const potted = useRef<{ id: number; color: string; pocket: number; at: Point }[]>([]);
  const cushions = useRef(0);
  const sparkId = useRef(0);

  // The chosen controls are remembered for the next game, in this browser only.
  useEffect(() => {
    saveControls(controls);
  }, [controls]);

  const cue = cueBall(world);
  const moving = !resting(world);
  const turning = controls.aim === 'table';
  const aiming = camera !== 'free';
  const ownFrame = camera !== 'auto';
  const plan = useMemo(
    () => (!aiming || moving || cue.potted || world.won ? null : predict(world, aim)),
    [world, aim, moving, cue.potted, aiming],
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

  /** Screen pixels into the table's own units, undoing the frame's turn and zoom. */
  const where = (event: { clientX: number; clientY: number }): Point => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: cue.x + 10, y: cue.y };
    return screenToTable(
      { x: event.clientX, y: event.clientY },
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { box: frameBox, angle: frameAngle, zoom: frameZoom, centre },
    );
  };

  const shoot = useCallback((angle: number, strength: number) => {
    const struck = strike(worldRef.current, angle, strength);
    worldRef.current = struck;
    setWorld(struck);
  }, []);

  const load = (value: number) => {
    powerRef.current = value;
    setPower(value);
  };

  /** Tapping an aiming option hands the screen back to the cue but keeps the view. */
  const chooseAim = (mode: AimMode) => {
    setControls({ ...controls, aim: mode });
    setCamera(afterAimTap);
  };

  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    // Setting the view comes first and works even while the balls are rolling.
    if (!aiming) {
      viewGrab.current = { x: event.clientX, y: event.clientY };
      frameAtGrab.current = view;
      svg.current?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (moving || cue.potted || world.won) return;
    grab.current = { x: event.clientX, y: event.clientY };
    aimAtGrab.current = aim;
    load(0);
    // On a mouse the finger also says where to look; on a phone the drag below
    // swings the cue, which is the only thing a fingertip can do well.
    if (!turning) {
      const point = where(event);
      setAim(Math.atan2(point.y - cue.y, point.x - cue.x));
    }
    setDragging(true);
    svg.current?.setPointerCapture?.(event.pointerId);
  };

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const now = { x: event.clientX, y: event.clientY };
    if (viewGrab.current) {
      const dragged = viewDrag(viewGrab.current, now);
      setView({
        angle: frameAtGrab.current.angle + (dragged.spin * 180) / Math.PI,
        zoom: clamp(frameAtGrab.current.zoom + dragged.lift, ZOOM.min, ZOOM.max),
      });
      return;
    }
    if (!aiming || moving) return;
    if (!grab.current) {
      // Hovering points the cue; a finger that is down steers it below instead.
      if (!turning) {
        const point = where(event);
        setAim(Math.atan2(point.y - cue.y, point.x - cue.x));
      }
      return;
    }
    // The same gesture everywhere: sideways swings the cue, towards the player
    // loads it. „Stół” reads the same spin but lets the frame turn with it.
    const effect = dragEffect(grab.current, now);
    setAim(aimAtGrab.current + effect.spin);
    load(effect.power);
  };

  const onUp = () => {
    if (viewGrab.current) {
      viewGrab.current = null;
      return;
    }
    if (!grab.current) return;
    const strength = powerRef.current;
    grab.current = null;
    setDragging(false);
    // With the button trigger a pull only loads the cue; it never strikes.
    if (strikesOnRelease(controls.trigger)) shoot(aim, strength);
  };

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!aiming || moving) return;
    if (event.key === 'ArrowLeft') setAim((a) => a - AIM_KEY);
    else if (event.key === 'ArrowRight') setAim((a) => a + AIM_KEY);
    else if (event.key === 'ArrowUp') load(Math.min(1, powerRef.current + 0.08));
    else if (event.key === 'ArrowDown') load(Math.max(0, powerRef.current - 0.08));
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      shoot(aim, powerRef.current);
      return;
    } else return;
    event.preventDefault();
  };

  const restart = () => {
    grab.current = null;
    viewGrab.current = null;
    setDragging(false);
    potted.current = [];
    cushions.current = 0;
    setSparks([]);
    const fresh = createRack();
    worldRef.current = fresh;
    setWorld(fresh);
  };

  // Who owns the frame: the player's hand while the view is being set, the shot
  // when the table is being turned, and the placed view when the cue is aiming.
  const board = { w: TABLE.width + RAIL * 2, h: TABLE.height + RAIL * 2 };
  const centre = { x: TABLE.width / 2, y: TABLE.height / 2 };
  const frameAngle =
    camera === 'free'
      ? view.angle
      : turning
        ? viewRotation(aim)
        : camera === 'placed'
          ? view.angle
          : phone
            ? -90
            : 0;
  const frameZoom = ownFrame ? view.zoom : 1;
  // The viewBox is the box the turned table really needs, so the cloth fills the
  // window at any angle instead of shrinking into a corner of a straight frame.
  const frameBox = turnedBox(board.w, board.h, frameAngle);
  const viewBox = `${frameBox.x} ${frameBox.y} ${frameBox.width} ${frameBox.height}`;
  const boardRatio = frameBox.width / frameBox.height;
  // The table lives in its own corner of coordinates; the frame always brings its
  // middle to the origin of the viewBox, then turns and magnifies it. The centring
  // is not optional — without it a straight table sits outside its own frame.
  const frameTransform = `rotate(${frameAngle}) scale(${frameZoom}) translate(${-centre.x} ${-centre.y})`;
  // Text outside the turned group sits in the frame, whose centre is the origin.
  const mid = { x: 0, y: 0 };

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
      </div>

      <div className={shell.stage}>
        <svg
          ref={svg}
          className={`${shell.board} ${styles.board}`}
          style={boardStyle(boardRatio)}
          viewBox={viewBox}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKeyDown}
          data-testid="billiard-table"
        >
          <title>
            {!aiming
              ? 'Ustawianie widoku: przeciągnij, aby obrócić i przybliżyć stół'
              : turning
                ? 'Stół bilardowy: przeciągnij w bok, aby obrócić stół, w dół, aby nabrać siły'
                : 'Stół bilardowy: rusz myszą, aby celować, przeciągnij w bok i w dół, aby uderzyć'}
          </title>
          {/* With a turning table the whole cloth spins around the white ball, so
              every shot goes up the screen. */}
          <g transform={frameTransform} data-testid="billiard-view">
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

          {aiming && !moving && !cue.potted && !world.won && (
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

          </g>

          {cue.potted && !moving && !world.won && (
            <text x={mid.x} y={frameBox.y + 18} textAnchor="middle" className={styles.scratch}>
              Biała wpadła — wraca na start
            </text>
          )}

          {world.won && (
            <g>
              <rect
                x={frameBox.x}
                y={frameBox.y}
                width={frameBox.width}
                height={frameBox.height}
                rx={14}
                className={styles.dim}
              />
              <text x={mid.x} y={mid.y - 8} textAnchor="middle" className={styles.overText}>
                Stół sprzątnięty!
              </text>
              <text x={mid.x} y={mid.y + 16} textAnchor="middle" className={styles.overScore}>
                {world.score} punktów {strzały(world.shots)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <ControlStrip
        controls={controls}
        onAim={chooseAim}
        onTrigger={(trigger) => setControls({ ...controls, trigger })}
        camera={camera}
        onCamera={setCamera}
        placedAvailable={camera !== 'auto'}
        onStrike={() => shoot(aim, powerRef.current)}
        disabled={moving || cue.potted || world.won}
        hint={stripHint(aiming, turning, controls.trigger)}
        testid="billiard2d"
      >
        <button type="button" className={styles.panelAction} onClick={restart}>
          Nowy bilard
        </button>
      </ControlStrip>
    </div>
  );
}
