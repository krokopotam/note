import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import {
  KOLORY_KAPSUŁEK,
  hex,
  licznik,
  posuńFx,
  rysuj,
  utwórzFx,
  zapiszZdarzenia,
} from './draw';
import { PAL } from './draw';
import { SZEROKOŚĆ, WYSOKOŚĆ, startowaGra, wyrzuć } from './logic';
import type { Zdarzenie } from './logic';

/** Płótno, które nic nie rysuje, tylko zapisuje pociągnięcia — bez niego testy szłyby przez DOM. */
type Pociągnięcie = { x: number; y: number; w: number; h: number; kolor: string };

function atrapa(): { ctx: CanvasRenderingContext2D; kreski: Pociągnięcie[] } {
  const kreski: Pociągnięcie[] = [];
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      kreski.push({ x, y, w, h, kolor: String(this.fillStyle) });
    },
    strokeRect() {
      kreski.push({ x: 0, y: 0, w: 0, h: 0, kolor: String(this.strokeStyle) });
    },
    save() {},
    restore() {},
    translate() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, kreski };
}

const gra = () => {
  const rng = rngFrom(5);
  const g = startowaGra(rng);
  wyrzuć(g, 0);
  return g;
};

describe('kadry', () => {
  it('rysują pełne tło i ani jednego piksela poza płótnem', () => {
    const { ctx, kreski } = atrapa();
    rysuj(ctx, gra(), utwórzFx(), 0);
    expect(kreski.some((k) => k.w === SZEROKOŚĆ && k.h === WYSOKOŚĆ)).toBe(true);
    for (const k of kreski) {
      expect(k.x + k.w).toBeLessThanOrEqual(SZEROKOŚĆ + 4);
      expect(k.y + k.h).toBeLessThanOrEqual(WYSOKOŚĆ + 4);
    }
  });

  it('każdy klocek dostaje swoje pociągnięcia, a zbity znika z kadru', () => {
    const g = gra();
    const ile = g.plansza.length;
    const pierwsza = atrapa();
    rysuj(pierwsza.ctx, g, utwórzFx(), 0);
    const zKlockami = pierwsza.kreski.length;

    g.plansza = g.plansza.slice(0, ile - 10);
    const druga = atrapa();
    rysuj(druga.ctx, g, utwórzFx(), 0);
    expect(druga.kreski.length).toBeLessThan(zKlockami);
  });

  it('szynka odróżnia się kolorem od cegły', () => {
    const { ctx, kreski } = atrapa();
    const g = gra();
    g.plansza = [{ id: 1, x: 40, y: 40, hp: null, kapsułka: null }];
    rysuj(ctx, g, utwórzFx(), 0);
    expect(kreski.some((k) => k.kolor === hex(PAL.szynka))).toBe(true);
  });
});

describe('licznik', () => {
  it('pokazuje siedem cyfr, a zera z przodu ma przygaszone', () => {
    const { ctx, kreski } = atrapa();
    licznik(ctx, 75, SZEROKOŚĆ - 8, 12);
    const cyfry = kreski.filter((k) => k.w <= 7 && k.h <= 12);
    expect(cyfry.length).toBeGreaterThanOrEqual(7 * 7);
    const jasne = cyfry.filter((k) => k.kolor === hex(PAL.żółty)).length;
    const przygaszone = cyfry.filter((k) => k.kolor === hex(0x4d3f1c)).length;
    expect(jasne).toBeGreaterThan(0);
    expect(przygaszone).toBeGreaterThan(jasne);
  });

  it('duża liczba nie ma już nic przygaszonego', () => {
    const { ctx, kreski } = atrapa();
    licznik(ctx, 1234567, SZEROKOŚĆ - 8, 12);
    expect(kreski.some((k) => k.kolor === hex(0x4d3f1c))).toBe(false);
  });
});

describe('efekty ze zdarzeń', () => {
  const rng = () => rngFrom(1)();

  it('zbicie cegiełki daje iskrę i liczbę punktów', () => {
    const fx = utwórzFx();
    const zdarzenia: Zdarzenie[] = [{ kind: 'cegiełka', x: 100, y: 80, punkty: 75, seria: true }];
    zapiszZdarzenia(fx, zdarzenia, rng);
    expect(fx.iskry.length).toBeGreaterThan(4);
    expect(fx.liczby.map((l) => l.tekst)).toContain('+75');
    expect(fx.drżenie).toBeGreaterThan(0);
  });

  it('złapana kapsułka rozjaśnia klapkę i ma własny kolor', () => {
    const fx = utwórzFx();
    zapiszZdarzenia(fx, [{ kind: 'kapsułka', x: 40, y: 300, rodzaj: 'kule' }], rng);
    expect(fx.klapka).toBe(1);
    expect(fx.rozbłyski[0].kolor).toBe(KOLORY_KAPSUŁEK.kule);
  });

  it('każdy rodzaj kapsułki ma inny kolor', () => {
    const kolory = new Set(Object.values(KOLORY_KAPSUŁEK));
    expect(kolory.size).toBe(5);
  });

  it('po chwili wszystko gaśnie, a drżenie wraca do zera', () => {
    const fx = utwórzFx();
    zapiszZdarzenia(fx, [{ kind: 'cegiełka', x: 100, y: 80, punkty: 25, seria: false }], rng);
    zapiszZdarzenia(fx, [{ kind: 'opal', x: 10 }], rng);
    for (let i = 0; i < 200; i += 1) posuńFx(fx, 1 / 60);
    expect(fx.iskry).toHaveLength(0);
    expect(fx.liczby).toHaveLength(0);
    expect(fx.rozbłyski).toHaveLength(0);
    expect(fx.drżenie).toBe(0);
    expect(fx.klapka).toBe(0);
  });

  it('iskier nie przybywa w nieskończoność', () => {
    const fx = utwórzFx();
    for (let i = 0; i < 200; i += 1) {
      zapiszZdarzenia(fx, [{ kind: 'cegiełka', x: 100, y: 80, punkty: 25, seria: true }], rng);
    }
    expect(fx.iskry.length).toBeLessThanOrEqual(160);
  });
});

describe('rysowanie z efektami', () => {
  it('po zbiciu klocka w kadrze jest więcej pociągnięć niż przed', () => {
    const g = gra();
    const fx = utwórzFx();
    const przed = atrapa();
    rysuj(przed.ctx, g, fx, 0);

    zapiszZdarzenia(
      fx,
      [{ kind: 'cegiełka', x: 100, y: 80, punkty: 125, seria: true }],
      rngFrom(3),
    );
    const po = atrapa();
    rysuj(po.ctx, g, fx, 0.05);
    expect(po.kreski.length).toBeGreaterThan(przed.kreski.length);
  });
});
