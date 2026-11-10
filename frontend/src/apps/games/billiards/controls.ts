/**
 * Sterowanie bilardem — wspólna dla 2D i 3D.
 *
 * Trzy niezależne widełki, bo gracz chce trzech różnych rzeczy:
 *  - **celowanie**: kijem (palec kręci kijem przy kuli) albo stołem (świat wiruje,
 *    uderzenie zawsze idzie od gracza),
 *  - **uderzenie**: pociągnięcie wzdłuż kija albo guzik,
 *  - **widok**: automat, swobodny (ustawiam kamerę palcem, wtedy celowanie śpi)
 *    i własny (kamery nie ruszam, celuję).
 *
 * Ustawienia celowania i uderzenia żyją w `localStorage` — gierki z zasady nic nie
 * zapisują w bazie. Widoku nie zapisujemy: to kadr na jedną chwilę, a start gry z
 * wyłączonym celowaniem byłby głupi.
 */
import type { Point } from './billiards';

/** Co robi przeciągnięcie palca: ustawia kij, czy obraca stół. */
export type AimMode = 'cue' | 'table';
/** Co odpala uderzenie: puszczenie palca po pociągnięciu, czy tylko guzik. */
export type Trigger = 'pull' | 'button';
/** Kamera: sama dba o kadr, gracz ją ustawia, albo gracz ustawił i zamroził. */
export type CameraWanted = 'auto' | 'free' | 'placed';

export interface Controls {
  aim: AimMode;
  trigger: Trigger;
}

export const DEFAULT_CONTROLS: Controls = { aim: 'cue', trigger: 'pull' };
export const DEFAULT_CAMERA: CameraWanted = 'auto';

export const AIM_MODES: { id: AimMode; label: string; hint: string }[] = [
  { id: 'cue', label: 'Kij', hint: 'w bok kręcę kijem, w dół nabieram siły' },
  { id: 'table', label: 'Stół', hint: 'przeciągam stół, uderzenie zawsze od gracza' },
];

export const TRIGGERS: { id: Trigger; label: string; hint: string }[] = [
  { id: 'pull', label: 'Pociągnięcie', hint: 'puść kij, aby uderzyć' },
  { id: 'button', label: 'Guzik', hint: 'uderza tylko „Uderz”' },
];

export const CAMERAS: { id: CameraWanted; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'kamera sama pilnuje stołu' },
  { id: 'free', label: 'Swobodny', hint: 'ustaw kadr palcem — celowanie śpi' },
  { id: 'placed', label: 'Własny', hint: 'kamery nie ruszam, celuję kijem' },
];

const KEY = 'note:bilard:sterowanie';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** Only known values get through; anything else falls back to the default. */
export function parseControls(raw: string | null): Controls {
  if (!raw) return DEFAULT_CONTROLS;
  try {
    const read = JSON.parse(raw) as Partial<Controls>;
    return {
      aim: read.aim === 'table' ? 'table' : 'cue',
      trigger: read.trigger === 'button' ? 'button' : 'pull',
    };
  } catch {
    return DEFAULT_CONTROLS;
  }
}

export function formatControls(controls: Controls): string {
  return JSON.stringify({ aim: controls.aim, trigger: controls.trigger });
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Reading settings can throw (private mode); a billiard still needs a table. */
export function loadControls(store?: Store): Controls {
  try {
    return parseControls((store ?? window.localStorage).getItem(KEY));
  } catch {
    return DEFAULT_CONTROLS;
  }
}

export function saveControls(controls: Controls, store?: Store): void {
  try {
    (store ?? window.localStorage).setItem(KEY, formatControls(controls));
  } catch {
    // Nowhere to remember it — the game just starts with the defaults next time.
  }
}

/** How far the finger has to travel for a radian of turning. */
const TURN_PER_PIXEL = 0.006;
/** Dead zone and full power of a pull, in screen pixels — a finger is a finger. */
const PULL_MIN = 12;
const PULL_MAX = 212;
/** How eagerly a vertical drag tilts the camera / zooms the table. */
const LIFT_PER_PIXEL = 0.006;

export interface DragEffect {
  /** How much to turn, in radians (kij or stół — the view decides what follows). */
  spin: number;
  /** Power loaded by the pull towards the player, 0..1. */
  power: number;
}

/**
 * What a drag with the finger down asks for, in screen pixels, so the same
 * gesture means the same thing on a phone and on a monitor: sideways turns,
 * towards the player loads the cue.
 *
 * Both aiming modes read the same numbers. The difference is what is allowed to
 * follow: with „kij” only the cue swings and the camera keeps its word, with
 * „stół” the whole world turns so the shot always runs away from the player.
 */
export function dragEffect(start: Point, now: Point): DragEffect {
  return {
    spin: (now.x - start.x) * TURN_PER_PIXEL,
    power: clamp01((Math.max(0, now.y - start.y) - PULL_MIN) / (PULL_MAX - PULL_MIN)),
  };
}

export interface ViewDrag {
  /** Yaw of the free camera, radians. */
  spin: number;
  /** Vertical travel: tilt in 3D, zoom in 2D. */
  lift: number;
}

/**
 * What a drag does while the view is being set. Aiming is asleep, so the whole
 * screen belongs to the camera: sideways orbits, up and down tilts or zooms.
 */
export function viewDrag(start: Point, now: Point): ViewDrag {
  return { spin: (now.x - start.x) * TURN_PER_PIXEL, lift: (now.y - start.y) * LIFT_PER_PIXEL };
}

/**
 * Where the camera ends up when the player taps an aiming option.
 *
 * Tapping „Kij” after placing a view must not throw the view away — it hands the
 * screen back to the cue and freezes the camera where the player left it.
 */
export const afterAimTap = (camera: CameraWanted): CameraWanted =>
  camera === 'free' ? 'placed' : camera;

/** Is the cue allowed to answer to the finger right now? */
export const aimingActive = (camera: CameraWanted): boolean => camera !== 'free';

/** Limits of the free camera and of the 2D frame. */
export const TILT = { min: 0.14, max: 1.32, base: 0.34 };
export const DISTANCE = { min: 4.4, max: 15, base: 7.6 };
export const ZOOM = { min: 0.55, max: 2, base: 1 };

/** Does letting go of the drag strike the ball? */
export const strikesOnRelease = (trigger: Trigger): boolean => trigger === 'pull';

/** Rotation of the 2D table so that the cue points up the screen. Degrees. */
export const viewRotation = (aim: number): number => -90 - (aim * 180) / Math.PI;

/** A frame of the 2D table: turned by `angle` degrees, magnified by `zoom`. */
export interface Frame {
  angle: number;
  zoom: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The box a turned table really needs.
 *
 * Measuring the turned table instead of squeezing it into the straight frame means
 * the cloth fills the window at any angle — on a phone held upright the table gets
 * a tall frame and stops being a stamp in the middle of the screen.
 */
export function turnedBox(width: number, height: number, degrees: number, margin = 1.04): Box {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const box = { width: (width * cos + height * sin) * margin, height: (width * sin + height * cos) * margin };
  return { x: -box.width / 2, y: -box.height / 2, ...box };
}

/** A rectangle in screen pixels, the way `getBoundingClientRect` reports one. */
export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A point on the screen back into table units.
 *
 * The frame turns and magnifies the table around `centre`, so the finger has to be
 * turned back and shrunk before it means anything to the physics. Without this,
 * aiming after a free view would point the cue somewhere else than the finger.
 */
export function screenToTable(
  client: Point,
  screen: ClientBox,
  frame: { box: Box; angle: number; zoom: number; centre: Point },
): Point {
  if (screen.width === 0 || screen.height === 0) return frame.centre;
  const at = {
    x: ((client.x - screen.left) / screen.width) * frame.box.width + frame.box.x,
    y: ((client.y - screen.top) / screen.height) * frame.box.height + frame.box.y,
  };
  const rad = (-frame.angle * Math.PI) / 180;
  const back = {
    x: at.x * Math.cos(rad) - at.y * Math.sin(rad),
    y: at.x * Math.sin(rad) + at.y * Math.cos(rad),
  };
  return { x: back.x / frame.zoom + frame.centre.x, y: back.y / frame.zoom + frame.centre.y };
}
