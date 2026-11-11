/**
 * Rysownik.
 *
 * Wszystko idzie do bufora 256 × 512 z palety Amigi, potem jedno powiększenie
 * nearest-neighbour na prawdziwe płótno. Stąd cała uroda i stąd ograniczenia:
 * żadnego antyaliasingu, żadnych półcieni — tylko plamy barwne, z którymi
 * można zrobić muchę na krawacie.
 *
 * Warstwy, od spodu:
 *   1. plastik — wydrukowana plandeka, pieczona raz przy starcie (`createPlastic`)
 *   2. blaski zapalników — to, co w automacie miga
 *   3. ciała stołu — bandy, słupki, zbijaki, razemarks, cele, klapki
 *   4. kule z cieniem, smugą i błyskiem
 *   5. efekty — iskry, fale uderzeniowe, latające liczby
 *
 * Bufor to `Uint32Array` w kolejności bajtów little-endian (RGBA), więc można
 * pisać jeden piksel jednym zapisem i rozmywać alpha bez dzielenia na kanały.
 */

import { BALL_R } from './physics';
import type { Body, World } from './physics';
import { bodiesOf } from './table';
import type { Rules } from './rules';

export const FB_W = 256;
export const FB_H = 512;

/** Pakuje kanały do jednego słowa tak, jak ich oczekuje `ImageData.data`. */
export const rgba = (r: number, g: number, b: number, a = 255): number =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

const unpack = (color: number): [number, number, number, number] => [
  color & 255,
  (color >> 8) & 255,
  (color >> 16) & 255,
  (color >> 24) & 255,
];

/** Paleta wzięta z OCS: mało kolorów, dużo kontrastu. */
export const PAL = {
  noc: rgba(10, 6, 26),
  grafit: rgba(30, 22, 54),
  fiolet: rgba(96, 44, 150),
  cyjan: rgba(32, 178, 200),
  żółty: rgba(242, 196, 24),
  czerwony: rgba(226, 60, 28),
  pomarańcz: rgba(250, 132, 32),
  zielony: rgba(46, 194, 122),
  biel: rgba(238, 232, 255),
  szkło: rgba(150, 170, 220),
  plastik: rgba(196, 200, 226),
  plastikCiemny: rgba(96, 98, 138),
  guma: rgba(206, 48, 64),
  metal: rgba(214, 222, 246),
  cień: rgba(4, 2, 12, 190),
  stal: rgba(126, 140, 178),
  kula: rgba(226, 232, 250),
  kulaCień: rgba(52, 62, 104),
  rubin: rgba(255, 96, 64),
} as const;

// ---------------------------------------------------------------- piksele

export class Buf {
  readonly w: number;
  readonly h: number;
  readonly px: Uint32Array;

  constructor(w = FB_W, h = FB_H) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h);
  }

  clear(color: number): this {
    this.px.fill(color);
    return this;
  }

  /** Piksel bez mieszania — najszybsze, co można zrobić. */
  set(x: number, y: number, color: number): void {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    this.px[yi * this.w + xi] = color;
  }

  /** Mieszanie alfa: `alpha` 0…255, liczone osobno na kanałach, bez dzielenia po drodze. */
  blend(x: number, y: number, color: number, alpha: number): void {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h || alpha <= 0) return;
    const index = yi * this.w + xi;
    if (alpha >= 255) {
      this.px[index] = color;
      return;
    }
    const [dr, dg, db] = unpack(this.px[index]);
    const [sr, sg, sb] = unpack(color);
    const inv = 255 - alpha;
    this.px[index] = rgba(
      (sr * alpha + dr * inv) >> 8,
      (sg * alpha + dg * inv) >> 8,
      (sb * alpha + db * inv) >> 8,
      255,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 255): void {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.blend(xx, yy, color, alpha);
  }

  /** Prosta z gradientem grubości — bandy i promienie. */
  line(x0: number, y0: number, x1: number, y1: number, thickness: number, color: number, alpha = 255): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const radius = thickness / 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.disc(x0 + dx * t, y0 + dy * t, radius, color, alpha);
    }
  }

  disc(cx: number, cy: number, radius: number, color: number, alpha = 255): void {
    const r2 = radius * radius;
    const x0 = Math.floor(cx - radius);
    const x1 = Math.ceil(cx + radius);
    const y0 = Math.floor(cy - radius);
    const y1 = Math.ceil(cy + radius);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const ddx = x + 0.5 - cx;
        const ddy = y + 0.5 - cy;
        if (ddx * ddx + ddy * ddy <= r2) this.blend(x, y, color, alpha);
      }
    }
  }

  /** Miękka plama światła — spodek pod zbijakiem, lampa nad stołem. */
  glow(cx: number, cy: number, radius: number, color: number, strength: number): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const ddx = x + 0.5 - cx;
        const ddy = y + 0.5 - cy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / radius;
        this.blend(x, y, color, strength * falloff * falloff);
      }
    }
  }

  ring(cx: number, cy: number, radius: number, thickness: number, color: number, alpha: number): void {
    const outer = radius + thickness / 2;
    const inner = Math.max(0, radius - thickness / 2);
    const x0 = Math.max(0, Math.floor(cx - outer));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + outer));
    const y0 = Math.max(0, Math.floor(cy - outer));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + outer));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const ddx = x + 0.5 - cx;
        const ddy = y + 0.5 - cy;
        const d = Math.hypot(ddx, ddy);
        if (d <= outer && d >= inner) this.blend(x, y, color, alpha);
      }
    }
  }
}

// ---------------------------------------------------------------- czcionka

/**
 * Stopka 5 × 7. Bez ogonków i kresek — automaty też ich nie miały, więc
 * „GORACZKA” jest bardziej wierne niż „GORĄCZKA”.
 */
const GLIFY: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#.##.'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
};

/** Zamienia polskie ogonki na to, co zmieści się na matrycy. */
export function dmdText(text: string): string {
  const map: Record<string, string> = { ą: 'A', ć: 'C', ę: 'E', ł: 'L', ń: 'N', ó: 'O', ś: 'S', ź: 'Z', ż: 'Z' };
  return text
    .split('')
    .map((char) => map[char.toLowerCase()] ?? char)
    .join('')
    .toUpperCase();
}

/** Rysuje tekst stopką 5 × 7; `skala` 1 daje literę 5 px — akurat na latające liczby. */
export function text(
  buf: Buf,
  content: string,
  x: number,
  y: number,
  color: number,
  skala = 1,
  shadow?: number,
): number {
  let cx = x;
  for (const char of dmdText(content)) {
    const glyph = GLIFY[char] ?? GLIFY[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] !== '#') continue;
        if (shadow) buf.blend(cx + col * skala + skala, y + row * skala + skala, shadow, 170);
        buf.rect(cx + col * skala, y + row * skala, skala, skala, color);
      }
    }
    cx += 6 * skala;
  }
  return cx;
}

/** Wyśrodkowany tekst — wszystko na matrycy liczy się w pikselach, nie w znakach. */
export function textCentered(buf: Buf, content: string, cy: number, color: number, skala = 1): void {
  const width = dmdText(content).length * 6 * skala - skala;
  text(buf, content, Math.round((buf.w - width) / 2), Math.round(cy - (7 * skala) / 2), color, skala);
}

// ---------------------------------------------------------------- plastik

/**
 * Wydruk na plandece. Piecze się raz: gradient, reflektory, kliny koloru,
 * gwiazdy, strzałki nalotu i cień wszystkich band. Rysowanie dynamiki tylko
 * dokłada na to blaski, więc klatka kosztuje tyle, co kopię bufora.
 */
export function createPlastic(bodies: Body[]): Buf {
  const buf = new Buf();
  const cx = FB_W / 2;

  // Głębokie tło: od dołu prawie czarne, u góry fiolet reflektora.
  for (let y = 0; y < FB_H; y += 1) {
    const t = y / FB_H;
    const shade = unpack(PAL.noc);
    const top = unpack(PAL.fiolet);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t * 0.5);
    const color = rgba(mix(top[0], shade[0]), mix(top[1], shade[1]), mix(top[3], shade[3]) + 24);
    buf.rect(0, y, FB_W, 1, color);
  }

  // Dwa reflektory nad zbijakami — to one robią nastrój.
  buf.glow(cx, 150, 130, PAL.fiolet, 120);
  buf.glow(cx, 150, 74, PAL.cyjan, 60);
  buf.glow(cx, 430, 120, PAL.fiolet, 70);

  // Kliny koloru rozchodzące się od szczytu — typowy wydruk z tamtych lat.
  for (let i = -3; i <= 3; i += 1) {
    const color = [PAL.fiolet, PAL.cyjan, PAL.czerwony, PAL.żółty][Math.abs(i) % 4];
    const edge = cx + i * 34;
    for (let y = 20; y < 320; y += 1) {
      const spread = (y - 20) * 0.18;
      const x = Math.round(edge + (edge > cx ? -spread : spread) * 0.3);
      buf.blend(x, y, color, 26);
      buf.blend(x + 1, y, color, 14);
    }
  }

  // Siatka w tle: melton ma drukowaną kratkę, inaczej plandeka jest martwa.
  for (let y = 0; y < FB_H; y += 8) for (let x = (y / 8) % 2 === 0 ? 0 : 4; x < FB_W; x += 8) buf.blend(x, y, PAL.szkło, 14);
  for (let y = 0; y < FB_H; y += 64) buf.rect(0, y, FB_W, 1, PAL.grafit, 90);

  // Gwiazdy i odpryski — drobny szum, który na dużym powiększeniu wygląda jak sitodruk.
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 420; i += 1) {
    const x = Math.floor(rnd() * FB_W);
    const y = 24 + Math.floor(rnd() * (FB_H - 48));
    const color = rnd() > 0.7 ? PAL.żółty : PAL.szkło;
    buf.blend(x, y, color, 30 + Math.floor(rnd() * 90));
  }

  // Napis przez środek — blade tło, żeby kula nigdy nie ginęła pod literami.
  const bufText = new Buf(FB_W, FB_H);
  textCentered(bufText, 'HIMALAJE', 250, rgba(255, 255, 255, 1), 5);
  textCentered(bufText, 'ELBRUS', 300, rgba(255, 255, 255, 1), 4);
  for (let y = 0; y < FB_H; y += 1) {
    for (let x = 0; x < FB_W; x += 1) {
      if (bufText.px[y * FB_W + x] !== 0) buf.blend(x, y, PAL.szkło, 22);
    }
  }

  // Strzałki nalotu: dwa chevrons po każdej stronie, prowadzą kulę do klapki.
  for (const side of [-1, 1]) {
    const base = cx + side * 80;
    for (let i = 0; i < 3; i += 1) {
      const y = 396 + i * 14;
      buf.line(base - 9, y, base, y + 8, 2, PAL.żółty, 150 - i * 30);
      buf.line(base, y + 8, base + 9, y, 2, PAL.żółty, 150 - i * 30);
    }
  }

  // Kanały boczne — ciemne rynny, z których nie ma ucieczki.
  for (const x of [8, 230]) buf.rect(x, 384, 18, FB_H - 384, PAL.grafit, 120);
  // Tor wyrzutnika.
  buf.rect(231, 100, 17, 372, PAL.grafit, 150);

  // Cień wszystkich band: jeden wspólny zapis, żeby krawędzie nie świeciły.
  for (const wall of bodiesOf('wall', bodies)) {
    buf.line(wall.a.x + 2, wall.a.y + 3, wall.b.x + 2, wall.b.y + 3, 5, PAL.cień, 150);
  }
  for (const post of bodiesOf('post', bodies)) buf.disc(post.at.x + 2, post.at.y + 3, post.r, PAL.cień, 150);

  return buf;
}

// ---------------------------------------------------------------- ramka

/** Stan wizualny jednej kuli: wystarczy pozycji i smugi. */
export interface BallView {
  x: number;
  y: number;
  trail: Array<{ x: number; y: number }>;
}

export interface Frame {
  world: World;
  rules: Rules;
  /** Tag → 0…1, jak mocno świeci dany element. */
  glow: Record<string, number>;
  /** Latające liczby i napisy. */
  floats: Array<{ text: string; x: number; y: number; age: number; tone: 'zwykły' | 'tryb' | 'jackpot' }>;
  sparks: Array<{ x: number; y: number; vx: number; vy: number; age: number; color: number }>;
  rings: Array<{ x: number; y: number; age: number; color: number }>;
  /** Kule z historią — sama fizyka nie pamięta smugi. */
  balls: BallView[];
  /** Wychylenie wyrzutnika 0…1. */
  plunger: number;
  /** Czy kula czeka w torze. */
  loaded: boolean;
  time: number;
  shake: { x: number; y: number };
  bankDown: number;
}

const flipperTip = (flipper: Extract<Body, { kind: 'flipper' }>) => ({
  x: flipper.pivot.x + Math.cos(flipper.angle) * flipper.length,
  y: flipper.pivot.y + Math.sin(flipper.angle) * flipper.length,
});

/** Kula: cień, korpus z cieniowaniem, obwódka światła i jasny punkt. */
function drawBall(buf: Buf, x: number, y: number, r: number): void {
  buf.disc(x + 2.5, y + 3.5, r, PAL.cień, 150);
  // Korpus — od dolnego brzegu ku górnemu, bez gradientów z biblioteki.
  for (let yy = -r; yy <= r; yy += 1) {
    for (let xx = -r; xx <= r; xx += 1) {
      if (xx * xx + yy * yy > r * r) continue;
      const light = Math.max(0, Math.min(1, (0.7 - (yy / r) * 0.75 - (xx / r) * 0.35) + 0.25));
      const [br, bg, bb] = unpack(PAL.kulaCień);
      const [hr, hg, hb] = unpack(PAL.kula);
      buf.set(
        Math.round(x + xx),
        Math.round(y + yy),
        rgba(
          Math.round(br + (hr - br) * light),
          Math.round(bg + (hg - bg) * light),
          Math.round(bb + (hb - bb) * light),
        ),
      );
    }
  }
  buf.ring(x, y, r, 1, PAL.biel, 120);
  buf.disc(x - r * 0.35, y - r * 0.45, Math.max(1, r * 0.26), PAL.biel, 235);
}

/** Rysuje całą klatkę do `bufor`. Funkcja czysta — nic nie pamięta między klatkami. */
export function paint(buf: Buf, frame: Frame): void {
  buf.clear(PAL.noc);

  const dx = Math.round(frame.shake.x);
  const dy = Math.round(frame.shake.y);

  // 1. plastik przesunięty o wstrząs
  const plastic = PLASTIK;
  for (let y = 0; y < FB_H; y += 1) {
    const src = y * FB_W;
    const target = y + dy;
    if (target < 0 || target >= FB_H) continue;
    for (let x = 0; x < FB_W; x += 1) {
      const sx = x + dx;
      if (sx < 0 || sx >= FB_W) continue;
      buf.px[target * FB_W + x] = plastic.px[src + sx];
    }
  }

  const { world, rules, glow, time } = frame;

  // 2. poświata trybu — cały stół łapie kolor, gdy coś gra
  if (rules.mode) {
    const color = rules.mode === 'multiball' ? PAL.czerwony : rules.mode === 'gorączka' ? PAL.pomarańcz : PAL.cyjan;
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    // Szachownica zamiast pełnego pokrycia: tak migały ekrany z palety 32 kolorów
    // i tak to wygląda lepiej niż udawany półcień.
    for (let y = 0; y < FB_H; y += 2) {
      for (let x = (y / 2) % 2; x < FB_W; x += 2) buf.blend(x, y, color, 12 + pulse * 18);
    }
  }

  // 3. ciała
  for (const body of world.bodies) {
    const shine = glow[body.tag] ?? 0;
    switch (body.kind) {
      case 'wall': {
        const bright = shine > 0;
        buf.line(body.a.x, body.a.y, body.b.x, body.b.y, 4, PAL.plastikCiemny);
        buf.line(body.a.x - 0.6, body.a.y - 0.8, body.b.x - 0.6, body.b.y - 0.8, 2, PAL.plastik);
        if (bright) {
          buf.line(body.a.x, body.a.y, body.b.x, body.b.y, 3, PAL.biel, Math.round(shine * 200));
          buf.line(body.a.x, body.a.y, body.b.x, body.b.y, 7, PAL.cyjan, Math.round(shine * 70));
        }
        break;
      }
      case 'post': {
        buf.disc(body.at.x, body.at.y, body.r, PAL.stal);
        buf.disc(body.at.x - body.r * 0.3, body.at.y - body.r * 0.35, body.r * 0.45, PAL.metal, 220);
        if (shine > 0) buf.glow(body.at.x, body.at.y, body.r * 3, PAL.biel, shine * 120);
        break;
      }
      case 'bumper': {
        const hot = shine > 0.02;
        buf.glow(body.at.x, body.at.y, body.r * 2.6, hot ? PAL.rubin : PAL.fiolet, hot ? 150 + shine * 100 : 55);
        buf.disc(body.at.x, body.at.y, body.r, hot ? PAL.pomarańcz : PAL.grafit);
        buf.ring(body.at.x, body.at.y, body.r - 1, 2, hot ? PAL.żółty : PAL.stal, 230);
        buf.disc(body.at.x, body.at.y, body.r * 0.5, hot ? PAL.biel : PAL.czerwony, 250);
        buf.disc(body.at.x - 1.5, body.at.y - 2, body.r * 0.2, PAL.biel, 210);
        break;
      }
      case 'sling': {
        const hot = shine > 0.02;
        buf.line(body.a.x, body.a.y, body.b.x, body.b.y, 5, hot ? PAL.żółty : PAL.guma);
        buf.line(body.a.x - 1, body.a.y - 1, body.b.x - 1, body.b.y - 1, 1.5, PAL.biel, hot ? 240 : 120);
        break;
      }
      case 'target': {
        const down = frame.bankDown > 0 && body.tag.startsWith('bank.') ? frame.bankDown : 0;
        const index = Number(body.tag.split('.')[1] ?? '1');
        const knocked = body.tag.startsWith('bank.') && index <= down;
        if (knocked) {
          buf.disc(body.at.x, body.at.y, body.r, PAL.grafit, 200);
          buf.ring(body.at.x, body.at.y, body.r, 1, PAL.plastikCiemny, 160);
        } else {
          const color = body.tag.startsWith('bank.') ? PAL.żółty : PAL.zielony;
          buf.disc(body.at.x, body.at.y, body.r, PAL.plastikCiemny);
          buf.disc(body.at.x, body.at.y, body.r - 1, shine > 0.02 ? PAL.biel : color);
          if (shine > 0) buf.glow(body.at.x, body.at.y, body.r * 3.5, color, shine * 160);
        }
        break;
      }
      case 'sensor': {
        const lit = (glow[body.tag] ?? 0) > 0.01 || rules.letters.includes(body.tag.slice(4));
        const color = lit ? PAL.żółty : PAL.stal;
        if (body.tag.startsWith('pas.')) {
          // Przewód pasu — łuk drutu nad wydrukowaną literą.
          buf.ring(body.at.x, body.at.y + 2, body.r, 1.5, color, lit ? 230 : 120);
          text(buf, body.tag.slice(4), body.at.x - 2, body.at.y - 4, lit ? PAL.biel : PAL.plastikCiemny);
        } else if (body.tag.startsWith('nalot.') || body.tag.startsWith('sklep.')) {
          buf.ring(body.at.x, body.at.y, body.r, 1.2, color, lit ? 210 : 90);
        } else if (body.tag === 'kielich') {
          buf.disc(body.at.x, body.at.y, body.r + 1, PAL.grafit);
          buf.ring(body.at.x, body.at.y, body.r, 2, rules.jackpotLit ? (Math.sin(time * 12) > 0 ? PAL.żółty : PAL.czerwony) : PAL.stal, 240);
          text(buf, rules.jackpotLit ? 'JACKPOT' : 'DAJ', body.at.x - 21, body.at.y + 10, rules.jackpotLit ? PAL.żółty : PAL.plastikCiemny);
        }
        break;
      }
      case 'flipper': {
        const tip = flipperTip(body);
        // Cień, guma, rdzeń, odblask — cztery przejścia, jak z oryginału.
        buf.line(body.pivot.x + 2, body.pivot.y + 3, tip.x + 2, tip.y + 3, body.radius * 2 + 2, PAL.cień, 140);
        buf.line(body.pivot.x, body.pivot.y, tip.x, tip.y, body.radius * 2, PAL.guma);
        buf.line(body.pivot.x, body.pivot.y, tip.x, tip.y, body.radius, PAL.rubin, 210);
        const nx = (body.pivot.y - tip.y) / (body.length || 1);
        const ny = (tip.x - body.pivot.x) / (body.length || 1);
        buf.line(body.pivot.x + nx, body.pivot.y + ny, tip.x + nx * 0.6, tip.y + ny * 0.6, 1.2, PAL.biel, 150);
        buf.disc(body.pivot.x, body.pivot.y, body.radius + 1, PAL.stal);
        buf.disc(body.pivot.x, body.pivot.y, body.radius * 0.5, PAL.metal, 230);
        buf.disc(tip.x, tip.y, body.tipRadius, PAL.plastik);
        break;
      }
      default:
        break;
    }
  }

  // 4. kule ze smugą
  for (const ball of frame.balls) {
    for (let i = 0; i < ball.trail.length; i += 1) {
      const point = ball.trail[i];
      const k = (i + 1) / (ball.trail.length + 1);
      buf.disc(point.x, point.y, BALL_R * (0.4 + k * 0.5), PAL.szkło, Math.round(40 * k));
    }
    drawBall(buf, ball.x, ball.y, BALL_R);
  }

  // 5. wyrzutnik
  const pulled = frame.plunger;
  buf.rect(233, 462 + pulled * 12, 13, 3, PAL.stal);
  for (let i = 0; i < 5; i += 1) {
    buf.rect(233, 468 + pulled * 12 + i * 3, 13, 1, i % 2 === 0 ? PAL.metal : PAL.plastikCiemny);
  }
  // Obok sprężyny, w ciemnym kącie pod prawą klapką — tam nie przeszkadza
  // ani razemarkowi, ani kuli.
  if (frame.loaded) text(buf, 'WCIŚNIJ', 190, 486, Math.sin(time * 6) > 0 ? PAL.żółty : PAL.czerwony);

  // 6. efekty
  for (const ring of frame.rings) {
    const r = 4 + ring.age * 34;
    const alpha = Math.max(0, 200 - ring.age * 260);
    if (alpha > 0) buf.ring(ring.x, ring.y, r, 2, ring.color, alpha);
  }
  for (const spark of frame.sparks) {
    const alpha = Math.max(0, 255 - spark.age * 420);
    if (alpha <= 0) continue;
    buf.blend(spark.x, spark.y, spark.color, alpha);
    buf.blend(spark.x - spark.vx * 0.02, spark.y - spark.vy * 0.02, PAL.biel, alpha * 0.6);
  }
  for (const float of frame.floats) {
    const rise = float.age * 26;
    const alpha = Math.max(0, 255 - float.age * 130);
    const color = float.tone === 'jackpot' ? PAL.żółty : float.tone === 'tryb' ? PAL.cyjan : PAL.biel;
    if (alpha > 0) text(buf, float.text, Math.round(float.x - 3 * float.text.length), Math.round(float.y - rise), color, 1, PAL.cień);
  }
}


// ---------------------------------------------------------------- matryca DMD

/**
 * Panel z matrycą. Siedzi nad stołem, tak jak siedzieć powinien — bez pudła
 * z tyłu (backbox) nie ma gdzie indziej go wcisnąć.
 */
export const DMD_H = 84;
/** Wysokość całego płótna: matryca plus pole gry. */
export const CANVAS_H = DMD_H + FB_H;
/** Co ma pokazać matryca. Same liczby i krótkie hasła — więcej się nie zmieści. */
export interface DmdView {
  score: number;
  line2: string;
  line3: string;
  ballsLeft: number;
  multiplier: number;
  letters: string[];
  jackpotLit: boolean;
  mode: string | null;
  over: boolean;
}

const LED = 3;
/** Początek matrycy diod — na tym trzymają się testy układu panelu. */
export const LED_X = 8;
export const LED_Y = 9;
/**
 * Odstęp między znakami: 15 px glifu plus jedna kolumna wolna. Przy 240 px
 * światła mieści piętnaście znaków, a „ZBIERAJ JACKPOT” ma właśnie piętnaście —
 * przy mniejszym ostatnia litera urwałaby się bez słowa wyjaśnienia.
 */
const LED_KROK = 16;
/** Ile znaków pomieści wiersz — dłuższe napisy skracam, zamiast ścinać w pół glifu. */
export const WIERSZ_MAX = Math.floor((FB_W - LED_X * 2 + (LED_KROK - 5 * LED)) / LED_KROK);

/** Tnie napis do szerokości matrycy, z jednoznakową wielokropkiem gdy nie wchodzi. */
export function zmieść(text: string): string {
  const value = dmdText(text);
  if (value.length <= WIERSZ_MAX) return value;
  return `${value.slice(0, WIERSZ_MAX - 1)}.`;
}

/**
 * Stopka na matrycy: każdy punkt glifu to świecąca dioda 2 × 2 w oknie 3 × 3.
 * Ta jedna luka między diodami robi całą robotę — bez niej „napis LED”
 * wygląda jak zepsuty wektor.
 */
export function ledText(buf: Buf, content: string, x: number, y: number, color: number, dim?: number): number {
  let cx = x;
  for (const char of dmdText(content)) {
    const glyph = GLIFY[char] ?? GLIFY[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const on = glyph[row][col] === '#';
        const color2 = on ? color : dim;
        if (color2 === undefined) continue;
        buf.rect(cx + col * LED, y + row * LED, 2, 2, color2);
      }
    }
    cx += LED_KROK;
  }
  return cx;
}

/** Liczba punktów z ciemnymi zerami z przodu — dokładnie tak, jak na automacie. */
function scoreLine(value: number): { dim: string; bright: string } {
  const digits = 8;
  const raw = Math.max(0, Math.min(99999999, Math.round(value))).toString().padStart(digits, '0');
  const first = raw.search(/[1-9]/);
  const cut = first < 0 ? digits - 1 : first;
  return { dim: raw.slice(0, cut), bright: raw.slice(cut) };
}

/** Rysuje panel z matrycą. Osobny bufor, bo stołu nie warto brudzić. */
export function paintDmd(buf: Buf, view: DmdView, time: number): void {
  buf.clear(PAL.noc);
  // Płyta czołowa: grafit, rant i lekka poświata od diod.
  buf.rect(0, 0, FB_W, DMD_H, PAL.grafit);
  buf.rect(0, 0, FB_W, 2, rgba(120, 126, 160, 255));
  buf.rect(0, DMD_H - 2, FB_W, 2, rgba(8, 4, 18, 255));
  buf.rect(LED_X - 3, LED_Y - 3, WIERSZ_MAX * LED_KROK + 2, 3 * 21 + 6, rgba(6, 3, 14, 255));

  const win = view.mode === 'multiball' ? PAL.rubin : PAL.biel;
  const amber = rgba(255, 176, 40, 255);
  const dimAmber = rgba(70, 44, 12, 255);

  // Wiersz 1: wynik przy prawej krawędzi, z ciemnymi zerami z przodu.
  const { dim, bright } = scoreLine(view.score);
  const right = LED_X + WIERSZ_MAX * LED_KROK - LED_KROK + 5 * LED;
  const widthBright = bright.length * LED_KROK - (LED_KROK - 5 * LED);
  ledText(buf, dim, right - widthBright - dim.length * LED_KROK, LED_Y, dimAmber);
  ledText(buf, bright, right - widthBright, LED_Y, amber);

  // Wiersz 2: to, co w tej chwili ważne.
  const second = view.over ? 'KONIEC GRY' : view.line2;
  ledText(buf, zmieść(second), LED_X, LED_Y + 22, view.jackpotLit ? PAL.żółty : win);

  // Wiersz 3: kule, mnożnik i zebrane litery.
  ledText(buf, zmieść(view.line3), LED_X, LED_Y + 44, PAL.cyjan);

  // Miganie wolnego pola — matryca nigdy nie stoi całkiem martwa.
  if (!view.over && Math.sin(time * 4) > 0.4 && !view.mode && !view.jackpotLit) {
    buf.rect(FB_W - 14, DMD_H - 12, 3, 3, PAL.czerwony);
  }
}

/** Składa matrycę i pole gry w jedno płótno. */
export function compose(into: Buf, dmd: Buf, table: Buf): void {
  into.clear(PAL.noc);
  into.px.set(dmd.px.subarray(0, FB_W * DMD_H), 0);
  for (let y = 0; y < FB_H; y += 1) {
    const src = y * FB_W;
    const dst = (y + DMD_H) * FB_W;
    into.px.set(table.px.subarray(src, src + FB_W), dst);
  }
}

/** Bufor plastiku trzymany między klatkami — piecze się raz na stół. */
let PLASTIK: Buf = createPlastic([]);

/** Przygotowuje wydruk dla konkretnego stołu. Wywołać przed pierwszym `paint`. */
export function setPlastic(bodies: Body[]): void {
  PLASTIK = createPlastic(bodies);
}

/** Kopiuje bufor na płótno nearest-neighbour, z zachowaniem skali. */
export function blit(target: ImageData, source: Buf): void {
  const out = new Uint32Array(target.data.buffer);
  out.set(source.px);
}
