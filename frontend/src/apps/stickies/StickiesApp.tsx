import { useEffect, useState } from 'react';
import { STICKY_COLORS } from '@note/shared/manifest';
import { formatStamp } from '../../shared/format';
import { useStickies, type StickyColor } from './stickiesStore';
import type { Sticky } from '../../api/types';
import styles from './StickiesApp.module.css';

/**
 * Stickies board: create short notes and browse them.
 *
 * Browsing means search, sorting and pinning — all resolved by the backend, so
 * this file is only about rendering cards and forwarding intent.
 */
export function StickiesApp() {
  const state = useStickies();

  useEffect(() => {
    void state.load();
    // The board loads once per window; store changes must not trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [text, setText] = useState(sticky.body);

  useEffect(() => {
    setText(sticky.body);
  }, [sticky.body]);

  return (
    <article
      className={`${styles.card} ${styles[sticky.color]} ${sticky.pinned ? styles.pinned : ''}`}
      data-testid={`sticky-${sticky.id}`}
    >
      <textarea
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
        <button
          type="button"
          className={styles.pin}
          aria-pressed={sticky.pinned}
          onClick={() => void togglePinned(sticky.id)}
          data-testid={`pin-${sticky.id}`}
        >
          {sticky.pinned ? 'Przypięta' : 'Przypnij'}
        </button>
        <button
          type="button"
          className={styles.delete}
          aria-label={`Usuń karteczkę ${sticky.id}`}
          onClick={() => void remove(sticky.id)}
        >
          Usuń
        </button>
      </div>
      <span className={styles.stamp}>{formatStamp(sticky.updated_at)}</span>
    </article>
  );
}
