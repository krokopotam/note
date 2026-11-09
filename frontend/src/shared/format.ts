/** Display formatting for ISO timestamps stored by the API. */

const TIME = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' });

/** `dd.MM HH:MM` — compact enough for a list row, unambiguous enough for history. */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${DAY.format(date)} ${TIME.format(date)}`;
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
