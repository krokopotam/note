/**
 * Rysowanie Arkanoida na płótnie 256 × 320.
 *
 * Celowo osobno od logiki: `rysuj` tylko patrzy na stan i na to, co logika
 * zgłosiła w zdarzeniach (iskry, liczby punktów, rozbłyski). Widok nic nie
 * odgaduje, więc nie może się rozjechać z grą, a `prefers-reduced-motion`
 * ścisza efekty do zera bez ruszania samej partii.
 */

import type { Gra, Palivo, Zdarzenie } from './logic';
import { KLOCK_H, KLOCK_W, KULA_R, PADEL_H, PADEL_Y, SZEROKOŚĆ, WYSOKOŚĆ } from './logic';

/** Paleta w duchu OCS: mało kolorów, mocno nasycone, bez gradientów z biblioteki. */
export const PAL = {
  noc: 0x0a0a1e,
  granat: 0x141433,
  cegła1: 0x2f9ee0,
  cegła2: 0xf0b429,
  cegła3: 0xe04a35,
  szynka: 0x8f97a8,
  szynkaCień: 0x4a5162,
  klapka: 0xe6e9f2,
  klapkaCień: 0x6b7285,
  krawędź: 0xff5a5a,
  kula: 0xffffff,
  kulaCień: 0x9aa3b8,
  cyjan: 0x3ce0d0,
  żółty: 0xffe14a,
  rubin: 0xff4f6e,
  Zieleń: 0x59e07a,
  fiolet: 0xa06ae0,
  szkło: 0x7f8ab0,
} as const;

/** Kapsułki: po kolorze i po znaku w środku, żeby dało się je odróżnieć bez pauzy. */
export const KOLORY_KAPSUŁEK: Record<Palivo, number> = {
  szeroko: PAL.cyjan,
  wąsko: PAL.rubin,
  kule: PAL.żółty,
  zwolnij: PAL.fiolet,
  życie: PAL.Zieleń,
};

export type Iskierka = { x: number; y: number; vx: number; vy: number; wiek: number; kolor: number };
export type Liczba = { x: number; y: number; wiek: number; tekst: string; kolor: number };
export type Rozbłysk = { x: number; y: number; wiek: number; kolor: number };

export type Fx = {
  iskry: Iskierka[];
  liczby: Liczba[];
  rozbłyski: Rozbłysk[];
  /** Chwilowe przechylenie obrazu po mocnym uderzeniu. */
  drżenie: number;
  /** Rozjaśnienie klapki po złapanej kapsułce. */
  klapka: number;
};

const ISKRY_MAX = 160;
const ŻYCIE_ISKRY = 0.5;
const ŻYCIE_LICZBY = 0.9;
const ŻYCIE_ROZBŁYSK = 0.34;

export function utwórzFx(): Fx {
  return { iskry: [], liczby: [], rozbłyski: [], drżenie: 0, klapka: 0 };
}

/**
 * Zamienia zdarzenia z logiki na efekty. `siła` to hołd dla
 * `prefers-reduced-motion`: przy zerze zostają liczby punktów (to informacja),
 * a znikają iskry i trzęsienie ekranu.
 */
export function zapiszZdarzenia(fx: Fx, zdarzenia: Zdarzenie[], rng: () => number, siła = 1): void {
  for (const z of zdarzenia) {
    switch (z.kind) {
      case 'cegiełka': {
        fx.liczby.push({ x: z.x, y: z.y, wiek: 0, tekst: `+${z.punkty}`, kolor: z.seria ? PAL.żółty : PAL.szkło });
        for (let i = 0, ile = Math.round((z.seria ? 8 : 5) * siła); i < ile; i += 1) {
          fx.iskry.push({
            x: z.x,
            y: z.y,
            vx: (rng() - 0.5) * 150,
            vy: -rng() * 130,
            wiek: 0,
            kolor: z.seria ? PAL.żółty : PAL.cyjan,
          });
        }
        fx.drżenie = Math.min(1, fx.drżenie + 0.25 * siła);
        break;
      }
      case 'kapsułka':
        fx.rozbłyski.push({ x: z.x, y: z.y, wiek: 0, kolor: KOLORY_KAPSUŁEK[z.rodzaj] });
        fx.klapka = 1;
        break;
      case 'opal':
        fx.drżenie = Math.min(1, fx.drżenie + siła);
        break;
      case 'stal':
        fx.rozbłyski.push({ x: z.x, y: z.y, wiek: 0, kolor: PAL.szynka });
        break;
      case 'poziom':
        fx.drżenie = Math.min(1, fx.drżenie + siła);
        for (let i = 0, ile = Math.round(24 * siła); i < ile; i += 1) {
          fx.iskry.push({
            x: SZEROKOŚĆ / 2,
            y: 120,
            vx: (rng() - 0.5) * 260,
            vy: -rng() * 220,
            wiek: 0,
            kolor: PAL.Zieleń,
          });
        }
        break;
      default:
        break;
    }
  }
  if (fx.iskry.length > ISKRY_MAX) fx.iskry.splice(0, fx.iskry.length - ISKRY_MAX);
}

export function posuńFx(fx: Fx, dt: number): void {
  for (const i of fx.iskry) {
    i.wiek += dt;
    i.x += i.vx * dt;
    i.y += i.vy * dt;
    i.vy += 340 * dt;
  }
  fx.iskry = fx.iskry.filter((i) => i.wiek < ŻYCIE_ISKRY);
  for (const l of fx.liczby) {
    l.wiek += dt;
    l.y -= 26 * dt;
  }
  fx.liczby = fx.liczby.filter((l) => l.wiek < ŻYCIE_LICZBY);
  for (const r of fx.rozbłyski) r.wiek += dt;
  fx.rozbłyski = fx.rozbłyski.filter((r) => r.wiek < ŻYCIE_ROZBŁYSK);
  fx.drżenie = Math.max(0, fx.drżenie - dt * 3.4);
  fx.klapka = Math.max(0, fx.klapka - dt * 2);
}

/** Cyfry siedmiosegmentowe — arcade'owy licznik, bez czcionki i bez fontu w pliku. */
const SEGMENTY: Record<string, number> = {
  '0': 0b0111111,
  '1': 0b0000110,
  '2': 0b1011011,
  '3': 0b1001111,
  '4': 0b1100110,
  '5': 0b1101101,
  '6': 0b1111101,
  '7': 0b0000111,
  '8': 0b1111111,
  '9': 0b1101111,
};

const SEG_W = 7;
const SEG_H = 12;
const SEG_GRUBOŚĆ = 2;

function cyfra(
  ctx: CanvasRenderingContext2D,
  znak: string,
  x: number,
  y: number,
  włączone: string,
  wygaszone: string,
): void {
  const mask = SEGMENTY[znak];
  if (mask === undefined) return;
  const kolor = (bit: number): string => ((mask >> bit) & 1 ? włączone : wygaszone);
  // Numeracja segmentów: 0 góra, 1 i 2 boki górne, 3 środek, 4 i 5 boki dolne, 6 dół.
  ctx.fillStyle = kolor(0);
  ctx.fillRect(x + 1, y, SEG_W - 2, SEG_GRUBOŚĆ);
  ctx.fillStyle = kolor(1);
  ctx.fillRect(x, y + 1, SEG_GRUBOŚĆ, SEG_H / 2 - 1);
  ctx.fillStyle = kolor(2);
  ctx.fillRect(x + SEG_W - SEG_GRUBOŚĆ, y + 1, SEG_GRUBOŚĆ, SEG_H / 2 - 1);
  ctx.fillStyle = kolor(3);
  ctx.fillRect(x + 1, y + SEG_H / 2 - 1, SEG_W - 2, SEG_GRUBOŚĆ);
  ctx.fillStyle = kolor(4);
  ctx.fillRect(x, y + SEG_H / 2, SEG_GRUBOŚĆ, SEG_H / 2 - 1);
  ctx.fillStyle = kolor(5);
  ctx.fillRect(x + SEG_W - SEG_GRUBOŚĆ, y + SEG_H / 2, SEG_GRUBOŚĆ, SEG_H / 2 - 1);
  ctx.fillStyle = kolor(6);
  ctx.fillRect(x + 1, y + SEG_H - SEG_GRUBOŚĆ, SEG_W - 2, SEG_GRUBOŚĆ);
}

/** Licznik punktów w górnym pasie: zera z przodu przygaszone, jak na automacie. */
export function licznik(ctx: CanvasRenderingContext2D, wartość: number, prawaX: number, y: number): void {
  const tekst = String(Math.max(0, Math.floor(wartość))).padStart(7, '0');
  let x = prawaX - tekst.length * (SEG_W + 2);
  // Pierwsza niezerowa cyfra: to, co na lewo od niej, jest tylko atrapą zera.
  let pierwszy = -1;
  for (let i = 0; i < tekst.length; i += 1) {
    if (tekst[i] !== '0') {
      pierwszy = i;
      break;
    }
  }
  for (let i = 0; i < tekst.length; i += 1) {
    const przygaszona = pierwszy < 0 || i < pierwszy;
    cyfra(ctx, tekst[i], x, y, przygaszona ? hex(0x4d3f1c) : hex(PAL.żółty), hex(0x221c0b));
    x += SEG_W + 2;
  }
}

export function hex(kolor: number): string {
  return `#${kolor.toString(16).padStart(6, '0')}`;
}

/** Rozgwieżdżone tło liczone z pozycji, nie z losowania — ten sam kadr co kadr. */
function tło(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = hex(PAL.noc);
  ctx.fillRect(0, 0, SZEROKOŚĆ, WYSOKOŚĆ);
  ctx.fillStyle = hex(PAL.granat);
  ctx.fillRect(0, 0, SZEROKOŚĆ, 32);
  for (let y = 34; y < WYSOKOŚĆ; y += 34) {
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    ctx.fillRect(0, y, SZEROKOŚĆ, 17);
  }
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 71) % SZEROKOŚĆ;
    const y = 36 + ((i * 137) % (WYSOKOŚĆ - 40));
    const jasne = i % 7 === 0;
    ctx.fillStyle = jasne ? 'rgba(200,220,255,0.30)' : 'rgba(200,220,255,0.12)';
    ctx.fillRect(x, y, 1, 1);
  }
}

function klocek(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number | null, lśnienie: number): void {
  const kolor = hp === null ? PAL.szynka : hp >= 3 ? PAL.cegła3 : hp === 2 ? PAL.cegła2 : PAL.cegła1;
  ctx.fillStyle = hex(kolor);
  ctx.fillRect(x, y, KLOCK_W - 1, KLOCK_H - 1);
  // Fasek: jasna góra i lewa, ciemny dół — bez tego klocki są płaskimi plamami.
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x, y, KLOCK_W - 1, 1);
  ctx.fillRect(x, y, 1, KLOCK_H - 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + KLOCK_H - 2, KLOCK_W - 1, 1);
  ctx.fillRect(x + KLOCK_W - 2, y, 1, KLOCK_H - 1);
  if (hp === null) {
    ctx.fillStyle = hex(PAL.szynkaCień);
    ctx.fillRect(x + 3, y + 3, 2, 2);
    ctx.fillRect(x + KLOCK_W - 6, y + 3, 2, 2);
  }
  if (lśnienie > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, lśnienie)})`;
    ctx.fillRect(x, y, KLOCK_W - 1, KLOCK_H - 1);
  }
}

function klapka(ctx: CanvasRenderingContext2D, g: Gra, fx: Fx): void {
  const x = g.padelX - g.padelW / 2;
  const y = PADEL_Y - PADEL_H / 2;
  ctx.fillStyle = hex(PAL.klapkaCień);
  ctx.fillRect(x, y + PADEL_H - 2, g.padelW, 2);
  ctx.fillStyle = fx.klapka > 0 ? hex(PAL.żółty) : hex(PAL.klapka);
  ctx.fillRect(x, y, g.padelW, PADEL_H - 2);
  // Czerwone końce: po nich widać, gdzie kula odbija najmocniej.
  ctx.fillStyle = hex(PAL.krawędź);
  ctx.fillRect(x, y, 4, PADEL_H);
  ctx.fillRect(x + g.padelW - 4, y, 4, PADEL_H);
}

function kula(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = hex(PAL.kulaCień);
  ctx.fillRect(x - KULA_R, y - KULA_R + 1, KULA_R * 2, KULA_R * 2);
  ctx.fillStyle = hex(PAL.kula);
  ctx.fillRect(x - KULA_R + 1, y - KULA_R, KULA_R * 2 - 2, KULA_R * 2 - 1);
  ctx.fillRect(x - 1, y - KULA_R - 1, 3, 1);
}

function kapsułka(ctx: CanvasRenderingContext2D, x: number, y: number, kolor: number, znak: Palivo): void {
  ctx.fillStyle = hex(kolor);
  ctx.fillRect(x - 8, y - 4, 16, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(x - 8, y - 4, 16, 1);
  ctx.fillStyle = hex(PAL.noc);
  // Znak rysowany kreskami: szeroka, wąska, trzy kropki, ukośna strzałka, krzyżyk życia.
  switch (znak) {
    case 'szeroko':
      ctx.fillRect(x - 5, y - 1, 10, 2);
      break;
    case 'wąsko':
      ctx.fillRect(x - 2, y - 1, 4, 2);
      break;
    case 'kule':
      ctx.fillRect(x - 4, y - 1, 2, 2);
      ctx.fillRect(x - 1, y - 1, 2, 2);
      ctx.fillRect(x + 2, y - 1, 2, 2);
      break;
    case 'zwolnij':
      ctx.fillRect(x - 4, y - 1, 8, 1);
      ctx.fillRect(x + 1, y - 3, 1, 2);
      ctx.fillRect(x + 2, y - 1, 1, 2);
      break;
    case 'życie':
      ctx.fillRect(x - 1, y - 3, 2, 6);
      ctx.fillRect(x - 3, y - 1, 6, 2);
      break;
  }
}

/** Pełny kadr: tło, pasek wyniku, klocki, kapsułki, klapka, kule, efekty. */
export function rysuj(ctx: CanvasRenderingContext2D, g: Gra, fx: Fx, czas: number): void {
  const drżenieX = fx.drżenie > 0 ? Math.round(Math.sin(czas * 47) * fx.drżenie * 2) : 0;
  const drżenieY = fx.drżenie > 0 ? Math.round(Math.cos(czas * 39) * fx.drżenie * 2) : 0;

  ctx.save();
  ctx.translate(drżenieX, drżenieY);
  tło(ctx);

  licznik(ctx, g.wynik, SZEROKOŚĆ - 8, 12);

  // Klocki. Ostatnio zbite dostają rozbłysk z listy — to logika mówi, co zgasło.
  for (const k of g.plansza) {
    const blask = fx.rozbłyski.reduce((acc, r) => acc + (r.wiek < 0.12 && Math.abs(r.x - (k.x + KLOCK_W / 2)) < KLOCK_W && Math.abs(r.y - (k.y + KLOCK_H / 2)) < KLOCK_H ? 1 - r.wiek * 6 : 0), 0);
    klocek(ctx, k.x, k.y, k.hp, blask);
  }

  for (const kaps of g.kapsułki) {
    kapsułka(ctx, Math.round(kaps.x), Math.round(kaps.y), KOLORY_KAPSUŁEK[kaps.rodzaj], kaps.rodzaj);
  }

  klapka(ctx, g, fx);
  for (const k of g.kule) kula(ctx, Math.round(k.x), Math.round(k.y));

  for (const r of fx.rozbłyski) {
    const r0 = 3 + r.wiek * 40;
    const alfa = Math.max(0, 0.7 - r.wiek * 2);
    ctx.strokeStyle = `rgba(255,255,255,${alfa})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(r.x - r0), Math.round(r.y - r0), r0 * 2, r0 * 2);
  }
  for (const i of fx.iskry) {
    const alfa = Math.max(0, 1 - i.wiek / ŻYCIE_ISKRY);
    ctx.fillStyle = `rgba(${(i.kolor >> 16) & 255},${(i.kolor >> 8) & 255},${i.kolor & 255},${alfa})`;
    ctx.fillRect(Math.round(i.x), Math.round(i.y), 2, 2);
  }
  for (const l of fx.liczby) {
    const alfa = Math.max(0, 1 - l.wiek / ŻYCIE_LICZBY);
    const kolor = `rgba(${(l.kolor >> 16) & 255},${(l.kolor >> 8) & 255},${l.kolor & 255},${alfa})`;
    const szer = l.tekst.length * (SEG_W + 1);
    narysujTekst(ctx, l.tekst, Math.round(l.x - szer / 2), Math.round(l.y), kolor);
  }

  ctx.restore();

  // Pas skanów na wierzchu — po nim widać monitor kineskopowy, nie wektor.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < WYSOKOŚĆ; y += 3) ctx.fillRect(0, y, SZEROKOŚĆ, 1);
}

/**
 * Liczby punktów nad miejscem zbicia: cyfry siedmiosegmentowe i krzyżyk plusa.
 * Większego alfabetu nie potrzebujemy — na taśmie pojawiają się same „+75”.
 */
function narysujTekst(ctx: CanvasRenderingContext2D, tekst: string, x: number, y: number, kolor: string): void {
  let cx = x;
  for (const znak of tekst) {
    if (znak === '+') {
      ctx.fillStyle = kolor;
      ctx.fillRect(cx + 1, y, 1, 5);
      ctx.fillRect(cx, y + 2, 3, 1);
    } else {
      cyfra(ctx, znak, cx, y, kolor, 'rgba(0,0,0,0)');
    }
    cx += SEG_W + 1;
  }
}
