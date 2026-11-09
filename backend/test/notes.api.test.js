import { describe, expect, it } from 'vitest';
import { makeSignedApp } from './helpers.js';

describe('notes API', () => {
  it('reports health', async () => {
    const { api } = await makeSignedApp();
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('creates then returns a note', async () => {
    const { api } = await makeSignedApp();

    const created = await api.post('/api/notes').send({ title: 'Notatka', body: 'treść' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'Notatka', body: 'treść' });

    const fetched = await api.get(`/api/notes/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it('rejects an over-long title with field details', async () => {
    const { api } = await makeSignedApp();
    const res = await api.post('/api/notes').send({ title: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details).toEqual([{ path: 'title', message: expect.any(String) }]);
  });

  it('rejects a patch with no fields at all', async () => {
    const { api } = await makeSignedApp();
    const created = await api.post('/api/notes').send({ title: 'A' });

    const res = await api.patch(`/api/notes/${created.body.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('title or body is required');
  });

  it('searches and sorts through query parameters', async () => {
    const { api } = await makeSignedApp();
    await api.post('/api/notes').send({ title: 'Projekt Alpha', body: 'terminy' });
    await api.post('/api/notes').send({ title: 'Projekt Beta', body: 'budget' });

    const found = await api.get('/api/notes').query({ q: 'terminy' });
    expect(found.body.items.map((note) => note.title)).toEqual(['Projekt Alpha']);
    expect(found.body.total).toBe(1);

    const byTitle = await api.get('/api/notes').query({ sort: 'title_asc' });
    expect(byTitle.body.items.map((note) => note.title)).toEqual(['Projekt Alpha', 'Projekt Beta']);
  });

  it('rejects an unknown sort instead of silently ordering differently', async () => {
    const { api } = await makeSignedApp();
    const res = await api.get('/api/notes').query({ sort: 'rand()' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_query');
  });

  it('exposes history and restores a revision', async () => {
    const { api } = await makeSignedApp();
    const created = await api.post('/api/notes').send({ title: 'Dziennik', body: 'v1' });
    const id = created.body.id;

    await api.patch(`/api/notes/${id}`).send({ body: 'v2' });
    await api.patch(`/api/notes/${id}`).send({ body: 'v3' });

    const revisions = await api.get(`/api/notes/${id}/revisions`);
    expect(revisions.body.map((revision) => revision.body)).toEqual(['v2', 'v1']);

    const restored = await api.post(`/api/notes/${id}/revisions/${revisions.body[1].id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.body).toBe('v1');
  });

  it('deletes a note and then reports 404 with the error contract', async () => {
    const { api } = await makeSignedApp();
    const created = await api.post('/api/notes').send({ title: 'Chwilowa' });

    const removed = await api.delete(`/api/notes/${created.body.id}`);
    expect(removed.status).toBe(204);

    const missing = await api.get(`/api/notes/${created.body.id}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { code: 'not_found', message: 'note does not exist' } });
  });

  it('rejects a non-numeric id', async () => {
    const { api } = await makeSignedApp();
    const res = await api.get('/api/notes/abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_id');
  });

  it('rejects a malformed JSON body with a stable code', async () => {
    const { api } = await makeSignedApp();
    const res = await api
      .post('/api/notes')
      .set('Content-Type', 'application/json')
      .send('{"title": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('answers 404 for an unknown api route', async () => {
    const { api } = await makeSignedApp();
    const res = await api.get('/api/plotki');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
