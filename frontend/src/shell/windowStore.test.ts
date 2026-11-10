import { beforeEach, describe, expect, it } from 'vitest';
import { SAFE_AREA } from './grid';
import { openApp, openFolder } from './openApp';
import { useWindows, windowDefaults } from './windowStore';
import type { DesktopItem } from '../api/types';

beforeEach(() => {
  useWindows.setState(windowDefaults);
});

const folder = (id: number, name = 'Schron'): DesktopItem => ({
  id,
  kind: 'folder',
  name,
  app_id: null,
  parent_id: null,
  x: 0,
  y: 0,
  created_at: '2026-01-01T00:00:00.000Z',
});

describe('window store', () => {
  it('opens an app once: a second open focuses the same window', () => {
    const first = openApp('calculator');
    const second = openApp('calculator');

    expect(second).toBe(first);
    expect(useWindows.getState().windows).toHaveLength(1);
  });

  it('takes the default size from the app manifest', () => {
    openApp('notepad');
    expect(useWindows.getState().windows[0]).toMatchObject({
      width: 960,
      height: 640,
      title: 'Notatnik',
    });
  });

  it('replaces the payload when an open app is opened again', () => {
    openApp('notepad', { payload: { noteId: 1 } });
    openApp('notepad', { payload: { noteId: 2 } });

    const windows = useWindows.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0].payload).toEqual({ noteId: 2 });
  });

  it('gives every folder its own window', () => {
    openFolder(folder(1, 'Biuro'));
    openFolder(folder(2, 'Prywatne'));

    const keys = useWindows.getState().windows.map((win) => win.key);
    expect(keys).toEqual(['folder:1', 'folder:2']);
  });

  it('renames an open folder window when the folder is renamed', () => {
    openFolder(folder(1, 'Stara'));
    openFolder({ ...folder(1), name: 'Nowa' });

    expect(useWindows.getState().windows[0].title).toBe('Nowa');
  });

  it('stacks windows by z and focuses the topmost remaining one after close', () => {
    openApp('calculator');
    openApp('stickies');
    expect(useWindows.getState().focusedKey).toBe('stickies');

    useWindows.getState().close('stickies');
    expect(useWindows.getState().focusedKey).toBe('calculator');

    useWindows.getState().close('calculator');
    expect(useWindows.getState().focusedKey).toBeNull();
  });

  it('un-minimises a window when it is opened again', () => {
    openApp('calculator');
    useWindows.getState().toggleMinimize('calculator');
    expect(useWindows.getState().windows[0].minimized).toBe(true);

    openApp('calculator');
    expect(useWindows.getState().windows[0].minimized).toBe(false);
    expect(useWindows.getState().focusedKey).toBe('calculator');
  });

  it('drops focus to the desktop when the focused window is minimised', () => {
    openApp('calculator');
    useWindows.getState().toggleMinimize('calculator');
    expect(useWindows.getState().focusedKey).toBeNull();
  });

  it('opens inside the safe area, not under the top bar or the launcher', () => {
    openApp('calculator');

    const win = useWindows.getState().windows[0];
    expect(win.x).toBeGreaterThanOrEqual(SAFE_AREA.left);
    expect(win.y).toBeGreaterThanOrEqual(SAFE_AREA.top);
  });

  it('will not let a window be thrown under the shell bars', () => {
    openApp('calculator');

    useWindows.getState().move('calculator', -400, -220);

    expect(useWindows.getState().windows[0]).toMatchObject({
      x: SAFE_AREA.left,
      y: SAFE_AREA.top,
    });
  });

  it('keeps a piece of the title bar on screen when dragged far out', () => {
    openApp('calculator');

    useWindows.getState().move('calculator', 90_000, 90_000);

    const win = useWindows.getState().windows[0];
    expect(win.x).toBeLessThan(window.innerWidth);
    expect(win.y).toBeLessThan(window.innerHeight);
  });

  it('cascades new windows so they do not cover each other exactly', () => {
    openApp('calculator');
    openApp('notepad');

    const [first, second] = useWindows.getState().windows;
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it('maximises and restores without losing the restored geometry', () => {
    openApp('calculator');
    useWindows.getState().move('calculator', 120, 90);
    useWindows.getState().toggleMaximize('calculator');
    expect(useWindows.getState().windows[0].maximized).toBe(true);

    useWindows.getState().toggleMaximize('calculator');
    expect(useWindows.getState().windows[0]).toMatchObject({ maximized: false, x: 120, y: 90 });
  });
});
