import { create } from 'zustand';
import { SAFE_AREA } from './grid';

/**
 * Window manager state.
 *
 * Deliberately not persisted: which windows are open is transient, while the
 * things worth keeping (note tabs, icon positions) are stored by the apps that
 * own them. That keeps this store free of API calls and trivially testable.
 */

export interface WindowState {
  key: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  payload: Record<string, unknown>;
}

export interface OpenInput {
  appId: string;
  title: string;
  width?: number;
  height?: number;
  payload?: Record<string, unknown>;
}

interface WindowStore {
  windows: WindowState[];
  focusedKey: string | null;
  /**
   * Bring an app to the front, creating it when needed.
   *
   * Windows are keyed by `key`, which defaults to the app id, so opening the
   * calculator twice yields one window instead of two. Folders pass
   * `folder:<id>` and therefore get a window each.
   */
  open: (input: OpenInput & { key?: string }) => string;
  close: (key: string) => void;
  focus: (key: string) => void;
  move: (key: string, x: number, y: number) => void;
  setTitle: (key: string, title: string) => void;
  toggleMinimize: (key: string) => void;
  toggleMaximize: (key: string) => void;
  /** Phone: home is not closing — every app keeps running, only the screen is empty. */
  goHome: () => void;
}

const CASCADE = 28;
const MARGIN = 24;
/** How much of the title bar must stay on screen, so a window is never lost. */
const TITLE_GRIP = { width: 120, height: 48 } as const;

/** Viewport size, tolerating a test run without a window object. */
function viewport(): { width: number; height: number } {
  return typeof window === 'undefined'
    ? { width: 1280, height: 800 }
    : { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Keep a window where the user can still grab it: below the top bar, right of the
 * launcher, and with a piece of the title bar inside the screen.
 */
function clampPosition(x: number, y: number): { x: number; y: number } {
  const { width, height } = viewport();
  return {
    x: Math.min(Math.max(x, SAFE_AREA.left), Math.max(SAFE_AREA.left, width - TITLE_GRIP.width)),
    y: Math.min(Math.max(y, SAFE_AREA.top), Math.max(SAFE_AREA.top, height - TITLE_GRIP.height)),
  };
}

/** Opening state, exported so tests can start from a clean desktop. */
export const windowDefaults: Pick<WindowStore, 'windows' | 'focusedKey'> = {
  windows: [],
  focusedKey: null,
};

export const useWindows = create<WindowStore>((set, get) => ({
  ...windowDefaults,

  open: ({ key, appId, title, width = 640, height = 480, payload = {} }) => {
    const windowKey = key ?? appId;
    const existing = get().windows.find((win) => win.key === windowKey);
    if (existing) {
      // The app is already open: refresh title and payload so it can react to
      // what the user asked for (e.g. the desktop's "Nowa notatka" pointing at a
      // note that must now be shown in the existing window).
      set((state) => ({
        focusedKey: windowKey,
        windows: state.windows.map((win) =>
          win.key === windowKey ? { ...win, title, payload, minimized: false } : win,
        ),
      }));
      return windowKey;
    }

    const offset = get().windows.length * CASCADE;
    const top = nextZ(get().windows);
    // New windows land inside the safe area, never under the top bar or launcher.
    const spot = clampPosition(SAFE_AREA.left + MARGIN + offset, SAFE_AREA.top + MARGIN + offset);
    set((state) => ({
      focusedKey: windowKey,
      windows: [
        ...state.windows,
        {
          key: windowKey,
          appId,
          title,
          x: spot.x,
          y: spot.y,
          width,
          height,
          z: top,
          minimized: false,
          maximized: false,
          payload,
        },
      ],
    }));
    return windowKey;
  },

  close: (key) =>
    set((state) => {
      const windows = state.windows.filter((win) => win.key !== key);
      return {
        windows,
        focusedKey:
          state.focusedKey === key ? (topmost(windows)?.key ?? null) : state.focusedKey,
      };
    }),

  focus: (key) =>
    set((state) => {
      const target = state.windows.find((win) => win.key === key);
      if (!target) return state;
      const top = nextZ(state.windows);
      return {
        focusedKey: key,
        windows: state.windows.map((win) =>
          win.key === key ? { ...win, z: top, minimized: false } : win,
        ),
      };
    }),

  move: (key, x, y) =>
    set((state) => ({
      windows: state.windows.map((win) =>
        win.key === key ? { ...win, ...clampPosition(x, y) } : win,
      ),
    })),

  setTitle: (key, title) =>
    set((state) => ({
      windows: state.windows.map((win) => (win.key === key ? { ...win, title } : win)),
    })),

  toggleMinimize: (key) =>
    set((state) => ({
      windows: state.windows.map((win) =>
        win.key === key ? { ...win, minimized: !win.minimized } : win,
      ),
      focusedKey:
        state.focusedKey === key
          ? (topmost(state.windows.filter((w) => w.key !== key && !w.minimized))?.key ?? null)
          : state.focusedKey,
    })),

  toggleMaximize: (key) =>
    set((state) => ({
      windows: state.windows.map((win) =>
        win.key === key ? { ...win, maximized: !win.maximized } : win,
      ),
    })),

  goHome: () =>
    set((state) => ({
      focusedKey: null,
      windows: state.windows.map((win) => ({ ...win, minimized: true })),
    })),
}));

function nextZ(windows: WindowState[]): number {
  return windows.reduce((max, win) => Math.max(max, win.z), 0) + 1;
}

function topmost(windows: WindowState[]): WindowState | undefined {
  return [...windows].filter((win) => !win.minimized).sort((a, b) => b.z - a.z)[0];
}
