/**
 * Księgowość efektów.
 *
 * Zasady mówią, co się stało (`Effect`), rysownik umie tylko malować. Między
 * jednym a drugim siedzi ten plik: zamienia listę zdarzeń na latające liczby,
 * iskry, fale i mapę zaświeceń, a potem starzeje je o `dt`. Trzymany osobno,
 * bo dzięki temu komponent nie ma ani jednej linii logiki do sprawdzenia na ślepo.
 */

import { PAL } from './render';
import type { Dźwięk } from './sound';
import type { BallView } from './render';
import type { Effect } from './rules';
import type { Rules } from './rules';
import type { World } from './physics';

export interface Floater {
  text: string;
  x: number;
  y: number;
  age: number;
  tone: 'zwykły' | 'tryb' | 'jackpot';
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  color: number;
}

export interface Ring {
  x: number;
  y: number;
  age: number;
  color: number;
}

/** Punkt toru — tylko współrzędne, bez reszty widoku. */
export interface Punkt {
  x: number;
  y: number;
}

export interface Fx {
  floats: Floater[];
  sparks: Spark[];
  rings: Ring[];
  /** Tag elementu → 0…1 jasności. Gaśnie sam. */
  glow: Record<string, number>;
  /** Energia wstrząsu, maleje wykładniczo. */
  shake: number;
  /** Najnowszy napis na matrycę i jak dawno wszedł. */
  banner: string;
  bannerAge: number;
}

const FLOAT_LIFE = 1.5;
const SPARK_LIFE = 0.55;
const RING_LIFE = 0.7;
const BANNER_LIFE = 2.4;
const FLOAT_MAX = 26;
const SPARK_MAX = 180;
const RING_MAX = 20;
const TRAIL = 5;

export function createFx(): Fx {
  return { floats: [], sparks: [], rings: [], glow: {}, shake: 0, banner: '', bannerAge: 99 };
}

const iskrz = (fx: Fx, x: number, y: number, count: number, color: number, rng: () => number): void => {
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const speed = 60 + rng() * 220;
    fx.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, age: 0, color });
  }
  if (fx.sparks.length > SPARK_MAX) fx.sparks.splice(0, fx.sparks.length - SPARK_MAX);
};

/**
 * Przy przejściu efektów z zasad: rysuje iskry, zapala elementy, dokłada
 * napisy. Zwraca liczbę kul, które komponent ma wypuścić na stół.
 */
export function applyEffects(fx: Fx, effects: Effect[], rng: () => number, onSound?: (name: Dźwięk) => void): number {
  let spawn = 0;
  for (const effect of effects) {
    switch (effect.kind) {
      case 'float':
        if (!effect.text) break;
        fx.floats.push({ text: effect.text, x: effect.at.x, y: effect.at.y, age: 0, tone: effect.tone });
        if (fx.floats.length > FLOAT_MAX) fx.floats.shift();
        iskrz(
          fx,
          effect.at.x,
          effect.at.y,
          effect.tone === 'jackpot' ? 22 : effect.tone === 'tryb' ? 12 : 7,
          effect.tone === 'jackpot' ? PAL.żółty : effect.tone === 'tryb' ? PAL.cyjan : PAL.biel,
          rng,
        );
        break;
      case 'flash':
        fx.glow[effect.tag] = 1;
        break;
      case 'shake':
        fx.shake = Math.min(8, fx.shake + effect.power);
        break;
      case 'sound':
        onSound?.(effect.name);
        break;
      case 'banner':
        fx.banner = effect.text;
        fx.bannerAge = 0;
        break;
      case 'spawn':
        spawn += effect.count;
        break;
    }
  }
  return spawn;
}

/** Falę uderzeniową dorzuca się osobno, bo jej środek zna tylko widok. */
export function addRing(fx: Fx, x: number, y: number, color: number = PAL.biel): void {
  fx.rings.push({ x, y, age: 0, color });
  if (fx.rings.length > RING_MAX) fx.rings.shift();
}

/** Starzeje wszystko o `dt` i wycina to, co już zgasło. */
export function advanceFx(fx: Fx, dt: number): void {
  for (const key of Object.keys(fx.glow)) {
    const value = fx.glow[key] - dt * 3.4;
    if (value <= 0.002) delete fx.glow[key];
    else fx.glow[key] = value;
  }
  for (const float of fx.floats) float.age += dt;
  fx.floats = fx.floats.filter((float) => float.age < FLOAT_LIFE);

  for (const spark of fx.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 520 * dt;
    spark.age += dt;
  }
  fx.sparks = fx.sparks.filter((spark) => spark.age < SPARK_LIFE);

  for (const ring of fx.rings) ring.age += dt;
  fx.rings = fx.rings.filter((ring) => ring.age < RING_LIFE);

  fx.bannerAge += dt;
  fx.shake *= Math.pow(0.0025, dt);
  if (fx.shake < 0.05) fx.shake = 0;
}

/**
 * Smugi kul. Historia trzymana jest poza fizyką — tam obowiązuje jedna kula,
 * jeden stan, a tu chodzi tylko o to, żeby kula na ekranie nie wyglądała jak
 * wycięta z kadru.
 */
export function updateTrails(world: World, trails: Map<number, Punkt[]>): BallView[] {
  const out: BallView[] = [];
  const alive = new Set<number>();
  for (const ball of world.balls) {
    alive.add(ball.id);
    const history = trails.get(ball.id) ?? [];
    history.push({ x: ball.pos.x, y: ball.pos.y });
    while (history.length > TRAIL) history.shift();
    trails.set(ball.id, history);
    out.push({ x: ball.pos.x, y: ball.pos.y, trail: history.slice(0, history.length - 1) });
  }
  for (const id of [...trails.keys()]) if (!alive.has(id)) trails.delete(id);
  return out;
}

/** Dwa dolne wiersze matrycy. */
export function dmdLines(rules: Rules, fx: Fx): { line2: string; line3: string } {
  const line2 =
    fx.bannerAge < BANNER_LIFE
      ? fx.banner
      : rules.jackpotLit
        ? 'JACKPOT OTWARTY'
        : rules.mode
          ? rules.mode.toUpperCase()
          : rules.letters.length
            ? `HASLO ${rules.letters.join('')}`
            : 'ZBIERAJ JACKPOT';
  return { line2, line3: `KULE ${rules.ballsLeft} ×${rules.multiplier}` };
}

/** Kolor tablicy wyników w HUD — ten sam, co na matrycy, żeby oczy nie skakały. */
export function hudColor(mode: Rules['mode']): string {
  if (mode === 'multiball') return '#ff6040';
  if (mode === 'gorączka') return '#fa8420';
  if (mode === 'mnożnik') return '#20b2c8';
  return '#f2c418';
}
