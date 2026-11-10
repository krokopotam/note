/**
 * Files: resources, uploads, downloads, sharing between accounts.
 *
 * Uploads are raw bodies and downloads are streams, so the helpers below read the
 * bytes back instead of trusting a JSON body.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeSignedApp, makeTestApp, PASSWORD, signInAnother } from './helpers.js';

/** superagent: collect the response as a Buffer instead of parsing it. */
function asBinary(res, cb) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

async function threeAccounts() {
  const ala = await makeSignedApp({ username: 'ala' });
  const ola = await signInAnother(ala, { username: 'ola' });
  const ivo = await signInAnother(ala, { username: 'ivo' });
  return { ...ala, ala, ola, ivo };
}

async function resource(api, name = 'Dokumenty') {
  const res = await api.post('/api/files/resources').send({ name });
  expect(res.status).toBe(201);
  return res.body;
}

async function upload(api, resourceId, name, bytes, type = 'text/plain') {
  return api
    .put(`/api/files/resources/${resourceId}/files/${encodeURIComponent(name)}`)
    .type(type)
    .send(Buffer.from(bytes));
}

describe('resources', () => {
  it('creates a resource and lists it as owned', async () => {
    const { api } = await makeSignedApp();

    const created = await resource(api, 'Paragony');

    expect(created).toMatchObject({ name: 'Paragony', role: 'owner', file_count: 0 });
    expect((await api.get('/api/files/resources')).body.items.map((r) => r.name)).toEqual([
      'Paragony',
    ]);
  });

  it('refuses an empty or absurd name', async () => {
    const { api } = await makeSignedApp();

    expect((await api.post('/api/files/resources').send({ name: '  ' })).status).toBe(400);
    expect((await api.post('/api/files/resources').send({ name: 'x'.repeat(200) })).status).toBe(400);
  });

  it('renames a resource', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api, 'Stara nazwa');

    const renamed = await api.patch(`/api/files/resources/${created.id}`).send({ name: 'Nowa nazwa' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Nowa nazwa');
  });

  it('deletes a resource together with its folder and files', async () => {
    const { api, filesDir } = await makeSignedApp();
    const created = await resource(api);
    await upload(api, created.id, 'a.txt', 'abc');

    expect((await api.delete(`/api/files/resources/${created.id}`)).status).toBe(204);

    expect(fs.existsSync(path.join(filesDir, String(created.id)))).toBe(false);
    expect((await api.get('/api/files/resources')).body.items).toEqual([]);
  });

  it('keeps one account blind to another account\'s resources', async () => {
    const { ala, ola } = await threeAccounts();
    const created = await resource(ala.api);

    expect((await ola.api.get('/api/files/resources')).body.items).toEqual([]);
    expect((await ola.api.get(`/api/files/resources/${created.id}`)).status).toBe(404);
    expect((await ola.api.get(`/api/files/resources/${created.id}/files`)).status).toBe(404);
    expect((await ola.api.patch(`/api/files/resources/${created.id}`).send({ name: 'moje' })).status).toBe(404);
    expect((await ola.api.delete(`/api/files/resources/${created.id}`)).status).toBe(404);
  });
});

describe('uploads and downloads', () => {
  it('stores a file and hands the very same bytes back', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);

    const uploaded = await upload(api, created.id, 'rozliczenie.txt', 'za 2026 rok');

    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({
      name: 'rozliczenie.txt',
      size: 'za 2026 rok'.length,
      content_type: 'text/plain',
      created_by_name: 'ala',
    });

    const downloaded = await api.get(`/api/files/${uploaded.body.id}`).buffer(true).parse(asBinary);

    expect(downloaded.status).toBe(200);
    expect(downloaded.body.toString('utf8')).toBe('za 2026 rok');
    expect(downloaded.headers['content-type']).toMatch(/text\/plain/);
    expect(downloaded.headers['content-length']).toBe(String('za 2026 rok'.length));
    expect(downloaded.headers['content-disposition']).toContain('filename="rozliczenie.txt"');
  });

  it('keeps Polish letters in the downloaded file name', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);
    const uploaded = await upload(api, created.id, 'óżądzenie.pdf', 'x');

    const downloaded = await api
      .get(`/api/files/${uploaded.body.id}`)
      .buffer(true)
      .parse(asBinary);

    expect(downloaded.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('óżądzenie.pdf')}`,
    );
  });

  it('renames a file without touching the bytes', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);
    const uploaded = await upload(api, created.id, 'zly-nazwa.txt', 'tresc');

    const renamed = await api.patch(`/api/files/${uploaded.body.id}`).send({ name: 'dobra-nazwa.txt' });

    expect(renamed.body.name).toBe('dobra-nazwa.txt');
    const downloaded = await api.get(`/api/files/${renamed.body.id}`).buffer(true).parse(asBinary);
    expect(downloaded.body.toString('utf8')).toBe('tresc');
  });

  it('deletes a file, row and bytes both', async () => {
    const { api, filesDir } = await makeSignedApp();
    const created = await resource(api);
    const uploaded = await upload(api, created.id, 'do-usuniecia.txt', 'x');
    const stored = fs
      .readdirSync(path.join(filesDir, String(created.id)))
      .find((name) => name.endsWith('.txt'));

    expect((await api.delete(`/api/files/${uploaded.body.id}`)).status).toBe(204);

    expect(fs.existsSync(path.join(filesDir, String(created.id), stored))).toBe(false);
    expect((await api.get(`/api/files/${uploaded.body.id}`)).status).toBe(404);
  });

  it('lists files newest first and searches by name', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);
    await upload(api, created.id, 'stare.txt', '1');
    await upload(api, created.id, 'nowe.txt', '2');
    await upload(api, created.id, 'inne.pdf', '3', 'application/pdf');

    const all = await api.get(`/api/files/resources/${created.id}/files`);
    expect(all.body.items.map((f) => f.name)).toEqual(['inne.pdf', 'nowe.txt', 'stare.txt']);

    const found = await api.get(`/api/files/resources/${created.id}/files?q=nowe`);
    expect(found.body.items.map((f) => f.name)).toEqual(['nowe.txt']);
  });

  it('refuses an empty upload', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);

    const res = await upload(api, created.id, 'pusty.txt', '');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('empty_upload');
  });

  it('refuses a file over the limit', async () => {
    const { api } = await makeSignedApp({ maxUploadBytes: 64 });
    const created = await resource(api);

    const res = await upload(api, created.id, 'duzy.txt', 'x'.repeat(5000));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('file_too_large');
  });

  it('leaves nothing on disk when an upload is refused', async () => {
    const { api, filesDir } = await makeSignedApp({ maxUploadBytes: 64 });
    const created = await resource(api);

    await upload(api, created.id, 'za-duzy.txt', 'x'.repeat(5000));

    const dir = path.join(filesDir, String(created.id));
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });

  it('never lets a file name become a path', async () => {
    const { api, filesDir } = await makeSignedApp();
    const created = await resource(api);

    const uploaded = await upload(api, created.id, '../../../../etc/passwd', 'nidka');

    expect(uploaded.status).toBe(201);
    // The label is flattened, and the bytes stayed inside the resource folder.
    expect(uploaded.body.name).toBe('passwd');
    expect(fs.existsSync(path.join(filesDir, String(created.id)))).toBe(true);
    const stored = fs.readdirSync(path.join(filesDir, String(created.id)));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a percent sign and Polish letters in a file name', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);

    // The name is URL-encoded on the way in; decoding it twice would eat the "%".
    const uploaded = await upload(api, created.id, '100% rabatu óż.txt', 'x');

    expect(uploaded.body.name).toBe('100% rabatu óż.txt');
    const listed = await api.get(`/api/files/resources/${created.id}/files`);
    expect(listed.body.items[0].name).toBe('100% rabatu óż.txt');
  });

  it('does not put the generated disk name in any response', async () => {
    const { api } = await makeSignedApp();
    const created = await resource(api);
    const uploaded = await upload(api, created.id, 'pronames.txt', 'x');

    const listed = await api.get(`/api/files/resources/${created.id}/files`);
    expect(JSON.stringify(listed.body)).not.toContain('stored_name');
    expect(listed.body.items[0]).not.toHaveProperty('stored_name');
  });
});

describe('leaving the account', () => {
  it('keeps a file when the account that uploaded it is gone', async () => {
    const { ala, ola, db } = await threeAccounts();
    const created = await resource(ala.api);
    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'edit' });
    const uploaded = await upload(ola.api, created.id, 'od-oli.txt', 'tresc');

    db.prepare('DELETE FROM users WHERE id = ?').run(ola.user.id);

    // Plik należy do zasobu, nie do osoby: zostaje, tylko autor się nie zna.
    const listed = await ala.api.get(`/api/files/resources/${created.id}/files`);
    expect(listed.body.items).toMatchObject([
      { id: uploaded.body.id, name: 'od-oli.txt', created_by: null, created_by_name: '—' },
    ]);

    const downloaded = await ala.api
      .get(`/api/files/${uploaded.body.id}`)
      .buffer(true)
      .parse(asBinary);
    expect(downloaded.body.toString('utf8')).toBe('tresc');
  });

  it('takes a shared resource away when the owner leaves', async () => {
    const { ala, ola, db } = await threeAccounts();
    const created = await resource(ala.api);
    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'read' });

    db.prepare('DELETE FROM users WHERE id = ?').run(ala.user.id);

    expect((await ola.api.get('/api/files/resources')).body.items).toEqual([]);
  });
});

describe('sharing', () => {
  it('lists the people you can share with, without yourself', async () => {
    const { ala } = await threeAccounts();

    const users = await ala.api.get('/api/files/users');

    // 'wincyj' istnieje zawsze: tworzy go migracja 002 dla danych sprzed kont.
    expect(users.body.items.map((u) => u.username)).toEqual(['ivo', 'ola', 'wincyj']);
    expect(JSON.stringify(users.body)).not.toContain('password');
  });

  it('gives a reader the files but no way to change them', async () => {
    const { ala, ola } = await threeAccounts();
    const created = await resource(ala.api);
    const uploaded = await upload(ala.api, created.id, 'do-przeczytania.txt', 'treść');

    const shared = await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'read' });
    expect(shared.status).toBe(200);
    expect(shared.body.members).toEqual([{ user_id: ola.user.id, username: 'ola', permission: 'read' }]);

    // ola sees it now
    const list = await ola.api.get('/api/files/resources');
    expect(list.body.items).toMatchObject([{ name: 'Dokumenty', role: 'read', file_count: 1 }]);

    const downloaded = await ola.api
      .get(`/api/files/${uploaded.body.id}`)
      .buffer(true)
      .parse(asBinary);
    expect(downloaded.body.toString('utf8')).toBe('treść');

    // ...but cannot write anything
    expect((await upload(ola.api, created.id, 'nowy.txt', 'x')).status).toBe(403);
    expect((await ola.api.patch(`/api/files/${uploaded.body.id}`).send({ name: 'moje.txt' })).status).toBe(403);
    expect((await ola.api.delete(`/api/files/${uploaded.body.id}`)).status).toBe(403);
    expect((await ola.api.patch(`/api/files/resources/${created.id}`).send({ name: 'moje' })).status).toBe(403);
    expect(
      (await ola.api.put(`/api/files/resources/${created.id}/members`).send({ user_id: 1, permission: 'read' }))
        .status,
    ).toBe(403);
  });

  it('gives an editor the files to work with, but not the resource', async () => {
    const { ala, ola } = await threeAccounts();
    const created = await resource(ala.api);

    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'edit' });

    const uploaded = await upload(ola.api, created.id, 'z-edytora.txt', 'dopisałem');
    expect(uploaded.status).toBe(201);
    expect((await ola.api.patch(`/api/files/${uploaded.body.id}`).send({ name: 'poprawione.txt' })).status).toBe(200);
    expect((await ola.api.delete(`/api/files/${uploaded.body.id}`)).status).toBe(204);

    // Still not the owner: no rename of the resource, no further sharing.
    expect((await ola.api.patch(`/api/files/resources/${created.id}`).send({ name: 'moje' })).status).toBe(403);
    expect(
      (await ola.api.put(`/api/files/resources/${created.id}/members`).send({ user_id: 1, permission: 'read' }))
        .status,
    ).toBe(403);
  });

  it('takes access away again', async () => {
    const { ala, ola } = await threeAccounts();
    const created = await resource(ala.api);
    const uploaded = await upload(ala.api, created.id, 'chwilowe.txt', 'x');
    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'read' });

    const revoked = await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: null });

    expect(revoked.body.members).toEqual([]);
    expect((await ola.api.get('/api/files/resources')).body.items).toEqual([]);
    expect((await ola.api.get(`/api/files/${uploaded.body.id}`)).status).toBe(404);
  });

  it('upgrades a reader to an editor in place', async () => {
    const { ala, ola } = await threeAccounts();
    const created = await resource(ala.api);
    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'read' });

    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'edit' });

    expect((await upload(ola.api, created.id, 'teraz-moge.txt', 'x')).status).toBe(201);
    expect((await ola.api.get('/api/files/resources')).body.items[0].role).toBe('edit');
  });

  it('refuses to share with an account that does not exist, or with yourself', async () => {
    const { ala } = await threeAccounts();
    const created = await resource(ala.api);

    expect(
      (await ala.api.put(`/api/files/resources/${created.id}/members`).send({ user_id: 9999, permission: 'read' }))
        .status,
    ).toBe(404);
    expect(
      (await ala.api.put(`/api/files/resources/${created.id}/members`).send({ user_id: ala.user.id, permission: 'edit' }))
        .status,
    ).toBe(400);
    const somebody = (await ala.api.get('/api/files/users')).body.items[0];
    expect(
      (await ala.api
        .put(`/api/files/resources/${created.id}/members`)
        .send({ user_id: somebody.id, permission: 'pisac' })).status,
    ).toBe(400);
  });

  it('keeps shared files out of a third account that was never invited', async () => {
    const { ala, ola } = await threeAccounts();
    const created = await resource(ala.api);
    await ala.api
      .put(`/api/files/resources/${created.id}/members`)
      .send({ user_id: ola.user.id, permission: 'read' });

    // A fourth account, created after the sharing, was never invited.
    const { api } = await signInAnother(ala, { username: 'piotrek' });
    expect((await api.get('/api/files/resources')).body.items).toEqual([]);
  });
});
