import { createItem } from './desktop.js';
import { putFavorites } from './favorites.js';
import { createNote } from './notes.js';
import { createSticky } from './stickies.js';
import { assertUserId } from '../domain/scope.js';

/**
 * First-run content for one account.
 *
 * Called when a user registers, so a brand-new desktop is never empty — without
 * icons there would be no way to reach a single application. It is also what the
 * CLI can run for an account created directly in the database.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} userId
 * @param {Array<{id: string, title: string}>} apps - registry of the shell
 */
export function seedUser(db, userId, apps) {
  const owner = assertUserId(userId);

  db.transaction(() => {
    apps.forEach((app, index) => {
      createItem(db, owner, { kind: 'app', name: app.title, app_id: app.id, x: 0, y: index });
    });

    // Folders are part of the requirement from day one, so ship one to show that
    // shortcuts live inside them too.
    const folder = createItem(db, owner, { kind: 'folder', name: 'Schron', x: 3, y: 0 });
    const first = apps[0];
    if (first) {
      createItem(db, owner, {
        kind: 'app',
        name: first.title,
        app_id: first.id,
        parent_id: folder.id,
        x: 0,
        y: 0,
      });
    }

    putFavorites(db, owner, 'dock', apps.map((app) => app.id));
    putFavorites(db, owner, 'launcher', apps.map((app) => app.id));

    createNote(db, owner, {
      title: 'Start',
      body:
        'To Twoje prywatne notatki — nikt ich nie zobaczy.\n\n' +
        'Notatnik zapisuje się sam, a każda zmiana ląduje w historii (prawa kolumna).\n' +
        'Szukaj wpisując słowa kluczowe, sortuj po dacie lub tytule.',
    });

    createSticky(db, owner, {
      body: 'Karteczki: zapisz myśl, wróć do niej z poziomu boardu.',
      color: 'yellow',
    });
  })();
}
