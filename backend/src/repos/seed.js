import { createItem } from './desktop.js';
import { putFavorites } from './favorites.js';
import { createNote } from './notes.js';
import { createSticky } from './stickies.js';

/**
 * First-run content.
 *
 * Called on every boot but a no-op after that: it only fills empty tables, so a
 * user who deleted everything never gets it back and a redeploy never duplicates
 * icons.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{id: string, title: string}>} apps - registry of the shell
 * @returns {boolean} true when the desktop was seeded
 */
export function seedIfEmpty(db, apps) {
  const isEmpty = db.prepare('SELECT COUNT(*) AS n FROM desktop_items').get().n === 0;
  if (isEmpty) {
    db.transaction(() => {
      apps.forEach((app, index) => {
        createItem(db, { kind: 'app', name: app.title, app_id: app.id, x: 0, y: index });
      });
      // Folders are part of the requirement from day one, so ship one to show that
      // shortcuts live inside them too.
      const folder = createItem(db, { kind: 'folder', name: 'Schron', x: 3, y: 0 });
      const first = apps[0];
      if (first) {
        createItem(db, {
          kind: 'app',
          name: first.title,
          app_id: first.id,
          parent_id: folder.id,
          x: 0,
          y: 0,
        });
      }
      putFavorites(db, 'dock', apps.map((app) => app.id));
      putFavorites(db, 'launcher', apps.map((app) => app.id));
    })();
  }

  const hasNotes = db.prepare('SELECT COUNT(*) AS n FROM notes').get().n > 0;
  if (!hasNotes) {
    createNote(db, {
      title: 'Start',
      body:
        'Notatnik zapisuje się sam, a każda zmiana ląduje w historii (prawa kolumna).\n' +
        'Szukaj wpisując słowa kluczowe, sortuj po dacie lub tytule.',
    });
  }

  const hasStickies = db.prepare('SELECT COUNT(*) AS n FROM stickies').get().n > 0;
  if (!hasStickies) {
    createSticky(db, {
      body: 'Karteczki: zapisz myśl, wróć do niej z poziomu boardu.',
      color: 'yellow',
    });
  }

  return isEmpty;
}
