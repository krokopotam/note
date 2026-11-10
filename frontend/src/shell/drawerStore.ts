import { create } from 'zustand';

/**
 * Whether the "all applications" overlay is open.
 *
 * The launcher opens it on a desktop, the phone's bottom bar opens it too, so the
 * answer cannot live inside either of them. One tiny store, no API calls.
 */
interface DrawerStore {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const useDrawer = create<DrawerStore>((set) => ({
  open: false,
  toggle: () => set((state) => ({ open: !state.open })),
  close: () => set({ open: false }),
}));

export const drawerDefaults = { open: false };
