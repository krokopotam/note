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

// --- accounts ---------------------------------------------------------------

/**
 * Lowercase ASCII handle (3–32 chars): no look-alike accounts, no unicode tricks.
 * Runtime data, because the login form validates against it before sending.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const USERNAME_HINT = '3–32 znaki, małe litery, cyfry, kropka, myślnik, podkreślenie';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** "Zapamiętaj mnie na 10 dni"; without it a session still lives SESSION_HOURS. */
export const REMEMBER_DAYS = 10;
export const SESSION_HOURS = 12;

/**
 * Trim + lowercase, so 'Wincyj' and 'wincyj ' are the same account.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeUsername = (value) => String(value ?? '').trim().toLowerCase();

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
// --- gierki -----------------------------------------------------------------

/**
 * Short games, all of them frontend-only: no table, no endpoint, nothing to
 * synchronise. A round is worth losing when the window closes.
 *
 * They live in one folder on the desktop (`GAMES_FOLDER`) rather than in the icon
 * grid and the quick bars, because a desktop is not an arcade and nine icons
 * would push the four real applications off the screen.
 */
export const GAMES_FOLDER = 'Gry';

export const GAMES = [
  { id: 'snake', title: 'Wężyk', width: 420, height: 640 },
  { id: 'tetris', title: 'Tetris', width: 400, height: 700 },
  { id: 'bubbles', title: 'Bąbelki', width: 460, height: 660 },
  { id: 'twentyforty', title: '2048', width: 460, height: 660 },
  { id: 'mines', title: 'Saper', width: 560, height: 640 },
  { id: 'memory', title: 'Pamięć', width: 480, height: 640 },
  { id: 'tictactoe', title: 'Kółko i krzyżyk', width: 440, height: 600 },
  { id: 'billiard2d', title: 'Bilard 2D', width: 860, height: 560 },
  // The 3D table pulls in three.js, so it is a window of its own size and the
  // library is loaded only when somebody opens it.
  { id: 'billiard3d', title: 'Bilard 3D', width: 940, height: 660 },
  // A whole pinball table. The canvas is a 256x596 Amiga-style buffer (84 px
  // of dot matrix over a 256x512 playfield) drawn one hardware pixel for one
  // screen pixel, so the window has to be tall and still leave a column
  // beside it for the score readout.
  { id: 'pinball', title: 'Pinball', width: 720, height: 680 },
];

/** @param {string} id */
export const isGame = (id) => GAMES.some((game) => game.id === id);

export const APPS = [
  { id: 'calculator', title: 'Kalkulator', width: 320, height: 470 },
  { id: 'notepad', title: 'Notatnik', width: 960, height: 640 },
  { id: 'stickies', title: 'Karteczki', width: 820, height: 600 },
  { id: 'files', title: 'Pliki', width: 900, height: 620 },
  { id: 'chat', title: 'Czaty', width: 900, height: 640 },
  ...GAMES,
];

// --- pliki ------------------------------------------------------------------

/**
 * What one upload may weigh. nginx has to agree (`client_max_body_size`),
 * otherwise the request dies at the proxy with 413 before reaching the app.
 */
export const MAX_UPLOAD_MB = 100;
export const FILE_NAME_MAX = 200;
export const RESOURCE_NAME_MAX = 80;

/** `read` = view and download, `edit` = also upload, rename and delete. */
export const FILE_PERMISSIONS = ['read', 'edit'];

// --- czaty ------------------------------------------------------------------

/** One message, counted in characters (a wall of text is not a chat message). */
export const MESSAGE_MAX_LENGTH = 2000;

/**
 * How long a message stays editable, counted from the moment it was written.
 * Editing does not restart the clock: five minutes after sending, what people
 * read is what was said.
 */
export const MESSAGE_EDIT_MINUTES = 5;

/** How often an open chat window asks for new messages. */
export const CHAT_POLL_MS = 3000;

/**
 * How often the desktop asks whether anything arrived while no chat window is
 * open — it is one cheap count, and it is what lights the badge on the icon.
 */
export const BADGE_POLL_MS = 5000;

/** A group conversation: a name it may be shown under, and a ceiling of people. */
export const CONVERSATION_TITLE_MAX = 60;
export const GROUP_MEMBERS_MAX = 32;

/**
 * Pictures in chat. Small on purpose: a phone photo is a couple of megabytes and
 * the server keeps other sites company, so this is "a picture in a conversation",
 * not a photo drive — that is what the Files app is for.
 */
export const CHAT_ATTACHMENT_MAX_MB = 8;
export const CHAT_ATTACHMENTS_PER_MESSAGE = 4;

/** An upload nobody turned into a message is swept away after this many hours. */
export const ATTACHMENT_STALE_HOURS = 24;

/** @param {string} id @returns {(typeof APPS)[number] | null} */
export const appById = (id) => APPS.find((app) => app.id === id) ?? null;
