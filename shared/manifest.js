/**
 * Plain data shared by backend and frontend: no zod, no runtime dependency.
 *
 * The split matters for the bundle: the frontend imports this file for values
 * (app manifest, colour list) and only ever imports the zod schemas as *types*.
 * Keeping them in one module would ship the whole validation runtime to the
 * browser for a handful of constants.
 */

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 200_000;
export const STICKY_BODY_MAX = 4_000;
export const DESKTOP_NAME_MAX = 80;

/** Sticky colours the UI can render. Unknown values are rejected by the API. */
export const STICKY_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];

/** Desktop item kinds: an app shortcut or a folder holding other items. */
export const DESKTOP_KINDS = ['app', 'folder'];

/** Slots the shell renders shortcuts into. */
export const FAVORITE_SLOTS = ['dock', 'launcher'];

/** Every ordering the list endpoints accept; each maps to one fixed ORDER BY. */
export const SORT_ORDERS = [
  'updated_desc',
  'updated_asc',
  'created_desc',
  'created_asc',
  'title_asc',
  'title_desc',
];

/**
 * Installed applications.
 *
 * The backend uses it to seed the desktop and to reject icons for apps that do
 * not exist; the shell uses it for names, window sizes and the app grid. Adding
 * an application means one entry here, one folder in frontend/src/apps and one
 * line in the frontend component map.
 */
export const APPS = [
  { id: 'calculator', title: 'Kalkulator', width: 320, height: 470 },
  { id: 'notepad', title: 'Notatnik', width: 960, height: 640 },
  { id: 'stickies', title: 'Karteczki', width: 820, height: 600 },
];

/** @param {string} id @returns {(typeof APPS)[number] | null} */
export const appById = (id) => APPS.find((app) => app.id === id) ?? null;
