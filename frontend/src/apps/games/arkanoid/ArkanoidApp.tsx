/**
 * Arkanoid — widok.
 *
 * Komponent celowo jest cienki: trzyma pętlę klatek, czytanie wejścia i
 * rysowanie. Cała gra mieszka w `logic.ts`, efekty w `draw.ts`, więc partię da
 * się przetestować bez DOM-u, a tu zostaje tylko przekładanie zdarzeń na
 * dźwięk i liczby w panelu.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { randomRng } from '../shared/random';
import { BRAK_WEJŚCIA, PADEL_Y, SZEROKOŚĆ, WYSOKOŚĆ, ŻYCIA_START, krok, mnożnikZ, startowaGra } from './logic';
import type { Faza, Gra, Wejście } from './logic';
import { posuńFx, rysuj, utwórzFx, zapiszZdarzenia } from './draw';
import { createSound } from './sound';
import styles from './ArkanoidApp.module.css';

const KROK = 1 / 120;
const KLUCZ_REKORDU = 'note:arkanoid:rekord';

type Odczyt = {
  wynik: number;
  życia: number;
  poziom: number;
  faza: Faza;
  seria: number;
};

function czytajRekord(): number {
  try {
    return Number(window.localStorage.getItem(KLUCZ_REKORDU)) || 0;
  } catch {
    return 0;
  }
}

function zapiszRekord(wartość: number): void {
  try {
    window.localStorage.setItem(KLUCZ_REKORDU, String(wartość));
  } catch {
    // Prywatne okno bez pamięci to nie powód, żeby gra przestała działać.
  }
}

export function ArkanoidApp() {
  const płótnoRef = useRef<HTMLCanvasElement>(null);
  const graRef = useRef<Gra | null>(null);
  const losRef = useRef<() => number>(() => 0);
  // Partia buduje się przy pierwszym żądaniu, nie przy każdym renderze:
  // `useRef(startowaGra(...))` składałaby plan klocków w każdej klatce Reacta.
  const gra = (): Gra => {
    if (!graRef.current) {
      losRef.current = randomRng();
      graRef.current = startowaGra(losRef.current);
    }
    return graRef.current;
  };
  const fxRef = useRef(utwórzFx());
  const wejścieRef = useRef<Wejście>({ ...BRAK_WEJŚCIA });
  const klawiszeRef = useRef({ lewo: false, prawo: false });
  const dźwiękRef = useRef(createSound());
  const ograniczonoRef = useRef(false);
  const [odczyt, setOdczyt] = useState<Odczyt>({
    wynik: 0,
    życia: ŻYCIA_START,
    poziom: 0,
    faza: 'gotowy',
    seria: 0,
  });
  const [rekord, setRekord] = useState(czytajRekord);
  const [dźwięk, setDźwięk] = useState(true);

  const nowe = useCallback(() => {
    graRef.current = null;
    gra();
    fxRef.current = utwórzFx();
    wejścieRef.current = { ...BRAK_WEJŚCIA };
    setOdczyt({ wynik: 0, życia: ŻYCIA_START, poziom: 0, faza: 'gotowy', seria: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pętla gry.
  useEffect(() => {
    const płótno = płótnoRef.current;
    const ctx = płótno?.getContext('2d');
    if (!płótno || !ctx) return undefined;

    ograniczonoRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let rAF = 0;
    let ostatnia = performance.now();
    let akumulator = 0;

    const klatka = (teraz: number): void => {
      rAF = window.requestAnimationFrame(klatka);
      // Tarcza zegara: nigdy wstecz, nigdy więcej niż 50 ms — ujemne `dt`
      // cofnęłoby partię, a duże wysłałoby kulę przez klocki.
      const dt = Math.max(0, Math.min(0.05, (teraz - ostatnia) / 1000));
      ostatnia = teraz;

      const g = gra();
      const fx = fxRef.current;
      const klawisze = klawiszeRef.current;
      wejścieRef.current.kierunek = (klawisze.prawo ? 1 : 0) - (klawisze.lewo ? 1 : 0);

      akumulator += dt;
      let kroki = 0;
      while (akumulator >= KROK && kroki < 8) {
        const zdarzenia = krok(g, KROK, wejścieRef.current, los);
        if (zdarzenia.length > 0) {
          zapiszZdarzenia(fx, zdarzenia, los, ograniczonoRef.current ? 0 : 1);
          for (const z of zdarzenia) {
            if (z.kind === 'cegiełka') dźwiękRef.current.play('cegiełka');
            else if (z.kind === 'stal') dźwiękRef.current.play('twardo');
            else if (z.kind === 'kapsułka') dźwiękRef.current.play('kapsułka');
            else if (z.kind === 'opal') dźwiękRef.current.play('opal');
            else if (z.kind === 'poziom') dźwiękRef.current.play('poziom');
            else if (z.kind === 'odbicie') dźwiękRef.current.play(z.y > PADEL_Y - 14 ? 'klapka' : 'ściana');
          }
        }
        if (wejścieRef.current.zwolnij) wejścieRef.current.zwolnij = false;
        akumulator -= KROK;
        kroki += 1;
      }
      if (kroki === 8) akumulator = 0;

      posuńFx(fx, dt);
      rysuj(ctx, g, fx, teraz / 1000);

      const sygnatura = `${g.wynik}|${g.życia}|${g.poziom}|${g.faza}|${mnożnikZ(g.seria)}`;
      if (sygnatura !== ostatniaSygnatura) {
        ostatniaSygnatura = sygnatura;
        setOdczyt({ wynik: g.wynik, życia: g.życia, poziom: g.poziom, faza: g.faza, seria: g.seria });
        if (g.faza === 'koniec') {
          setRekord((poprzedni) => {
            const najlepszy = Math.max(poprzedni, g.wynik);
            zapiszRekord(najlepszy);
            return najlepszy;
          });
        }
      }
    };

    const los = () => losRef.current();
    let ostatniaSygnatura = '';
    rAF = window.requestAnimationFrame(klatka);
    return () => window.cancelAnimationFrame(rAF);
  }, []);

  // Klawiatura. Strzałki prowadzą klapkę, spacja i Enter wypuszczają kulę.
  useEffect(() => {
    const w_dół = (zdarzenie: KeyboardEvent): void => {
      if (zdarzenie.key === 'ArrowLeft' || zdarzenie.key === 'a' || zdarzenie.key === 'A') {
        klawiszeRef.current.lewo = true;
        zdarzenie.preventDefault();
      } else if (zdarzenie.key === 'ArrowRight' || zdarzenie.key === 'd' || zdarzenie.key === 'D') {
        klawiszeRef.current.prawo = true;
        zdarzenie.preventDefault();
      } else if (zdarzenie.key === ' ' || zdarzenie.key === 'ArrowUp') {
        wejścieRef.current.zwolnij = true;
        zdarzenie.preventDefault();
      } else if (zdarzenie.key === 'Enter' && gra().faza === 'koniec') {
        nowe();
      }
    };
    const do_góry = (zdarzenie: KeyboardEvent): void => {
      if (zdarzenie.key === 'ArrowLeft' || zdarzenie.key === 'a' || zdarzenie.key === 'A') klawiszeRef.current.lewo = false;
      if (zdarzenie.key === 'ArrowRight' || zdarzenie.key === 'd' || zdarzenie.key === 'D') klawiszeRef.current.prawo = false;
    };
    window.addEventListener('keydown', w_dół);
    window.addEventListener('keyup', do_góry);
    return () => {
      window.removeEventListener('keydown', w_dół);
      window.removeEventListener('keyup', do_góry);
    };
  }, [nowe]);

  // Mysz i palec: klapka idzie tam, gdzie wskazanie, bez klikania i bez opóźnień.
  const wskaz = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const prostokąt = e.currentTarget.getBoundingClientRect();
    if (prostokąt.width <= 0) return;
    wejścieRef.current.cel = ((e.clientX - prostokąt.left) / prostokąt.width) * SZEROKOŚĆ;
  };

  const dotknij = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    wskaz(e);
    wejścieRef.current.zwolnij = true;
  };

  const mnożnik = mnożnikZ(odczyt.seria);

  return (
    <div className={styles.okno} data-testid="arkanoid" data-faza={odczyt.faza}>
      <div className={styles.scena}>
        <canvas
          ref={płótnoRef}
          className={styles.płótno}
          data-testid="arkanoid-canvas"
          width={SZEROKOŚĆ}
          height={WYSOKOŚĆ}
          style={{ aspectRatio: `${SZEROKOŚĆ} / ${WYSOKOŚĆ}` }}
          onPointerMove={wskaz}
          onPointerDown={dotknij}
        />
        {odczyt.faza === 'koniec' ? (
          <div className={styles.zasłona} data-testid="arkanoid-koniec">
            <p className={styles.napisKonca}>KONIEC GRY</p>
            <p className={styles.wynikKonca}>{odczyt.wynik.toLocaleString('pl-PL')} punktów</p>
            <button type="button" className={styles.guzik} data-testid="arkanoid-ponownie" onClick={nowe}>
              JESZCZE RAZ
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.panel}>
        <div className={styles.wiersz}>
          <span className={styles.etykieta}>wynik</span>
          <strong className={styles.wynik} data-testid="arkanoid-wynik">
            {odczyt.wynik.toLocaleString('pl-PL')}
          </strong>
        </div>
        <div className={styles.wiersz}>
          <span className={styles.etykieta}>rekord</span>
          <span data-testid="arkanoid-rekord">{rekord.toLocaleString('pl-PL')}</span>
        </div>
        <div className={styles.wiersz}>
          <span className={styles.etykieta}>poziom</span>
          <span data-testid="arkanoid-poziom">{odczyt.poziom + 1}</span>
          <span className={styles.mnoznik} data-testid="arkanoid-mnożnik">
            ×{mnożnik}
          </span>
        </div>
        <div className={styles.kule} data-testid="arkanoid-życia" aria-label={`Kule: ${odczyt.życia}`}>
          {Array.from({ length: Math.max(0, odczyt.życia) }, (_, i) => (
            <i key={i} className={styles.kulka} />
          ))}
        </div>

        <p className={styles.podpowiedź}>
          Mysz albo palec prowadzi klapkę, strzałki też działają. Kula odbija się tym mocniej, im bliżej
          końca klapki trafi — tam są czerwone końce. Spacja wypuszcza kulę.
        </p>

        <div className={styles.doły}>
          <button
            type="button"
            className={styles.guzik}
            data-testid="arkanoid-puść"
            disabled={odczyt.faza !== 'gotowy'}
            onPointerDown={() => {
              wejścieRef.current.zwolnij = true;
            }}
          >
            puść kulę
          </button>
          <button type="button" className={styles.mini} data-testid="arkanoid-nowa" onClick={nowe}>
            nowa
          </button>
          <button
            type="button"
            className={styles.mini}
            data-testid="arkanoid-dźwięk"
            aria-pressed={dźwięk}
            onClick={() => {
              const następny = !dźwięk;
              setDźwięk(następny);
              dźwiękRef.current.setEnabled(następny);
            }}
          >
            {dźwięk ? 'dźwięk' : 'cisza'}
          </button>
        </div>
      </div>
    </div>
  );
}
