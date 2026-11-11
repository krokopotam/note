/**
 * Dźwięki pinballa.
 *
 * Amiga grała z ośmiu kanałów PCM, ale próbki w przeglądarce ważyłyby więcej niż
 * cały pinball, więc zostają sterowane envelopy: fala prostokątna na uderzenie,
 * opadająca dla odpływu, wznosząca dla jackpota. Samo granie jest wspólne z
 * innymi grami w `../shared/sound.ts`; tu leży wyłącznie przepis.
 */

import { createGenerator } from '../shared/sound';
import type { Generator, Przepis } from '../shared/sound';

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

export function createSound(getContext?: () => AudioContext | null): Generator {
  return createGenerator(PRZEPISY, getContext);
}
