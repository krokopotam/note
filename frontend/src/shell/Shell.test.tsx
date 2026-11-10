import { fireEvent, screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, type RequestOptions } from '../api/client';
import { Shell } from './Shell';
import { useAuth } from './authStore';
import { desktopDefaults, useDesktop } from './desktopStore';
import { windowDefaults, useWindows } from './windowStore';
import type { DesktopItem } from '../api/types';

// Keep the real module (queryString is used by the api clients), mock only transport.
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, request: vi.fn() };
});

const mockedRequest = vi.mocked(request);

const stamp = '2026-01-01T00:00:00.000Z';

const user = { id: 1, username: 'ala', created_at: stamp, last_login_at: stamp };

let table: DesktopItem[] = [];

/** Whether the fake server recognises the (imaginary) cookie of this test run. */
let signedIn = true;

const item = (overrides: Partial<DesktopItem> & { id: number }): DesktopItem => ({
  kind: 'app',
  name: 'item',
  app_id: null,
  parent_id: null,
  x: 0,
  y: 0,
  created_at: stamp,
  ...overrides,
});

function fakeBackend() {
  mockedRequest.mockImplementation(async (path: string, options?: RequestOptions) => {
    const body = options?.body as Partial<DesktopItem> | undefined;

    if (path === '/auth/me') {
      if (!signedIn) throw new ApiError(401, 'unauthorized', 'zaloguj się');
      return { user };
    }
    if (path === '/auth/login' || path === '/auth/register') {
      signedIn = true;
      return { user };
    }
    if (path === '/auth/logout') {
      signedIn = false;
      return undefined;
    }
    if (!signedIn) throw new ApiError(401, 'unauthorized', 'zaloguj się');

    if (path === '/desktop/items' && !options?.method) return { items: table.map((row) => ({ ...row })) };
    if (path === '/notes' && options?.method === 'POST') {
      return { id: 900, title: 'Bez tytułu', body: '', created_at: stamp, updated_at: stamp };
    }
    if (path === '/stickies' && options?.method === 'POST') {
      return {
        id: 901,
        body: '',
        color: 'yellow',
        pinned: false,
        created_at: stamp,
        updated_at: stamp,
      };
    }
    if (path === '/desktop/favorites') {
      return {
        slots: [
          { slot: 'dock', app_ids: ['calculator', 'notepad', 'stickies'] },
          { slot: 'launcher', app_ids: ['calculator', 'notepad', 'stickies'] },
        ],
      };
    }
    if (path === '/desktop/items' && options?.method === 'POST') {
      const created = item({ id: table.length + 100, ...body });
      table = [...table, created];
      return created;
    }
    const patched = /^\/desktop\/items\/(\d+)$/.exec(path);
    if (patched && options?.method === 'PATCH') {
      const id = Number(patched[1]);
      const current = table.find((row) => row.id === id);
      if (!current) throw new Error('not_found');
      const next = { ...current, ...body };
      // The store treats a null parent as "on the desktop", matching the API.
      table = table.map((row) => (row.id === id ? next : row));
      return next;
    }
    if (patched && options?.method === 'DELETE') {
      const id = Number(patched[1]);
      table = table.filter((row) => row.id !== id && row.parent_id !== id);
      return undefined;
    }
    throw new Error(`unexpected request: ${options?.method ?? 'GET'} ${path}`);
  });
}

/** Drag an icon to a point of the grid, then let the optimistic update settle. */
async function drag(from: HTMLElement, toX: number, toY: number) {
  fireEvent.pointerDown(from, { clientX: 12, clientY: 12, button: 0 });
  fireEvent.pointerMove(window, { clientX: toX, clientY: toY });
  fireEvent.pointerUp(window, { clientX: toX, clientY: toY });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  useDesktop.setState(desktopDefaults);
  useWindows.setState(windowDefaults);
  signedIn = true;
  useAuth.setState({ status: 'signed-in', user, busy: false, error: null });
  vi.resetAllMocks();
  table = [
    item({ id: 1, name: 'Kalkulator', app_id: 'calculator', x: 0, y: 0 }),
    item({ id: 2, name: 'Notatnik', app_id: 'notepad', x: 1, y: 0 }),
    item({ id: 3, name: 'Schron', kind: 'folder', x: 3, y: 0 }),
    item({ id: 4, name: 'Kalkulator w schronie', app_id: 'calculator', parent_id: 3, x: 0, y: 0 }),
    item({ id: 5, name: 'Widmo', app_id: 'ghost', x: 4, y: 0 }),
  ];
  fakeBackend();
});

describe('desktop shell', () => {
  it('paints icons and both shortcut bars', async () => {
    render(<Shell />);

    expect(await screen.findByTestId('icon-1')).toHaveTextContent('Kalkulator');
    expect(screen.getByTestId('icon-3')).toHaveTextContent('Schron');
    // The folder's child belongs to the folder window, not to the desktop grid.
    expect(screen.getByTestId('icon-grid-desktop')).not.toHaveTextContent('Kalkulator w schronie');

    expect(screen.getByTestId('dock-calculator')).toBeInTheDocument();
    expect(screen.getByTestId('launcher-stickies')).toBeInTheDocument();
  });

  it('opens an app from the dock and reports it in the top bar', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    await userEvent.click(screen.getByTestId('dock-notepad'));

    expect(await screen.findByTestId('window-notepad')).toBeInTheDocument();
    expect(screen.getByTestId('titlebar-notepad')).toHaveTextContent('Notatnik');
  });

  it('opens an app by double-clicking its desktop icon', async () => {
    render(<Shell />);
    const icon = await screen.findByTestId('icon-1');

    await userEvent.dblClick(icon);

    expect(await screen.findByTestId('window-calculator')).toBeInTheDocument();
  });

  it('closes a window with the red button', async () => {
    render(<Shell />);
    await userEvent.dblClick(await screen.findByTestId('icon-1'));
    const win = await screen.findByTestId('window-calculator');

    await userEvent.click(within(win).getByRole('button', { name: 'Zamknij' }));

    expect(screen.queryByTestId('window-calculator')).not.toBeInTheDocument();
  });

  it('shows a readable fallback for an icon pointing at a removed app', async () => {
    render(<Shell />);
    await userEvent.dblClick(await screen.findByTestId('icon-5'));

    const win = await screen.findByTestId('window-ghost');
    expect(win).toHaveTextContent('Ta aplikacja nie jest już zainstalowana');
    expect(win).toHaveTextContent('ghost');
  });

  it('opens a folder window listing only its own icons', async () => {
    render(<Shell />);
    await userEvent.dblClick(await screen.findByTestId('icon-3'));

    const win = await screen.findByTestId('window-folder');
    expect(within(win).getByTestId('icon-4')).toHaveTextContent('Kalkulator w schronie');
    expect(within(win).queryByTestId('icon-1')).not.toBeInTheDocument();
  });

  it('saves the cell an icon was dragged into', async () => {
    render(<Shell />);
    const icon = await screen.findByTestId('icon-1');

    // Cell (2,3): 2 * 96 <= 250 < 3 * 96, 3 * 104 <= 320 < 4 * 104.
    await drag(icon, 250, 320);

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items/1', {
      method: 'PATCH',
      body: { x: 2, y: 3, parent_id: null },
    });
  });

  it('moves an icon into a folder when it is dropped on that folder', async () => {
    render(<Shell />);
    const icon = await screen.findByTestId('icon-1');

    // Folder sits at cell (3,0) -> pointer inside that cell.
    await drag(icon, 3 * 96 + 20, 40);

    // It already holds an icon in (0,0), so the newcomer lands in the next free cell.
    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items/1', {
      method: 'PATCH',
      body: { x: 1, y: 0, parent_id: 3 },
    });
  });

  it('ignores a click that is not a drag', async () => {
    render(<Shell />);
    const icon = await screen.findByTestId('icon-1');

    fireEvent.pointerDown(icon, { clientX: 12, clientY: 12, button: 0 });
    fireEvent.pointerUp(window, { clientX: 13, clientY: 13 });

    expect(mockedRequest).not.toHaveBeenCalledWith(
      '/desktop/items/1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('creates a folder from the desktop context menu', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    await userEvent.pointer([
      { target: screen.getByTestId('desktop'), coords: { x: 400, y: 400 }, keys: '[MouseRight]' },
    ]);

    const menu = await screen.findByTestId('context-menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Nowy folder' }));

    // Icons occupy (0,0), (1,0), (3,0) and (4,0): the gap at (2,0) is the first free.
    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items', {
      method: 'POST',
      body: { kind: 'folder', name: 'Nowy folder', x: 2, y: 0 },
    });
  });

  it('creates a note from the desktop menu and opens the notepad', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    await userEvent.pointer([
      { target: screen.getByTestId('desktop'), coords: { x: 400, y: 400 }, keys: '[MouseRight]' },
    ]);
    await userEvent.click(
      within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Nowa notatka' }),
    );

    expect(mockedRequest).toHaveBeenCalledWith('/notes', { method: 'POST', body: { body: '' } });
    expect(await screen.findByTestId('window-notepad')).toBeInTheDocument();
  });

  it('creates a card from the desktop menu and opens the board', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    await userEvent.pointer([
      { target: screen.getByTestId('desktop'), coords: { x: 400, y: 400 }, keys: '[MouseRight]' },
    ]);
    await userEvent.click(
      within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Nowa karteczka' }),
    );

    expect(mockedRequest).toHaveBeenCalledWith('/stickies', { method: 'POST', body: { body: '' } });
    expect(await screen.findByTestId('window-stickies')).toBeInTheDocument();
  });

  it('deletes an icon from its context menu', async () => {
    render(<Shell />);
    const icon = await screen.findByTestId('icon-2');

    await userEvent.pointer([{ target: icon, coords: { x: 200, y: 20 }, keys: '[MouseRight]' }]);

    await userEvent.click(within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Usuń' }));

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items/2', { method: 'DELETE' });
    expect(screen.queryByTestId('icon-2')).not.toBeInTheDocument();
  });

  it('renames an icon inline', async () => {
    render(<Shell />);
    const icon = await screen.findByTestId('icon-3');

    await userEvent.pointer([{ target: icon, coords: { x: 320, y: 20 }, keys: '[MouseRight]' }]);
    await userEvent.click(within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Zmień nazwę' }));

    const field = await screen.findByRole('textbox', { name: 'Nowa nazwa' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Biurko{Enter}');

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items/3', {
      method: 'PATCH',
      body: { name: 'Biurko' },
    });
    expect(await screen.findByTestId('icon-3')).toHaveTextContent('Biurko');
  });

  it('lists all installed apps in the launcher overlay and opens from there', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    await userEvent.click(screen.getByTestId('launcher-all'));
    await userEvent.click(await screen.findByTestId('appgrid-stickies'));

    expect(await screen.findByTestId('window-stickies')).toBeInTheDocument();
  });

  it('tells the user when the desktop cannot be loaded', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    // The API goes away for everything but the session check.
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { user };
      throw new Error('offline');
    });
    await useDesktop.getState().load();

    expect(await screen.findByTestId('error-toast')).toHaveTextContent('offline');
  });
});

describe('signing in', () => {
  it('shows the login form to a stranger, and nothing of the desktop', async () => {
    signedIn = false;

    render(<Shell />);

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dock-calculator')).not.toBeInTheDocument();
  });

  it('waits for the answer before deciding what to show', () => {
    useAuth.setState({ status: 'booting', user: null, error: null });
    mockedRequest.mockImplementation(() => new Promise(() => {}));

    render(<Shell />);

    expect(screen.getByTestId('boot-splash')).toBeInTheDocument();
  });

  it('paints the desktop after a successful login', async () => {
    signedIn = false;
    render(<Shell />);
    const form = await screen.findByTestId('login-screen');

    await userEvent.type(within(form).getByLabelText('Login'), 'ala');
    await userEvent.type(within(form).getByLabelText('Hasło'), 'mojehaslo123');
    await userEvent.click(within(form).getByRole('button', { name: 'Wejdź' }));

    expect(await screen.findByTestId('icon-1')).toBeInTheDocument();
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('topbar-user')).toHaveTextContent('ala');
  });

  it('logs out and hands the screen back to the login form', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    await userEvent.click(screen.getByRole('button', { name: 'Wyloguj' }));

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('topbar-user')).not.toBeInTheDocument();
  });

  it('hands the screen back the moment the session is known to be gone', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');

    // What the 401 listener does (covered in authStore.test.ts): anonymous again.
    useAuth.setState({ status: 'anonymous', user: null });

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
  });

  it('explains itself when the server is unreachable while deciding who is here', async () => {
    useAuth.setState({ status: 'booting', user: null, error: null });
    mockedRequest.mockRejectedValue(new Error('offline'));

    render(<Shell />);

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(screen.getByTestId('login-error')).toHaveTextContent('Nie udało się połączyć');
  });
});

describe('maximised windows', () => {
  it('can still be minimised, and come back from the dock', async () => {
    render(<Shell />);
    await screen.findByTestId('icon-1');
    await userEvent.click(screen.getByTestId('dock-calculator'));
    const frame = await screen.findByTestId('window-calculator');

    await userEvent.click(within(frame).getByRole('button', { name: 'Maksymalizuj' }));

    // No geometry of its own while maximised: (0,0) + 100vw is exactly what used to
    // slide the window under the top bar, covering its own title bar and buttons.
    expect(frame.style.top).toBe('');
    expect(frame.style.left).toBe('');
    expect(frame.style.width).toBe('');

    await userEvent.click(within(frame).getByRole('button', { name: 'Zminimalizuj' }));
    expect(screen.queryByTestId('window-calculator')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('dock-calculator'));
    expect(screen.getByTestId('window-calculator')).toBeInTheDocument();
  });
});
