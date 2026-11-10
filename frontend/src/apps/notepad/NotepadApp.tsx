import { useEffect, useRef, useState } from 'react';
import { formatStamp, preview } from '../../shared/format';
import { RowMenu } from '../../shared/RowMenu';
import { usePhone } from '../../shell/viewport';
import { cancelAutosave, useNotepad } from './notepadStore';
import type { AppProps } from '../../shell/registry';
import styles from './NotepadApp.module.css';

/**
 * Notepad: list + tabs + editor.
 *
 * The component reads from the store and forwards clicks; all decisions (what is
 * dirty, when to save, what a deleted tab means) live in notepadStore, which is
 * unit-tested without rendering.
 *
 * On a phone the two halves cannot share the screen — the list and the note take
 * it in turns, because an editor squeezed under a list is not an editor.
 */
export function NotepadApp({ payload }: AppProps) {
  const state = useNotepad();
  const narrow = usePhone();
  const [backToList, setBackToList] = useState(false);
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

  // A note that stopped existing puts the list back on screen on its own.
  useEffect(() => {
    if (state.activeNoteId === null) setBackToList(false);
  }, [state.activeNoteId]);

  const showingList = narrow && (backToList || active === null);

  const openFromList = (id: number) => {
    setBackToList(false);
    void state.openNote(id);
  };

  const createNote = () => {
    setBackToList(false);
    void state.newNote();
  };

  const list = (
    <aside className={showingList ? styles.sidebar : `${styles.sidebar} ${styles.hidden}`}>
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
        <button type="button" className={styles.new} onClick={createNote}>
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
              onClick={() => openFromList(note.id)}
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
  );

  return (
    <div
      className={styles.app}
      data-testid="notepad"
      data-showing={showingList ? 'list' : 'note'}
    >
      {list}

      <main className={showingList ? `${styles.main} ${styles.hidden}` : styles.main}>
        {!narrow && (
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
        )}

        {active ? (
          <>
            {narrow ? (
              <div className={styles.noteHead}>
                <button
                  type="button"
                  className={styles.back}
                  onClick={() => setBackToList(true)}
                  data-testid="note-back"
                >
                  ‹ Notatki
                </button>
                <TitleField title={active.title} onCommit={(title) => void state.rename(title)} />
                <RowMenu
                  label={`Czynności notatki ${active.title}`}
                  items={[
                    { label: 'Usuń notatkę', onSelect: () => void state.removeNote(active.id), danger: true },
                  ]}
                />
              </div>
            ) : (
              <TitleField title={active.title} onCommit={(title) => void state.rename(title)} />
            )}

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
              {/* On a phone the three dots live next to the title, out of the keyboard's way. */}
              {!narrow && (
                <RowMenu
                  label={`Czynności notatki ${active.title}`}
                  items={[
                    { label: 'Usuń notatkę', onSelect: () => void state.removeNote(active.id), danger: true },
                  ]}
                />
              )}
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
