import { create } from 'zustand';
import { notesApi } from './notesApi';
import type { Note, NoteRevision, SortOrder } from '../../api/types';

/**
 * Notepad state.
 *
 * Three things are persisted by the backend and one is not:
 *  - notes and their revision history (notes / note_revisions),
 *  - the open tabs and the active one (notepad_tabs),
 *  - the text currently being typed — only here, until the autosave fires.
 *
 * Autosave is debounced with a module-level timer rather than in state, so a
 * keystroke never re-renders the note list.
 */

const AUTOSAVE_MS = 500;

interface NotepadStore {
  notes: Note[];
  total: number;
  query: string;
  sort: SortOrder;
  /** Cache of notes referenced by tabs, so a tab label survives a filtered list. */
  byId: Record<number, Note>;
  tabs: number[];
  activeNoteId: number | null;
  /** Text in the editor, which may be ahead of what is saved. */
  draft: string;
  dirty: boolean;
  saving: boolean;
  /** True when the note list was reloaded by search/sort (drives the empty state). */
  listLoaded: boolean;
  revisions: NoteRevision[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  init: (noteId?: number) => Promise<void>;
  refresh: () => Promise<void>;
  search: (query: string) => Promise<void>;
  setSort: (sort: SortOrder) => Promise<void>;
  newNote: () => Promise<void>;
  openNote: (id: number) => Promise<void>;
  closeTab: (id: number) => void;
  edit: (text: string) => void;
  save: () => Promise<void>;
  rename: (title: string) => Promise<void>;
  removeNote: (id: number) => Promise<void>;
  restoreRevision: (revisionId: number) => Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Everything the store holds besides the actions — also its reset point. */
export const notepadDefaults: Pick<
  NotepadStore,
  | 'notes'
  | 'total'
  | 'query'
  | 'sort'
  | 'byId'
  | 'tabs'
  | 'activeNoteId'
  | 'draft'
  | 'dirty'
  | 'saving'
  | 'listLoaded'
  | 'revisions'
  | 'status'
  | 'error'
> = {
  notes: [],
  total: 0,
  query: '',
  sort: 'updated_desc',
  byId: {},
  tabs: [],
  activeNoteId: null,
  draft: '',
  dirty: false,
  saving: false,
  listLoaded: false,
  revisions: [],
  status: 'idle',
  error: null,
};

export const useNotepad = create<NotepadStore>((set, get) => ({
  ...notepadDefaults,

  init: async (noteId) => {
    set({ status: 'loading', error: null });
    try {
      const [session, page] = await Promise.all([
        notesApi.session(),
        notesApi.list({ q: get().query, sort: get().sort }),
      ]);

      const wanted = noteId ?? session.active_note_id ?? session.tabs[0] ?? null;
      const tabs =
        wanted !== null && !session.tabs.includes(wanted)
          ? [...session.tabs, wanted]
          : session.tabs;

      set({
        notes: page.items,
        total: page.total,
        byId: index(page.items),
        tabs,
        listLoaded: true,
        status: 'ready',
      });

      if (wanted !== null) await get().openNote(wanted);
      if (tabs !== session.tabs) void persistSession(tabs, wanted);
    } catch (error) {
      set({ status: 'error', error: describe(error) });
    }
  },

  refresh: async () => {
    try {
      const page = await notesApi.list({ q: get().query, sort: get().sort });
      set({ notes: page.items, total: page.total, byId: { ...get().byId, ...index(page.items) } });
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  search: async (query) => {
    set({ query });
    await get().refresh();
  },

  setSort: async (sort) => {
    set({ sort });
    await get().refresh();
  },

  newNote: async () => {
    try {
      const note = await notesApi.create({ body: '' });
      const tabs = [...get().tabs, note.id];
      set({
        tabs,
        byId: { ...get().byId, [note.id]: note },
        activeNoteId: note.id,
        draft: note.body,
        dirty: false,
        revisions: [],
      });
      await persistSession(tabs, note.id);
      await get().refresh();
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  openNote: async (id) => {
    const cached = get().byId[id];
    const tabs = get().tabs.includes(id) ? get().tabs : [...get().tabs, id];
    set({ activeNoteId: id, tabs, draft: cached?.body ?? '', dirty: false, revisions: [] });
    void persistSession(tabs, id);

    try {
      const note = await notesApi.get(id);
      set({ byId: { ...get().byId, [id]: note }, draft: get().dirty ? get().draft : note.body });
      await loadRevisionsInto(set, id);
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  closeTab: (id) => {
    const tabs = get().tabs.filter((tab) => tab !== id);
    let activeNoteId = get().activeNoteId;

    if (activeNoteId === id) {
      activeNoteId = tabs[tabs.length - 1] ?? null;
      const next = activeNoteId !== null ? get().byId[activeNoteId] : null;
      set({ tabs, activeNoteId, draft: next?.body ?? '', dirty: false, revisions: [] });
      void persistSession(tabs, activeNoteId);
      if (activeNoteId !== null) void get().openNote(activeNoteId);
      return;
    }

    set({ tabs });
    void persistSession(tabs, activeNoteId);
  },

  edit: (text) => {
    set({ draft: text, dirty: true });
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void get().save(), AUTOSAVE_MS);
  },

  save: async () => {
    const { activeNoteId, draft, dirty } = get();
    if (activeNoteId === null || !dirty || get().saving) return;

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    set({ saving: true });
    try {
      const updated = await notesApi.update(activeNoteId, { body: draft });
      set({
        byId: { ...get().byId, [updated.id]: updated },
        notes: get().notes.map((note) => (note.id === updated.id ? updated : note)),
        // Only this exact text is saved: if the draft moved on while the request
        // was in flight, it stays dirty and is saved by the follow-up call below.
        dirty: get().draft !== draft,
        saving: false,
      });
      if (get().dirty) void get().save();
    } catch (error) {
      set({ saving: false, error: describe(error) });
    }
  },

  rename: async (title) => {
    const id = get().activeNoteId;
    if (id === null) return;
    try {
      const updated = await notesApi.update(id, { title });
      set({ byId: { ...get().byId, [id]: updated } });
      await get().refresh();
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  removeNote: async (id) => {
    try {
      await notesApi.remove(id);
      const tabs = get().tabs.filter((tab) => tab !== id);
      const byId = { ...get().byId };
      delete byId[id];
      const activeNoteId = get().activeNoteId === id ? (tabs[tabs.length - 1] ?? null) : get().activeNoteId;

      set({
        tabs,
        byId,
        activeNoteId,
        draft: activeNoteId !== null ? (byId[activeNoteId]?.body ?? '') : '',
        dirty: false,
        revisions: [],
        notes: get().notes.filter((note) => note.id !== id),
        total: Math.max(0, get().total - 1),
      });
      await persistSession(tabs, activeNoteId);
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  restoreRevision: async (revisionId) => {
    const id = get().activeNoteId;
    if (id === null) return;
    try {
      const restored = await notesApi.restore(id, revisionId);
      set({
        byId: { ...get().byId, [id]: restored },
        draft: restored.body,
        dirty: false,
        notes: get().notes.map((note) => (note.id === id ? restored : note)),
      });
      await loadRevisionsInto(set, id);
    } catch (error) {
      set({ error: describe(error) });
    }
  },
}));

/** Drop any pending autosave; used by tests and by unmounting the app. */
export function cancelAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function index(notes: Note[]): Record<number, Note> {
  return Object.fromEntries(notes.map((note) => [note.id, note]));
}

async function persistSession(tabs: number[], activeNoteId: number | null) {
  try {
    await notesApi.saveSession({ tabs, active_note_id: activeNoteId });
  } catch {
    // A failed session write must not interrupt typing; the tabs come back on the
    // next successful save.
  }
}

async function loadRevisionsInto(
  set: (partial: Partial<NotepadStore>) => void,
  noteId: number,
) {
  try {
    set({ revisions: await notesApi.revisions(noteId) });
  } catch (error) {
    set({ revisions: [], error: describe(error) });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'nieznany błąd';
}
