/**
 * Pictures in chat: uploaded as bytes, kept with the conversation, shown only to
 * the people inside it, and gone when the message they belonged to is deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTACHMENT_STALE_HOURS, CHAT_ATTACHMENT_MAX_MB } from '@note/shared';
import { pruneStaleAttachments, storeFolder } from '../src/repos/attachments.js';
import { makeSignedApp, signInAnother } from './helpers.js';

/** A tiny stand-in for a photo: bytes with a picture's name in front of them. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

async function twoAccounts(options = {}) {
  const ala = await makeSignedApp({ username: 'ala', ...options });
  const ola = await signInAnother(ala, { username: 'ola' });
  return { ...ala, ala, ola };
}

async function thread(api, userId) {
  const res = await api.post('/api/chat/conversations').send({ user_id: userId });
  return res.body;
}

function upload(api, conversationId, name, bytes, type = 'image/png') {
  return api
    .post(`/api/chat/conversations/${conversationId}/attachments?name=${encodeURIComponent(name)}`)
    .type(type)
    .send(bytes);
}

describe('wrzucanie zdjęcia', () => {
  it('takes a picture and shows it inside the message to both people', async () => {
    const { ala, ola, filesDir } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    const sent = await upload(ala.api, conv.id, 'kot.png', PNG);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ file_name: 'kot.png', mime: 'image/png', size: PNG.length });

    const message = await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ body: 'spójrz', attachment_ids: [sent.body.id] });
    expect(message.status).toBe(201);
    expect(message.body.attachments).toMatchObject([{ id: sent.body.id, file_name: 'kot.png' }]);

    const forOla = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(forOla.body.items[0].attachments).toHaveLength(1);

    // The bytes really are on disk, under the conversation and not under any name
    // the client could walk around with.
    const stored = fs.readdirSync(path.join(filesDir, storeFolder(conv.id)));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/\.png$/);
  });

  it('serves the picture to a member, with the type it was stored as', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await upload(ala.api, conv.id, 'kot.png', PNG);
    await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ body: '', attachment_ids: [sent.body.id] });

    const picture = await ola.api.get(`/api/chat/attachments/${sent.body.id}`).expect(200);

    expect(picture.headers['content-type']).toBe('image/png');
    expect(picture.headers['content-disposition']).toContain("inline; filename*=UTF-8''kot.png");
    expect(picture.body).toEqual(PNG);
  });

  it('a message can be only a picture', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await upload(ala.api, conv.id, 'wakacje.png', PNG);

    const message = await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ attachment_ids: [sent.body.id] });

    expect(message.status).toBe(201);
    expect(message.body).toMatchObject({ body: '' });

    // The sidebar has to say something, so it says "there is a picture here".
    const list = await ola.api.get('/api/chat/conversations');
    expect(list.body.items[0]).toMatchObject({ last_body: '', last_has_attachment: true });
  });

  it('refuses a message with neither text nor picture', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    const empty = await ala.api.post(`/api/chat/conversations/${conv.id}/messages`).send({ body: '   ' });

    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('validation_error');
  });
});

describe('czat to nie dysk na pliki', () => {
  it('refuses something that is not a picture', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    const sent = await upload(ala.api, conv.id, 'instalator.exe', Buffer.from('MZ...'), 'image/png');

    expect(sent.status).toBe(415);
    expect(sent.body.error.code).toBe('not_an_image');
  });

  it('refuses a picture announced as something else', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    const sent = await upload(ala.api, conv.id, 'podrzuc.png', PNG, 'application/octet-stream');

    expect(sent.status).toBe(415);
  });

  it('refuses a picture over the limit and leaves nothing behind', async () => {
    const { ala, ola, filesDir } = await twoAccounts({ maxAttachmentBytes: 1024 });
    const conv = await thread(ala.api, ola.user.id);

    const big = await upload(ala.api, conv.id, 'ogromne.png', Buffer.alloc(4096, 1));

    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('file_too_large');
    expect(fs.existsSync(path.join(filesDir, storeFolder(conv.id)))
      ? fs.readdirSync(path.join(filesDir, storeFolder(conv.id)))
      : []).toEqual([]);
  });

  it('refuses an empty upload', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    const nothing = await upload(ala.api, conv.id, 'puste.png', Buffer.alloc(0));

    expect(nothing.status).toBe(400);
    expect(nothing.body.error.code).toBe('empty_upload');
  });

  it('says what the limit is, in the language the app speaks', () => {
    expect(CHAT_ATTACHMENT_MAX_MB).toBeLessThanOrEqual(8);
  });
});

describe('kto może zobaczyć zdjęcie', () => {
  it('hides the conversation from a stranger, picture included', async () => {
    const { ala, ola } = await twoAccounts();
    const ivo = await signInAnother(ala, { username: 'ivo' });
    const conv = await thread(ala.api, ola.user.id);
    const sent = await upload(ala.api, conv.id, 'prywatne.png', PNG);
    await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ attachment_ids: [sent.body.id] });

    expect((await ivo.api.get(`/api/chat/attachments/${sent.body.id}`)).status).toBe(404);
  });

  it('will not attach somebody else upload to a message', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const hers = await upload(ola.api, conv.id, 'jej.png', PNG);

    const stolen = await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ body: 'to moje', attachment_ids: [hers.body.id] });

    expect(stolen.status).toBe(400);
    expect(stolen.body.error.code).toBe('invalid_attachment');
    // Nothing was written, so the picture still waits for its own message.
    const messages = await ala.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(messages.body.items).toHaveLength(0);
  });

  it('asks for a session like everything else', async () => {
    const { app } = await twoAccounts();
    const request = (await import('supertest')).default;

    expect((await request(app).get('/api/chat/attachments/1')).status).toBe(401);
  });
});

describe('sprzątanie zdjęć', () => {
  it('removes the pictures of a deleted message, rows and bytes', async () => {
    const { ala, ola, filesDir } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await upload(ala.api, conv.id, 'zly-kadr.png', PNG);
    const message = await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ body: 'kasuję to', attachment_ids: [sent.body.id] });

    expect((await ala.api.delete(`/api/chat/messages/${message.body.id}`)).status).toBe(204);

    const { db } = ala;
    expect(db.prepare('SELECT COUNT(*) n FROM message_attachments').get().n).toBe(0);
    expect(fs.readdirSync(path.join(filesDir, storeFolder(conv.id)))).toEqual([]);
  });

  it('sweeps uploads that never became a message', async () => {
    const { ala, ola, db, filesDir } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const kept = await upload(ala.api, conv.id, 'swieze.png', PNG);
    const stale = await upload(ala.api, conv.id, 'porzucone.png', PNG);

    // Yesterday, and nobody came to send it.
    const yesterday = new Date(Date.now() - (ATTACHMENT_STALE_HOURS + 1) * 3600_000).toISOString();
    db.prepare('UPDATE message_attachments SET created_at = ? WHERE id = ?').run(yesterday, stale.body.id);

    const removed = pruneStaleAttachments(db, new Date(Date.now() - ATTACHMENT_STALE_HOURS * 3600_000).toISOString());
    removed.forEach((row) => {
      fs.rmSync(path.join(filesDir, storeFolder(row.conversation_id), row.stored_name), { force: true });
    });

    expect(removed.map((row) => row.id)).toEqual([stale.body.id]);
    expect(db.prepare('SELECT id FROM message_attachments').all().map((row) => row.id)).toEqual([kept.body.id]);
  });

  it('leaves a picture alone when the person who sent it is gone', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await upload(ala.api, conv.id, 'wspomnienie.png', PNG);
    await ala.api
      .post(`/api/chat/conversations/${conv.id}/messages`)
      .send({ attachment_ids: [sent.body.id] });

    db.prepare('DELETE FROM users WHERE id = ?').run(ala.user.id);

    const forOla = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(forOla.body.items[0].attachments).toMatchObject([{ id: sent.body.id, file_name: 'wspomnienie.png' }]);
  });
});
