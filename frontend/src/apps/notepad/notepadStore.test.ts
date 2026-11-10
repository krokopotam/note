import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notesApi } from './notesApi';
import { cancelAutosave, notepadDefaults, useNotepad } from './notepadStore';
import type { Note } from '../../api/types';

vi.mock('./notesApi', () => ({
  notesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    session: vi.fn(),
    saveSession: vi.fn(),
  },
}));

const api = vi.mocked(notesApi);

const note = (id: number, overrides: Partial<Note> = {}): Note => ({
  id,
  title: `Notatka ${id}`,
  body: `treść ${id}`,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

function stubEmptyApi() {
  api.list.mockResolvedValue({ items: [], total: 0 });
  api.session.mockResolvedValue({ tabs: [], active_note_id: null });
  api.saveSession.mockResolvedValue({ tabs: [], active_note_id: null });
}

beforeEach(() => {
  cancelAutosave();
  useNotepad.setState(notepadDefaults);
  vi.resetAllMocks();
  stubEmptyApi();
});

afterEach(() => {
  // A debounce timer outliving its test would fire requests into the next one.
  cancelAutosave();
  vi.useRealTimers();
});

describe('opening the notepad', () => {
  it('restores saved tabs and the active note', async () => {
    api.list.mockResolvedValue({ items: [note(1), note(2)], total: 2 });
    api.session.mockResolvedValue({ tabs: [1, 2], active_note_id: 2 });
    api.get.mockResolvedValue(note(2));

    await useNotepad.getState().init();

    const state = useNotepad.getState();
    expect(state.tabs).toEqual([1, 2]);
    expect(state.activeNoteId).toBe(2);
    expect(state.draft).toBe('treść 2');
    expect(api.get).toHaveBeenCalledWith(2);
  });

  it('opens a note requested from outside (desktop "Nowa notatka")', async () => {
    const created = note(7, { title: 'Bez tytułu', body: '' });
    api.get.mockResolvedValue(created);

    await useNotepad.getState().init(7);

    expect(useNotepad.getState().tabs).toContain(7);
    expect(useNotepad.getState().activeNoteId).toBe(7);
  });

  it('surfaces a failed load instead of showing a blank editor', async () => {
    api.session.mockRejectedValue(new Error('500'));

    await useNotepad.getState().init();

    expect(useNotepad.getState().status).toBe('error');
    expect(useNotepad.getState().error).toBe('500');
  });
});

describe('autosave', () => {
  it('saves the draft shortly after typing', async () => {
    vi.useFakeTimers();
    api.update.mockResolvedValue(note(1, { body: 'nowa treść' }));
    useNotepad.setState({ tabs: [1], activeNoteId: 1, byId: { 1: note(1) } });

    useNotepad.getState().edit('nowa treść');
    expect(api.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(api.update).toHaveBeenCalledWith(1, { body: 'nowa treść' });
    expect(useNotepad.getState()).toMatchObject({ dirty: false, saving: false });
    expect(useNotepad.getState().byId[1].body).toBe('nowa treść');
    vi.useRealTimers();
  });

  it('coalesces rapid keystrokes into one request', async () => {
    vi.useFakeTimers();
    api.update.mockResolvedValue(note(1));
    useNotepad.setState({ tabs: [1], activeNoteId: 1, byId: { 1: note(1) } });

    useNotepad.getState().edit('a');
    await vi.advanceTimersByTimeAsync(200);
    useNotepad.getState().edit('ab');
    await vi.advanceTimersByTimeAsync(500);

    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(1, { body: 'ab' });
    vi.useRealTimers();
  });

  it('saves again when text changed while a request was in flight', async () => {
    api.update.mockResolvedValue(note(1, { body: 'druga' }));
    useNotepad.setState({ tabs: [1], activeNoteId: 1, byId: { 1: note(1) } });

    useNotepad.getState().edit('pierwsza');
    const first = useNotepad.getState().save();
    useNotepad.getState().edit('druga');
    await first;

    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.update).toHaveBeenLastCalledWith(1, { body: 'druga' });
  });

  it('does not write when nothing changed', async () => {
    useNotepad.setState({ tabs: [1], activeNoteId: 1, draft: 'x', dirty: false });

    await useNotepad.getState().save();

    expect(api.update).not.toHaveBeenCalled();
  });

  it('keeps unsaved text when the server refuses the save', async () => {
    useNotepad.setState({ tabs: [1], activeNoteId: 1, byId: { 1: note(1) } });
    api.update.mockRejectedValue(new Error('offline'));

    useNotepad.getState().edit('ocalona');
    await useNotepad.getState().save();

    const state = useNotepad.getState();
    expect(state.draft).toBe('ocalona');
    expect(state.dirty).toBe(true);
    expect(state.error).toBe('offline');
  });
});

describe('tabs', () => {
  it('opening a note adds a tab and persists the session', async () => {
    api.get.mockResolvedValue(note(3));

    await useNotepad.getState().openNote(3);

    expect(useNotepad.getState().tabs).toEqual([3]);
    expect(api.saveSession).toHaveBeenCalledWith({ tabs: [3], active_note_id: 3 });
  });

  it('closing the active tab activates the remaining one', async () => {
    api.get.mockResolvedValue(note(1));
    useNotepad.setState({ tabs: [1, 2], activeNoteId: 2, byId: { 1: note(1), 2: note(2) } });

    useNotepad.getState().closeTab(2);

    expect(useNotepad.getState().activeNoteId).toBe(1);
    expect(useNotepad.getState().tabs).toEqual([1]);
  });

  it('closing a background tab leaves the active one alone', () => {
    useNotepad.setState({ tabs: [1, 2], activeNoteId: 2, byId: { 1: note(1), 2: note(2) } });

    useNotepad.getState().closeTab(1);

    expect(useNotepad.getState()).toMatchObject({ tabs: [2], activeNoteId: 2 });
  });

  it('closing the last tab leaves no active note', () => {
    useNotepad.setState({ tabs: [1], activeNoteId: 1, byId: { 1: note(1) }, draft: 'treść' });

    useNotepad.getState().closeTab(1);

    expect(useNotepad.getState()).toMatchObject({ tabs: [], activeNoteId: null, draft: '' });
  });
});

describe('list, search and sort', () => {
  it('passes the keywords to the API rather than filtering locally', async () => {
    await useNotepad.getState().search('paragon marzec');

    expect(api.list).toHaveBeenCalledWith({ q: 'paragon marzec', sort: 'updated_desc' });
    expect(useNotepad.getState().query).toBe('paragon marzec');
  });

  it('passes the sort order to the API', async () => {
    await useNotepad.getState().setSort('created_asc');

    expect(api.list).toHaveBeenCalledWith({ q: '', sort: 'created_asc' });
  });

  it('keeps a tab label after the list is filtered out from under it', async () => {
    api.list.mockImplementation(async ({ q } = {}) =>
      q ? { items: [], total: 0 } : { items: [note(1)], total: 1 },
    );
    api.session.mockResolvedValue({ tabs: [1], active_note_id: 1 });
    api.get.mockResolvedValue(note(1));

    await useNotepad.getState().init();
    await useNotepad.getState().search('nic nie pasuje');

    const state = useNotepad.getState();
    expect(state.notes).toEqual([]);
    expect(state.byId[1].title).toBe('Notatka 1');
  });
});

describe('creating, renaming and deleting', () => {
  it('creates a note, opens its tab and refreshes the list', async () => {
    api.create.mockResolvedValue(note(9, { title: 'Bez tytułu', body: '' }));

    await useNotepad.getState().newNote();

    const state = useNotepad.getState();
    expect(state.activeNoteId).toBe(9);
    expect(state.tabs).toEqual([9]);
    expect(api.saveSession).toHaveBeenCalledWith({ tabs: [9], active_note_id: 9 });
    expect(api.list).toHaveBeenCalled();
  });

  it('renames through the API and updates the cached note', async () => {
    useNotepad.setState({ activeNoteId: 1, byId: { 1: note(1) } });
    api.update.mockResolvedValue(note(1, { title: 'Nowy tytuł' }));

    await useNotepad.getState().rename('Nowy tytuł');

    expect(api.update).toHaveBeenCalledWith(1, { title: 'Nowy tytuł' });
    expect(useNotepad.getState().byId[1].title).toBe('Nowy tytuł');
  });

  it('removes the note from list, tabs and session', async () => {
    useNotepad.setState({
      notes: [note(1), note(2)],
      total: 2,
      tabs: [1, 2],
      activeNoteId: 1,
      byId: { 1: note(1), 2: note(2) },
    });

    await useNotepad.getState().removeNote(1);

    const state = useNotepad.getState();
    expect(state.notes.map((entry) => entry.id)).toEqual([2]);
    expect(state.tabs).toEqual([2]);
    expect(state.activeNoteId).toBe(2);
    expect(state.byId[1]).toBeUndefined();
    expect(api.saveSession).toHaveBeenCalledWith({ tabs: [2], active_note_id: 2 });
  });

  it('an unopened note list is empty, and the app has no history to load', async () => {
    stubEmptyApi();

    await useNotepad.getState().init();

    expect(api.list).toHaveBeenCalled();
    expect(api.session).toHaveBeenCalled();
    expect(useNotepad.getState().notes).toEqual([]);
    expect(Object.keys(useNotepad.getState())).not.toContain('revisions');
  });
});
