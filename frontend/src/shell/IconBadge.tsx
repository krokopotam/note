import styles from './Badge.module.css';

/**
 * The little number in the corner of an icon.
 *
 * It is decoration: the button around it carries the count in its own label, so a
 * screen reader hears "Czaty, 3 nieprzeczytane" rather than a floating digit.
 */
export function IconBadge({ count, testId }: { count: number; testId: string }) {
  if (count <= 0) return null;

  return (
    <span className={styles.badge} aria-hidden="true" data-testid={`badge-${testId}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Accessible name of an icon button, with what waits inside it. */
export function iconLabel(title: string, count: number): string {
  if (count <= 0) return title;
  return `${title}, ${count} ${count === 1 ? 'nieprzeczytana wiadomość' : 'nieprzeczytane wiadomości'}`;
}
