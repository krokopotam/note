/**
 * Arkanoid — logika partii, bez Reacta i bez płótna.
 *
 * Wszystko, co w grze jest decyzją, mieści się tutaj: tor kuli, cegiełki,
 * kapsułki, serie, życia, poziomy. Widok tylko pyta o stan i rysuje to, co
 * logika sama zgłosiła w `Zdarzenie`, więc nie ma drugiego stanu, który mógłby
 * się rozjechać. Losowanie (co wypadnie z cegiełki) idzie przez `Rng` podany z
 * zewnątrz — test widzi dokładnie tę partię co gracz.
 */

import type { Rng } from '../shared/random';

/** Plansza w pikselach logiki. Widok skaluje ją do okna, tu nic od okna nie zależy. */
export const SZEROKOŚĆ = 256;
export const WYSOKOŚĆ = 320;

/** Siatka klocków: 15 kolumn po 16 px, rzędy po 8 px, po osiem pikseli marginesu. */
export const KLOCK_W = 16;
export const KLOCK_H = 8;
export const KLOCK_KOLEJNIE = 15;
export const KLOCK_X0 = (SZEROKOŚĆ - KLOCK_KOLEJNIE * KLOCK_W) / 2;
export const KLOCK_Y0 = 40;

export const KULA_R = 3;
export const PADEL_H = 6;
export const PADEL_Y = 300;
export const PADEL_W = 40;
export const PADEL_W_MIN = 26;
export const PADEL_W_MAX = 66;
/** Prędkość klapki z klawiatury. Mysz podaje miejsce wprost, bez tej granicy. */
export const PADEL_V = 300;
/** Kula złapana za samą krawędź klapki odbija pod 65°, ze środka idzie prosto. */
export const KĄT_MAX = (65 * Math.PI) / 180;
/** Żeby kula nie utknęła lecąc równolegle do klapki i nie goniła planszy w kółko. */
export const PION_MIN = 0.34;

export const KAPSUŁKA_R = 5;
export const KAPSUŁKA_V = 74;
/** Prawdopodobieństwo, że w cegiełce siedzi kapsułka. */
export const KAPSUŁKA_LOS = 0.16;
/** Co ile rozbitych cegiełek mnożnik rośnie o jeden. */
export const SERIA_KROK = 4;
export const MNOŻNIK_MAX = 5;
export const ŻYCIA_START = 3;
/** Ile sekund plansza jest „zebrana", zanim zacznie się następna. */
export const CHWILA_PO_POZIOMIE = 1;

/** Kapsułka po rozbitej cegiełce. Dwie są kłopotem, reszta pomocą. */
export type Palivo = 'szeroko' | 'wąsko' | 'kule' | 'zwolnij' | 'życie';

export const PALIWA: Palivo[] = ['szeroko', 'wąsko', 'kule', 'zwolnij', 'życie'];

export type Cegła = {
  id: number;
  x: number;
  y: number;
  /** Ile uderzeń wytrzyma. `null` to stal: nie do zbicia, tylko odbija. */
  hp: number | null;
  /** Kapsułka w środku, przesądzona przy budowie poziomu — stąd powtarzalność. */
  kapsułka: Palivo | null;
};

export type Kula = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Przyklejona do klapki: jedzie z nią i czeka na zwolnienie. */
  przyklejona: boolean;
};

export type Kapsułka = { x: number; y: number; rodzaj: Palivo };

export type Faza = 'gotowy' | 'gra' | 'poziom' | 'koniec';

export type Zdarzenie =
  | { kind: 'cegiełka'; x: number; y: number; punkty: number; seria: boolean }
  | { kind: 'stal'; x: number; y: number }
  | { kind: 'odbicie'; x: number; y: number }
  | { kind: 'kapsułka'; x: number; y: number; rodzaj: Palivo }
  | { kind: 'opal'; x: number }
  | { kind: 'poziom'; numer: number }
  | { kind: 'koniec'; wynik: number };

export type Wejście = {
  /** -1, 0, 1 z klawiatury. */
  kierunek: number;
  /** Środek klapki z myszy albo palca; `null`, kiedy gracz nie wskazuje. */
  cel: number | null;
  /** Zwolnienie przyklejonej kuli. */
  zwolnij: boolean;
};

export const BRAK_WEJŚCIA: Wejście = { kierunek: 0, cel: null, zwolnij: false };

export type Gra = {
  plansza: Cegła[];
  kule: Kula[];
  kapsułki: Kapsułka[];
  padelX: number;
  padelW: number;
  wynik: number;
  życia: number;
  poziom: number;
  /** Cegiełki rozbite od ostatniego dotknięcia klapki — z tego mnożnik. */
  seria: number;
  faza: Faza;
  /** Odliczanie do następnego poziomu. */
  chwila: number;
  czas: number;
  prędkość: number;
  następnyId: number;
};

/**
 * Planów używamy znakowo, bo tak się je czyta: `.` pusto, `1`–`3` cegiełka z
 * wytrzymałością, `S` stal. Każdy wiersz ma dokładnie 15 znaków, każdy plan ma
 * osiem wierszy — inaczej plansza zjechałaby z siatki.
 */
export const PLANY: string[][] = [
  [
    '...............',
    '.1111111111111.',
    '.1222222222221.',
    '.1233333333321.',
    '.1233333333321.',
    '.1222222222221.',
    '.1111111111111.',
    '...............',
  ],
  [
    '..S.........S..',
    '.1111111111111.',
    '.2222222222222.',
    '.3333333333333.',
    '...............',
    '.3333333333333.',
    '.2222222222222.',
    '..S.........S..',
  ],
  [
    '.S.1.S.1.S.1.S.',
    '1.2.3.3.3.2.1.1',
    '.S.1.S.2.S.1.S.',
    '...............',
    '.2222222222222.',
    '.1111111111111.',
    '...............',
    '..S.........S..',
  ],
  [
    '.......3.......',
    '......323......',
    '.....32123.....',
    '....3211123....',
    '.....32123.....',
    '......323......',
    '.......3.......',
    '..SS.......SS..',
  ],
  [
    '333333333333333',
    '2S2S2S2S2S2S2S2',
    '131313131313131',
    '...............',
    '.1111111111111.',
    '.2222222222222.',
    '.3333333333333.',
    '...............',
  ],
];

export const planNa = (poziom: number): string[] => {
  const n = ((poziom % PLANY.length) + PLANY.length) % PLANY.length;
  return PLANY[n];
};

/** Kula po poziomie rośnie, ale nie tak, żeby po pięciu planach uciekała oku. */
export function prędkośćPoziomu(poziom: number): number {
  return Math.min(150 + poziom * 12, 240);
}

/**
 * Klocki planu `poziom`. Kapsułki losuje ten sam `Rng`, co resztę partii, więc
 * ten sam numer startowy daje ten sam zestaw prezentów w tych samych cegiełkach.
 */
export function budujPlan(poziom: number, rng: Rng): Cegła[] {
  const klocki: Cegła[] = [];
  let id = 0;
  planNa(poziom).forEach((wiersz, ry) => {
    for (let kol = 0; kol < KLOCK_KOLEJNIE; kol += 1) {
      const znak = wiersz[kol] ?? '.';
      if (znak === '.') continue;
      const hp = znak === 'S' ? null : Number(znak);
      const lot = rng();
      const trafionaKapsułka = hp !== null && lot < KAPSUŁKA_LOS;
      klocki.push({
        id: id++,
        x: KLOCK_X0 + kol * KLOCK_W,
        y: KLOCK_Y0 + ry * KLOCK_H,
        hp,
        kapsułka: trafionaKapsułka ? PALIWA[Math.floor(rng() * PALIWA.length)] ?? 'szeroko' : null,
      });
    }
  });
  return klocki;
}

export function kulaStartowa(padelX: number, id = 0): Kula {
  return { id, x: padelX, y: PADEL_Y - PADEL_H / 2 - KULA_R, vx: 0, vy: 0, przyklejona: true };
}

export function startowaGra(rng: Rng): Gra {
  return {
    plansza: budujPlan(0, rng),
    kule: [kulaStartowa(SZEROKOŚĆ / 2)],
    kapsułki: [],
    padelX: SZEROKOŚĆ / 2,
    padelW: PADEL_W,
    wynik: 0,
    życia: ŻYCIA_START,
    poziom: 0,
    seria: 0,
    faza: 'gotowy',
    chwila: 0,
    czas: 0,
    prędkość: prędkośćPoziomu(0),
    następnyId: 1,
  };
}

export const mnożnikZ = (seria: number): number => Math.min(1 + Math.floor(seria / SERIA_KROK), MNOŻNIK_MAX);

/** Czy plan jest zaliczony. Stal się nie liczy — inaczej poziom byłby nie do przejścia. */
export function planZebrany(plansza: Cegła[]): boolean {
  return plansza.every((k) => k.hp === null);
}

/**
 * Wystrzelenie kuli: pod górę i zawsze trochę w bok. Równo pionowo znaczy, że
 * kula wpada w środę klapki, odbija się równo pionowo i tak w kółko — partia
 * bez jednego zbitego klocka, która nigdy się nie kończy.
 */
export function wyrzuć(g: Gra, kierunek: number): void {
  for (const kula of g.kule) {
    if (!kula.przyklejona) continue;
    const przechył = Math.max(-0.5, Math.min(0.5, kierunek * 0.45));
    const kąt = Math.abs(przechył) < 0.2 ? (kierunek < 0 ? -0.26 : 0.26) : przechył;
    kula.vx = Math.sin(kąt) * g.prędkość;
    kula.vy = -Math.cos(kąt) * g.prędkość;
    kula.przyklejona = false;
  }
  if (g.faza === 'gotowy') {
    g.faza = 'gra';
    g.seria = 0;
  }
}

function przesuńPadel(g: Gra, wejście: Wejście, dt: number): void {
  const połowa = g.padelW / 2;
  const cel = wejście.cel !== null ? wejście.cel + wejście.kierunek * PADEL_V * dt : g.padelX + wejście.kierunek * PADEL_V * dt;
  g.padelX = Math.max(połowa, Math.min(SZEROKOŚĆ - połowa, cel));
}

/** Utrzymuje prędkość kuli równą `g.prędkość` i nie pozwala lecieć poziomo. */
function prostuj(g: Gra, kula: Kula): void {
  const v = Math.hypot(kula.vx, kula.vy) || g.prędkość;
  kula.vx = (kula.vx / v) * g.prędkość;
  kula.vy = (kula.vy / v) * g.prędkość;
  if (Math.abs(kula.vy) < g.prędkość * PION_MIN) {
    kula.vy = Math.sign(kula.vy || -1) * g.prędkość * PION_MIN;
    const bok = Math.sqrt(Math.max(g.prędkość ** 2 - kula.vy ** 2, 1));
    kula.vx = Math.sign(kula.vx || 1) * bok;
  }
}

/**
 * Jeden krok logiki. `dt` w sekundach, `wejście` to to, co w tej klatce zrobił
 * gracz. Zwraca zdarzenia — widok z nich robi iskry, liczby i dźwięki.
 */
export function krok(g: Gra, dt: number, wejście: Wejście, rng: Rng): Zdarzenie[] {
  g.czas += dt;
  const zdarzenia: Zdarzenie[] = [];
  if (g.faza === 'koniec') return zdarzenia;

  if (g.faza === 'poziom') {
    g.chwila -= dt;
    if (g.chwila <= 0) następnyPlan(g, rng);
    return zdarzenia;
  }

  przesuńPadel(g, wejście, dt);
  if (wejście.zwolnij) wyrzuć(g, wejście.kierunek);

  const stracone: Kula[] = [];
  for (const kula of g.kule) {
    if (kula.przyklejona) {
      kula.x = g.padelX;
      kula.y = PADEL_Y - PADEL_H / 2 - KULA_R;
      continue;
    }
    // Podział na kawałki po 2 px: klocek ma 8 px grubości, a kula przy 240 px/s
    // potrafi w jednej klatce przeskoczyć go na wylot.
    const dystans = Math.hypot(kula.vx, kula.vy) * dt;
    const kroki = Math.max(1, Math.ceil(dystans / 2));
    for (let i = 0; i < kroki; i += 1) {
      zdarzenia.push(...ruńKulę(g, kula, dt / kroki));
    }
    if (kula.y - KULA_R > WYSOKOŚĆ) stracone.push(kula);
  }

  if (stracone.length > 0) {
    g.kule = g.kule.filter((kula) => !stracone.includes(kula));
    for (const kula of stracone) zdarzenia.push({ kind: 'opal', x: kula.x });
  }

  if (g.kule.length === 0) {
    g.życia -= 1;
    if (g.życia <= 0) {
      g.faza = 'koniec';
      zdarzenia.push({ kind: 'koniec', wynik: g.wynik });
    } else {
      // Klapka wraca do zwykłego rozmiaru: kapsułki są nagrodą za kulkę, nie na zawsze.
      g.kule = [kulaStartowa(g.padelX, g.następnyId++)];
      g.padelW = PADEL_W;
      g.seria = 0;
      g.faza = 'gotowy';
    }
  }

  for (const kaps of g.kapsułki) {
    kaps.y += KAPSUŁKA_V * dt;
    const dotyk =
      kaps.y + KAPSUŁKA_R >= PADEL_Y - PADEL_H / 2 &&
      kaps.y - KAPSUŁKA_R <= PADEL_Y + PADEL_H / 2 &&
      Math.abs(kaps.x - g.padelX) <= g.padelW / 2 + KAPSUŁKA_R;
    if (dotyk) {
      zdarzenia.push({ kind: 'kapsułka', x: kaps.x, y: kaps.y, rodzaj: kaps.rodzaj });
      zastosujKapsułkę(g, kaps.rodzaj);
      kaps.y = -9999;
    }
  }
  g.kapsułki = g.kapsułki.filter((kaps) => kaps.y > -9000 && kaps.y < WYSOKOŚĆ + KAPSUŁKA_R * 2);

  if (g.faza === 'gra' && planZebrany(g.plansza)) {
    g.faza = 'poziom';
    g.chwila = CHWILA_PO_POZIOMIE;
    zdarzenia.push({ kind: 'poziom', numer: g.poziom + 1 });
  }

  return zdarzenia;
}

function ruńKulę(g: Gra, kula: Kula, dt: number): Zdarzenie[] {
  const zdarzenia: Zdarzenie[] = [];
  kula.x += kula.vx * dt;
  kula.y += kula.vy * dt;

  if (kula.x - KULA_R < 0) {
    kula.x = KULA_R;
    kula.vx = Math.abs(kula.vx);
    zdarzenia.push({ kind: 'odbicie', x: kula.x, y: kula.y });
  } else if (kula.x + KULA_R > SZEROKOŚĆ) {
    kula.x = SZEROKOŚĆ - KULA_R;
    kula.vx = -Math.abs(kula.vx);
    zdarzenia.push({ kind: 'odbicie', x: kula.x, y: kula.y });
  }
  if (kula.y - KULA_R < 0) {
    kula.y = KULA_R;
    kula.vy = Math.abs(kula.vy);
    zdarzenia.push({ kind: 'odbicie', x: kula.x, y: kula.y });
  }

  // Klapka. Kąt zależy od tego, w które jej miejsce kula trafiła — to jest całe
  // sterowanie Arkanoidem: nie celowanie, a podstawienie krawędzi.
  if (
    kula.vy > 0 &&
    kula.y + KULA_R >= PADEL_Y - PADEL_H / 2 &&
    kula.y - KULA_R <= PADEL_Y + PADEL_H / 2 &&
    Math.abs(kula.x - g.padelX) <= g.padelW / 2 + KULA_R
  ) {
    const trafienie = Math.max(-1, Math.min(1, (kula.x - g.padelX) / (g.padelW / 2)));
    const kąt = trafienie * KĄT_MAX;
    kula.vx = Math.sin(kąt) * g.prędkość;
    kula.vy = -Math.abs(Math.cos(kąt) * g.prędkość);
    kula.y = PADEL_Y - PADEL_H / 2 - KULA_R;
    g.seria = 0;
    zdarzenia.push({ kind: 'odbicie', x: kula.x, y: kula.y });
  }

  for (const k of g.plansza) {
    if (!nakładaSię(kula, k)) continue;
    const [poziomo, wypchnięcie] = wypchnij(kula, k);
    if (poziomo) kula.vx = -kula.vx;
    else kula.vy = -kula.vy;
    kula.x += wypchnięcie.x;
    kula.y += wypchnięcie.y;

    if (k.hp === null) {
      zdarzenia.push({ kind: 'stal', x: kula.x, y: kula.y });
      break;
    }

    k.hp -= 1;
    g.seria += 1;
    // Klocek z zerową wytrzymałością nie wisi w powietrzu: znika, a plan jest
    // zaliczony, kiedy zostaną same szynki.
    if (k.hp === 0) g.plansza = g.plansza.filter((b) => b !== k);
    const mnożnik = mnożnikZ(g.seria);
    const punkty = 25 * mnożnik;
    g.wynik += punkty;
    zdarzenia.push({
      kind: 'cegiełka',
      x: k.x + KLOCK_W / 2,
      y: k.y + KLOCK_H / 2,
      punkty,
      seria: mnożnik > 1,
    });
    if (k.hp === 0 && k.kapsułka) {
      g.kapsułki.push({ x: k.x + KLOCK_W / 2, y: k.y + KLOCK_H / 2, rodzaj: k.kapsułka });
    }
    // Jedna kula, jeden klocek na podkrok: dwa naraz to always sporny wektor odbicia.
    prostuj(g, kula);
    break;
  }

  return zdarzenia;
}

function nakładaSię(kula: Kula, k: Cegła): boolean {
  const dx = Math.max(k.x - kula.x, 0, kula.x - (k.x + KLOCK_W));
  const dy = Math.max(k.y - kula.y, 0, kula.y - (k.y + KLOCK_H));
  return dx * dx + dy * dy <= KULA_R * KULA_R;
}

/**
 * Wypycha kulę z klocka i mówi, którą prędkość odwrócić (true = poziomą).
 * Dołożony luz `LUZ` jest nieprzypadkowy: bez niego kula po odbiciu dotyka
 * krawędzi klocka z milimetra, następny podkrok liczy to jako nowe trafienie
 * i jeden klocek znika w jednej klatce.
 */
const LUZ = 0.06;

function wypchnij(kula: Kula, k: Cegła): [boolean, { x: number; y: number }] {
  const środekX = kula.x - (k.x + KLOCK_W / 2);
  const środekY = kula.y - (k.y + KLOCK_H / 2);
  const wnikX = KLOCK_W / 2 + KULA_R - Math.abs(środekX) + LUZ;
  const wnikY = KLOCK_H / 2 + KULA_R - Math.abs(środekY) + LUZ;
  if (wnikX < wnikY) return [true, { x: Math.sign(środekX || 1) * wnikX, y: 0 }];
  return [false, { x: 0, y: Math.sign(środekY || 1) * wnikY }];
}

function zastosujKapsułkę(g: Gra, rodzaj: Palivo): void {
  switch (rodzaj) {
    case 'szeroko':
      g.padelW = Math.min(PADEL_W_MAX, g.padelW + 14);
      break;
    case 'wąsko':
      g.padelW = Math.max(PADEL_W_MIN, g.padelW - 12);
      break;
    case 'życie':
      g.życia += 1;
      break;
    case 'zwolnij': {
      g.prędkość = Math.max(110, Math.round(g.prędkość * 0.78));
      for (const kula of g.kule) {
        const v = Math.hypot(kula.vx, kula.vy);
        if (v > 0) {
          kula.vx = (kula.vx / v) * g.prędkość;
          kula.vy = (kula.vy / v) * g.prędkość;
        }
      }
      break;
    }
    case 'kule': {
      const matka = g.kule.find((kula) => !kula.przyklejona) ?? g.kule[0];
      if (!matka) break;
      // Dwie nowe odchyły się o pół kata od macierzystej — stado, nie strzępy.
      for (const odchył of [-0.55, 0.55]) {
        const kąt = Math.atan2(matka.vy, matka.vx) + odchył;
        g.kule.push({
          id: g.następnyId++,
          x: matka.x,
          y: matka.y,
          vx: Math.cos(kąt) * g.prędkość,
          vy: Math.sin(kąt) * g.prędkość,
          przyklejona: false,
        });
      }
      break;
    }
  }
}

function następnyPlan(g: Gra, rng: Rng): void {
  g.poziom += 1;
  g.plansza = budujPlan(g.poziom, rng);
  g.kapsułki = [];
  g.kule = [kulaStartowa(g.padelX, g.następnyId++)];
  g.padelW = PADEL_W;
  g.prędkość = prędkośćPoziomu(g.poziom);
  g.seria = 0;
  g.faza = 'gotowy';
}
