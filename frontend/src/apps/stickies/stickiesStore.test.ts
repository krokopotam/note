import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stickiesApi } from './stickiesApi';
import { stickiesDefaults, useStickies } from './stickiesStore';
import type { Sticky } from '../../api/types';

vi.mock('./stickiesApi', () => ({
  stickiesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const api = vi.mocked(stickiesApi);

const sticky = (id: number, overrides: Partial<Sticky> = {}): Sticky => ({
  id,
  body: `karteczka ${id}`,
  color: 'yellow',
  pinned: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  useStickies.setState(stickiesDefaults);
  vi.resetAllMocks();
  api.list.mockResolvedValue({ items: [], total: 0 });
});

describe('loading the board', () => {
  it('sends keywords, sort and the pinned filter to the API', async () => {
    useStickies.setState({ query: 'baterie', sort: 'created_asc', onlyPinned: true });

    await useStickies.getState().load();

    expect(api.list).toHaveBeenCalledWith({ q: 'baterie', sort: 'created_asc', pinned: true });
    expect(useStickies.getState().status).toBe('ready');
  });

  it('keeps previously loaded cards but flags the error when the API is down', async () => {
    api.list.mockResolvedValue({ items: [sticky(1)], total: 1 });
    await useStickies.getState().load();

    api.list.mockRejectedValue(new Error('503'));
    await useStickies.getState().load();

    expect(useStickies.getState()).toMatchObject({ status: 'error', error: '503' });
    expect(useStickies.getState().stickies).toHaveLength(1);
  });
});

describe('board actions', () => {
  it('adds a new card at the front of the board', async () => {
    useStickies.setState({ stickies: [sticky(1)], total: 1 });
    api.create.mockResolvedValue(sticky(2, { body: 'nowa' }));

    await useStickies.getState().create('nowa');

    expect(api.create).toHaveBeenCalledWith({ body: 'nowa' });
    expect(useStickies.getState().stickies.map((entry) => entry.id)).toEqual([2, 1]);
    expect(useStickies.getState().total).toBe(2);
  });

  it('saves text only when it actually changed', async () => {
    useStickies.setState({ stickies: [sticky(1, { body: 'bez zmian' })] });

    await useStickies.getState().commitText(1, 'bez zmian');
    expect(api.update).not.toHaveBeenCalled();

    await useStickies.getState().commitText(1, 'poprawione');
    expect(api.update).toHaveBeenCalledWith(1, { body: 'poprawione' });
  });

  it('changes the colour of a card', async () => {
    useStickies.setState({ stickies: [sticky(1)] });
    api.update.mockResolvedValue(sticky(1, { color: 'pink' }));

    await useStickies.getState().setColor(1, 'pink');

    expect(api.update).toHaveBeenCalledWith(1, { color: 'pink' });
    expect(useStickies.getState().stickies[0].color).toBe('pink');
  });

  it('toggles the pin and re-reads the board because pinned cards sort first', async () => {
    useStickies.setState({ stickies: [sticky(1)] });
    api.update.mockResolvedValue(sticky(1, { pinned: true }));

    await useStickies.getState().togglePinned(1);

    expect(api.update).toHaveBeenCalledWith(1, { pinned: true });
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('removes a card and restores it if the delete fails', async () => {
    useStickies.setState({ stickies: [sticky(1), sticky(2)], total: 2 });

    api.remove.mockResolvedValue(undefined);
    await useStickies.getState().remove(1);
    expect(useStickies.getState().stickies.map((entry) => entry.id)).toEqual([2]);

    api.remove.mockRejectedValue(new Error('boom'));
    await useStickies.getState().remove(2);
    expect(useStickies.getState().stickies.map((entry) => entry.id)).toEqual([2]);
    expect(useStickies.getState().error).toBe('boom');
  });

  it('searching reloads the board with the new keywords', async () => {
    await useStickies.getState().search('mleko');

    expect(api.list).toHaveBeenCalledWith({ q: 'mleko', sort: 'updated_desc', pinned: false });
  });
});
