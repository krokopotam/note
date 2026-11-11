/**
 * Dźwięki Arkanoida.
 *
 * Cztery dźwięki na całą grę, bo arcade nie opowiadało historii — meldowało.
 * Przepis jest tu, granie jest wspólne (`../shared/sound.ts`).
 */

import { createGenerator } from '../shared/sound';
import type { Generator, Przepis } from '../shared/sound';

export type Dźwięk = 'ściana' | 'klapka' | 'cegiełka' | 'twardo' | 'kapsułka' | 'opal' | 'poziom';

const PRZEPISY: Record<Dźwięk, Przepis> = {
  ściana: { od: 420, do: 300, czas: 0.04, typ: 'square', głośność: 0.05 },
  klapka: { od: 240, do: 520, czas: 0.06, typ: 'square', głośność: 0.08 },
  cegiełka: { od: 760, do: 320, czas: 0.07, typ: 'square', głośność: 0.1 },
  twardo: { od: 190, do: 150, czas: 0.05, typ: 'square', głośność: 0.07 },
  kapsułka: { od: 900, do: 1700, czas: 0.16, typ: 'triangle', głośność: 0.11 },
  opal: { od: 320, do: 55, czas: 0.45, typ: 'sawtooth', głośność: 0.11 },
  poziom: { od: 500, do: 1900, czas: 0.42, typ: 'square', głośność: 0.12 },
};

export function createSound(getContext?: () => AudioContext | null): Generator {
  return createGenerator(PRZEPISY, getContext);
}
