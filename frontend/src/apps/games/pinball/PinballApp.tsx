import { useCallback, useEffect, useRef, useState } from 'react';
import { pressKey, PULL_PEWNY } from './physics';
import { createEngine } from './engine';
import type { Engine, Faza } from './engine';
import { buildTable } from './table';
import {
  Buf,
  CANVAS_H,
  DMD_H,
  FB_H,
  FB_W,
  blit,
  compose,
  paint,
  paintDmd,
  setPlastic,
} from './render';
import { createSound } from './sound';
import { startGame } from './rules';
import type { Rules } from './rules';
import { hudColor } from './view';
import { usePhone } from '../../../shell/viewport';
import styles from './PinballApp.module.css';

/** Jeden krok fizyki. 1/120 s — przy 60 klatkach dwa kroki na kadrę. */
const KROK = 1 / 120;
/** Pełne naciśnięcie wyrzutnika trwa tyle sekund. */
const CZAS_NACIŚNIĘCIA = 0.45;
const REKORD = 'note:pinball:rekord';
const HASLO = ['J', 'A', 'C', 'K', 'P'];

interface HudStan {
  score: number;
  ballsLeft: number;
  multiplier: number;
  mode: Rules['mode'];
  modeTime: number;
  letters: string[];
  jackpotLit: boolean;
  over: boolean;
}

const hudOd = (rules: Rules): HudStan => ({
  score: rules.score,
  ballsLeft: rules.ballsLeft,
  multiplier: rules.multiplier,
  mode: rules.mode,
  modeTime: rules.modeTime,
  letters: [...rules.letters],
  jackpotLit: rules.jackpotLit,
  over: rules.over,
});

function czytajRekord(): number {
  try {
    return Number(window.localStorage.getItem(REKORD)) || 0;
  } catch {
    return 0;
  }
}

function zapiszRekord(value: number): void {
  try {
    window.localStorage.setItem(REKORD, String(value));
  } catch {
    /* prywatny tryb przeglądarki — rekord po prostu nie zostanie */
  }
}

/**
 * Pinball.
 *
 * Komponent jest celowo cienki: pętla, wejście, płótno. Cała partia mieszka
 * w `engine`, całe malowanie w `render`, więc testy nie muszą wiedzieć nic
 * o DOM-ie.
 */
export function PinballApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const soundRef = useRef(createSound());
  const inputRef = useRef({ left: false, right: false, mini: false });
  const dotykRef = useRef(new Map<number, 'lewa' | 'prawa'>());
  const naciśniętyRef = useRef(false);
  const siłaRef = useRef(0);
  const sygnaturaRef = useRef('');

  const [hud, setHud] = useState<HudStan>(() => hudOd(startGame()));
  const [faza, setFaza] = useState<Faza>('ładowanie');
  const [siła, setSiła] = useState(0);
  const [rekord, setRekord] = useState(czytajRekord);
  const [dźwięk, setDźwięk] = useState(true);
  const phone = usePhone();

  const engine = (): Engine => {
    if (!engineRef.current) engineRef.current = createEngine(1989, (name) => soundRef.current.play(name));
    return engineRef.current;
  };

  const nowe = useCallback(() => {
    const gra = engine();
    const wynik = gra.zasady().score;
    if (wynik > czytajRekord()) {
      zapiszRekord(wynik);
      setRekord(wynik);
    }
    gra.reset();
    sygnaturaRef.current = '';
    setHud(hudOd(gra.zasady()));
    setFaza('ładowanie');
    siłaRef.current = 0;
    setSiła(0);
  }, []);

  const puść = useCallback(() => {
    if (!naciśniętyRef.current) return;
    naciśniętyRef.current = false;
    const gra = engine();
    // Muśnięcie też wystrzeliwuje, ale nie poniżej progu, po którym kula
    // na pewno wychodzi z toru — inaczej pierwsze dotknięcie wygląda na zepsuty
    // automat, a nie na delikatne kopnięcie.
    gra.launch(Math.max(PULL_PEWNY, siłaRef.current));
    siłaRef.current = 0;
    setSiła(0);
  }, []);

  const naciśnij = useCallback(() => {
    if (engine().faza() !== 'ładowanie') return;
    naciśniętyRef.current = true;
  }, []);

  // Pętla gry: dwa kroki fizyki na kadrą, potem malowanie i ewentualna
  // wymiana odczytu w panelu.
  useEffect(() => {
    const gra = engine();
    setPlastic(buildTable());
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const płótno = new Buf(FB_W, CANVAS_H);
    const matryca = new Buf(FB_W, DMD_H);
    const stół = new Buf(FB_W, FB_H);
    const obraz = ctx.createImageData(FB_W, CANVAS_H);

    let raf = 0;
    let ostatnia = performance.now();
    let akumulator = 0;

    const klatka = (teraz: number): void => {
      raf = window.requestAnimationFrame(klatka);
      // Tarcza zegara: nigdy wstecz, nigdy więcej niż 50 ms. Przeglądarka
      // potrafi przyspać kartę w tle, a ujemne `dt` cofnęłoby całą symulację.
      const dt = Math.max(0, Math.min(0.05, (teraz - ostatnia) / 1000));
      ostatnia = teraz;

      if (naciśniętyRef.current && gra.faza() === 'ładowanie') {
        siłaRef.current = Math.min(1, siłaRef.current + dt / CZAS_NACIŚNIĘCIA);
        setSiła(siłaRef.current);
      }

      akumulator += dt;
      let kroki = 0;
      while (akumulator >= KROK && kroki < 8) {
        gra.step(KROK, inputRef.current);
        akumulator -= KROK;
        kroki += 1;
      }
      if (kroki === 8 || akumulator < 0) akumulator = 0;

      paintDmd(matryca, gra.matryca(), teraz / 1000);
      paint(stół, gra.rama(teraz / 1000, siłaRef.current));
      compose(płótno, matryca, stół);
      blit(obraz, płótno);
      ctx.putImageData(obraz, 0, 0);

      const zasady = gra.zasady();
      const sygnatura = `${zasady.score}|${zasady.ballsLeft}|${zasady.mode}|${Math.ceil(zasady.modeTime)}|${zasady.letters}|${zasady.jackpotLit}|${gra.faza()}`;
      if (sygnatura !== sygnaturaRef.current) {
        sygnaturaRef.current = sygnatura;
        setHud(hudOd(zasady));
        setFaza(gra.faza());
        if (zasady.over && zasady.score > czytajRekord()) {
          zapiszRekord(zasady.score);
          setRekord(zasady.score);
        }
      }
    };

    raf = window.requestAnimationFrame(klatka);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // Klawiatura: strzałki i Z /. do klapek (strzałka w górę do mini-klapki),
  // spacja lub strzałka w dół do wyrzutnika, Enter do nowej partii. Same
  // klapki idą przez `pressKey` — ta mapa ma test, obsługa reszty klawiszy nie
  // musi go mieć, bo nic nie obraca.
  useEffect(() => {
    const wciśnięto = (event: KeyboardEvent): void => {
      if (pressKey(inputRef.current, event.key, true)) {
        event.preventDefault();
        return;
      }
      switch (event.key) {
        case ' ':
        case 'ArrowDown':
          if (!event.repeat) naciśnij();
          event.preventDefault();
          break;
        case 'Enter':
          if (engine().faza() === 'koniec') nowe();
          break;
        default:
          break;
      }
    };
    const puszczono = (event: KeyboardEvent): void => {
      if (pressKey(inputRef.current, event.key, false)) return;
      switch (event.key) {
        case ' ':
        case 'ArrowDown':
          puść();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', wciśnięto);
    window.addEventListener('keyup', puszczono);
    return () => {
      window.removeEventListener('keydown', wciśnięto);
      window.removeEventListener('keyup', puszczono);
    };
  }, [naciśnij, puść]);

  useEffect(() => () => soundRef.current.dispose(), []);

  // Ekran dotykowy: lewa połowa stołu to lewa klapka, prawa to prawa, a dotyk
  // w fazie ładowania naciąga wyrzutnik.
  const naDole = (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const box = canvas.getBoundingClientRect();
    return (event.clientX - box.left) / Math.max(1, box.width) < 0.5;
  };

  const dotykW = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (engine().faza() === 'ładowanie') {
      naciśnij();
      return;
    }
    const strona = naDole(event) ? 'lewa' : 'prawa';
    dotykRef.current.set(event.pointerId, strona);
    inputRef.current[strona === 'lewa' ? 'left' : 'right'] = true;
  };

  const dotykP = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (engine().faza() === 'ładowanie' && naciśniętyRef.current) {
      puść();
      return;
    }
    const strona = dotykRef.current.get(event.pointerId);
    if (!strona) return;
    dotykRef.current.delete(event.pointerId);
    inputRef.current[strona === 'lewa' ? 'left' : 'right'] = false;
  };

  const klapka = (strona: 'left' | 'right' | 'mini', on: boolean) => () => {
    inputRef.current[strona] = on;
  };

  const kolor = hudColor(hud.mode);

  return (
    <div className={styles.wrap} data-testid="pinball" data-faza={faza}>
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          width={FB_W}
          height={CANVAS_H}
          className={styles.canvas}
          data-testid="pinball-canvas"
          aria-label="Stół pinballa"
          onPointerDown={dotykW}
          onPointerUp={dotykP}
          onPointerCancel={dotykP}
        />
        {hud.over && (
          <div className={styles.nakladka} data-testid="pinball-koniec">
            <h2>Koniec gry</h2>
            <div>
              Wynik {hud.score.toLocaleString('pl-PL')} · rekord {rekord.toLocaleString('pl-PL')}
            </div>
            <button type="button" className={styles.strzal} onClick={nowe} data-testid="pinball-jeszcze">
              Zagraj jeszcze
            </button>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.pole}>
          <div className={styles.wynik} data-testid="pinball-wynik">
            {hud.score.toLocaleString('pl-PL')}
          </div>
          <div className={styles.rekord} data-testid="pinball-rekord">
            Rekord {rekord.toLocaleString('pl-PL')}
          </div>
        </div>

        <div className={`${styles.wiersz} ${styles.pole}`}>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={styles.kula}
              data-testid={`pinball-kula-${index}`}
              data-padnieta={String(index >= hud.ballsLeft)}
            />
          ))}
          {hud.mode && (
            <span className={styles.tryb} style={{ color: kolor }} data-testid="pinball-tryb">
              {hud.mode} {Math.ceil(hud.modeTime)}s
            </span>
          )}
          {hud.jackpotLit && !hud.mode && (
            <span className={styles.tryb} style={{ color: '#f2c418' }} data-testid="pinball-jackpot">
              jackpot otwarty
            </span>
          )}
          <span className={styles.rekord} data-testid="pinball-mnoznik">×{hud.multiplier}</span>
        </div>

        <div className={`${styles.litery} ${styles.pole}`} data-testid="pinball-litery">
          {HASLO.map((letter) => (
            <span key={letter} className={styles.litera} data-zebrana={String(hud.letters.includes(letter))}>
              {letter}
            </span>
          ))}
        </div>

        <div className={styles.hint}>
          {faza === 'ładowanie'
            ? 'Przytrzymaj STRZAŁ i puść. Im dłużej trzymasz, tym wyżej leci kula.'
            : 'Strzałki lub Z i kropka — klapki, strzałka w górę — mini-klapka na lewej burcie. Spacja — wyrzutnik. Pasy J A C K P otwierają jackpot i zapalają obronę kuli.'}
        </div>

        <div className={styles.nalozone} aria-hidden="true">
          <span data-testid="pinball-sila" style={{ width: `${Math.round(siła * 100)}%` }} />
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.pad}
            data-testid="pinball-lewa"
            aria-label="Lewa klapka"
            onPointerDown={klapka('left', true)}
            onPointerUp={klapka('left', false)}
            onPointerLeave={klapka('left', false)}
            onPointerCancel={klapka('left', false)}
          >
            ◀
          </button>
          <button
            type="button"
            className={styles.pad}
            data-testid="pinball-prawa"
            aria-label="Prawa klapka"
            onPointerDown={klapka('right', true)}
            onPointerUp={klapka('right', false)}
            onPointerLeave={klapka('right', false)}
            onPointerCancel={klapka('right', false)}
          >
            ▶
          </button>
          <button
            type="button"
            className={styles.mini}
            data-testid="pinball-mini"
            aria-label="Mini-klapka na lewej burcie"
            title="Mini-klapka — strzałka w górę"
            onPointerDown={klapka('mini', true)}
            onPointerUp={klapka('mini', false)}
            onPointerLeave={klapka('mini', false)}
            onPointerCancel={klapka('mini', false)}
          >
            ▲
          </button>

          <button
            type="button"
            className={styles.strzal}
            data-testid="pinball-strzal"
            disabled={faza !== 'ładowanie'}
            onPointerDown={naciśnij}
            onPointerUp={puść}
            onPointerCancel={puść}
          >
            {phone ? 'strzał' : 'STRZAŁ — trzymaj i puść'}
          </button>
        </div>

        <div className={styles.kącik}>
          <button type="button" className={styles.mini} onClick={nowe} data-testid="pinball-nowa">
            nowa
          </button>
          <button
            type="button"
            className={styles.mini}
            data-testid="pinball-dzwiek"
            aria-pressed={dźwięk}
            onClick={() => {
              const next = !dźwięk;
              setDźwięk(next);
              soundRef.current.setEnabled(next);
            }}
          >
            {dźwięk ? 'dźwięk' : 'cisza'}
          </button>
        </div>
      </div>
    </div>
  );
}
