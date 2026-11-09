import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

describe('desktop layout API', () => {
  it('creates an app shortcut and reads the layout back', async () => {
    const { app } = makeTestApp();

    const created = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator', x: 2, y: 4 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'app', app_id: 'calculator', x: 2, y: 4, parent_id: null });

    const layout = await request(app).get('/api/desktop/items');
    expect(layout.body.items.map((item) => item.id)).toEqual([created.body.id]);
  });

  it('persists a dragged position', async () => {
    const { app } = makeTestApp();
    const created = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Notatnik', app_id: 'notepad', x: 0, y: 0 });

    const moved = await request(app).patch(`/api/desktop/items/${created.body.id}`).send({ x: 5, y: 7 });
    expect(moved.body).toMatchObject({ x: 5, y: 7 });

    const reread = await request(app).get('/api/desktop/items');
    expect(reread.body.items[0]).toMatchObject({ x: 5, y: 7 });
  });

  it('refuses an icon for an app that is not installed', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Eksplorator', app_id: 'explorer' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_app');
  });

  it('refuses an app item without app_id', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/desktop/items').send({ kind: 'app', name: 'Nic' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('app_id');
  });

  it('moves an icon into a folder and back to the desktop', async () => {
    const { app } = makeTestApp();
    const folder = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'folder', name: 'Biuro', x: 1, y: 1 });
    const icon = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator', x: 0, y: 0 });

    const inside = await request(app)
      .patch(`/api/desktop/items/${icon.body.id}`)
      .send({ parent_id: folder.body.id, x: 0, y: 0 });
    expect(inside.body.parent_id).toBe(folder.body.id);

    const outside = await request(app)
      .patch(`/api/desktop/items/${icon.body.id}`)
      .send({ parent_id: null });
    expect(outside.body.parent_id).toBeNull();
  });

  it('refuses to move a folder into itself or into its own subtree', async () => {
    const { app } = makeTestApp();
    const outer = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'folder', name: 'Zewn', x: 0, y: 0 });
    const inner = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'folder', name: 'Wewn', parent_id: outer.body.id, x: 0, y: 0 });

    const self = await request(app)
      .patch(`/api/desktop/items/${outer.body.id}`)
      .send({ parent_id: outer.body.id });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('cycle_detected');

    const nested = await request(app)
      .patch(`/api/desktop/items/${outer.body.id}`)
      .send({ parent_id: inner.body.id });
    expect(nested.status).toBe(409);
    expect(nested.body.error.code).toBe('cycle_detected');

    // The rejected move left the tree untouched.
    const layout = await request(app).get('/api/desktop/items');
    expect(layout.body.items.find((item) => item.id === outer.body.id).parent_id).toBeNull();
  });

  it('refuses to place an item inside another shortcut', async () => {
    const { app } = makeTestApp();
    const icon = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator' });
    const other = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Karteczki', app_id: 'stickies' });

    const res = await request(app)
      .patch(`/api/desktop/items/${icon.body.id}`)
      .send({ parent_id: other.body.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_parent');
  });

  it('refuses to place an item inside a folder that does not exist', async () => {
    const { app } = makeTestApp();
    const icon = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator' });

    const res = await request(app)
      .patch(`/api/desktop/items/${icon.body.id}`)
      .send({ parent_id: 4242 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_parent');
  });

  it('deleting a folder removes its shortcuts but not the applications', async () => {
    const { app } = makeTestApp();
    const folder = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'folder', name: 'Do usunięcia', x: 0, y: 0 });
    const icon = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator', parent_id: folder.body.id });
    expect(icon.body.parent_id).toBe(folder.body.id);

    expect((await request(app).delete(`/api/desktop/items/${folder.body.id}`)).status).toBe(204);

    const layout = await request(app).get('/api/desktop/items');
    expect(layout.body.items).toEqual([]);

    // The app itself is still installed, so a new icon can be created.
    const again = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'app', name: 'Kalkulator', app_id: 'calculator' });
    expect(again.status).toBe(201);
  });

  it('renames an icon', async () => {
    const { app } = makeTestApp();
    const created = await request(app)
      .post('/api/desktop/items')
      .send({ kind: 'folder', name: 'Stara nazwa' });

    const renamed = await request(app)
      .patch(`/api/desktop/items/${created.body.id}`)
      .send({ name: 'Nowa nazwa' });
    expect(renamed.body.name).toBe('Nowa nazwa');
  });
});

describe('favourites API', () => {
  it('replaces a slot and keeps the submitted order', async () => {
    const { app } = makeTestApp();

    await request(app)
      .put('/api/desktop/favorites')
      .send({ slot: 'dock', app_ids: ['notepad', 'calculator'] });
    const res = await request(app)
      .put('/api/desktop/favorites')
      .send({ slot: 'dock', app_ids: ['stickies', 'notepad'] });

    expect(res.body).toEqual({ slot: 'dock', app_ids: ['stickies', 'notepad'] });

    const all = await request(app).get('/api/desktop/favorites');
    expect(all.body.slots).toEqual([
      { slot: 'dock', app_ids: ['stickies', 'notepad'] },
      { slot: 'launcher', app_ids: [] },
    ]);
  });

  it('never lists the same app twice in a slot', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .put('/api/desktop/favorites')
      .send({ slot: 'launcher', app_ids: ['notepad', 'notepad'] });
    expect(res.body.app_ids).toEqual(['notepad']);
  });

  it('rejects an unknown slot and an unknown app', async () => {
    const { app } = makeTestApp();

    const badSlot = await request(app)
      .put('/api/desktop/favorites')
      .send({ slot: 'bocian', app_ids: ['notepad'] });
    expect(badSlot.status).toBe(400);

    const badApp = await request(app)
      .put('/api/desktop/favorites')
      .send({ slot: 'dock', app_ids: ['paint'] });
    expect(badApp.status).toBe(400);
    expect(badApp.body.error.code).toBe('unknown_app');
  });
});

describe('notepad session API', () => {
  const createNote = async (app, title) =>
    (await request(app).post('/api/notes').send({ title, body: title })).body.id;

  it('stores open tabs in order and the active one', async () => {
    const { app } = makeTestApp();
    const first = await createNote(app, 'Pierwsza');
    const second = await createNote(app, 'Druga');

    const put = await request(app)
      .put('/api/session/notepad')
      .send({ tabs: [second, first], active_note_id: first });
    expect(put.status).toBe(200);

    const res = await request(app).get('/api/session/notepad');
    expect(res.body).toEqual({ tabs: [second, first], active_note_id: first });
  });

  it('drops a tab whose note was deleted, keeping the rest', async () => {
    const { app } = makeTestApp();
    const keep = await createNote(app, 'Zostaje');
    const doomed = await createNote(app, 'Usunięta');
    await request(app).put('/api/session/notepad').send({ tabs: [keep, doomed], active_note_id: doomed });

    await request(app).delete(`/api/notes/${doomed}`);
    expect((await request(app).get('/api/session/notepad')).body).toEqual({
      tabs: [keep],
      active_note_id: null,
    });
  });

  it('ignores tabs pointing at notes that never existed', async () => {
    const { app } = makeTestApp();
    const real = await createNote(app, 'Prawdziwa');

    const res = await request(app)
      .put('/api/session/notepad')
      .send({ tabs: [real, 4242], active_note_id: 4242 });

    expect(res.body).toEqual({ tabs: [real], active_note_id: null });
  });

  it('rejects a malformed session payload', async () => {
    const { app } = makeTestApp();
    const res = await request(app).put('/api/session/notepad').send({ tabs: ['a'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});
