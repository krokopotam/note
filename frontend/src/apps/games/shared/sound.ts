/**
 * Generator dźwięku wspólnej dla gier.
 *
 * Żadnych plików z próbkami: jedna oscylator na zdarzenie, opadająca lub
 * wznosząca się częstotliwość, wykładnicze wybrzmienie. To brzmi jak 1989, bo
 * tak brzmiało, i nic nie waży. Gra, w której `AudioContext` nie działa, gra
 * dalej po cichu — dźwięk nie ma prawa niczego zepsuć.
 *
 * Gry podają tylko przepisy (patrz `pinball/sound.ts`, `arkanoid/sound.ts`),
 * więc ten sam kod nie jest dwa razy przepisany.
 */

/** Przepis na jeden dźwięk: od jakiej częstotliwości, do jakiej, jak długo. */
export type Przepis = {
  od: number;
  do: number;
  czas: number;
  typ: OscillatorType;
  głośność: number;
};

export interface Generator {
  play(nazwa: string): void;
  setEnabled(on: boolean): void;
  enabled(): boolean;
  dispose(): void;
}

/**
 * `getContext` pozwala podstawić atrapę w teście; bez niego pierwszy `play`
 * buduje prawdziwy `AudioContext` — wcześniej nie wolno, przeglądarka i tak by
 * nie puściła dźwięku przed pierwszym dotknięciem strony.
 */
export function createGenerator(
  przepisy: Record<string, Przepis>,
  getContext?: () => AudioContext | null,
): Generator {
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
    play(nazwa) {
      if (!on) return;
      const ctx = contextFor();
      const przepis = przepisy[nazwa];
      if (!ctx || !przepis) return;
      try {
        const teraz = ctx.currentTime;
        const oscylator = ctx.createOscillator();
        const wzmocnienie = ctx.createGain();
        oscylator.type = przepis.typ;
        oscylator.frequency.setValueAtTime(przepis.od, teraz);
        oscylator.frequency.exponentialRampToValueAtTime(Math.max(20, przepis.do), teraz + przepis.czas);
        wzmocnienie.gain.setValueAtTime(przepis.głośność, teraz);
        wzmocnienie.gain.exponentialRampToValueAtTime(0.0005, teraz + przepis.czas);
        oscylator.connect(wzmocnienie).connect(ctx.destination);
        oscylator.start(teraz);
        oscylator.stop(teraz + przepis.czas + 0.02);
      } catch {
        // Zepsuty dźwięk nie ma prawa zepsuć partii.
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
