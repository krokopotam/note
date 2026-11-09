import { create } from 'zustand';
import { request } from '../api/client';
import type { DesktopItem, DesktopItems, Favorites } from '../api/types';
import { nextFreeCell, type Cell } from './grid';

/**
 * Desktop layout and pinned apps.
 *
 * Writes are optimistic: a dragged icon is moved locally first and rolled back
 * only if the server rejects the move, so dragging never stutters on the round
 * trip. Every action keeps `items` in the shape the API returned, so a reload
 * cannot change what the user sees.
 */

export type Slot = 'dock' | 'launcher';

interface DesktopStore {
  items: DesktopItem[];
  favorites: Record<Slot, string[]>;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  load: () => Promise<void>;
  createFolder: (cell?: Cell) => Promise<DesktopItem | null>;
  createShortcut: (appId: string, title: string, cell?: Cell) => Promise<DesktopItem | null>;
  rename: (id: number, name: string) => Promise<void>;
  /** Drop an icon on a grid cell, optionally moving it into a folder in the same call. */
  moveItem: (id: number, cell: Cell, parentId: number | null) => Promise<void>;
  remove: (id: number) => Promise<void>;
  setFavorites: (slot: Slot, appIds: string[]) => Promise<void>;
}

/** Opening state, exported so tests can start from a clean desktop. */
export const desktopDefaults: Pick<DesktopStore, 'items' | 'favorites' | 'status' | 'error'> = {
  items: [],
  favorites: { dock: [], launcher: [] },
  status: 'loading',
  error: null,
};

export const useDesktop = create<DesktopStore>((set, get) => ({
  ...desktopDefaults,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const layout = await request<DesktopItems>('/desktop/items');
      const slots = await request<Favorites>('/desktop/favorites');
      set({
        items: layout.items,
        favorites: {
          dock: slots.slots.find((slot) => slot.slot === 'dock')?.app_ids ?? [],
          launcher: slots.slots.find((slot) => slot.slot === 'launcher')?.app_ids ?? [],
        },
        status: 'ready',
      });
    } catch (error) {
      set({ status: 'error', error: describe(error) });
    }
  },

  createFolder: async (cell) => {
    const target = cell ?? nextFreeCell(get().items, null);
    return postItem(
      set,
      get,
      { kind: 'folder', name: 'Nowy folder', x: target.x, y: target.y },
      'Nowy folder',
    );
  },

  createShortcut: async (appId, title, cell) => {
    const target = cell ?? nextFreeCell(get().items, null);
    return postItem(
      set,
      get,
      { kind: 'app', name: title, app_id: appId, x: target.x, y: target.y },
      title,
    );
  },

  rename: async (id, name) => {
    const before = get().items;
    set({ items: before.map((item) => (item.id === id ? { ...item, name } : item)) });
    try {
      const updated = await request<DesktopItem>(`/desktop/items/${id}`, {
        method: 'PATCH',
        body: { name },
      });
      set({ items: get().items.map((item) => (item.id === id ? updated : item)) });
    } catch (error) {
      set({ items: before, error: describe(error) });
    }
  },

  moveItem: async (id, cell, parentId) => {
    const before = get().items;
    set({
      items: before.map((item) =>
        item.id === id ? { ...item, x: cell.x, y: cell.y, parent_id: parentId } : item,
      ),
    });

    try {
      const updated = await request<DesktopItem>(`/desktop/items/${id}`, {
        method: 'PATCH',
        body: { x: cell.x, y: cell.y, parent_id: parentId },
      });
      set({ items: get().items.map((item) => (item.id === id ? updated : item)) });
    } catch (error) {
      set({ items: before, error: describe(error) });
    }
  },

  remove: async (id) => {
    const before = get().items;
    // Optimistically drop the folder subtree as well, mirroring the cascade.
    const doomed = collectSubtree(before, id);
    set({ items: before.filter((item) => !doomed.has(item.id)) });

    try {
      await request(`/desktop/items/${id}`, { method: 'DELETE' });
    } catch (error) {
      set({ items: before, error: describe(error) });
    }
  },

  setFavorites: async (slot, appIds) => {
    const before = get().favorites;
    set({ favorites: { ...before, [slot]: appIds } });
    try {
      await request('/desktop/favorites', { method: 'PUT', body: { slot, app_ids: appIds } });
    } catch (error) {
      set({ favorites: before, error: describe(error) });
    }
  },
}));

/** Direct children of a container: `parentId === null` is the desktop itself. */
export function childrenOf(items: DesktopItem[], parentId: number | null): DesktopItem[] {
  return items.filter((item) => item.parent_id === parentId);
}

/** Ids of an item and everything nested below it (folders only nest that far). */
export function collectSubtree(items: DesktopItem[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parent_id !== null && ids.has(item.parent_id) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

async function postItem(
  set: (partial: Partial<DesktopStore>) => void,
  get: () => DesktopStore,
  body: Record<string, unknown>,
  fallbackName: string,
): Promise<DesktopItem | null> {
  try {
    const created = await request<DesktopItem>('/desktop/items', { method: 'POST', body });
    set({ items: [...get().items, created] });
    return created;
  } catch (error) {
    set({ error: `${fallbackName}: ${describe(error)}` });
    return null;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'nieznany błąd';
}
