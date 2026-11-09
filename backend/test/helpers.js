import { APPS } from '@note/shared';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';

/** Fresh migrated database per test — in-memory, so tests never touch data/note.db. */
export function makeDb() {
  return openDb(':memory:');
}

/** The same app object production runs, wired to a throwaway database. */
export function makeTestApp() {
  const db = makeDb();
  return { db, app: createApp({ db, apps: APPS }) };
}

/** Fixed timestamps keep sort assertions deterministic instead of clock-dependent. */
export const T = {
  t1: '2026-01-01T10:00:00.000Z',
  t2: '2026-01-02T10:00:00.000Z',
  t3: '2026-01-03T10:00:00.000Z',
  t4: '2026-01-04T10:00:00.000Z',
};
