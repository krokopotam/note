/**
 * The CLI is the only way to claim the account the migration creates (nobody knows
 * its password) and to reset one somebody lost, so it is worth testing like any
 * other interface — including what it prints.
 */
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findByUsername } from '../src/repos/users.js';
import { isLocked } from '../src/domain/passwords.js';
import { createFileStore } from '../src/files/store.js';
import { run } from '../src/cli/users.js';
import { makeSignedApp, PASSWORD, signInAnother } from './helpers.js';

const OWNER = 'wincyj'; // the account migration 002 creates for pre-existing data

/** Run a command and hand back what it printed. A trailing object is its options. */
function cli(db, ...args) {
  const options = typeof args.at(-1) === 'object' && args.at(-1) !== null ? args.pop() : {};
  const lines = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...args) => lines.push(args.join(' ')));
  run(db, args, options);
  spy.mockRestore();
  err.mockRestore();
  return lines.join('\n');
}

describe('users CLI', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await makeSignedApp({ username: 'ala' });
    process.exitCode = 0;
  });

  it('lists accounts', () => {
    const output = cli(ctx.db, 'list');

    expect(output).toContain(OWNER);
    expect(output).toContain('ala');
  });

  it('prints usage for an unknown command and leaves a nonzero status', () => {
    const output = cli(ctx.db, 'cos-nie-tego');

    expect(output).toContain('użycie:');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('sets a password, which is what makes the legacy account usable', async () => {
    expect(isLocked(findByUsername(ctx.db, OWNER).password_hash)).toBe(true);

    cli(ctx.db, 'set-password', OWNER, PASSWORD);

    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: OWNER, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(OWNER);
  });

  it('refuses a password shorter than the rule', () => {
    const output = cli(ctx.db, 'set-password', OWNER, 'krótkie');

    expect(output).toContain('8 znak');
    expect(isLocked(findByUsername(ctx.db, OWNER).password_hash)).toBe(true);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('locks an account and drops its sessions', async () => {
    // ola shares ctx's database and app, but carries her own cookie.
    const { agent } = await signInAnother(ctx, { username: 'ola' });
    const ola = findByUsername(ctx.db, 'ola');
    cli(ctx.db, 'lock', 'ola');

    expect(isLocked(findByUsername(ctx.db, 'ola').password_hash)).toBe(true);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(ola.id).n).toBe(0);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('moves everything to another account, including pinned apps that collide', async () => {
    const db = ctx.db;
    const giver = findByUsername(db, 'ala');

    // ala has a desktop, a note and a card pinned to her dock; ola starts empty
    // and pins the same app, so the adoption has to drop one of the two rows.
    await ctx.api.post('/api/desktop/items').send({ kind: 'folder', name: 'Schron', x: 0, y: 0 });
    await ctx.api.post('/api/notes').send({ title: 'Ala', body: 'x' });
    await ctx.api.put('/api/desktop/favorites').send({ slot: 'dock', app_ids: ['calculator'] });

    const ola = await signInAnother(ctx, { username: 'ola' });
    await ola.api.put('/api/desktop/favorites').send({ slot: 'dock', app_ids: ['calculator'] });
    expect((await ola.api.get('/api/desktop/items')).body.items).toEqual([]);

    const output = cli(db, 'adopt', 'ala', 'ola');
    expect(output).toContain('notes=1');
    expect(output).toContain('duplicates_dropped=1');

    expect(db.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').get(giver.id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ?').get(giver.id).n).toBe(0);
    expect((await ola.api.get('/api/notes')).body.items.map((note) => note.title)).toEqual(['Ala']);
    expect((await ola.api.get('/api/desktop/items')).body.items).toHaveLength(1);
    expect(
      (await ola.api.get('/api/desktop/favorites')).body.slots.find((slot) => slot.slot === 'dock')
        .app_ids,
    ).toEqual(['calculator']);
  });

  it('removes an account together with everything it owned', async () => {
    const db = ctx.db;
    await ctx.api.post('/api/notes').send({ title: 'Ala', body: 'zostaje' });
    const { agent } = await signInAnother(ctx, { username: 'ola' });
    await agent.post('/api/notes').send({ title: 'Ola', body: 'x' });
    await agent.post('/api/stickies').send({ body: 'myśl' });
    const ola = findByUsername(db, 'ola');

    const output = cli(db, 'remove', 'ola');

    expect(output).toContain('notes=1');
    expect(output).toContain('stickies=1');
    expect(findByUsername(db, 'ola')).toBeUndefined();
    // ala is untouched, and nothing of ola's survives anywhere.
    expect((await ctx.api.get('/api/notes')).body.items.map((note) => note.title)).toEqual(['Ala']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').get(ola.id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(ola.id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_revisions').get().n).toBe(0);
  });

  it('says so when the account does not exist', () => {
    const output = cli(ctx.db, 'lock', 'duch');

    expect(output).toContain('nie ma konta');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('moves resources to the account that takes the data over', async () => {
    const { db, api } = ctx;
    const created = await api.post('/api/files/resources').send({ name: 'Dokumenty' });
    const taker = await signInAnother(ctx, { username: 'ola' });

    const output = cli(db, 'adopt', 'ala', 'ola');

    expect(output).toContain('file_resources=1');
    expect(db.prepare('SELECT owner_id FROM file_resources WHERE id = ?').get(created.body.id).owner_id).toBe(
      taker.user.id,
    );
    // Now it is Ola's own — she sees it as the owner, not as a guest.
    expect((await taker.api.get('/api/files/resources')).body.items[0]).toMatchObject({
      name: 'Dokumenty',
      role: 'owner',
    });
  });

  it('removes the folders on disk together with the account', async () => {
    const { db, api, filesDir } = ctx;
    const created = await api.post('/api/files/resources').send({ name: 'Wrzutki' });
    await api
      .put(`/api/files/resources/${created.body.id}/files/${encodeURIComponent('a.txt')}`)
      .type('text/plain')
      .send(Buffer.from('a'));
    const folder = path.join(filesDir, String(created.body.id));
    expect(fs.existsSync(folder)).toBe(true);

    const output = cli(db, 'remove', 'ala', { files: createFileStore(filesDir) });

    expect(output).toContain('foldery=1');
    expect(fs.existsSync(folder)).toBe(false);
  });

  it('gives an existing account a starter desktop', async () => {
    const { app, agent, db } = await makeSignedApp({ username: 'bose' });
    expect((await agent.get('/api/desktop/items')).body.items).toEqual([]);

    cli(db, 'seed', 'bose');

    expect((await agent.get('/api/desktop/items')).body.items.length).toBeGreaterThan(0);
    expect(app).toBeTruthy();
  });
});
