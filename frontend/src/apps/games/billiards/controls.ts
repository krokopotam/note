/**
 * Sterowanie bilardem — wspólna dla 2D i 3D.
 *
 * Gracze chcą dwóch rzeczy: celować kijem (kierunek wskazuje palec) albo obracać
 * stołem (świat kręci się tak, żeby uderzenie zawsze szło „od widza"). Do tego
 * wyzwalacz uderzenia: pociągnięcie wzdłuż kija albo guzik. Ustawienia żyją w
 * `localStorage` — gierki z zasady nic nie zapisują w bazie, a to jest zwyczajnie
 * wygodne, bo na telefonie i na biurku sprawdza się co innego.
 */
import type { Point } from './billiards';

/** Co robi przeciągnięcie palca: ustawia kij, czy obraca stół. */
export type AimMode = 'cue' | 'table';
/** Co odpala uderzenie: puszczenie palca po pociągnięciu, czy tylko guzik. */
export type Trigger = 'pull' | 'button';

export interface Controls {
  aim: AimMode;
  trigger: Trigger;
}

export const DEFAULT_CONTROLS: Controls = { aim: 'cue', trigger: 'pull' };

export const AIM_MODES: { id: AimMode; label: string; hint: string }[] = [
  { id: 'cue', label: 'Kij', hint: 'palec wskazuje kierunek kija' },
  { id: 'table', label: 'Stół', hint: 'przeciągnij, aby obrócić stół' },
];

export const TRIGGERS: { id: Trigger; label: string; hint: string }[] = [
  { id: 'pull', label: 'Pociągnięcie', hint: 'puść kij, aby uderzyć' },
  { id: 'button', label: 'Guzik', hint: 'uderza tylko „Uderz”' },
];

const KEY = 'note:bilard:sterowanie';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

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

/** How far the eye has to drag for the table to turn a radian. */
const TURN_PER_PIXEL = 0.006;
/** Dead zone and full power of a pull, in screen pixels — a finger is a finger. */
const PULL_MIN = 12;
const PULL_MAX = 212;

export interface DragEffect {
  /** How much the view should turn, in radians. */
  aimDelta: number;
  /** Power loaded by the drag, 0..1. */
  power: number;
}

/**
 * What a drag does, in the mode the player picked — measured in screen pixels,
 * so the same gesture asks for the same strength on a phone and on a monitor.
 *
 * Along the cue it is the distance away from where the finger landed. When the
 * table is being turned it is the sideways travel that steers and the pull
 * towards the player that loads the cue.
 */
export function dragEffect(start: Point, now: Point, mode: AimMode): DragEffect {
  const dx = now.x - start.x;
  const dy = now.y - start.y;
  if (mode === 'table') {
    return {
      aimDelta: dx * TURN_PER_PIXEL,
      power: clamp01((Math.max(0, dy) - PULL_MIN) / (PULL_MAX - PULL_MIN)),
    };
  }
  return {
    aimDelta: 0,
    power: clamp01((Math.hypot(dx, dy) - PULL_MIN) / (PULL_MAX - PULL_MIN)),
  };
}

/** Does letting go of the drag strike the ball? */
export const strikesOnRelease = (trigger: Trigger): boolean => trigger === 'pull';

/** Rotation of the 2D table so that the cue points up the screen. Degrees. */
export const viewRotation = (aim: number): number => -90 - (aim * 180) / Math.PI;

/**
 * Uniform scale that keeps a turned rectangle inside its own box.
 *
 * A turned table needs it or the corners run out of the window and half the rack
 * disappears. It is 1 for a table that stands straight and ~0.6 for our 2:1 table
 * lying across the frame — which is also why „stół” is such a gift on a phone held
 * upright: the long edge of the table becomes the long edge of the screen.
 */
export function fitScale(
  degrees: number,
  width: number,
  height: number,
  boxWidth = width,
  boxHeight = height,
): number {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return Math.min(
    boxWidth / (width * cos + height * sin),
    boxHeight / (width * sin + height * cos),
  );
}
