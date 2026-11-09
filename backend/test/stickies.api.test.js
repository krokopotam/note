import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

describe('stickies API', () => {
  it('creates a sticky with defaults applied', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/stickies').send({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: '', color: 'yellow', pinned: false });
    expect(typeof res.body.id).toBe('number');
  });

  it('rejects a colour the UI cannot render', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/stickies').send({ color: 'neon' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'color' });
  });

  it('keeps pinned stickies first regardless of the sort', async () => {
    const { app } = makeTestApp();
    const plain = await request(app).post('/api/stickies').send({ body: 'zwykła' });
    const pinned = await request(app).post('/api/stickies').send({ body: 'przypięta' });
    await request(app).patch(`/api/stickies/${pinned.body.id}`).send({ pinned: true });

    const list = await request(app).get('/api/stickies').query({ sort: 'created_asc' });
    expect(list.body.items.map((s) => s.id)).toEqual([pinned.body.id, plain.body.id]);
    expect(list.body.items[0].pinned).toBe(true);
  });

  it('filters to pinned only on request', async () => {
    const { app } = makeTestApp();
    await request(app).post('/api/stickies').send({ body: 'zwykła' });
    const pinned = await request(app).post('/api/stickies').send({ body: 'ważna', pinned: true });

    const list = await request(app).get('/api/stickies').query({ pinned: 'true' });
    expect(list.body.items.map((s) => s.id)).toEqual([pinned.body.id]);
    expect(list.body.total).toBe(1);
  });

  it('searches keyword text in sticky bodies', async () => {
    const { app } = makeTestApp();
    await request(app).post('/api/stickies').send({ body: 'kupić baterie' });
    await request(app).post('/api/stickies').send({ body: 'zadzwonić do Marka' });

    const res = await request(app).get('/api/stickies').query({ q: 'marka' });
    expect(res.body.items.map((s) => s.body)).toEqual(['zadzwonić do Marka']);
  });

  it('updates colour and body, and deletes', async () => {
    const { app } = makeTestApp();
    const created = await request(app).post('/api/stickies').send({ body: 'brzydka' });

    const patched = await request(app)
      .patch(`/api/stickies/${created.body.id}`)
      .send({ color: 'blue', body: 'ładna' });
    expect(patched.body).toMatchObject({ color: 'blue', body: 'ładna' });

    expect((await request(app).delete(`/api/stickies/${created.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/stickies/${created.body.id}`)).status).toBe(404);
  });

  it('rejects an unknown filter value', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/stickies').query({ pinned: 'czasem' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_query');
  });
});
