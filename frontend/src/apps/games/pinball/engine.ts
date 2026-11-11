/**
 * Sesja gry.
 *
 * Trzyma świat, zasady, efekty i to, w której fazie jest gra. Celowo nie wie
 * nic o React ani o płótnie: `step(dt, input)` do przodu, `rama(time)` do
 * narysowania. Dzięki temu da się rozegrać całą partię w teście, klatka po
 * klatce, bez zegara, bez canvasu i bez czekania.
 */

import { vec } from './geometry';
import type { Input, World } from './physics';
import { createWorld, liveBalls, plungerSpeed, PULL_SAG, spawnBall, stepWorld } from './physics';
import { PLUNGER, SAUCER, buildTable } from './table';
import { applyHits, startFever, startGame, tick } from './rules';
import type { Rules } from './rules';
import { addRing, advanceFx, applyEffects, createFx, dmdLines, updateTrails } from './view';
import type { Fx, Punkt } from './view';
import type { BallView, DmdView, Frame } from './render';
import { rngFrom } from '../shared/random';
import type { Dźwięk } from './sound';

export type Faza = 'ładowanie' | 'gra' | 'koniec';

/** Tyle sekund kula czeka na powrót po wpadnięciu do kielicha. */
const RESPAWN_DELAY = 0.9;
/** Tyle samo po otworze — gracz musi zobaczyć, co się stało. */
const NEXT_BALL_DELAY = 1.1;

export interface Engine {
  step(dt: number, input: Input): void;
  launch(pull: number): void;
  reset(): void;
  faza(): Faza;
  zasady(): Rules;
  efekty(): Fx;
  swiat(): World;
  /** Kula czekająca na wyrzutnik — rysowana, ale jeszcze nie w świecie. */
  zaladowana(): Punkt | null;
  /** Kompletny obraz dla rysownika, ze smugami kul. */
  rama(time: number, plunger: number): Frame;
  /** Co ma pokazać matryca. */
  matryca(): DmdView;
}

/**
 * `startowe` pozwala zacząć partię od ustawionego stanu — testy używają tego,
 * żeby wejść w jackpot bez rozgrywania całej partii na dojście do niego.
 */
export function createEngine(
  seed = 1989,
  onSound?: (name: Dźwięk) => void,
  startowe: Rules = startGame(),
): Engine {
  const bodies = buildTable();
  const trails = new Map<number, Punkt[]>();
  let world = createWorld(bodies, rngFrom(seed));
  let rules = startowe;
  let fx = createFx();
  let faza: Faza = 'ładowanie';
  /** Na co czekamy: na kulę z kielicha czy na nowe ładowanie. */
  let wait: 'kielich' | 'otwór' | null = null;
  /** Smugi kul liczone w tempie fizyki — `rama` tylko je oddaje. */
  let tory: BallView[] = [];
  let respawn = 0;
  /** Jak długo kula leży w torze — za długo znaczy, że z niego nie wyjechała. */
  let wTorze = 0;
  const rng = rngFrom(seed ^ 0x5eed);
  // Osobny generator do wstrząsu: rysowanie nie może ruszać kolejności losów gry.
  const rngDrżenie = rngFrom(seed ^ 0xcafe);

  const dźwięk = (name: Dźwięk): void => onSound?.(name);

  /** Wypuszcza kulę z kielicha na środek pola — tak robi automat po trybie. */
  const fromSaucer = (): void => {
    const side = rng() < 0.5 ? -1 : 1;
    spawnBall(world, vec(SAUCER.x + side * 3, SAUCER.y + 6), vec(side * (40 + rng() * 60), 260));
  };

  const engine: Engine = {
    step(dt, input) {
      // Klapek nie wolno zamrażać podczas ładowania, inaczej pierwsze
      // rąbnięcie po starcie wygląda na martwe.
      const hits = stepWorld(world, dt, input);
      for (const hit of hits) {
        if (hit.kind === 'bumper' || hit.kind === 'sling') addRing(fx, hit.at.x, hit.at.y);
      }

      const reduced = applyHits(rules, hits, liveBalls(world).length + (faza === 'ładowanie' ? 1 : 0));
      rules = reduced.state;
      const spawn = applyEffects(fx, reduced.effects, rng, dźwięk);

      // Zasady poprosiły o kule z multiballa — wychodzą z kielicha natychmiast,
      // a kula złapana wraca po chwili i robią się trzy, jak w oryginale.
      for (let i = 0; i < spawn; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        spawnBall(world, vec(SAUCER.x + side * 8, SAUCER.y + 8), vec(side * (90 + rng() * 80), 320));
      }

      const drained = hits.some((hit) => hit.kind === 'drain');
      const captured = hits.some((hit) => hit.kind === 'kicker');
      if (captured) {
        // Kielich może odpalić gorączkę — jeśli była gotowa, wchodzi teraz.
        const fever = startFever(rules);
        rules = fever.state;
        applyEffects(fx, fever.effects, rng, dźwięk);
        wait = 'kielich';
        respawn = RESPAWN_DELAY;
      }
      if (drained) {
        if (rules.over) {
          faza = 'koniec';
        } else if (liveBalls(world).length === 0) {
          // Ostatnia kula zeszła ze stołu: chwila oddechu i nowe ładowanie.
          wait = 'otwór';
          respawn = NEXT_BALL_DELAY;
        }
        // Przy multiballu inne kule jeszcze grają — nie przerywamy im.
      }

      if (wait && respawn > 0) {
        respawn -= dt;
        if (respawn <= 0) {
          const co = wait;
          wait = null;
          respawn = 0;
          if (rules.over) faza = 'koniec';
          else if (co === 'otwór') faza = 'ładowanie';
          else fromSaucer();
        }
      }

      // Za słabe wciśnięcie wyrzutnika nie może być darmowe. W automacie kula
      // zjeżdża wtedy z powrotem na kielzeń i liczy się jako stracona; bez tego
      // kroku gracz zostałby z kulą leżącą na dnie toru w nieskończoność.
      if (faza === 'gra' && wait === null) {
        const leży = world.balls.some(
          (ball) => ball.pos.x > 231 && ball.pos.y > 150 && Math.hypot(ball.vel.x, ball.vel.y) < 40,
        );
        wTorze = leży ? wTorze + dt : 0;
        if (wTorze > 0.5 && world.balls.length === 1) {
          wTorze = 0;
          const zguba = applyHits(rules, [
            { kind: 'drain', tag: 'otwór', at: vec(240, 470), speed: 0, ball: world.balls[0].id },
          ], 1);
          rules = zguba.state;
          applyEffects(fx, zguba.effects, rng, dźwięk);
          world.balls[0].alive = false;
          faza = rules.over ? 'koniec' : 'ładowanie';
        }
      }

      const timed = tick(rules, dt);
      rules = timed.state;
      applyEffects(fx, timed.effects, rng, dźwięk);
      advanceFx(fx, dt);
      tory = updateTrails(world, trails);
    },

    launch(pull) {
      if (faza !== 'ładowanie') return;
      spawnBall(world, PLUNGER, vec(0, -plungerSpeed(pull)));
      faza = 'gra';
      wTorze = 0;
      dźwięk('wyrzutnik');
    },

    reset() {
      world = createWorld(bodies, rngFrom(seed));
      rules = startGame();
      fx = createFx();
      trails.clear();
      tory = [];
      wait = null;
      respawn = 0;
      wTorze = 0;
      faza = 'ładowanie';
    },

    faza: () => faza,
    zasady: () => rules,
    efekty: () => fx,
    swiat: () => world,
    zaladowana: () => (faza === 'ładowanie' ? { x: PLUNGER.x, y: PLUNGER.y } : null),

    rama(clock, plunger) {
      // Sam odczyt: smugi rachuje `step`, żeby ten sam kadr narysować dwa razy.
      const balls = tory;
      const loaded = engine.zaladowana();
      const shake = fx.shake;
      return {
        world,
        rules,
        glow: fx.glow,
        floats: fx.floats,
        sparks: fx.sparks,
        rings: fx.rings,
        // Kula siada razem ze sprężyną. Ruch w górę wyglądał jak dźwignia, która
        // „wcale nie ciągnie", bo kula uciekała w stronę bramy zamiast w dół.
        balls: loaded ? [...balls, { x: loaded.x, y: loaded.y + plunger * PULL_SAG, trail: [] }] : balls,
        plunger,
        loaded: loaded !== null,
        time: clock,
        shake: shake > 0 ? { x: (rngDrżenie() - 0.5) * shake * 2, y: (rngDrżenie() - 0.5) * shake * 2 } : { x: 0, y: 0 },
        bankDown: rules.bankDown,
      };
    },

    matryca() {
      const lines = dmdLines(rules, fx);
      return {
        score: rules.score,
        line2: rules.over ? 'KONIEC GRY' : lines.line2,
        line3: lines.line3,
        ballsLeft: rules.ballsLeft,
        multiplier: rules.multiplier,
        letters: rules.letters,
        jackpotLit: rules.jackpotLit,
        mode: rules.mode,
        over: rules.over,
      };
    },
  };

  return engine;
}
