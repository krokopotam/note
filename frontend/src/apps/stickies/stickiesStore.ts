import { create } from 'zustand';
import { stickiesApi } from './stickiesApi';
import type { SortOrder, Sticky } from '../../api/types';

/**
 * Stickies board state.
 *
 * Search and sorting are delegated to the API rather than filtered in the
 * browser, so the board works the same whether there are 20 or 20 000 cards.
 */

export type StickyColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

interface StickiesStore {
  stickies: Sticky[];
  total: number;
  query: string;
  sort: SortOrder;
  onlyPinned: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /**
   * The card created a moment ago that is still waiting for its first words: it
   * gets the caret, and another click on "Nowa karteczka" points at it instead of
   * putting a second blank card on the board.
   *
   * Nothing here ever deletes a card — a blur is also a click on the window frame,
   * the pin or another app, and a card that vanishes for one of those is lost work.
   * `pendingNonce` bumps so the caret can be sent back to the same card.
   */
  pendingEmptyId: number | null;
  pendingNonce: number;

  load: () => Promise<void>;
  search: (query: string) => Promise<void>;
  setSort: (sort: SortOrder) => Promise<void>;
  setOnlyPinned: (only: boolean) => Promise<void>;
  create: (body?: string) => Promise<void>;
  /** Text is committed on blur, so typing does not fire one request per key. */
  commitText: (id: number, body: string) => Promise<void>;
  setColor: (id: number, color: StickyColor) => Promise<void>;
  togglePinned: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Everything the store holds besides the actions — also its reset point. */
export const stickiesDefaults: Pick<
  StickiesStore,
  | 'stickies'
  | 'total'
  | 'query'
  | 'sort'
  | 'onlyPinned'
  | 'status'
  | 'error'
  | 'pendingEmptyId'
  | 'pendingNonce'
> = {
  stickies: [],
  total: 0,
  query: '',
  sort: 'updated_desc',
  onlyPinned: false,
  status: 'idle',
  error: null,
  pendingEmptyId: null,
  pendingNonce: 0,
};

export const useStickies = create<StickiesStore>((set, get) => ({
  ...stickiesDefaults,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const page = await stickiesApi.list(listParams(get()));
      set({ stickies: page.items, total: page.total, status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: describe(error) });
    }
  },

  search: async (query) => {
    set({ query });
    await get().load();
  },

  setSort: async (sort) => {
    set({ sort });
    await get().load();
  },

  setOnlyPinned: async (onlyPinned) => {
    set({ onlyPinned });
    await get().load();
  },

  create: async (body = '') => {
    // A blank card is already waiting for words: send the caret back to it rather
    // than stacking another empty one (that is how the board got littered).
    if (body.trim() === '') {
      const waiting = get().stickies.find((sticky) => sticky.id === get().pendingEmptyId);
      if (waiting && waiting.body.trim() === '') {
        set((state) => ({ pendingNonce: state.pendingNonce + 1, error: null }));
        return;
      }
    }

    try {
      const created = await stickiesApi.create({ body });
      set({
        stickies: [created, ...get().stickies],
        total: get().total + 1,
        pendingEmptyId: created.body.trim() === '' ? created.id : null,
      });
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  commitText: async (id, body) => {
    const current = get().stickies.find((sticky) => sticky.id === id);
    if (!current || current.body === body) return;
    if (get().pendingEmptyId === id) set({ pendingEmptyId: null });
    await patch(set, get, id, { body });
  },

  setColor: async (id, color) => {
    await patch(set, get, id, { color });
  },

  togglePinned: async (id) => {
    const current = get().stickies.find((sticky) => sticky.id === id);
    if (!current) return;
    await patch(set, get, id, { pinned: !current.pinned });
    // Pinned cards sort first, so the board order has to be re-read from the API.
    await get().load();
  },

  remove: async (id) => {
    const before = get().stickies;
    set({ stickies: before.filter((sticky) => sticky.id !== id), total: Math.max(0, get().total - 1) });
    try {
      await stickiesApi.remove(id);
    } catch (error) {
      set({ stickies: before, error: describe(error) });
    }
  },
}));

function listParams(state: StickiesStore) {
  return { q: state.query, sort: state.sort, pinned: state.onlyPinned };
}

async function patch(
  set: (partial: Partial<StickiesStore>) => void,
  get: () => StickiesStore,
  id: number,
  changes: { body?: string; color?: string; pinned?: boolean },
) {
  try {
    const updated = await stickiesApi.update(id, changes);
    set({
      stickies: get().stickies.map((sticky) => (sticky.id === id ? updated : sticky)),
    });
  } catch (error) {
    set({ error: describe(error) });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'nieznany błąd';
}
