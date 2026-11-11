/**
 * Fizyka pinballa.
 *
 * Kula to punkt z promieniem, stół to zbiór ciał: ścian (odcinki), słupków
 * (okręgi), zbijaków, „razemek” (bandy odpalające impuls), celu, klapek
 * jednokierunkowych, czujników i klapki obrotowe. Wszystko w pikselach bufora
 * 256 × 512, w krokach 1/120 s z podziałem na podkroki — przy pełnym wyrzutniku
 * kula leci ~1400 px/s, czyli 11 px na krok, a najcieńsza przeszkoda na stole ma
 * 5 px. Bez podziału kula przeskakiwałaby bandę.
 *
 * Świat jest mutowany w miejscu i tak ma zostać: 60 klatek × 3 kule × 12 podsteps
 * to kilkanaście tysięcy kolizji na sekundę, a każdą z nich resolwujemy w tej
 * samej tabeli ciał. Czyste pozostają funkcje jednej kolizji — `collideSegment`,
 * `collideCircle`, `collideFlipper` — i na nich stoją testy.
 */

import {
  add,
  bounce,
  clamp,
  closestOnSegment,
  dot,
  len,
  norm,
  scale,
  sub,
  surfaceVelocity,
  vec,
} from './geometry';
import type { Vec } from './geometry';

/** Rozmiar pola: bufor 256 × 512, czyli proporcje pionowego stołu. */
export const WORLD_W = 256;
export const WORLD_H = 512;

/** Promień kuli. W oryginale 27 mm na ~1,3 m stołu — tu 4,6 px z 512. */
export const BALL_R = 4.6;

/** Przyspieszenie w płaszczyźnie stołu (stół jest pochylony, nie pionowy). */
export const GRAVITY = 760;

/** Ile kula odbija od bandy, od słupka, od klapki. */
export const WALL_BOUNCE = 0.36;
export const POST_BOUNCE = 0.62;
export const FLIPPER_BOUNCE = 0.28;

/** Tarcie styczne — od niego kula po bandzie toczy się, a nie ślizga bez końca. */
export const WALL_FRICTION = 0.045;
export const FLIPPER_FRICTION = 0.1;

/** Szybkość klapki: w górę rąbie, w dół opada leniwie — dokładnie jak sprężyna. */
export const FLIPPER_UP = 27;
export const FLIPPER_DOWN = 13;

/** Najdłuższy krok podziału: poniżej połowy promienia kuli, więc nie prze_skoczy. */
const MAX_STEP = BALL_R * 0.45;

export const MAX_SPEED = 1450;

/** Kula, która stoi dłużej niż tyle sekund, dostaje kopniaka (maszyny robią to samo). */
export const STUCK_AFTER = 3.4;
/**
 * Od tej wysokości w dół kula jest już pod klapkami. Czekanie, aż sama
 * przekroczy dół bufora, tylko pozwala jej usiąść na czymś w przejściu.
 */
const DEFAULT_DRAIN_Y = 484;

export interface Ball {
  id: number;
  pos: Vec;
  vel: Vec;
  r: number;
  alive: boolean;
  /** Sekundy bez ruchu — patrz `STUCK_AFTER`. */
  stuck: number;
}

/** Co może stać na stole. Każdy wariant ma `tag` dla zasad i dla rysowania. */
export type Body =
  | { kind: 'wall'; a: Vec; b: Vec; tag: string; bounce?: number; /** Którą stronę trzyma; bez niej obie. */ normal?: Vec }
  | { kind: 'post'; at: Vec; r: number; tag: string; bounce?: number }
  | { kind: 'bumper'; at: Vec; r: number; tag: string; kick: number }
  | { kind: 'sling'; a: Vec; b: Vec; tag: string; kick: number }
  | { kind: 'target'; at: Vec; r: number; tag: string }
  | {
      kind: 'flipper';
      side: 'left' | 'right';
      pivot: Vec;
      length: number;
      /** Promień przy osi obrotu. */
      radius: number;
      /**
       * Promień na czubku. Prawdziwa klapka jest stożkowa i to nie kosmetyka:
       * bez zwężenia dwie zamknięte klapki tworzą widełki, w których kula siada
       * i patrzy na gracza do końca życia.
       */
      tipRadius: number;
      rest: number;
      up: number;
      angle: number;
      omega: number;
      tag: string;
    }
  | { kind: 'sensor'; at: Vec; r: number; tag: string }
  | { kind: 'kicker'; at: Vec; r: number; tag: string; shot: Vec }
  | { kind: 'drain'; a: Vec; b: Vec; tag: string };

export interface Hit {
  kind: 'wall' | 'post' | 'bumper' | 'sling' | 'target' | 'roll' | 'gate' | 'kicker' | 'drain' | 'stuck' | 'launch';
  tag: string;
  at: Vec;
  /** Prędkość kuli w chwili zdarzenia — z niej rules liczy siłę efektu. */
  speed: number;
  ball: number;
}

export interface World {
  bodies: Body[];
  balls: Ball[];
  /** Pole grawitacyjne: w dół ekranu, ale da się przechylić nudgem. */
  gravity: Vec;
  bounds: { left: number; top: number; right: number; bottom: number };
  /** Od tej wysokości w dół kula jest już za klapkami — liczymy ją jako straconą. */
  drainY: number;
  time: number;
  /** Co i do kiedy jest wyłączone (celki przewrócone, razemek po odpaleniu). */
  timers: Record<string, number>;
  /** Kula↔czujnik, żeby rollover odpalał się raz na wejście. */
  overlap: Record<string, true>;
  nextBallId: number;
  rng: () => number;
}

export interface Input {
  left: boolean;
  right: boolean;
}

export function createWorld(bodies: Body[], rng: () => number = () => 0.5): World {
  return {
    bodies,
    balls: [],
    gravity: vec(0, GRAVITY),
    bounds: { left: 0, top: 0, right: WORLD_W, bottom: WORLD_H },
    drainY: DEFAULT_DRAIN_Y,
    time: 0,
    timers: {},
    overlap: {},
    nextBallId: 1,
    rng,
  };
}

export function spawnBall(world: World, at: Vec, vel: Vec = vec(0, 0)): Ball {
  const ball: Ball = { id: world.nextBallId, pos: { ...at }, vel: { ...vel }, r: BALL_R, alive: true, stuck: 0 };
  world.nextBallId += 1;
  world.balls.push(ball);
  return ball;
}

export const isDown = (world: World, tag: string): boolean => (world.timers[tag] ?? 0) > world.time;

export const cool = (world: World, tag: string, until: number): void => {
  world.timers[tag] = Math.max(world.timers[tag] ?? 0, until);
};

/** Kula w polu widzenia i żywa? */
export const liveBalls = (world: World): Ball[] => world.balls.filter((ball) => ball.alive);

/** Klapki: trzymana = jedzie do górnego ogranicznika, puszczona = opada. */
export function stepFlippers(world: World, input: Input, dt: number): void {
  for (const body of world.bodies) {
    if (body.kind !== 'flipper') continue;
    const held = body.side === 'left' ? input.left : input.right;
    const speed = held ? FLIPPER_UP : FLIPPER_DOWN;
    const target = held ? body.up : body.rest;
    const delta = target - body.angle;
    const step = speed * dt;
    if (Math.abs(delta) <= step) {
      body.angle = target;
      body.omega = 0; // doszła do ogranicznika — nie ma już czego przekazać kuli
    } else {
      body.omega = Math.sign(delta) * speed;
      body.angle += body.omega * dt;
    }
  }
}

/** Koniec odcinka klapki: `pivot` + length pod kątem `angle`. */
export function flipperTip(flipper: Extract<Body, { kind: 'flipper' }>): Vec {
  return {
    x: flipper.pivot.x + Math.cos(flipper.angle) * flipper.length,
    y: flipper.pivot.y + Math.sin(flipper.angle) * flipper.length,
  };
}

/**
 * Normalna odcinka, gdy środek kuli trafi dokładnie na niego. Wybieram stronę
 * przeciwną pędowi kuli — inaczej ten sam przypadek dawałby odbicie w losową
 * stronę i test nie byłby powtarzalny.
 */
function sideNormal(a: Vec, b: Vec, velocity: Vec): Vec {
  const axis = norm(sub(b, a));
  const n = vec(-axis.y, axis.x);
  return dot(n, velocity) <= 0 ? n : scale(n, -1);
}

interface SegmentHitOptions {
  restitution: number;
  friction: number;
  /** Prędkość powierzchni (klapka) — od niej bierze się kopnięcie. */
  surface?: Vec;
  /**
   * Kierunek, w który banda **trąca** kulę. Banda jednokierunkowa (klapka toru
   * powrotnego) trzyma tylko od jednej strony: kula lecąca zgodnie z tą normalną
   * czyli od tyłu, przechodzi swobodnie.
   */
  blockNormal?: Vec;
  /** Dokłada impuls prosto w normalną (razemki, zbijaki). */
  kick?: number;
}

/**
 * Kula vs odcinek. Zwraca zdarzenie i rusza kulą, albo zwraca null.
 *
 * Trzy rzeczy dzieją się tu naraz i kolejność ma znaczenie: najpierw impuls od
 * ruchomej powierzchni (klapka trafia kulę, która na niej leży), potem odbicie
 * od normalnej, na końcu wypchnięcie z nakładki. Wypchnięcie jest po odbiciu,
 * żeby kula nie odbiła się od ściany, w którą już weszła na pół promienia.
 */
export function collideSegment(
  ball: Ball,
  a: Vec,
  b: Vec,
  options: SegmentHitOptions,
): { normal: Vec; depth: number } | null {
  const near = closestOnSegment(ball.pos, a, b);
  const delta = sub(ball.pos, near.point);
  const distance = len(delta);
  if (distance > ball.r) return null;

  // Normalna patrzy od bandy ku kulie — to znaczy, że ujemny iloczyn skalarny z
  // pędem to kula wpadająca w przeszkodę.
  const normal = distance > 1e-6 ? scale(delta, 1 / distance) : sideNormal(a, b, ball.vel);

  if (options.blockNormal && dot(ball.vel, options.blockNormal) > 0) return null;

  const surface = options.surface ?? vec(0, 0);
  const relative = sub(ball.vel, surface);
  const closing = dot(relative, normal);
  if (closing < 0) {
    let next = add(surface, bounce(relative, normal, options.restitution, options.friction));
    if (options.kick) next = add(next, scale(normal, options.kick));
    ball.vel = next;
  }
  // Wypchnięcie tylko gdy kula naprawdę siedzi w ciele — inaczej drżałaby na bandzie.
  const depth = ball.r - distance;
  if (depth > 0) ball.pos = add(ball.pos, scale(normal, depth));
  return { normal, depth };
}

/** Kula vs okrąg (słupek, zbijak, celka). */
export function collideCircle(
  ball: Ball,
  at: Vec,
  radius: number,
  options: { restitution: number; friction?: number; kick?: number },
): { normal: Vec; depth: number } | null {
  const delta = sub(ball.pos, at);
  const distance = len(delta);
  const reach = radius + ball.r;
  if (distance > reach) return null;
  let normal = distance > 1e-6 ? scale(delta, 1 / distance) : vec(0, -1);
  const relative = ball.vel;
  if (dot(relative, normal) < 0) {
    let next = bounce(relative, normal, options.restitution, options.friction ?? 0);
    if (options.kick) next = add(next, scale(normal, options.kick));
    ball.vel = next;
  }
  ball.pos = add(at, scale(normal, reach));
  return { normal, depth: reach - distance };
}

/**
 * Kula vs klapka (kapsuła).
 *
 * Klapka nie jest ścianą: jej powierzchnia pędzi. Liczę prędkość punktu kontaktu
 * jak ω × r i od niej odejmuję prędkość kuli — to jedyny uczciwy sposób, żeby
 * kula leżąca na opuszczonej klapce została wyrzucona, gdy klapka rąbie w górę,
 * a nie tylko prześlizgnęła się po niej, nie zostawiając śladu.
 */
export function collideFlipper(
  ball: Ball,
  flipper: Extract<Body, { kind: 'flipper' }>,
): { normal: Vec; speed: number } | null {
  const tip = flipperTip(flipper);
  const near = closestOnSegment(ball.pos, flipper.pivot, tip);
  const delta = sub(ball.pos, near.point);
  const distance = len(delta);
  // Klapka jest stożkowa: przy osi gruba, na czubku cienka.
  const reach = (flipper.radius + (flipper.tipRadius - flipper.radius) * near.t) + ball.r;
  if (distance > reach) return null;

  const axis = norm(sub(tip, flipper.pivot));
  const surface = surfaceVelocity(flipper.omega, sub(near.point, flipper.pivot));

  // Kiedy klapka rąbnie, w jednej chwili potrafi zakryć kulę w połowie długości:
  // środek kuli siada wtedy na osi klapki, a normalna z nakładki wskazuje byle
  // gdzie albo nie istnieje wcale. Biorę ją wtedy z kierunku prostopadłego do
  // klapki, po tej stronie, w którą pędzi jej powierzchnia — bo to powierzchnia
  // kulę porwała i w tę stronę musi ją wypuścić.
  const sideways = vec(-axis.y, axis.x);
  let normal: Vec;
  if (distance > flipper.radius * 0.4) {
    normal = scale(delta, 1 / distance);
  } else {
    const hint = len(surface) > 1 ? surface : ball.vel;
    normal = dot(sideways, hint) >= 0 ? sideways : scale(sideways, -1);
  }

  const relative = sub(ball.vel, surface);
  const before = len(ball.vel);
  if (dot(relative, normal) < 0) {
    ball.vel = add(surface, bounce(relative, normal, FLIPPER_BOUNCE, FLIPPER_FRICTION));
  }
  // Wypchnięcie liczby od powierzchni klapki wzdłuż tej samej normalnej, inaczej
  // kula zostaje w środku kapsuły i w następnej klatce wypada na wylot.
  ball.pos = add(near.point, scale(normal, reach));
  return { normal, speed: Math.max(before, len(ball.vel)) };
}

/** Czy kula weszła w czujnik? Odpala raz na wejście, dzięki `world.overlap`. */
function sensorEvent(world: World, ball: Ball, at: Vec, radius: number, kind: Hit['kind'], tag: string): Hit | null {
  const key = `${ball.id}:${tag}`;
  const inside = dot(sub(ball.pos, at), sub(ball.pos, at)) <= radius * radius;
  if (inside && !world.overlap[key]) {
    world.overlap[key] = true;
    return { kind, tag, at: { ...ball.pos }, speed: len(ball.vel), ball: ball.id };
  }
  if (!inside && world.overlap[key]) delete world.overlap[key];
  return null;
}

/** Jeden podkrok: grawitacja, ruch, kolizje. */
function substep(world: World, ball: Ball, dt: number, hits: Hit[]): void {
  ball.vel = add(ball.vel, scale(world.gravity, dt));
  const speed = len(ball.vel);
  if (speed > MAX_SPEED) ball.vel = scale(ball.vel, MAX_SPEED / speed);
  ball.pos = add(ball.pos, scale(ball.vel, dt));

  for (const body of world.bodies) {
    switch (body.kind) {
      case 'wall': {
        const hit = collideSegment(ball, body.a, body.b, {
          restitution: body.bounce ?? WALL_BOUNCE,
          friction: WALL_FRICTION,
          blockNormal: body.normal,
        });
        if (hit) hits.push({ kind: 'wall', tag: body.tag, at: { ...ball.pos }, speed, ball: ball.id });
        break;
      }
      case 'sling': {
        if (isDown(world, body.tag)) break;
        const hit = collideSegment(ball, body.a, body.b, {
          restitution: 0.5,
          friction: WALL_FRICTION,
          kick: body.kick,
        });
        if (hit && dot(hit.normal, ball.vel) > 0) {
          // Razemek strzela tylko wtedy, gdy kula w niego wpadła, nie gdy
          // odprowadzamy ją po jego powierzchni.
          cool(world, body.tag, world.time + 0.12);
          hits.push({ kind: 'sling', tag: body.tag, at: { ...ball.pos }, speed, ball: ball.id });
        }
        break;
      }
      case 'post': {
        const hit = collideCircle(ball, body.at, body.r, { restitution: body.bounce ?? POST_BOUNCE });
        if (hit) hits.push({ kind: 'post', tag: body.tag, at: { ...ball.pos }, speed, ball: ball.id });
        break;
      }
      case 'bumper': {
        if (isDown(world, body.tag)) {
          const hit = collideCircle(ball, body.at, body.r, { restitution: 0.2, friction: 0.2 });
          if (hit) hits.push({ kind: 'post', tag: `${body.tag}.dead`, at: { ...ball.pos }, speed, ball: ball.id });
          break;
        }
        const hit = collideCircle(ball, body.at, body.r, { restitution: 0.32, kick: body.kick });
        if (hit) {
          cool(world, body.tag, world.time + 0.09);
          hits.push({ kind: 'bumper', tag: body.tag, at: { ...body.at }, speed, ball: ball.id });
        }
        break;
      }
      case 'target': {
        if (isDown(world, body.tag)) break;
        const hit = collideCircle(ball, body.at, body.r, { restitution: 0.25, friction: 0.2 });
        if (hit) {
          hits.push({ kind: 'target', tag: body.tag, at: { ...body.at }, speed, ball: ball.id });
        }
        break;
      }
      case 'flipper': {
        const hit = collideFlipper(ball, body);
        if (hit && hit.speed > 60) {
          hits.push({ kind: 'wall', tag: body.tag, at: { ...ball.pos }, speed: hit.speed, ball: ball.id });
        }
        break;
      }
      case 'sensor': {
        const hit = sensorEvent(world, ball, body.at, body.r, 'roll', body.tag);
        if (hit) hits.push(hit);
        break;
      }
      case 'kicker': {
        if (dot(sub(ball.pos, body.at), sub(ball.pos, body.at)) <= body.r * body.r) {
          ball.alive = false;
          hits.push({ kind: 'kicker', tag: body.tag, at: { ...body.at }, speed: len(ball.vel), ball: ball.id });
        }
        break;
      }
      case 'drain':
        break;
    }
  }

  // Ścany boczne świata: poza nimi nie ma nic, kula nie ma prawa się tam znaleźć.
  if (ball.pos.x < world.bounds.left + ball.r) {
    ball.pos.x = world.bounds.left + ball.r;
    ball.vel.x = Math.abs(ball.vel.x) * WALL_BOUNCE;
  }
  if (ball.pos.x > world.bounds.right - ball.r) {
    ball.pos.x = world.bounds.right - ball.r;
    ball.vel.x = -Math.abs(ball.vel.x) * WALL_BOUNCE;
  }
}

/**
 * Krok świata. Mutuje `world`, zwraca zdarzenia tej klatki.
 *
 * Podział na podkroki bierze się z najszybszej kuli, nie z góry wziętej liczby:
 * spokojna kula robi jeden krok, kula z wyrzutnika dwanaście. Dzięki temu test
 * „kula przy pełnej prędkości nie przechodzi przez bandę” jest prawdziwy, a nie
 * przypadkowy.
 */
export function stepWorld(world: World, dt: number, input: Input): Hit[] {
  const hits: Hit[] = [];
  stepFlippers(world, input, dt);

  let fastest = 0;
  for (const ball of world.balls) if (ball.alive) fastest = Math.max(fastest, len(ball.vel));
  const steps = clamp(Math.ceil((fastest * dt) / MAX_STEP), 1, 24);
  const sub = dt / steps;

  for (const ball of world.balls) {
    if (!ball.alive) continue;
    for (let i = 0; i < steps; i += 1) substep(world, ball, sub, hits);

    const speed = len(ball.vel);
    ball.stuck = speed < 26 ? ball.stuck + dt : 0;
    if (ball.stuck > STUCK_AFTER) {
      ball.stuck = 0;
      const side = world.rng() < 0.5 ? -1 : 1;
      ball.vel = add(ball.vel, vec(side * 120, -160));
      hits.push({ kind: 'stuck', tag: 'kula', at: { ...ball.pos }, speed, ball: ball.id });
    }

    if (ball.pos.y + ball.r > world.drainY) {
      ball.alive = false;
      hits.push({ kind: 'drain', tag: 'otwór', at: vec(ball.pos.x, world.bounds.bottom), speed, ball: ball.id });
    }
  }

  world.time += dt;
  // Kula wypadła — sprzątamy jej ślad po czujnikach, żeby numer nie wrócił w padlinie.
  for (const ball of world.balls) {
    if (ball.alive) continue;
    for (const key of Object.keys(world.overlap)) if (key.startsWith(`${ball.id}:`)) delete world.overlap[key];
  }
  world.balls = world.balls.filter((ball) => ball.alive);
  return hits;
}

/** Wyrzutnik: trzymanie nabija sprężynę, puszczenie wystrzeliwuje w górę toru. */
export const PULL_MAX = 1;
/** Muśnięcie: kula podskakuje w torze i zostaje w nim, tak jak w automacie. */
export const PULL_MIN_SPEED = 300;
export const PULL_FULL_SPEED = 1180;
/** O tyle pikseli kula i sprężyna siadają przy pełnym naciągnięciu. */
export const PULL_SAG = 14;
/**
 * Prędkość, która wynosi kulę spod sprężyny do wylotu toru: 461 → 78 px, czyli
 * 391 px pod górę, więc co najmniej pierwiastek z 2·g·h ≈ 771 px/s. Bierze się
 * 830 — zapas na tarcie o ściany toru i na to, że „wyszło" ma być widoczne, a nie
 * osiągnięte o włos.
 */
export const PRÓG_TORU = 830;

/**
 * Prędkość startowa wprost z naciągnięcia — liniowo. Kwadratowa krzywa zbijała
 * środkowe wciśnięcie do ~600 px/s, czyli poniżej `PRÓG_TORU`: półautomatu nie
 * dało się uruchomić, bo kula uczciwie naciśnięta wracała na sprężynę.
 */
export function plungerSpeed(pull: number): number {
  const p = clamp(pull, 0, PULL_MAX);
  return PULL_MIN_SPEED + (PULL_FULL_SPEED - PULL_MIN_SPEED) * p;
}

/**
 * Najmniejsze naciągnięcie, po którym kula na pewno wychodzi z toru. Interfejs
 * wystrzeliwuje z nie mniejszą wartością, żeby muśnięcie palcem nie wyglądało na
 * zepsutą maszynę; poniżej tego progu jest już tylko decyzja gracza.
 */
export const PULL_PEWNY = (PRÓG_TORU - PULL_MIN_SPEED) / (PULL_FULL_SPEED - PULL_MIN_SPEED);

/** Nudge: krótki impuls w całą kulę, potem grawitacja wraca na miejsce. */
export function nudge(world: World, direction: Vec): void {
  for (const ball of liveBalls(world)) ball.vel = add(ball.vel, scale(direction, 170));
}
