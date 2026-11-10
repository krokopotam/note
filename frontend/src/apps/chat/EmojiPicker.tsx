import { useEffect, useState } from 'react';
import { EMOJI_GROUPS } from './emoji';
import styles from './EmojiPicker.module.css';

/**
 * The emoji panel: a category row, a grid, and nothing else.
 *
 * It does not close after a pick — people send more than one — but Escape and the
 * button do, and the caller keeps the caret where it was.
 */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id);
  const group = EMOJI_GROUPS.find((entry) => entry.id === groupId) ?? EMOJI_GROUPS[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.picker} role="dialog" aria-label="Wybierz emotikonkę" data-testid="emoji-picker">
      <div className={styles.tabs}>
        {EMOJI_GROUPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === groupId ? styles.tabOn : styles.tab}
            aria-pressed={entry.id === groupId}
            onClick={() => setGroupId(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {group.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={styles.cell}
            aria-label={`Wstaw ${emoji}`}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      <button type="button" className={styles.close} onClick={onClose}>
        Zamknij
      </button>
    </div>
  );
}
