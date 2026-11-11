/**
 * Dźwięk.
 *
 * Amiga grała z ośmiu kanałów PCM, ale próbki w przeglądarce ważyłyby więcej niż
 * cały pinball. Dlatego tylko sterowane envelopy: jedna dwa-takty fala prostokątna
 * na uderzenie, opadająca dla otworu, pętla dla trybu. Bez plików, bez ładowania,
 * bez czekania — i bez wyjątku, gdy przeglądarka nie ma `AudioContext`.
 */

export type Dźwięk =
  | 'banda'
  | 'zbijak'
  | 'klapka'
  | 'cel'
  | 'tryb'
  | 'jackpot'
  | 'otwór'
  | 'bilet'
  | 'wyrzutnik';

/** Przepis na jeden dźwięk: częstotliwości, czas, kształt. */
interface Przepis {
  od: number;
  do: number;
  czas: number;
  typ: OscillatorType;
  głośność: number;
}

const PRZEPISY: Record<Dźwięk, Przepis> = {
  banda: { od: 320, do: 180, czas: 0.05, typ: 'square', głośność: 0.05 },
  zbijak: { od: 880, do: 240, czas: 0.09, typ: 'square', głośność: 0.11 },
  klapka: { od: 180, do: 90, czas: 0.06, typ: 'square', głośność: 0.09 },
  cel: { od: 1200, do: 1800, czas: 0.07, typ: 'square', głośność: 0.09 },
  tryb: { od: 400, do: 1200, czas: 0.3, typ: 'sawtooth', głośność: 0.09 },
  jackpot: { od: 600, do: 2400, czas: 0.5, typ: 'square', głośność: 0.12 },
  otwór: { od: 300, do: 60, czas: 0.4, typ: 'sawtooth', głośność: 0.1 },
  bilet: { od: 1500, do: 900, czas: 0.22, typ: 'triangle', głośność: 0.1 },
  wyrzutnik: { od: 120, do: 700, czas: 0.18, typ: 'square', głośność: 0.1 },
};

export interface DźwiękInterface {
  play(name: Dźwięk): void;
  setEnabled(on: boolean): void;
  enabled(): boolean;
  dispose(): void;
}

/**
 * Tworzy generator. `AudioContext` pojawia się przy pierwszym sygnale, bo
 * przeglądarki nie pozwalają grać przed pierwszym dotknięciem strony.
 */
export function createSound(getContext?: () => AudioContext | null): DźwiękInterface {
  let context: AudioContext | null | undefined;
  let on = true;

  const contextFor = (): AudioContext | null => {
    if (context !== undefined) return context;
    try {
      context = getContext ? getContext() : new AudioContext();
    } catch {
      context = null;
    }
    return context;
  };

  return {
    play(name) {
      if (!on) return;
      const ctx = contextFor();
      if (!ctx) return;
      const recipe = PRZEPISY[name];
      if (!recipe) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = recipe.typ;
        osc.frequency.setValueAtTime(recipe.od, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, recipe.do), now + recipe.czas);
        gain.gain.setValueAtTime(recipe.głośność, now);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + recipe.czas);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + recipe.czas + 0.02);
      } catch {
        // Zepsuty wyjątek w dźwięku nie ma prawa zepsuć gry.
      }
    },
    setEnabled(value) {
      on = value;
    },
    enabled() {
      return on;
    },
    dispose() {
      try {
        context?.close();
      } catch {
        /* już zamknięty */
      }
      context = null;
    },
  };
}
