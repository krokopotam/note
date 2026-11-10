/**
 * Mostek między stołem a sceną three.js.
 *
 * Fizyka liczy w jednostkach stołu (220 × 110, y rośnie w dół ekranu). Scena
 * potrzebuje metrów i osi Y do góry. Trzymanie tego w dwóch czystych funkcjach
 * znaczy, że można policzyć bez WebGL, gdzie wyląduje kamera, a bilard 2D i 3D
 * dzielą ten sam układ współrzędnych.
 */
import { BALL_R, TABLE } from '../billiards/billiards';
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

/**
 * Where the camera should sit and what it should look at.
 *
 * "Za kulą" is the playing view: behind the white ball and looking down the
 * table, so the balls being aimed at are always in the frame. The app eases the
 * camera towards the pose instead of snapping to it.
 */
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
export function cameraFor(mode: CameraMode, cue: Vec3, pose: FreePose | null = null): Pose {
  if (mode === 'top') {
    // Straight down needs its own up, or the world tips over and the table ends
    // up standing on its short edge.
    return {
      position: { x: 0, y: 13.5, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
    };
  }
  if (mode === 'side') {
    return { position: { x: 0, y: 5.4, z: 9.6 }, target: { x: 0, y: 0, z: 0 }, up: UP };
  }

  // A camera the player placed, or a table being turned: the hand says where the
  // eye is, and it stays there until the hand moves it again.
  if (pose) return poseOf(cue, pose);
  if (mode === 'free') return poseOf(cue, DEFAULT_FREE);

  // Behind the white ball, looking down the length of the table. There is no aim
  // argument on purpose: the pointer steers the cue, and a camera that turned
  // with it would chase the mouse and never let the player see the rack.
  const towards = cue.x <= 0 ? 1 : -1;
  return {
    position: { x: cue.x - towards * 5.4, y: 2.7, z: cue.z * 0.7 - 2.4 },
    target: { x: cue.x + towards * 4.2, y: BALL_LIFT, z: cue.z * 0.7 + 0.5 },
    up: UP,
  };
}
