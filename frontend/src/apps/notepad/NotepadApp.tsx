import { useEffect, useRef, useState } from 'react';
import { formatStamp, preview } from '../../shared/format';
import { RowMenu } from '../../shared/RowMenu';
import { cancelAutosave, useNotepad } from './notepadStore';
import type { AppProps } from '../../shell/registry';
import styles from './NotepadApp.module.css';

/**
 * Notepad: list + tabs + editor.
 *
 * The component reads from the store and forwards clicks; all decisions (what is
 * dirty, when to save, what a deleted tab means) live in notepadStore, which is
 * unit-tested without rendering.
 */
export function NotepadApp({ payload }: AppProps) {
  const state = useNotepad();
  const requestedNoteId = typeof payload.noteId === 'number' ? payload.noteId : undefined;
  const seenNoteId = useRef(requestedNoteId);

  useEffect(() => {
    void useNotepad.getState().init(requestedNoteId);
    return cancelAutosave;
    // Start-up only: re-running init on every store change would reload over the user's tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Nowa notatka" on the desktop reuses this window and only changes the payload.
  useEffect(() => {
    if (requestedNoteId === undefined || requestedNoteId === seenNoteId.current) return;
    seenNoteId.current = requestedNoteId;
    void useNotepad.getState().openNote(requestedNoteId);
  }, [requestedNoteId]);

  const active = state.activeNoteId !== null ? (state.byId[state.activeNoteId] ?? null) : null;

  return (
    <div className={styles.app} data-testid="notepad">
      <aside className={styles.sidebar}>
        <div className={styles.tools}>
          <input
            className={styles.search}
            type="search"
            placeholder="Szukaj słów kluczowych…"
            aria-label="Szukaj w notatkach"
            value={state.query}
            onChange={(event) => void state.search(event.target.value)}
          />
          <select
            className={styles.sort}
            aria-label="Sortuj"
            value={state.sort}
            onChange={(event) => void state.setSort(event.target.value as typeof state.sort)}
          >
            <option value="updated_desc">Najnowsze zmiany</option>
            <option value="updated_asc">Najstarsze zmiany</option>
            <option value="created_desc">Najnowsze</option>
            <option value="created_asc">Najstarsze</option>
            <option value="title_asc">Tytuł A–Z</option>
            <option value="title_desc">Tytuł Z–A</option>
          </select>
          <button type="button" className={styles.new} onClick={() => void state.newNote()}>
            Nowa notatka
          </button>
        </div>

        <ul className={styles.list}>
          {state.notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                className={
                  note.id === state.activeNoteId ? `${styles.row} ${styles.rowActive}` : styles.row
                }
                onClick={() => void state.openNote(note.id)}
                data-testid={`note-row-${note.id}`}
              >
                <span className={styles.rowTitle}>{note.title}</span>
                <span className={styles.rowPreview}>{preview(note.body)}</span>
                <span className={styles.rowStamp}>{formatStamp(note.updated_at)}</span>
              </button>
            </li>
          ))}
          {state.listLoaded && state.notes.length === 0 && (
            <li className={styles.empty}>Brak notatek dla tych kryteriów.</li>
          )}
        </ul>
        <span className={styles.count}>
          {state.total} {state.total === 1 ? 'notatka' : 'notatek'}
        </span>
      </aside>

      <main className={styles.main}>
        <div className={styles.tabs} role="tablist" aria-label="Otwarte notatki">
          {state.tabs.map((id) => {
            const note = state.byId[id];
            return (
              <span key={id} className={styles.tab}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={id === state.activeNoteId}
                  className={id === state.activeNoteId ? `${styles.tabButton} ${styles.tabActive}` : styles.tabButton}
                  onClick={() => void state.openNote(id)}
                  data-testid={`tab-${id}`}
                >
                  {note?.title ?? '…'}
                </button>
                <button
                  type="button"
                  className={styles.tabClose}
                  aria-label={`Zamknij zakładkę ${note?.title ?? id}`}
                  onClick={() => state.closeTab(id)}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>

        {active ? (
          <>
            <TitleField title={active.title} onCommit={(title) => void state.rename(title)} />
            <textarea
              className={styles.editor}
              value={state.draft}
              aria-label="Treść notatki"
              placeholder="Pisz…"
              onChange={(event) => state.edit(event.target.value)}
              data-testid="editor"
            />
            <footer className={styles.footer} data-testid="note-footer">
              <span className={styles.status} data-testid="save-status">
                {state.saving ? 'Zapisywanie…' : state.dirty ? 'Zmiany do zapisania' : 'Zapisano'}
              </span>
              <RowMenu
                label={`Czynności notatki ${active.title}`}
                items={[
                  { label: 'Usuń notatkę', onSelect: () => void state.removeNote(active.id), danger: true },
                ]}
              />
            </footer>
          </>
        ) : (
          <p className={styles.placeholder}>Wybierz notatkę z listy albo utwórz nową.</p>
        )}
      </main>

    </div>
  );
}

/**
 * Title input kept local: committing on blur/Enter instead of on every keystroke
 * avoids one PATCH request per character (and one history entry per character).
 */
function TitleField({ title, onCommit }: { title: string; onCommit: (title: string) => void }) {
  const [value, setValue] = useState(title);

  useEffect(() => {
    setValue(title);
  }, [title]);

  return (
    <input
      className={styles.title}
      value={value}
      aria-label="Tytuł notatki"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== title) onCommit(trimmed);
        else setValue(title);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}
