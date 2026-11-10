/**
 * Account maintenance from the server shell — the escape hatch for the one thing
 * the web UI cannot do: claim the account that predates login, or reset a password
 * somebody forgot.
 *
 *   npm run cli -- list
 *   npm run cli -- set-password wincyj <hasło>     # also unlocks the account
 *   npm run cli -- lock wincyj                     # kill every session, forbid login
  npm run cli -- remove ala                      # delete the account and all its content
 *   npm run cli -- adopt wincyj ala                # move all of wincyj's data to ala
 *   npm run cli -- seed ala                        # give an account the starter desktop
 *   npm run cli -- sessions wincyj
 *
 * The password may also come from NOTE_PASSWORD to keep it out of the shell history.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, ATTACHMENT_STALE_HOURS } from '@note/shared';
import { openDb } from '../db/index.js';
import { LOCKED_HASH, hashPassword } from '../domain/passwords.js';
import { createFileStore } from '../files/store.js';
import { pruneEmptyConversations } from '../repos/chat.js';
import { pruneStaleAttachments, storeFolder } from '../repos/attachments.js';
import { ownedResourceIds } from '../repos/files.js';
import { seedUser } from '../repos/seed.js';
import { destroyAllForUser, listSessions } from '../repos/sessions.js';
import {
  adoptDataFrom,
  deleteUser,
  findByUsername,
  listUsers,
  setPassword,
} from '../repos/users.js';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

const USAGE = `użycie: npm run cli -- <polecenie> [argumenty]
  list
  set-password <login> [hasło]     (albo NOTE_PASSWORD=...)
  lock <login>
  remove <login>                    (usuwa też jego dane)
  prune                             (porządzi rozmowy bez żadnego członka)
  adopt <z-czyje> <na-kogo>
  seed <login>
  sessions <login>`;

/**
 * Look an account up, reporting a miss the way a human would want to read it.
 * Returns null so the command can stop without a stack trace.
 */
function mustFind(db, username) {
  const account = findByUsername(db, username);
  if (!account) {
    console.error(`nie ma konta "${username}"`);
    process.exitCode = 1;
  }
  return account ?? null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} args
 * @param {{files?: object}} options - the disk side, injectable for tests
 */
export function run(db, args, { files = createFileStore(path.join(PROJECT_ROOT, 'data', 'files')) } = {}) {
  const [command, ...rest] = args;

  switch (command) {
    case 'list': {
      const users = listUsers(db);
      if (!users.length) console.log('brak kont');
      for (const user of users) {
        console.log(`#${user.id}\t${user.username}\t${user.last_login_at ?? 'nigdy'}`);
      }
      return;
    }

    case 'set-password': {
      const [username, positional] = rest;
      const password = positional ?? process.env.NOTE_PASSWORD;
      if (!password || password.length < 8) {
        console.error('hasło musi mieć co najmniej 8 znaków (argument albo NOTE_PASSWORD)');
        process.exitCode = 1;
        return;
      }
      const account = mustFind(db, username);

      if (!account) return;
      const updated = setPassword(db, account.id, hashPassword(password));
      const killed = destroyAllForUser(db, account.id);
      console.log(`hasło ustawione dla #${updated.id} ${updated.username} (wygaszone sesji: ${killed})`);
      return;
    }

    case 'lock': {
      const [username] = rest;
      const account = mustFind(db, username);

      if (!account) return;
      setPassword(db, account.id, LOCKED_HASH);
      const killed = destroyAllForUser(db, account.id);
      console.log(`konto ${account.username} zablokowane (wygaszone sesji: ${killed})`);
      return;
    }

    case 'remove': {
      const [username] = rest;
      const account = mustFind(db, username);
      if (!account) return;

      // Wiersze znikają kaskadowo, ale bajty na dysku są poza bazą — bez tego
      // zostałyby foldery, do których nigdy już nikt nie trafi.
      const folders = ownedResourceIds(db, account.id);
      const removed = deleteUser(db, account.id);
      folders.forEach((id) => files.removeResource(id));
      // Czyjeś rozmowy przeżyją jego konto — ale nie te, z których odszedł ostatni.
      // Zdjęcia razem z rozmowami, z których odszedł ostatni człowiek.
      const orphans = pruneEmptyConversations(db);
      orphans.forEach((id) => files.removeResource(storeFolder(id)));
      console.log(
        `usunięto konto ${username} wraz z:`,
        [...Object.entries(removed), ['foldery', folders.length], ['osierocone', orphans.length]]
          .map(([what, n]) => `${what}=${n}`)
          .join(' '),
      );
      return;
    }

    case 'prune': {
      const orphans = pruneEmptyConversations(db);
      orphans.forEach((id) => files.removeResource(storeFolder(id)));

      // Zdjęcie wysłane i niedopięte do żadnej wiadomości to porzucony plik.
      const cutoff = new Date(Date.now() - ATTACHMENT_STALE_HOURS * 60 * 60 * 1000).toISOString();
      const stale = pruneStaleAttachments(db, cutoff);
      stale.forEach((row) => files.remove(storeFolder(row.conversation_id), row.stored_name));

      console.log(
        `rozmowy bez członków usunięte: ${orphans.length}; porzucone zdjęcia: ${stale.length}`,
      );
      return;
    }

    case 'adopt': {
      const [from, to] = rest;
      const giver = mustFind(db, from);

      if (!giver) return;
      const taker = mustFind(db, to);
      if (!taker) return;

      const counts = adoptDataFrom(db, giver.id, taker.id);
      console.log(
        `przeniesiono do ${taker.username}:`,
        Object.entries(counts)
          .map(([table, n]) => `${table}=${n}`)
          .join(' '),
      );
      return;
    }

    case 'seed': {
      const [username] = rest;
      const account = mustFind(db, username);

      if (!account) return;
      seedUser(db, account.id, APPS);
      console.log(`starter pulpit dla ${account.username}`);
      return;
    }

    case 'sessions': {
      const [username] = rest;
      const account = mustFind(db, username);

      if (!account) return;
      const sessions = listSessions(db, account.id);
      if (!sessions.length) console.log('brak aktywnych sesji');
      for (const session of sessions) {
        console.log(
          `#${session.id}\t${session.created_at} → ${session.expires_at}\t${session.remember ? '10 dni' : 'zwykła'}`,
        );
      }
      return;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

// Direct execution only (tests import run() and pass their own database).
const invokedDirectly = process.argv[1]?.endsWith('cli/users.js');
if (invokedDirectly) {
  const dbFile = process.env.DB_FILE ?? path.join(PROJECT_ROOT, 'data', 'note.db');
  run(openDb(dbFile), process.argv.slice(2));
}
