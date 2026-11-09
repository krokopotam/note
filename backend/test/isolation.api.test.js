/**
 * Two accounts, one server: the point of the whole feature.
 *
 * Every case here is "ola tries to reach something that belongs to ala" — the API
 * answers as if it did not exist (404), which is also what keeps ids from leaking.
 */
import { describe, expect, it } from 'vitest';
import { makeSignedApp, signInAnother } from './helpers.js';

async function twoAccounts() {
  const ala = await makeSignedApp({ username: 'ala' });
  const ola = await signInAnother(ala, { username: 'ola' });
  return { ...ala, ala, ola };
}

describe('notes', () => {
  it('lists only what belongs to the signed-in account', async () => {
    const { ala, ola } = await twoAccounts();

    await ala.api.post('/api/notes').send({ title: 'Ala — notatki służbowe', body: 'x' });
    await ola.api.post('/api/notes').send({ title: 'Ola — lista zakupów', body: 'y' });

    const mine = await ala.api.get('/api/notes');
    expect(mine.body.total).toBe(1);
    expect(mine.body.items.map((note) => note.title)).toEqual(['Ala — notatki służbowe']);

    const hers = await ola.api.get('/api/notes');
    expect(hers.body.items.map((note) => note.title)).toEqual(['Ola — lista zakupów']);
  });

  it('searches inside one account only', async () => {
    const { ala, ola } = await twoAccounts();

    await ala.api.post('/api/notes').send({ title: 'Hasło do sejfu', body: 'sejf' });
    await ola.api.post('/api/notes').send({ title: 'Sejf w banku', body: 'sejf też' });

    expect((await ala.api.get('/api/notes?q=sejf')).body.total).toBe(1);
    expect((await ola.api.get('/api/notes?q=sejf')).body.total).toBe(1);
    expect((await ola.api.get('/api/notes?q=Hasło')).body.total).toBe(0);
  });

  it('refuses to read, change or delete another account\'s note', async () => {
    const { ala, ola } = await twoAccounts();

    const created = await ala.api.post('/api/notes').send({ title: 'Tajne', body: 'treść' });
    const id = created.body.id;

    expect((await ola.api.get(`/api/notes/${id}`)).status).toBe(404);
    expect((await ola.api.patch(`/api/notes/${id}`).send({ body: 'podmiana' })).status).toBe(404);
    expect((await ola.api.delete(`/api/notes/${id}`)).status).toBe(404);

    // Still exactly what ala left there.
    expect((await ala.api.get(`/api/notes/${id}`)).body).toMatchObject({ body: 'treść' });
  });

  it('keeps revision history out of reach, including restores', async () => {
    const { ala, ola } = await twoAccounts();

    const note = await ala.api.post('/api/notes').send({ title: 'v1', body: 'pierwsza' });
    await ala.api.patch(`/api/notes/${note.body.id}`).send({ body: 'druga' });
    const revisions = await ala.api.get(`/api/notes/${note.body.id}/revisions`);
    expect(revisions.body).toHaveLength(1);

    expect((await ola.api.get(`/api/notes/${note.body.id}/revisions`)).status).toBe(404);
    expect(
      (await ola.api.post(`/api/notes/${note.body.id}/revisions/${revisions.body[0].id}/restore`))
        .status,
    ).toBe(404);

    expect((await ala.api.get(`/api/notes/${note.body.id}`)).body.body).toBe('druga');
  });

  it('lets two accounts keep the same title', async () => {
    const { ala, ola } = await twoAccounts();

    expect((await ala.api.post('/api/notes').send({ title: 'Hasła' })).status).toBe(201);
    expect((await ola.api.post('/api/notes').send({ title: 'Hasła' })).status).toBe(201);
  });
});

describe('stickies', () => {
  it('shows each board to its own owner only', async () => {
    const { ala, ola } = await twoAccounts();

    await ala.api.post('/api/stickies').send({ body: 'ala myśli' });
    await ola.api.post('/api/stickies').send({ body: 'ola myśli', color: 'blue', pinned: true });

    expect((await ala.api.get('/api/stickies')).body.items.map((s) => s.body)).toEqual([
      'ala myśli',
    ]);
    expect((await ola.api.get('/api/stickies')).body.items.map((s) => s.body)).toEqual([
      'ola myśli',
    ]);
  });

  it('refuses to read, recolour or delete another account\'s card', async () => {
    const { ala, ola } = await twoAccounts();

    const created = await ala.api.post('/api/stickies').send({ body: 'privé' });
    const id = created.body.id;

    expect((await ola.api.get(`/api/stickies/${id}`)).status).toBe(404);
    expect((await ola.api.patch(`/api/stickies/${id}`).send({ color: 'pink' })).status).toBe(404);
    expect((await ola.api.delete(`/api/stickies/${id}`)).status).toBe(404);

    expect((await ala.api.get(`/api/stickies/${id}`)).body).toMatchObject({ color: 'yellow' });
  });
});

describe('desktop', () => {
  it('lays out each desktop separately', async () => {
    const { ala, ola } = await twoAccounts();

    const created = await ala.api
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator' });

    expect((await ala.api.get('/api/desktop/items')).body.items).toHaveLength(1);
    expect((await ola.api.get('/api/desktop/items')).body.items).toEqual([]);

    // ola cannot tidy up ala's icon.
    expect((await ola.api.patch(`/api/desktop/items/${created.body.id}`).send({ x: 9 })).status).toBe(
      404,
    );
    expect((await ola.api.delete(`/api/desktop/items/${created.body.id}`)).status).toBe(404);
  });

  it('will not drop a shortcut into somebody else\'s folder', async () => {
    const { ala, ola } = await twoAccounts();

    const folder = await ala.api
      .post('/api/desktop/items')
      .send({ kind: 'folder', name: 'Schron', x: 0, y: 0 });

    const res = await ola.api
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Notatnik', app_id: 'notepad', parent_id: folder.body.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_parent');
  });

  it('keeps the dock and the launcher per account', async () => {
    const { ala, ola } = await twoAccounts();

    await ala.api.put('/api/desktop/favorites').send({ slot: 'dock', app_ids: ['notepad'] });

    expect((await ala.api.get('/api/desktop/favorites')).body.slots).toContainEqual({
      slot: 'dock',
      app_ids: ['notepad'],
    });
    expect((await ola.api.get('/api/desktop/favorites')).body.slots).toContainEqual({
      slot: 'dock',
      app_ids: [],
    });
  });
});

describe('notepad session', () => {
  it('restores each account\'s own tabs', async () => {
    const { ala, ola } = await twoAccounts();

    const note = await ala.api.post('/api/notes').send({ title: 'Ala', body: 'x' });
    await ala.api
      .put('/api/session/notepad')
      .send({ tabs: [note.body.id], active_note_id: note.body.id });

    expect((await ola.api.get('/api/session/notepad')).body).toEqual({
      tabs: [],
      active_note_id: null,
    });

    // ola naming ala's note in a payload does not get it into the session.
    const saved = await ola.api
      .put('/api/session/notepad')
      .send({ tabs: [note.body.id], active_note_id: note.body.id });
    expect(saved.body).toEqual({ tabs: [], active_note_id: null });
  });
});
