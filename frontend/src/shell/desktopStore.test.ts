import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api/client';
import { childrenOf, collectSubtree, desktopDefaults, useDesktop } from './desktopStore';
import type { DesktopItem } from '../api/types';

vi.mock('../api/client', () => ({ request: vi.fn() }));

const mockedRequest = vi.mocked(request);

const item = (overrides: Partial<DesktopItem> & { id: number }): DesktopItem => ({
  kind: 'app',
  name: `item ${overrides.id}`,
  app_id: 'calculator',
  parent_id: null,
  x: 0,
  y: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  useDesktop.setState(desktopDefaults);
  mockedRequest.mockReset();
});

describe('desktop store loading', () => {
  it('loads icons and both favourite slots', async () => {
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/desktop/items') return { items: [item({ id: 1 }), item({ id: 2, parent_id: 1 })] };
      if (path === '/desktop/favorites') {
        return { slots: [{ slot: 'dock', app_ids: ['notepad'] }, { slot: 'launcher', app_ids: [] }] };
      }
      throw new Error(`unexpected ${path}`);
    });

    await useDesktop.getState().load();

    const state = useDesktop.getState();
    expect(state.status).toBe('ready');
    expect(state.items).toHaveLength(2);
    expect(state.favorites).toEqual({ dock: ['notepad'], launcher: [] });
  });

  it('reports a failed load instead of showing an empty desktop', async () => {
    mockedRequest.mockRejectedValue(new Error('502'));

    await useDesktop.getState().load();

    expect(useDesktop.getState().status).toBe('error');
    expect(useDesktop.getState().error).toBe('502');
  });
});

describe('desktop store writes', () => {
  it('sends the dragged cell to the API', async () => {
    useDesktop.setState({ items: [item({ id: 1 })] });
    mockedRequest.mockResolvedValue(item({ id: 1, x: 4, y: 2 }));

    await useDesktop.getState().moveItem(1, { x: 4, y: 2 }, null);

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items/1', {
      method: 'PATCH',
      body: { x: 4, y: 2, parent_id: null },
    });
    expect(useDesktop.getState().items[0]).toMatchObject({ x: 4, y: 2 });
  });

  it('rolls the icon back when the server rejects the move', async () => {
    useDesktop.setState({ items: [item({ id: 1, x: 1, y: 1, name: 'Kalkulator' })] });
    mockedRequest.mockRejectedValue(new Error('invalid_parent'));

    await useDesktop.getState().moveItem(1, { x: 9, y: 9 }, 55);

    expect(useDesktop.getState().items[0]).toMatchObject({ x: 1, y: 1, parent_id: null });
    expect(useDesktop.getState().error).toBe('invalid_parent');
  });

  it('creates a folder in the first free cell', async () => {
    useDesktop.setState({ items: [item({ id: 1 }), item({ id: 2, x: 1, y: 0 })] });
    mockedRequest.mockImplementation(async () => item({ id: 3, kind: 'folder', name: 'Nowy folder', x: 2, y: 0 }));

    const created = await useDesktop.getState().createFolder();

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items', {
      method: 'POST',
      body: { kind: 'folder', name: 'Nowy folder', x: 2, y: 0 },
    });
    expect(created?.name).toBe('Nowy folder');
    expect(useDesktop.getState().items).toHaveLength(3);
  });

  it('keeps the new name after a rename', async () => {
    useDesktop.setState({ items: [item({ id: 1, name: 'Stara' })] });
    mockedRequest.mockResolvedValue(item({ id: 1, name: 'Nowa' }));

    await useDesktop.getState().rename(1, 'Nowa');

    expect(useDesktop.getState().items[0].name).toBe('Nowa');
  });

  it('drops a folder and its shortcuts optimistically', async () => {
    useDesktop.setState({
      items: [
        item({ id: 1, kind: 'folder', name: 'Biuro' }),
        item({ id: 2, parent_id: 1 }),
        item({ id: 3 }),
      ],
    });
    mockedRequest.mockResolvedValue(undefined);

    await useDesktop.getState().remove(1);

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/items/1', { method: 'DELETE' });
    expect(useDesktop.getState().items.map((entry) => entry.id)).toEqual([3]);
  });

  it('restores the whole subtree when the delete fails', async () => {
    const items = [
      item({ id: 1, kind: 'folder', name: 'Biuro' }),
      item({ id: 2, parent_id: 1 }),
      item({ id: 3 }),
    ];
    useDesktop.setState({ items });
    mockedRequest.mockRejectedValue(new Error('boom'));

    await useDesktop.getState().remove(1);

    expect(useDesktop.getState().items.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(useDesktop.getState().error).toBe('boom');
  });

  it('replaces a favourite slot and keeps the order the user dropped', async () => {
    mockedRequest.mockResolvedValue({ slot: 'dock', app_ids: ['stickies', 'notepad'] });

    await useDesktop.getState().setFavorites('dock', ['stickies', 'notepad']);

    expect(mockedRequest).toHaveBeenCalledWith('/desktop/favorites', {
      method: 'PUT',
      body: { slot: 'dock', app_ids: ['stickies', 'notepad'] },
    });
    expect(useDesktop.getState().favorites.dock).toEqual(['stickies', 'notepad']);
  });
});

describe('desktop selectors', () => {
  it('lists direct children of a container only', () => {
    const items = [
      item({ id: 1, kind: 'folder' }),
      item({ id: 2, parent_id: 1 }),
      item({ id: 3, parent_id: 2 }),
    ];
    expect(childrenOf(items, null).map((entry) => entry.id)).toEqual([1]);
    expect(childrenOf(items, 1).map((entry) => entry.id)).toEqual([2]);
  });

  it('collects a whole subtree for the optimistic delete', () => {
    const items = [
      item({ id: 1, kind: 'folder' }),
      item({ id: 2, parent_id: 1 }),
      item({ id: 3, parent_id: 2 }),
      item({ id: 4 }),
    ];
    expect([...collectSubtree(items, 1)]).toEqual([1, 2, 3]);
  });
});
