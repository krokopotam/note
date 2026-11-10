/** Display formatting for ISO timestamps stored by the API. */

const TIME = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' });

/** `dd.MM HH:MM` — compact enough for a list row, unambiguous enough for history. */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${DAY.format(date)} ${TIME.format(date)}`;
}

/**
 * `m:ss` of the time a five-minute edit window has left. A raw "187 s" makes people
 * do arithmetic while the clock is running.
 */
export function formatCountdown(msLeft: number): string {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return '0:00';
  const seconds = Math.ceil(msLeft / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

/**
 * Byte count the way a Polish file manager writes it: `3 B`, `12,4 kB`, `1,8 GB`.
 * A raw number next to a uploaded file makes people guess; this does not.
 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const text = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${text.replace('.', ',')} ${UNITS[unit]}`;
}

/** First line of a body, used as a preview under a note title. */
export function preview(body: string, max = 60): string {
  const line = body
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return 'pusto';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
