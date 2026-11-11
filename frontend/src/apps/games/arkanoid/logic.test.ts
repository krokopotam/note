import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import {
  BRAK_WEJŚCIA,
  CHWILA_PO_POZIOMIE,
  KLOCK_H,
  KLOCK_W,
  KULA_R,
  MNOŻNIK_MAX,
  PADEL_V,
  PADEL_W,
  PADEL_Y,
  PLANY,
  SERIA_KROK,
  SZEROKOŚĆ,
  WYSOKOŚĆ,
  ŻYCIA_START,
  budujPlan,
  krok,
  mnożnikZ,
  planZebrany,
  prędkośćPoziomu,
  startowaGra,
  wyrzuć,
} from './logic';
import type { Cegła, Gra, Kula, Palivo, Wejście, Zdarzenie } from './logic';

const KROK = 1 / 120;

/** Gra z tym samym źródłem losowości — kapsułki wypadają tak samo w teście i u gracza. */
const gra = (seed = 7): [Gra, () => number] => {
  const rng = rngFrom(seed);
  return [startowaGra(rng), rng];
};

/** Gra z kulą w powietrzu. */
const wGrze = (seed = 7): [Gra, () => number] => {
  const [g, rng] = gra(seed);
  wyrzuć(g, 0);
  return [g, rng];
};

/** Prowadzi grę przez `sekund` z jednym wejściem, zbierając wszystkie zdarzenia. */
function leć(g: Gra, rng: () => number, sekund: number, wejście: Wejście = BRAK_WEJŚCIA): Zdarzenie[] {
  const log: Zdarzenie[] = [];
  for (let i = 0; i < Math.round(sekund / KROK); i += 1) log.push(...krok(g, KROK, wejście, rng));
  return log;
}

/** Podstawia kulę w wybrane miejsce z wybraną prędkością — test nie zależy od rzutu. */
function podłóż(g: Gra, x: number, y: number, vx: number, vy: number): Kula {
  const kula: Kula = { id: 99, x, y, vx, vy, przyklejona: false };
  g.kule = [kula];
  return kula;
}

/** Pierwszy klocek danego rodzaju na liście klocków. */
const wśród = (klocki: Cegła[], stal: boolean): Cegła => {
  const k = klocki.find((b) => (b.hp === null) === stal);
  if (!k) throw new Error(stal ? 'plan bez szynki' : 'plan bez cegły');
  return k;
};

const klocek = (g: Gra, stal: boolean): Cegła => wśród(g.plansza, stal);

/**
 * Zostawia na planszy jeden klocek. Rzędy cegieł chodzą co osiem pikseli, więc
 * bez tej izolacji test rozbija sąsiada i mierzy nie to, co chce.
 */
const tylko = (g: Gra, k: Cegła): Cegła => {
  g.plansza = [k];
  return k;
};

/** Kula pod klockiem, lecąca w jego środek od dołu. */
const odDołu = (g: Gra, k: Cegła, v = 200): void => {
  podłóż(g, k.x + KLOCK_W / 2, k.y + KLOCK_H + KULA_R + 6, 0, -v);
};

describe('start partii', () => {
  it('kula czeka przyklejona do klapki, a nie leci', () => {
    const [g] = gra();
    expect(g.faza).toBe('gotowy');
    expect(g.życia).toBe(ŻYCIA_START);
    expect(g.wynik).toBe(0);
    expect(g.kule).toHaveLength(1);
    expect(g.kule[0].przyklejona).toBe(true);
    expect(g.kule[0].x).toBe(g.padelX);
    expect(g.plansza.length).toBeGreaterThan(20);
  });

  it('bez zwolnienia nic się nie dzieje — kula jedzie z klapką, punktów cero', () => {
    const [g, rng] = gra();
    leć(g, rng, 1, { kierunek: 1, cel: null, zwolnij: false });
    expect(g.faza).toBe('gotowy');
    expect(g.wynik).toBe(0);
    expect(g.kule[0].y).toBeLessThan(PADEL_Y);
    expect(g.kule[0].x).toBe(g.padelX);
  });

  it('wyrzucenie podaje kulę do góry i otwiera partię', () => {
    const [g, rng] = gra();
    wyrzuć(g, 0);
    leć(g, rng, 0.1);
    expect(g.faza).toBe('gra');
    expect(g.kule[0].vy).toBeLessThan(0);
  });

  it('ruch klapki przy wyrzuceniu przechyla tor, ale nie bardziej niż 0,5 rad', () => {
    const [g] = gra();
    wyrzuć(g, 1);
    const kąt = Math.abs(Math.atan2(-g.kule[0].vx, -g.kule[0].vy));
    expect(kąt).toBeGreaterThan(0.1);
    expect(kąt).toBeLessThanOrEqual(0.5);
  });
});

describe('klapka', () => {
  it('klawiatura przesuwa klapkę i nie wypuszcza jej za ścianę', () => {
    const [g, rng] = wGrze();
    leć(g, rng, 3, { kierunek: 1, cel: null, zwolnij: false });
    expect(g.padelX).toBeCloseTo(SZEROKOŚĆ - g.padelW / 2, 3);
    leć(g, rng, 6, { kierunek: -1, cel: null, zwolnij: false });
    expect(g.padelX).toBeCloseTo(g.padelW / 2, 3);
  });

  it('klapka z klawiatury jedzie z prędkością PADEL_V', () => {
    const [g, rng] = wGrze();
    const przed = g.padelX;
    leć(g, rng, 0.2, { kierunek: -1, cel: null, zwolnij: false });
    expect(przed - g.padelX).toBeCloseTo(PADEL_V * 0.2, 0);
  });

  it('mysz podaje środek klapki wprost', () => {
    const [g, rng] = wGrze();
    leć(g, rng, 0.02, { kierunek: 0, cel: 60, zwolnij: false });
    expect(g.padelX).toBe(60);
  });

  it('kula trafiona w krawędź odbija pod kątem, a ze środka idzie prosto', () => {
    const [g, rng] = wGrze();
    g.padelX = SZEROKOŚĆ / 2;
    podłóż(g, g.padelX + g.padelW / 2 - 1, PADEL_Y - KULA_R - 1, 0, 120);
    leć(g, rng, KROK);
    expect(Math.abs(g.kule[0].vx)).toBeGreaterThan(60);
    expect(g.kule[0].vy).toBeLessThan(0);

    podłóż(g, g.padelX, PADEL_Y - KULA_R - 1, 0, 120);
    leć(g, rng, KROK);
    expect(Math.abs(g.kule[0].vx)).toBeLessThan(1);
    expect(g.kule[0].vy).toBeLessThan(-100);
  });

  it('dotknięcie klapki zeruje serię', () => {
    const [g, rng] = wGrze();
    g.seria = 7;
    podłóż(g, g.padelX, PADEL_Y - KULA_R - 1, 0, 120);
    leć(g, rng, KROK);
    expect(g.seria).toBe(0);
  });
});

describe('ściany', () => {
  it('kula odbija się od lewej, prawej i góry i zostaje w polu', () => {
    const [g, rng] = wGrze();
    podłóż(g, 2, 5, -200, -200);
    const log = leć(g, rng, 0.05);
    expect(log.filter((z) => z.kind === 'odbicie').length).toBeGreaterThan(1);
    expect(g.kule[0].vx).toBeGreaterThan(0);
    leć(g, rng, 1.5);
    expect(g.kule[0].x).toBeGreaterThan(0);
    expect(g.kule[0].x).toBeLessThan(SZEROKOŚĆ);
    expect(g.kule[0].y).toBeGreaterThan(0);
  });
});

describe('klocki', () => {
  it('uderzenie zbija punkty i odbija kulę', () => {
    const [g, rng] = wGrze();
    const k = tylko(g, klocek(g, false)!);
    const przed = k.hp!;
    odDołu(g, k);
    const log = leć(g, rng, 0.05);
    expect(k.hp).toBe(przed - 1);
    expect(g.wynik).toBe(25);
    expect(log.some((z) => z.kind === 'cegiełka')).toBe(true);
    expect(g.kule[0].vy).toBeGreaterThan(0);
  });

  it('cegła traci tyle uderzeń, ile ma wytrzymałości, i znika z punktów dopiero na końcu', () => {
    const [g, rng] = wGrze();
    const trójka = tylko(g, g.plansza.find((b) => b.hp === 3)!);
    for (let raz = 0; raz < 3; raz += 1) {
      odDołu(g, trójka);
      leć(g, rng, 0.05);
      expect(g.kule[0].vy).toBeGreaterThan(0);
    }
    expect(trójka.hp).toBe(0);
    expect(g.plansza.includes(trójka)).toBe(false);
    expect(g.wynik).toBe(75);
  });

  it('szynka odbija, ale jej nie ubywa', () => {
    const [g, rng] = wGrze();
    // Szynki są dopiero na planie pierwszym. Obok musi zostać cegła: plan bez
    // niczego do zbicia jest z definicji zaliczony i gra skończyłaby poziom w
    // pierwszej klatce, zanim kula zdążyłaby dolecieć.
    const klocki = budujPlan(1, rngFrom(3));
    const szynka = wśród(klocki, true);
    const rezerwa = klocki.find((b) => b.hp !== null && b.x > 180)!;
    g.plansza = [szynka, rezerwa];
    odDołu(g, szynka);
    const log = leć(g, rng, 0.05);
    expect(szynka.hp).toBeNull();
    expect(g.wynik).toBe(0);
    expect(log.some((z) => z.kind === 'stal')).toBe(true);
    expect(g.kule[0].vy).toBeGreaterThan(0);
  });

  it('kula nie przeskakuje klocka przy dużej prędkości', () => {
    const [g, rng] = wGrze();
    g.prędkość = 240;
    const k = tylko(g, klocek(g, false)!);
    const przed = k.hp!;
    odDołu(g, k, 240);
    leć(g, rng, 0.05);
    expect(k.hp).toBe(przed - 1);
  });
});

describe('serie i mnożnik', () => {
  it('mnożnik rośnie co tyle cegiełek, ile trzeba, i ma sufit', () => {
    expect(mnożnikZ(0)).toBe(1);
    expect(mnożnikZ(SERIA_KROK - 1)).toBe(1);
    expect(mnożnikZ(SERIA_KROK)).toBe(2);
    expect(mnożnikZ(SERIA_KROK * MNOŻNIK_MAX)).toBe(MNOŻNIK_MAX);
    expect(mnożnikZ(9999)).toBe(MNOŻNIK_MAX);
  });

  it('cztery klocki z rządu bez klapki płacą podwójnie', () => {
    const [g, rng] = wGrze();
    const klocki = g.plansza.filter((b) => b.hp !== null).slice(0, 4);
    // Rezerwa daleko z boku: bez niej czwarte zbicie zamknęłoby plan i reszta
    // kroków poleciałaby w następnym poziomie.
    const rezerwa = g.plansza.find((b) => b.hp !== null && b.x > 180)!;
    for (const k of klocki) {
      g.plansza = [k, rezerwa];
      odDołu(g, k);
      leć(g, rng, 0.05);
    }
    expect(g.seria).toBe(4);
    expect(g.wynik).toBe(25 + 25 + 25 + 50);
  });
});

describe('kapsołki', () => {
  /** Rzuca pod klapkę `razy` kapsułek tego samego rodzaju i łapie je wszystkie. */
  const złap = (rodzaj: Palivo, razy = 1): Gra => {
    const [g, rng] = wGrze();
    for (let i = 0; i < razy; i += 1) {
      g.kapsułki = [{ x: g.padelX, y: PADEL_Y - 40, rodzaj }];
      leć(g, rng, 1);
    }
    return g;
  };

  it('szeroka i wąska zmierzają klapkę w granicach', () => {
    expect(złap('szeroko').padelW).toBeGreaterThan(PADEL_W);
    expect(złap('wąsko').padelW).toBeLessThan(PADEL_W);
    expect(złap('szeroko', 6).padelW).toBe(66);
    expect(złap('wąsko', 6).padelW).toBe(26);
  });

  it('kapsułka z życiem dopisuje życie', () => {
    const g = złap('życie');
    expect(g.życia).toBe(ŻYCIA_START + 1);
  });

  it('zwolnienie ścina prędkość kuli, a nie tylko licznik', () => {
    const [g, rng] = wGrze();
    const przed = Math.hypot(g.kule[0].vx, g.kule[0].vy);
    g.kapsułki = [{ x: g.padelX, y: PADEL_Y - 40, rodzaj: 'zwolnij' }];
    leć(g, rng, 1);
    expect(g.prędkość).toBeLessThan(przed);
    expect(Math.hypot(g.kule[0].vx, g.kule[0].vy)).toBeCloseTo(g.prędkość, 3);
  });

  it('kule robią ze jednej kuli trzy', () => {
    const g = złap('kule');
    expect(g.kule.length).toBeGreaterThanOrEqual(3);
    expect(new Set(g.kule.map((k) => k.id)).size).toBe(g.kule.length);
  });

  it('kapsołka spada i znika pod planszą, jeśli jej nie złapać', () => {
    const [g, rng] = wGrze();
    g.padelX = 20;
    g.kapsułki = [{ x: 236, y: 100, rodzaj: 'szeroko' }];
    leć(g, rng, 4);
    expect(g.kapsułki).toHaveLength(0);
    expect(g.padelW).toBe(PADEL_W);
  });
});

describe('życia i koniec', () => {
  it('spod klapki kula znika, życie spada, a klapka wraca do zwykłej szerokości', () => {
    const [g, rng] = wGrze();
    g.padelW = 60;
    podłóż(g, g.padelX, WYSOKOŚĆ + 20, 0, 200);
    const log = leć(g, rng, KROK);
    expect(g.życia).toBe(ŻYCIA_START - 1);
    expect(g.faza).toBe('gotowy');
    expect(g.padelW).toBe(PADEL_W);
    expect(g.kule[0].przyklejona).toBe(true);
    expect(log.some((z) => z.kind === 'opal')).toBe(true);
  });

  it('trzy zguby kończą partię i nic już w niej nie drgnie', () => {
    const [g, rng] = gra();
    for (let kula = 0; kula < ŻYCIA_START; kula += 1) {
      wyrzuć(g, 0);
      podłóż(g, g.padelX, WYSOKOŚĆ + 20, 0, 200);
      leć(g, rng, KROK);
    }
    expect(g.faza).toBe('koniec');
    expect(g.życia).toBe(0);
    const czas = g.czas;
    leć(g, rng, 2);
    expect(g.czas).not.toBe(czas);
    expect(g.kule).toHaveLength(0);
  });
});

describe('poziomy', () => {
  it('zebranie wszystkiego, co się da zebrać, kończy plan, stal może zostać', () => {
    const [g, rng] = wGrze();
    g.plansza = g.plansza.filter((k) => k.hp === null);
    expect(planZebrany(g.plansza)).toBe(true);
    const log = leć(g, rng, KROK);
    expect(g.faza).toBe('poziom');
    expect(log.some((z) => z.kind === 'poziom')).toBe(true);
  });

  it('po chwili wchodzi następny plan, szybsza kula i nowa klocki', () => {
    const [g, rng] = wGrze();
    const stare = g.plansza;
    g.plansza = g.plansza.filter((k) => k.hp === null);
    leć(g, rng, KROK);
    leć(g, rng, CHWILA_PO_POZIOMIE + 0.1);
    expect(g.poziom).toBe(1);
    expect(g.faza).toBe('gotowy');
    expect(g.prędkość).toBe(prędkośćPoziomu(1));
    expect(g.plansza).not.toBe(stare);
    expect(g.kule[0].przyklejona).toBe(true);
  });

  it('prędkość rośnie z poziomem i ma sufit', () => {
    expect(prędkośćPoziomu(1)).toBeGreaterThan(prędkośćPoziomu(0));
    expect(prędkośćPoziomu(50)).toBe(prędkośćPoziomu(50));
    expect(prędkośćPoziomu(50)).toBeLessThanOrEqual(240);
  });

  it('każdy plan ma piętnaście kolumn, osiem wierszy i tylko znane znaki', () => {
    for (const plan of PLANY) {
      expect(plan).toHaveLength(8);
      for (const wiersz of plan) {
        expect(wiersz).toHaveLength(15);
        expect(wiersz).toMatch(/^[.123S]+$/);
      }
    }
  });

  it('budowa planu z tego samego ziarna daje te same kapsułki', () => {
    const a = budujPlan(2, rngFrom(11));
    const b = budujPlan(2, rngFrom(11));
    expect(a.map((k) => `${k.x},${k.y},${k.hp},${k.kapsułka}`)).toEqual(b.map((k) => `${k.x},${k.y},${k.hp},${k.kapsułka}`));
    expect(a.some((k) => k.kapsułka !== null)).toBe(true);
  });
});

describe('ciągła gra', () => {
  /**
   * Klapka, która biega za kulą i podstawia ją zawsze lekko od środka pola —
   * inaczej kula odbija pionowo, wydrąża jedną kolumnę i krąży w niej w nieskończoność.
   */
  const graj = (seed: number, sekund: number): Gra => {
    const [g, rng] = gra(seed);
    wyrzuć(g, 0);
    for (let i = 0; i < Math.round(sekund / KROK); i += 1) {
      const kula = g.kule.find((b) => !b.przyklejona) ?? g.kule[0];
      const cel = kula ? kula.x + (kula.x < SZEROKOŚĆ / 2 ? 10 : -10) : SZEROKOŚĆ / 2;
      krok(g, KROK, { kierunek: 0, cel, zwolnij: g.faza === 'gotowy' }, rng);
      if (g.faza === 'koniec') break;
    }
    return g;
  };

  it('pięć minut z klapką za kulą: punktów przybywa, kula jest w polu, bez NaN', () => {
    const g = graj(5, 300);
    expect(g.wynik).toBeGreaterThan(0);
    expect(Number.isFinite(g.padelX)).toBe(true);
    for (const kula of g.kule) {
      expect(Number.isFinite(kula.x)).toBe(true);
      expect(Number.isFinite(kula.y)).toBe(true);
      expect(kula.x).toBeGreaterThan(-1);
      expect(kula.x).toBeLessThan(SZEROKOŚĆ + 1);
    }
    expect(['gotowy', 'gra', 'poziom', 'koniec']).toContain(g.faza);
  });

  it('ta sama partia z tego samego ziarna daje ten sam wynik', () => {
    expect(graj(3, 60).wynik).toBe(graj(3, 60).wynik);
  });

  it('kula nigdy nie leci równolegle do klapki na dłuższą metę', () => {
    const g = graj(9, 120);
    for (const kula of g.kule) {
      if (kula.przyklejona) continue;
      expect(Math.abs(kula.vy)).toBeGreaterThan(g.prędkość * 0.2);
    }
  });

  // Kula spędza dużo czasu na dole, więc jednej planszy AI nie zbiera w całości
  // w pięć minut; po tym widać, czy gra posuwa się do przodu i czy kula nie
  // przepada między klapką a krawędzią.
  it('pięć minut gry klapką za kulą: pół planu zebrane, kule nie tracone', () => {
    const [wzorzec] = gra(2);
    const ileNaStartcie = wzorzec.plansza.length;
    const g = graj(2, 300);
    expect(g.plansza.length).toBeLessThan(ileNaStartcie / 2);
    expect(g.wynik).toBeGreaterThan(2000);
    expect(g.życia).toBeGreaterThanOrEqual(ŻYCIA_START);
  });
});
