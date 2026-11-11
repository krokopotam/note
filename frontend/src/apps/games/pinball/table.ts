/**
 * Stół.
 *
 * Geometria w pikselach bufora 256 × 512 — dokładnie tam, gdzie rysuje
 * `render.ts`, więc krawędź bandy i jej cień nigdy się nie rozjadą. Układ jest
 * klasyczny: góra w łuku, trzy zbijaki w trójkącie, bank trzech celu po lewej,
 * dwie celki stojące po prawej, kielich na samej górze, razemarks nad klapkami i
 * dwa kanały boczne, które wypluwają kulę tak samo jak środek.
 *
 * Lewa strona jest pisana wprost, prawa przez `lustro` — jedno przestawienie
 * liczby nie może zostawić stołu krzywego, a test `stół jest zamknięty` i tak by
 * to złapał, ale znacznie później i mniej czytelnie.
 */

import { vec } from './geometry';
import type { Vec } from './geometry';
import { WORLD_H, WORLD_W } from './physics';
import type { Body } from './physics';

// Rozmiar pola bierze fizyka — rysownik i zasady patrzą na te same liczby.
export const TABLE_W = WORLD_W;
export const TABLE_H = WORLD_H;

/** Środek kielicha: stamtąd kula wraca na stół po trybie. */
export const SAUCER = vec(128, 42);
/** Miejsce, w którym kula czeka na wyrzutnik. */
export const PLUNGER = vec(240, 461);

export const LEFT_FLIPPER_PIVOT = vec(86, 448);
export const RIGHT_FLIPPER_PIVOT = vec(170, 448);
export const FLIPPER_LENGTH = 40;
export const FLIPPER_RADIUS = 3.4;
export const FLIPPER_REST = 0.52;
export const FLIPPER_UP = -0.6;
export const FLIPPER_TIP_RADIUS = 2.3;

/**
 * Mini-klapka. Siedzi wysoko, na lewej orbicie, i ma jedno zadanie: kula, która
 * zjedzie lewą burtą, dostaje tu drugą szansę zamiast opływać dołek. Trzecia
 * klappa jest celowo jedna i celowo po lewej —tędy wraca większość kul po
 * wystrzale, a dwa takie wynalazki zrobiłyby ze stołu bilard.
 */
export const MINI_PIVOT = vec(12, 250);
export const MINI_LENGTH = 24;
export const MINI_RADIUS = 3;
export const MINI_TIP_RADIUS = 2;
export const MINI_REST = 0.45;
export const MINI_UP = -0.6;

/** Odbicia ścian: rants gumy, drewno i metal nie są jednakowe. */
const RAIL = 0.34;
const GUIDE = 0.26;

/** Lustro punktu względem środka pola (x = 128). */
const mirror = (p: Vec): Vec => vec(TABLE_W - p.x, p.y);

/** Lustro odcinka — koniec i początek zamieniają się miejscami, żeby bieg został ciągły. */
const mirrorSeg = (a: Vec, b: Vec): [Vec, Vec] => [mirror(b), mirror(a)];

/** Banda po lewej i ta sama po prawej. */
function pair(tag: string, a: Vec, b: Vec, bounce = RAIL): Body[] {
  return [
    { kind: 'wall', a, b, tag: `${tag}.l`, bounce },
    { kind: 'wall', a: mirrorSeg(a, b)[0], b: mirrorSeg(a, b)[1], tag: `${tag}.p`, bounce },
  ];
}

/**
 * Łuk górnej misy: od lewej ściany, przez szczyt, do wylotu toru wyrzutnika.
 * Krótkie cięciwy — przy długich kula wpada w nie pod kątem i albo odbija się
 * w bok, albo (najgorsze) zatrzymuje na płaskiej strunie.
 */
function topArc(): Body[] {
  const points: Vec[] = [
    vec(8, 92),
    vec(10, 70),
    vec(20, 50),
    vec(40, 34),
    vec(70, 24),
    vec(104, 20),
    vec(140, 20),
    vec(176, 24),
    vec(194, 31),
    vec(206, 44),
  ];
  const out: Body[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    out.push({ kind: 'wall', a: points[i], b: points[i + 1], tag: 'łuk', bounce: RAIL });
  }
  return out;
}

/** Ściany boczne pola gry i dno kanałów. */
function walls(): Body[] {
  return [
    // Zewnętrzne krawędzie pola. Lewa jest jedna, prawa — ścianą toru wyrzutnika,
    // więc nie mają sobie pary i test lustrzanych band ich nie szuka.
    { kind: 'wall', a: vec(8, 92), b: vec(8, TABLE_H), tag: 'ściana zewnętrzna.l', bounce: RAIL },
    // Tor wyrzutnika: ściana wewnętrzna od bramy aż do dna kanału.
    { kind: 'wall', a: vec(230, 100), b: vec(230, 470), tag: 'tor', bounce: GUIDE },
    { kind: 'wall', a: vec(248, 78), b: vec(248, 470), tag: 'tor', bounce: GUIDE },
    { kind: 'wall', a: vec(230, 470), b: vec(248, 470), tag: 'wyrzutnik.dno', bounce: 0.1 },
    // Róg nad torem wyrzutnika: długi i stromy celowo. Kula leci torem prawie
    // pionowo w górę i po tym zjeździe musi pójść w lewy róg stołu, przez pasy i
    // zbijaki. Róg za płytki oddaje ją z powrotem na prawą burtę i całą partię
    // gra się połową stołu.
    { kind: 'wall', a: vec(206, 44), b: vec(248, 78), tag: 'róg', bounce: RAIL },

    // Kanały boczne (outlane): pasek 18 px, z którego nie ma powrotu.
    ...pair('kanał', vec(26, 384), vec(26, 474), GUIDE),

    // Lej do klapki — po nim kula zjeżdża na kij, a nie w kanał. Koniec leja
    // musi wypadać przy samej osi klapki: jakakolwiek przeciwległa ścianacreate
    // tworzy kieszonkę, w której kula zasiada na wieczność.
    // Koniec leja musi zostać *nad* klapką, nie w jej narożniku: gdy dochodzi do
    // samej osi, kula wpada w kątnicę między lejem a osią i siedzi.
    ...pair('lej', vec(26, 384), vec(72, 436), GUIDE),

    // Ściany zwężające pole nad razemarkami, żeby kula nie leżała na klapce wiecznie.
    ...pair('gardziel', vec(52, 300), vec(64, 352), GUIDE),
  ];
}

/** Klapy, które puszczają kulę z toru na górę i nie wpuszczają jej z powrotem. */
function gates(): Body[] {
  return [
    // Ujście toru: w górę wolno, w dół nie.
    { kind: 'wall', a: vec(230, 100), b: vec(248, 96), tag: 'brama.tor', bounce: 0.2, normal: vec(0, -1) },
  ];
}

/** Razemarks: ściana odpalająca impuls, twarzą w stronę klapki. */
function slings(): Body[] {
  const face: [Vec, Vec] = [vec(66, 366), vec(86, 412)];
  const [ra, rb] = mirrorSeg(face[0], face[1]);
  return [
    { kind: 'sling', a: face[0], b: face[1], tag: 'razemek.l', kick: 330 },
    { kind: 'sling', a: ra, b: rb, tag: 'razemek.p', kick: 330 },
    // Ściany boczne razemarka, żeby kula nie weszła w niego od tyłu.
    ...pair('razemek.tyl', vec(66, 366), vec(52, 352), 0.3),
  ];
}

/** Trzy zbijaki w trójkącie — serce stołu. */
function bumpers(): Body[] {
  return [
    { kind: 'bumper', at: vec(100, 152), r: 10, tag: 'zbijak.1', kick: 400 },
    { kind: 'bumper', at: vec(156, 152), r: 10, tag: 'zbijak.2', kick: 400 },
    { kind: 'bumper', at: vec(128, 190), r: 10, tag: 'zbijak.3', kick: 400 },
  ];
}

/** Bank trzech celu (lewy górny róg) i dwie celki stojące po prawej. */
function targets(): Body[] {
  return [
    { kind: 'target', at: vec(40, 120), r: 5, tag: 'bank.1' },
    { kind: 'target', at: vec(40, 138), r: 5, tag: 'bank.2' },
    { kind: 'target', at: vec(40, 156), r: 5, tag: 'bank.3' },
    { kind: 'target', at: vec(204, 132), r: 5, tag: 'stoja.1' },
    { kind: 'target', at: vec(214, 158), r: 5, tag: 'stoja.2' },
  ];
}

/** Słupki: odbijają, rozdzielają, nie dają położyć się kuli w rogu. */
function posts(): Body[] {
  return [
    { kind: 'post', at: vec(74, 250), r: 4, tag: 'słupek.1' },
    { kind: 'post', at: vec(182, 250), r: 4, tag: 'słupek.2' },
    { kind: 'post', at: vec(128, 262), r: 5, tag: 'słupek.3' },
    // Odblask przy wlocie do kanału: bez niego kula wchodzi w kanał bez szansy.
    { kind: 'post', at: vec(38, 356), r: 3.4, tag: 'słupek.kanał.l' },
    { kind: 'post', at: vec(218, 356), r: 3.4, tag: 'słupek.kanał.p' },
  ];
}

/**
 * Pasy z literami. Siedzą *pod* korytarzem wejściowym, a nie w nim: kula
 * wystrzelona z toru leci łukiem w lewą stronę tuż pod łukiem (na wysokości
 * ok. 60 px) i gdyby przegroda wystawała na tę wysokość, wlatujący bil odbijał
 * się od niej z powrotem na prawą burtę i schodził na dół nie trącając niczego.
 * Stąd pasy niżej i przegrody krótkie — jeden pas, jedna litera.
 */
export const LANE_TAGS = ['pas.J', 'pas.A', 'pas.C', 'pas.K', 'pas.P'] as const;

function lanes(): Body[] {
  const ys = 84;
  const out: Body[] = [];
  const xs = [70, 99, 128, 157, 186];
  xs.forEach((x, i) => {
    out.push({ kind: 'sensor', at: vec(x, ys), r: 6.5, tag: LANE_TAGS[i] });
    if (i < xs.length - 1) {
      out.push({ kind: 'wall', a: vec(x + 14.5, ys - 9), b: vec(x + 14.5, ys + 8), tag: 'przegroda', bounce: GUIDE });
    }
  });
  return out;
}

/** Czujniki: nalot na klapkę (inlane) i powrót z toru. */
function sensors(): Body[] {
  return [
    { kind: 'sensor', at: vec(48, 404), r: 6, tag: 'nalot.l' },
    { kind: 'sensor', at: vec(208, 404), r: 6, tag: 'nalot.p' },
    { kind: 'sensor', at: vec(240, 300), r: 7, tag: 'tor' },
    { kind: 'sensor', at: vec(128, 320), r: 7, tag: 'środek' },
    // Kupki po bokach, tuż pod pasami — po zebraniu obu Automat dorzuca kulę.
    { kind: 'sensor', at: vec(64, 112), r: 6, tag: 'sklep.l' },
    { kind: 'sensor', at: vec(192, 112), r: 6, tag: 'sklep.p' },
  ];
}

/** Kielich na szczycie: chwyta kulę, rules decydują, kiedy i z jakim impetem wraca. */
function saucer(): Body[] {
  return [
    { kind: 'kicker', at: SAUCER, r: 7.5, tag: 'kielich', shot: vec(0, 0) },
    // Krawędź kielicha po bokach, żeby kula wchodziła do środka, a nie po nim.
    { kind: 'wall', a: vec(118, 34), b: vec(118, 52), tag: 'kielich.l', bounce: 0.2 },
    { kind: 'wall', a: vec(138, 34), b: vec(138, 52), tag: 'kielich.p', bounce: 0.2 },
  ];
}

/** Klapek nie buduje `physics` — tu tylko je opisujemy. */
function flippers(): Body[] {
  return [
    {
      kind: 'flipper',
      side: 'left',
      pivot: LEFT_FLIPPER_PIVOT,
      length: FLIPPER_LENGTH,
      radius: FLIPPER_RADIUS,
      tipRadius: FLIPPER_TIP_RADIUS,
      rest: FLIPPER_REST,
      up: FLIPPER_UP,
      angle: FLIPPER_REST,
      omega: 0,
      tag: 'klapka.l',
    },
    {
      kind: 'flipper',
      side: 'mini',
      pivot: MINI_PIVOT,
      length: MINI_LENGTH,
      radius: MINI_RADIUS,
      tipRadius: MINI_TIP_RADIUS,
      rest: MINI_REST,
      up: MINI_UP,
      angle: MINI_REST,
      omega: 0,
      tag: 'klapka.mini',
    },
    {
      kind: 'flipper',
      side: 'right',
      pivot: RIGHT_FLIPPER_PIVOT,
      length: FLIPPER_LENGTH,
      radius: FLIPPER_RADIUS,
      tipRadius: FLIPPER_TIP_RADIUS,
      // Prawa klapka to ta sama geometria lustrzana co reszta stołu: kąt θ idzie
      // do π − θ. Było tu `π + FLIPPER_UP`, czyli spoczynek 150,2° i „góra”
      // 145,6° — klapka o 4,6° w dół, w stronę odpływu. Cała prawa strona stołu
      // była martwa, a żadna klapki prawej w testach nie ruszała.
      rest: Math.PI - FLIPPER_REST,
      up: Math.PI - FLIPPER_UP,
      angle: Math.PI - FLIPPER_REST,
      omega: 0,
      tag: 'klapka.p',
    },
  ];
}

/** Cały stół jako lista ciał dla `createWorld`. */
export function buildTable(): Body[] {
  return [
    ...walls(),
    ...topArc(),
    ...gates(),
    ...slings(),
    ...bumpers(),
    ...targets(),
    ...posts(),
    ...lanes(),
    ...sensors(),
    ...saucer(),
    ...flippers(),
  ];
}

/** Wszystkie tagi, które coś znaczą dla zasad — testy pilnują, że nie znikną. */
export const SCORE_TAGS = {
  lanes: LANE_TAGS,
  bumpers: ['zbijak.1', 'zbijak.2', 'zbijak.3'],
  bank: ['bank.1', 'bank.2', 'bank.3'],
  standups: ['stoja.1', 'stoja.2'],
  inlanes: ['nalot.l', 'nalot.p'],
  slings: ['razemek.l', 'razemek.p'],
  saucer: 'kielich',
} as const;

/** Gdzie co jest — dla renderera (kolor bandy, blask zbijaka, cień klapki). */
export function bodiesOf<K extends Body['kind']>(kind: K, bodies: Body[]): Extract<Body, { kind: K }>[] {
  return bodies.filter((body) => body.kind === kind) as Extract<Body, { kind: K }>[];
}
