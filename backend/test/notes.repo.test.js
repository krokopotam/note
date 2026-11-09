import { describe, expect, it } from 'vitest';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  listRevisions,
  restoreRevision,
  updateNote,
} from '../src/repos/notes.js';
import { makeDb, T } from './helpers.js';

describe('notes repository', () => {
  it('creates a note and reads it back', () => {
    const db = makeDb();
    const note = createNote(db, { title: 'Zakupy', body: 'mleko, chleb', now: T.t1 });

    expect(note.id).toBeGreaterThan(0);
    expect(getNote(db, note.id)).toMatchObject({
      title: 'Zakupy',
      body: 'mleko, chleb',
      created_at: T.t1,
      updated_at: T.t1,
    });
  });

  it('derives the title from the first body line when none is given', () => {
    const db = makeDb();
    const note = createNote(db, { body: '\n  List do urzędu\nreszta', now: T.t1 });
    expect(note.title).toBe('List do urzędu');
  });

  it('falls back to "Bez tytułu" for an empty body', () => {
    const db = makeDb();
    expect(createNote(db, { body: '   \n  ', now: T.t1 }).title).toBe('Bez tytułu');
  });

  it('truncates a derived title to the schema limit', () => {
    const db = makeDb();
    const note = createNote(db, { body: 'x'.repeat(400), now: T.t1 });
    expect(note.title).toHaveLength(200);
    expect(note.title.endsWith('…')).toBe(true);
  });

  it('snapshots the replaced version on every effective change', () => {
    const db = makeDb();
    const note = createNote(db, { title: 'v1', body: 'pierwsza treść', now: T.t1 });
    updateNote(db, note.id, { body: 'druga treść', now: T.t2 });

    const revisions = listRevisions(db, note.id);
    expect(revisions).toHaveLength(1);
    // The revision holds what the note used to contain, stamped with the old update time.
    expect(revisions[0]).toMatchObject({ title: 'v1', body: 'pierwsza treść', created_at: T.t1 });
    expect(getNote(db, note.id)).toMatchObject({ body: 'druga treść', updated_at: T.t2 });
  });

  it('does not write a revision when an autosave changes nothing', () => {
    const db = makeDb();
    const note = createNote(db, { title: 'Bez zmian', body: 'a', now: T.t1 });
    const after = updateNote(db, note.id, { title: 'Bez zmian', body: 'a', now: T.t3 });

    expect(listRevisions(db, note.id)).toEqual([]);
    expect(after.updated_at).toBe(T.t1);
  });

  it('restores a revision and keeps the version it replaced', () => {
    const db = makeDb();
    const note = createNote(db, { title: 'v1', body: 'stara', now: T.t1 });
    updateNote(db, note.id, { body: 'nowa', now: T.t2 });
    const revisionId = listRevisions(db, note.id)[0].id;

    const restored = restoreRevision(db, note.id, revisionId, T.t4);

    expect(restored.body).toBe('stara');
    // Undo of the restore is possible: the "nowa" state was snapshotted too.
    expect(listRevisions(db, note.id).map((r) => r.body)).toEqual(['nowa', 'stara']);
  });

  it('searches keywords across title and body, case-insensitively', () => {
    const db = makeDb();
    createNote(db, { title: 'Awans', body: 'rozmowa z kierownikiem', now: T.t1 });
    createNote(db, { title: 'Lista', body: 'mleko i chleb', now: T.t2 });
    createNote(db, { title: 'Przemyślenia', body: 'kierownik jest OK', now: T.t3 });

    expect(listNotes(db, { q: 'KIEROWNIK' }).items.map((n) => n.title)).toEqual([
      'Przemyślenia',
      'Awans',
    ]);
    expect(listNotes(db, { q: 'kierownik mleko' }).items).toEqual([]);
    expect(listNotes(db, { q: 'mleko chleb' }).items.map((n) => n.title)).toEqual(['Lista']);
  });

  it('treats a percent sign as a literal character', () => {
    const db = makeDb();
    createNote(db, { title: 'Promocja', body: 'rabat 100% dziś', now: T.t1 });
    createNote(db, { title: 'Inna', body: 'rabat 10 dziś', now: T.t2 });

    expect(listNotes(db, { q: '100%' }).items.map((n) => n.title)).toEqual(['Promocja']);
  });

  it('sorts by updated, created and title', () => {
    const db = makeDb();
    const a = createNote(db, { title: 'BBB', body: '1', now: T.t1 });
    const b = createNote(db, { title: 'aaa', body: '2', now: T.t3 });
    const c = createNote(db, { title: 'CCC', body: '3', now: T.t2 });
    // Touching A makes it the most recently updated without changing created_at.
    updateNote(db, a.id, { body: '1 zmienione', now: T.t4 });

    expect(listNotes(db, { sort: 'updated_desc' }).items.map((n) => n.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
    expect(listNotes(db, { sort: 'created_asc' }).items.map((n) => n.id)).toEqual([
      a.id,
      c.id,
      b.id,
    ]);
    expect(listNotes(db, { sort: 'title_asc' }).items.map((n) => n.title)).toEqual([
      'aaa',
      'BBB',
      'CCC',
    ]);
  });

  it('paginates and reports the unfiltered-by-limit total', () => {
    const db = makeDb();
    for (let i = 0; i < 5; i += 1) createNote(db, { title: `N${i}`, now: T.t1 });

    const page = listNotes(db, { limit: 2, offset: 3 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('keeps search and pagination together', () => {
    const db = makeDb();
    createNote(db, { title: 'temperatura', now: T.t1 });
    createNote(db, { title: 'temperatura dnia', now: T.t2 });
    createNote(db, { title: 'inne', now: T.t3 });

    const found = listNotes(db, { q: 'temperatura', limit: 1, offset: 0 });
    expect(found.total).toBe(2);
    expect(found.items).toHaveLength(1);
  });

  it('cascades revisions and tabs when a note is deleted', () => {
    const db = makeDb();
    const note = createNote(db, { title: 'Do usunięcia', body: 'x', now: T.t1 });
    updateNote(db, note.id, { body: 'y', now: T.t2 });
    db.prepare('INSERT INTO notepad_tabs (note_id, position) VALUES (?, ?)').run(note.id, 0);

    expect(deleteNote(db, note.id)).toBe(true);

    expect(getNote(db, note.id)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_revisions').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM notepad_tabs').get().n).toBe(0);
    expect(deleteNote(db, note.id)).toBe(false);
  });

  it('returns null when updating an unknown note', () => {
    const db = makeDb();
    expect(updateNote(db, 999, { body: 'x' })).toBeNull();
    expect(listRevisions(db, 999)).toBeNull();
  });
});
