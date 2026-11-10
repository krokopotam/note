/**
 * Mostek między stołem a sceną three.js.
 *
 * Fizyka liczy w jednostkach stołu (220 × 110, y rośnie w dół ekranu). Scena
 * potrzebuje metrów i osi Y do góry. Trzymanie tego w dwóch czystych funkcjach
 * znaczy, że można policzyć bez WebGL, gdzie wyląduje kamera, a bilard 2D i 3D
 * dzielą ten sam układ współrzędnych.
 */
import { BALL_R, RAIL, TABLE } from '../billiards/billiards';
import type { Point } from '../billiards/billiards';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Table units → metres. The table ends up about 13 m × 7 m in scene units. */
export const SCALE = 0.06;
/** Height of a ball's centre above the cloth. */
export const BALL_LIFT = BALL_R * SCALE;

/** A point on the cloth, moved to the middle of the scene and onto the XZ plane. */
export function tableToScene(point: Point): Vec3 {
  return {
    x: (point.x - TABLE.width / 2) * SCALE,
    y: 0,
    z: (point.y - TABLE.height / 2) * SCALE,
  };
}

export type CameraMode = 'behind' | 'top' | 'side' | 'free';

/** Where the player put the camera: which way it looks, how high, how far. */
export interface FreePose {
  yaw: number;
  tilt: number;
  distance: number;
}

export const DEFAULT_FREE: FreePose = { yaw: Math.PI / 2, tilt: 0.34, distance: 7.6 };

/** The eye behind the ball along `pose.yaw`, lifted by its tilt, pulled back by distance. */
function poseOf(cue: Vec3, pose: FreePose): Pose {
  const forward = { x: Math.cos(pose.yaw), z: Math.sin(pose.yaw) };
  const run = pose.distance * Math.cos(pose.tilt);
  return {
    position: {
      x: cue.x - forward.x * run,
      y: Math.max(0.5, pose.distance * Math.sin(pose.tilt)),
      z: cue.z - forward.z * run,
    },
    // The gaze leans towards the middle of the cloth (which is the origin) so the
    // rack stays in the frame instead of the ball floating in a sea of felt.
    target: {
      x: cue.x + forward.x * 5 - cue.x * 0.3,
      y: BALL_LIFT,
      z: cue.z + forward.z * 5 - cue.z * 0.3,
    },
    up: UP,
  };
}

export const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'behind', label: 'Za kulą' },
  { id: 'top', label: 'Z góry' },
  { id: 'side', label: 'Z boku' },
];

/** Which way is up on the screen for this view. */
export interface Pose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * `pose` is a camera the player placed: it holds the view exactly where the hand
 * left it. „Za kulą” uses it as well when the table is being turned (then the drag
 * only spins the yaw). With no pose the camera falls back on its own judgement —
 * and the aiming modes deliberately pass none: a camera that turned with the cue
 * would chase the pointer and never let the player see the rack.
 */
/** Vertical field of view of the camera in the app, in degrees. */
export const FOV_DEGREES = 46;

/**
 * The table with its wooden frame and a finger of air around it, in scene units.
 */
export function tableOutline(): Vec3[] {
  const halfX = (TABLE.width / 2 + RAIL * 2) * SCALE;
  const halfZ = (TABLE.height / 2 + RAIL * 2) * SCALE;
  return [
    { x: -halfX, y: 0, z: -halfZ },
    { x: halfX, y: 0, z: -halfZ },
    { x: halfX, y: 0, z: halfZ },
    { x: -halfX, y: 0, z: halfZ },
  ];
}

/**
 * Where a point lands on the screen: each axis in [-1, 1] is inside the frame,
 * `null` means it is behind the eye.
 *
 * Same maths as three.js, only small enough to run in a test — that is the whole
 * point of the file: the framing can be checked without a GPU.
 */
export function project(
  pose: Pose,
  point: Vec3,
  aspect: number,
  fov: number = FOV_DEGREES,
): { x: number; y: number } | null {
  const forward = norm({
    x: pose.target.x - pose.position.x,
    y: pose.target.y - pose.position.y,
    z: pose.target.z - pose.position.z,
  });
  const right = norm(cross(forward, pose.up));
  const up = cross(right, forward);
  const d = {
    x: point.x - pose.position.x,
    y: point.y - pose.position.y,
    z: point.z - pose.position.z,
  };
  const depth = dot(d, forward);
  if (depth <= 0.001) return null;
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  return {
    x: dot(d, right) / (depth * tanHalf * aspect),
    y: dot(d, up) / (depth * tanHalf),
  };
}

/** Below this the window is tall enough to look down the length of the table. */
export function looksLengthwise(aspect: number): boolean {
  return aspect < LENGTHWISE_ASPECT;
}

/**
 * How far a pose has to move back so the whole table is inside the frame.
 *
 * No magic constant tied to one window shape: the four corners of the table are
 * projected, and the eye retreats until the worst of them fits with a finger of
 * air. A wide monitor needs a little, a phone in portrait needs twice as much,
 * and rotating the window answers something in between — which is what the
 * player expects when they turn the phone and the table simply stays in view.
 */
/** How much of the frame the table may fill: the rest is air to aim in. */
const FILL = 0.93;

/**
 * How far a camera has to move back so the table fits the frame.
 *
 * `poseAt` is the camera for a given back-off, not a single pose: how a view
 * retreats is its own decision (some climb as they back away, the steep phone
 * view does not), and fitting a *different* retreat than the one that will be
 * rendered is how you end up with a table half out of the frame.
 */
export function fitFor(
  poseAt: (fit: number) => Pose,
  aspect: number,
  fov: number = FOV_DEGREES,
  outline: Vec3[] = tableOutline(),
): number {
  if (!(aspect > 0)) return 1;
  const MAX = 5;

  /** How far the worst corner sticks out of the frame at this back-off. */
  const worstAt = (fit: number): number => {
    const wide = poseAt(fit);
    let worst = 0;
    for (const corner of outline) {
      const seen = project(wide, corner, aspect, fov);
      // Behind the eye is not "sticking out": the near rail of a table you are
      // sitting behind is meant to be off-screen. Counting it as a miss pushed
      // the eye back until the whole table was a stamp in the middle of the sky.
      if (seen) worst = Math.max(worst, Math.abs(seen.x), Math.abs(seen.y));
    }
    return worst;
  };

  if (worstAt(1) <= FILL) return 1;
  if (worstAt(MAX) > FILL) return MAX;
  // Backing away only ever shrinks the table, so the smallest fit that works is
  // the biggest table — bisection finds it without overshooting.
  let tooClose = 1;
  let enough = MAX;
  for (let step = 0; step < 12; step += 1) {
    const middle = (tooClose + enough) / 2;
    if (worstAt(middle) <= FILL) enough = middle;
    else tooClose = middle;
  }
  return enough;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Zoom the pose out, and look down on the table instead of along it.
 *
 * Pure zoom keeps the perspective but leaves a phone with a small table under a
 * lot of empty sky: what a tall window has to spare is height, so the eye climbs
 * and the table's length runs up the screen. Straight-down views already look
 * down, so they only get the zoom.
 */
function backOff(pose: Pose, fit: number, climb = 6): Pose {
  if (fit === 1) return pose;
  const step = (a: number, b: number) => b + (a - b) * fit;
  const position = {
    x: step(pose.position.x, pose.target.x),
    y: step(pose.position.y, pose.target.y),
    z: step(pose.position.z, pose.target.z),
  };
  // Wspinaczka ma sufit: bez niej oko przy bardzo wąskim oknie ląduje nad
  // stołem jak nad modelem, a to już nie jest kadr do grania.
  if (pose.up.y > 0.9) position.y += Math.min(7, (fit - 1) * climb);
  return { ...pose, position };
}

/** How the frame is shaped and what that asks of the camera. */
export interface Framing {
  /** How far the eye retreats so the table fits; 1 means no change. */
  fit?: number;
  /** Canvas width / height, used to pick which way the table is looked at. */
  aspect?: number;
}

/** Below this the window is tall enough to look down the length of the table. */
export const LENGTHWISE_ASPECT = 1.2;

export function cameraFor(mode: CameraMode, cue: Vec3, pose: FreePose | null = null, framing: Framing = {}): Pose {
  const fit = framing.fit ?? 1;

  if (mode === 'top') {
    // Straight down needs its own up, or the world tips over and the table ends
    // up standing on its short edge.
    return backOff(
      {
        position: { x: 0, y: 13.5, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: -1 },
      },
      fit,
    );
  }
  if (mode === 'side') {
    return backOff(
      { position: { x: 0, y: 5.4, z: 9.6 }, target: { x: 0, y: 0, z: 0 }, up: UP },
      fit,
    );
  }

  // A camera the player placed, or a table being turned: the hand says where the
  // eye is, and it stays there until the hand moves it again — no auto zoom, the
  // frame is theirs.
  if (pose) return poseOf(cue, pose);
  if (mode === 'free') return poseOf(cue, DEFAULT_FREE);

  // Behind the white ball. There is no aim argument on purpose: the pointer
  // steers the cue, and a camera that turned with it would chase the mouse and
  // never let the player see the rack.
  const towards = cue.x <= 0 ? 1 : -1;
  // A monitor looks *across* the table, low, with the gaze leaning to the middle
  // so the rack stays in frame — the classic broadcast angle.
  if (!looksLengthwise(framing.aspect ?? 2)) {
    return backOff(
      {
        position: { x: cue.x - towards * 5.4, y: 2.7, z: cue.z * 0.7 - 1.9 },
        target: { x: cue.x + towards * 4.2, y: BALL_LIFT, z: cue.z * 0.7 + 0.5 },
        up: UP,
      },
      fit,
    );
  }
  // A phone held upright is tall and narrow, and a billiard table seen from the
  // rail is wide and short: the two shapes fight, and the table loses — it ends
  // up a stamp in the middle of the sky. From high behind the white ball the long
  // edge runs up the screen instead, the cloth and the frame agree, and the table
  // fills the phone.
  const back = 6.5;
  return backOff(
    {
      position: { x: cue.x - towards * back, y: BALL_LIFT + back * 1.9, z: cue.z * 0.6 },
      target: { x: cue.x + towards * 1.5, y: BALL_LIFT, z: cue.z * 0.6 },
      up: UP,
    },
    // Ten kadr już patrzy z góry — nie dokładamy wspięcia, bo tylko psuje kadr.
    fit,
    0,
  );
}
