/**
 * Derive a note title from its body.
 *
 * The notepad saves on every keystroke, so a note is frequently untitled at
 * first; showing the first line keeps the tab and the list meaningful.
 */
export const UNTITLED = 'Bez tytułu';

/**
 * @param {string} body
 * @param {number} maxLength - shared NOTE_TITLE_MAX
 * @returns {string} first non-empty line, or UNTITLED
 */
export function deriveTitle(body, maxLength) {
  const firstLine = String(body ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return UNTITLED;
  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength - 1)}…` : firstLine;
}
