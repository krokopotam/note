import { create } from 'zustand';

/**
 * Context menu service.
 *
 * One tiny store instead of prop drilling: the desktop, an icon or a card can all
 * request the menu, and only ContextMenu knows how it looks.
 */

export interface MenuAction {
  id: string;
  label: string;
  run: () => void;
  danger?: boolean;
}

interface ContextMenuStore {
  x: number;
  y: number;
  actions: MenuAction[];
  open: (x: number, y: number, actions: MenuAction[]) => void;
  close: () => void;
}

export const useContextMenu = create<ContextMenuStore>((set) => ({
  x: 0,
  y: 0,
  actions: [],
  open: (x, y, actions) => set({ x, y, actions }),
  close: () => set({ actions: [] }),
}));
