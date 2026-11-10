import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { APPS } from '@note/shared';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { LOCKED_HASH } from '../src/domain/passwords.js';
import { createUser } from '../src/repos/users.js';

export const PASSWORD = 'superhaslo123';

/** Fresh migrated database per test — in-memory, so tests never touch data/note.db. */
export function makeDb() {
  return openDb(':memory:');
}

/**
 * The same app object production runs, wired to a throwaway database.
 *
 * `seed` defaults to a no-op: most tests assert a resource in isolation and do not
 * want a starter desktop in the way. The registration seeding has its own test.
 */
export function makeTestApp({ apps = APPS, seed = () => {}, throttle, maxUploadBytes } = {}) {
  const db = makeDb();
  // Uploads go to a throwaway folder, never into the repository's data/files.
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-files-'));
  const app = createApp({ db, apps, seed, throttle, filesDir, maxUploadBytes });
  return { db, app, filesDir };
}

/**
 * Register an account through the real endpoint and hand back an agent that carries
 * the session cookie, so every test runs as a signed-in user the same way a browser
 * would — no back doors in the production wiring.
 *
 * `api` is the agent; use it instead of `request(app)`.
 */
export async function makeSignedApp({
  username = 'ala',
  password = PASSWORD,
  remember = false,
  ...rest
} = {}) {
  const context = makeTestApp(rest);
  const agent = request.agent(context.app);
  const res = await agent
    .post('/api/auth/register')
    .send({ username, password, password_confirm: password, remember });

  if (res.status !== 201) {
    throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { ...context, agent, api: agent, user: res.body.user };
}

/**
 * A second account on the *same* database and app, with its own cookie.
 * This is how ownership is tested: two agents, one server, nothing shared.
 */
export async function signInAnother({ app }, { username = 'ola', password = PASSWORD } = {}) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ username, password, password_confirm: password });
  if (res.status !== 201) {
    throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { agent, api: agent, user: res.body.user };
}

/**
 * A migrated database plus one account, for repository tests that assert ownership
 * without caring about login. The hash is a locked placeholder: no login happens.
 */
export function makeDbOwned() {
  const db = makeDb();
  const owner = createUser(db, { username: 'wlasciciel', passwordHash: LOCKED_HASH }).id;
  return { db, owner };
}

/** Fixed timestamps keep sort assertions deterministic instead of clock-dependent. */
export const T = {
  t1: '2026-01-01T10:00:00.000Z',
  t2: '2026-01-02T10:00:00.000Z',
  t3: '2026-01-03T10:00:00.000Z',
  t4: '2026-01-04T10:00:00.000Z',
};
