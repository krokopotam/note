import { useEffect, useRef, useState } from 'react';
import { STICKY_COLORS } from '@note/shared/manifest';
import { formatStamp } from '../../shared/format';
import { RowMenu } from '../../shared/RowMenu';
import { useStickies, type StickyColor } from './stickiesStore';
import type { Sticky } from '../../api/types';
import type { AppProps } from '../../shell/registry';
import styles from './StickiesApp.module.css';

/**
 * Stickies board: create short notes and browse them.
 *
 * Browsing means search, sorting and pinning — all resolved by the backend, so
 * this file is only about rendering cards and forwarding intent.
 */
export function StickiesApp({ payload }: AppProps) {
  const state = useStickies();
  const requestedId = typeof payload.stickyId === 'number' ? payload.stickyId : undefined;
  const seenId = useRef(requestedId);

  useEffect(() => {
    void useStickies.getState().load();
    // The board loads once per window; store changes must not trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A card created from the desktop menu arrives through a changed payload while
  // this window may already be open: re-read the board so it shows up.
  useEffect(() => {
    if (requestedId === undefined || requestedId === seenId.current) return;
    seenId.current = requestedId;
    void useStickies.getState().load();
  }, [requestedId]);

  return (
    <div className={styles.app} data-testid="stickies">
      <header className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Szukaj na karteczkach…"
          aria-label="Szukaj na karteczkach"
          value={state.query}
          onChange={(event) => void state.search(event.target.value)}
        />
        <select
          className={styles.sort}
          aria-label="Sortuj karteczki"
          value={state.sort}
          onChange={(event) => void state.setSort(event.target.value as typeof state.sort)}
        >
          <option value="updated_desc">Ostatnio zmienione</option>
          <option value="updated_asc">Najstarsze zmiany</option>
          <option value="created_desc">Najnowsze</option>
          <option value="created_asc">Najstarsze</option>
        </select>
        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={state.onlyPinned}
            onChange={(event) => void state.setOnlyPinned(event.target.checked)}
          />
          Tylko przypięte
        </label>
        <button type="button" className={styles.create} onClick={() => void state.create()}>
          Nowa karteczka
        </button>
      </header>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.board} data-testid="sticky-board">
        {state.stickies.map((sticky) => (
          <Card key={sticky.id} sticky={sticky} />
        ))}
        {state.status === 'ready' && state.stickies.length === 0 && (
          <p className={styles.empty}>Brak karteczek. Zapisz pierwszą myśl.</p>
        )}
      </div>

      <footer className={styles.footer}>
        {state.total} {state.total === 1 ? 'karteczka' : 'karteczek'}
      </footer>
    </div>
  );
}

function Card({ sticky }: { sticky: Sticky }) {
  const commitText = useStickies((state) => state.commitText);
  const setColor = useStickies((state) => state.setColor);
  const togglePinned = useStickies((state) => state.togglePinned);
  const remove = useStickies((state) => state.remove);
  const isPending = useStickies((state) => state.pendingEmptyId === sticky.id);
  // Bumped when "Nowa karteczka" is clicked while this card is still waiting.
  const focusNonce = useStickies((state) => (state.pendingEmptyId === sticky.id ? state.pendingNonce : 0));
  const [text, setText] = useState(sticky.body);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(sticky.body);
  }, [sticky.body]);

  // A card created from the toolbar is ready for typing straight away.
  useEffect(() => {
    if (isPending) field.current?.focus();
  }, [isPending, focusNonce]);

  return (
    <article
      className={`${styles.card} ${styles[sticky.color]} ${sticky.pinned ? styles.pinned : ''}`}
      data-testid={`sticky-${sticky.id}`}
    >
      <textarea
        ref={field}
        className={styles.cardText}
        value={text}
        aria-label={`Treść karteczki ${sticky.id}`}
        placeholder="Myśl…"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => void commitText(sticky.id, text)}
      />
      <div className={styles.cardBar}>
        <span className={styles.swatches}>
          {STICKY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={color === sticky.color ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch}
              aria-label={`Kolor ${color}`}
              data-color={color}
              onClick={() => void setColor(sticky.id, color as StickyColor)}
            />
          ))}
        </span>
        <RowMenu
          label={`Czynności karteczki ${sticky.id}`}
          items={[
            {
              label: sticky.pinned ? 'Odepnij' : 'Przypnij',
              onSelect: () => void togglePinned(sticky.id),
            },
            { label: 'Usuń', onSelect: () => void remove(sticky.id), danger: true },
          ]}
        />
      </div>
      <span className={styles.stamp}>{formatStamp(sticky.updated_at)}</span>
      {sticky.pinned && <span className={styles.pinnedTag}>przypięta</span>}
    </article>
  );
}
