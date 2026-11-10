/**
 * Chat: opening conversations, writing, and the five minutes in which a message
 * may still be changed.
 *
 * The window is tested against the clock rather than against a mock of it: the
 * message is written, then its `created_at` is moved back in the database, which
 * is exactly what time does to it.
 */
import { describe, expect, it } from 'vitest';
import { MESSAGE_EDIT_MINUTES } from '@note/shared';
import { makeSignedApp, signInAnother } from './helpers.js';

async function twoAccounts() {
  const ala = await makeSignedApp({ username: 'ala' });
  const ola = await signInAnother(ala, { username: 'ola' });
  return { ...ala, ala, ola };
}

async function thread(api, userId) {
  const res = await api.post('/api/chat/conversations').send({ user_id: userId });
  expect(res.status).toBe(200);
  return res.body;
}

const say = (api, id, body) => api.post(`/api/chat/conversations/${id}/messages`).send({ body });

/** Backdate a message so the edit window has already run out. */
function age(db, messageId, minutes) {
  const created = new Date(Date.now() - minutes * 60_000).toISOString();
  db.prepare('UPDATE messages SET created_at = ? WHERE id = ?').run(created, messageId);
}

describe('conversations', () => {
  it('lists the accounts you can write to, without yourself', async () => {
    const { ala } = await twoAccounts();

    const people = await ala.api.get('/api/chat/people');

    expect(people.body.items.map((p) => p.username)).toEqual(['ola', 'wincyj']);
    expect(JSON.stringify(people.body)).not.toContain('password');
  });

  it('opens a thread with a person and keeps only one', async () => {
    const { ala, ola } = await twoAccounts();

    const first = await thread(ala.api, ola.user.id);
    const second = await thread(ala.api, ola.user.id);

    expect(first.peer).toEqual({ id: ola.user.id, username: 'ola' });
    expect(second.id).toBe(first.id);
    expect(ala.db.prepare('SELECT COUNT(*) AS n FROM conversations').get().n).toBe(1);
  });

  it('refuses writing to yourself and to an account that does not exist', async () => {
    const { ala } = await twoAccounts();

    expect((await ala.api.post('/api/chat/conversations').send({ user_id: ala.user.id })).status).toBe(400);
    expect((await ala.api.post('/api/chat/conversations').send({ user_id: 9999 })).status).toBe(404);
  });

  it('shows the last words and how many are unread', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    await say(ala.api, conv.id, 'hej');

    await say(ola.api, conv.id, 'słyszę');
    await say(ola.api, conv.id, 'i drugi raz');
    const before = await ala.api.get('/api/chat/conversations');
    expect(before.body.items[0]).toMatchObject({ last_body: 'i drugi raz', unread: 2, last_from_me: false });

    // Reading the thread is what clears the counter.
    await ala.api.get(`/api/chat/conversations/${conv.id}/messages`);
    const after = await ala.api.get('/api/chat/conversations');
    expect(after.body.items[0]).toMatchObject({ unread: 0, last_from_me: false });
  });
});

describe('messages', () => {
  it('writes a message and reports what may still be done with it', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    const sent = await say(ala.api, conv.id, 'cześć, Olu');

    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      author_id: ala.user.id,
      author_name: 'ala',
      body: 'cześć, Olu',
      edited_at: null,
      from_me: true,
      can_edit: true,
    });
    const window = (Date.parse(sent.body.editable_until) - Date.parse(sent.body.created_at)) / 60_000;
    expect(window).toBe(MESSAGE_EDIT_MINUTES);

    // The other side gets the same message, but the bubble is not theirs.
    const seen = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(seen.body.items[0]).toMatchObject({ from_me: false, can_edit: false });
  });

  it('refuses an empty message and one that is a wall of text', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    expect((await say(ala.api, conv.id, '   ')).status).toBe(400);
    expect((await say(ala.api, conv.id, 'x'.repeat(5000))).status).toBe(400);
  });

  it('reads them oldest first and carries a watermark to ask with', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const first = await say(ala.api, conv.id, 'pierwsza');
    await say(ola.api, conv.id, 'druga');
    await say(ala.api, conv.id, 'trzecia');

    const all = await ala.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(all.body.items.map((m) => m.body)).toEqual(['pierwsza', 'druga', 'trzecia']);

    // 'pierwsza' is two minutes old, so "everything since the watermark" cannot
    // accidentally include it because both lines landed in the same millisecond.
    age(db, first.body.id, 2);
    const seen = await ala.api.get(`/api/chat/conversations/${conv.id}/messages`);
    await say(ala.api, conv.id, 'czwarta');

    const fresh = await ala.api.get(
      `/api/chat/conversations/${conv.id}/messages?since=${seen.body.watermark}`,
    );
    // The boundary itself comes back once more ('trzecia' is exactly the watermark):
    // asking ">= that moment" is what makes a message written in the same
    // millisecond impossible to lose, and a window merges what it already has.
    expect(fresh.body.items.map((m) => m.body)).toEqual(['trzecia', 'czwarta']);
  });

  /**
   * The point of the whole polling design: a window that is already open learns
   * about a correction and about a deletion, not only about new lines.
   */
  it('a poll brings what arrived, what was corrected and what was deleted', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const mine = await say(ala.api, conv.id, 'pierwsza');
    await say(ola.api, conv.id, 'druga');
    age(db, mine.body.id, 2);

    const url = `/api/chat/conversations/${conv.id}/messages`;
    const seen = await ola.api.get(url);
    expect(seen.body.items.map((m) => m.body)).toEqual(['pierwsza', 'druga']);

    await say(ala.api, conv.id, 'trzecia');
    await ola.api.patch(`/api/chat/messages/${seen.body.items[1].id}`).send({ body: 'druga, poprawiona' });
    await ala.api.delete(`/api/chat/messages/${seen.body.items[0].id}`);

    const poll = await ola.api.get(`${url}?since=${seen.body.watermark}`);
    const changed = poll.body.items.map((m) => (m.deleted ? '(usunięta)' : m.body));

    expect(changed).toContain('trzecia');
    expect(changed).toContain('druga, poprawiona');
    expect(changed).toContain('(usunięta)');
    expect(changed).not.toContain('druga');
  });

  it('keeps a stranger out of the conversation', async () => {
    const { ala, ola, db } = await twoAccounts();
    const ivo = await signInAnother(ala, { username: 'ivo' });
    const conv = await thread(ala.api, ola.user.id);
    const sent = await say(ala.api, conv.id, 'tylko między nami');

    expect((await ivo.api.get(`/api/chat/conversations/${conv.id}`)).status).toBe(404);
    expect((await ivo.api.get(`/api/chat/conversations/${conv.id}/messages`)).status).toBe(404);
    expect((await say(ivo.api, conv.id, 'a ja się wciśnie')).status).toBe(404);
    expect((await ivo.api.patch(`/api/chat/messages/${sent.body.id}`).send({ body: 'zmienione' })).status).toBe(404);
    expect((await ivo.api.delete(`/api/chat/messages/${sent.body.id}`)).status).toBe(404);
    // Nothing was touched.
    expect(db.prepare('SELECT body FROM messages WHERE id = ?').get(sent.body.id).body).toBe('tylko między nami');
  });

  it('does not offer editing of somebody else\'s message', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    await say(ala.api, conv.id, 'od ali');

    const read = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);

    expect(read.body.items[0]).toMatchObject({ can_edit: false, editable_until: null });
  });
});

describe('the five minutes', () => {
  it('lets the author fix a typo while the window is open', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await say(ala.api, conv.id, 'kupić bateree');

    const fixed = await ala.api.patch(`/api/chat/messages/${sent.body.id}`).send({ body: 'kupić baterie' });

    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ body: 'kupić baterie', can_edit: true });
    expect(fixed.body.edited_at).not.toBeNull();

    // The other side reads the corrected text.
    const read = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(read.body.items[0].body).toBe('kupić baterie');
  });

  it('refuses a message older than the window', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await say(ala.api, conv.id, 'napisane rano');
    age(db, sent.body.id, MESSAGE_EDIT_MINUTES + 1);

    const late = await ala.api.patch(`/api/chat/messages/${sent.body.id}`).send({ body: 'poprawione po latach' });

    expect(late.status).toBe(403);
    expect(late.body.error.code).toBe('edit_window_closed');
    expect(db.prepare('SELECT body FROM messages WHERE id = ?').get(sent.body.id).body).toBe('napisane rano');
  });

  it('counts the window from writing, not from the last edit', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await say(ala.api, conv.id, 'jedna');

    const first = await ala.api.patch(`/api/chat/messages/${sent.body.id}`).send({ body: 'druga' });
    age(db, sent.body.id, MESSAGE_EDIT_MINUTES + 1);

    // `created_at` is what sets the deadline: an edit four minutes in does not
    // buy another four.
    expect(first.body.editable_until).toBe(sent.body.editable_until);
    expect((await ala.api.patch(`/api/chat/messages/${sent.body.id}`).send({ body: 'trzecia' })).body.error.code).toBe(
      'edit_window_closed',
    );
  });

  it('tells whose message it was not, separately from too late', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await say(ola.api, conv.id, 'od oli');

    const denied = await ala.api.patch(`/api/chat/messages/${sent.body.id}`).send({ body: 'nie moje' });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('not_author');
  });

  it('deletes own message at any time, and nobody else\'s at all', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const mine = await say(ala.api, conv.id, 'to skasuję');
    const theirs = await say(ola.api, conv.id, 'tego nie skasujesz');
    age(db, mine.body.id, 60);

    expect((await ala.api.delete(`/api/chat/messages/${mine.body.id}`)).status).toBe(204);
    expect((await ala.api.delete(`/api/chat/messages/${theirs.body.id}`)).status).toBe(403);

    // The row stays behind as a tombstone — the other window learns it is gone
    // precisely by being told so, and the text itself is emptied on the way.
    expect(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n).toBe(2);
    const read = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(read.body.items).toMatchObject([
      { body: '', deleted: true },
      { body: 'tego nie skasujesz', deleted: false },
    ]);

    // Nothing to fix in a message that is already gone.
    const resurrect = await ala.api
      .patch(`/api/chat/messages/${mine.body.id}`)
      .send({ body: 'a jedak' });
    expect(resurrect.status).toBe(410);
  });
});

describe('leaving the account', () => {
  it('keeps the thread for the other person, with the author unknown', async () => {
    const { ala, ola, db } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    await say(ala.api, conv.id, 'zostań po mnie');

    db.prepare('DELETE FROM users WHERE id = ?').run(ala.user.id);

    const messages = await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect(messages.body.items).toMatchObject([{ body: 'zostań po mnie', author_id: null, author_name: '—' }]);

    const list = await ola.api.get('/api/chat/conversations');
    expect(list.body.items[0]).toMatchObject({ peer: null, last_body: 'zostań po mnie' });
  });
});

describe('rozmowa z kilkoma osobami', () => {
  it('opens a group under a name and everybody reads the same thread', async () => {
    const { ala, ola } = await twoAccounts();
    const ivo = await signInAnother(ala, { username: 'ivo' });

    const group = await ala.api
      .post('/api/chat/conversations/group')
      .send({ title: 'Remont', member_ids: [ola.user.id, ivo.user.id] });

    expect(group.status).toBe(201);
    expect(group.body).toMatchObject({ title: 'Remont', is_group: true, peer: null });
    expect(group.body.members.map((m) => m.username)).toEqual(['ala', 'ivo', 'ola']);

    await say(ala.api, group.body.id, 'ile kafli?');

    const forOla = await ola.api.get(`/api/chat/conversations/${group.body.id}/messages`);
    expect(forOla.body.items).toMatchObject([{ body: 'ile kafli?', from_me: false, author_name: 'ala' }]);

    const forIvo = await ivo.api.get('/api/chat/conversations');
    expect(forIvo.body.items[0]).toMatchObject({ id: group.body.id, title: 'Remont', is_group: true });
  });

  it('an unnamed group says who is in it', async () => {
    const { ala, ola } = await twoAccounts();
    const ivo = await signInAnother(ala, { username: 'ivo' });

    const group = await ala.api
      .post('/api/chat/conversations/group')
      .send({ member_ids: [ola.user.id, ivo.user.id] });

    const forOla = await ola.api.get('/api/chat/conversations');
    expect(forOla.body.items[0].title).toBe('ala, ivo');
  });

  it('a 1:1 thread keeps the peer as its title', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);

    expect(conv).toMatchObject({ title: 'ola', is_group: false, peer: { username: 'ola' } });
    expect(conv.members.map((m) => m.username)).toEqual(['ala', 'ola']);
  });

  it('lets a group grow and refuses to grow a 1:1 thread', async () => {
    const { ala, ola } = await twoAccounts();
    const ivo = await signInAnother(ala, { username: 'ivo' });
    const group = await ala.api.post('/api/chat/conversations/group').send({ member_ids: [ola.user.id] });

    const added = await ola.api
      .post(`/api/chat/conversations/${group.body.id}/members`)
      .send({ user_id: ivo.user.id });
    expect(added.status).toBe(200);
    expect(added.body.members.map((m) => m.username)).toEqual(['ala', 'ivo', 'ola']);

    // Adding a third person to a pair thread would stop it being that pair.
    const direct = await thread(ala.api, ola.user.id);
    const refused = await ala.api.post(`/api/chat/conversations/${direct.id}/members`).send({ user_id: ivo.user.id });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('direct_conversation');
  });

  it('a stranger is not in it, and cannot join from the outside', async () => {
    const { ala, ola } = await twoAccounts();
    const ivo = await signInAnother(ala, { username: 'ivo' });
    const group = await ala.api.post('/api/chat/conversations/group').send({ member_ids: [ola.user.id] });
    await say(ala.api, group.body.id, 'między nami trzema');

    expect((await ivo.api.get(`/api/chat/conversations/${group.body.id}`)).status).toBe(404);
    expect((await ivo.api.get(`/api/chat/conversations/${group.body.id}/messages`)).status).toBe(404);
    expect((await ivo.api.post(`/api/chat/conversations/${group.body.id}/messages`).send({ body: 'hej' })).status).toBe(404);
    expect((await ivo.api.post(`/api/chat/conversations/${group.body.id}/members`).send({ user_id: ola.user.id })).status).toBe(404);
  });

  it('refuses a group without anybody to talk to', async () => {
    const { ala } = await twoAccounts();

    expect((await ala.api.post('/api/chat/conversations/group').send({ member_ids: [] })).status).toBe(400);
    // Oneself is not a conversation partner.
    expect(
      (await ala.api.post('/api/chat/conversations/group').send({ member_ids: [ala.user.id] })).status,
    ).toBe(400);
  });
});

describe('znak na ikonie czatu', () => {
  it('counts what waits across every conversation', async () => {
    const { ala, ola } = await twoAccounts();
    expect((await ola.api.get('/api/chat/unread')).body).toEqual({ total: 0 });

    const conv = await thread(ala.api, ola.user.id);
    await say(ala.api, conv.id, 'hej');
    await say(ala.api, conv.id, 'hej dwa');
    expect((await ola.api.get('/api/chat/unread')).body.total).toBe(2);

    // Reading the thread clears it, and what one wrote oneself never waited.
    await ola.api.get(`/api/chat/conversations/${conv.id}/messages`);
    expect((await ola.api.get('/api/chat/unread')).body.total).toBe(0);

    await say(ola.api, conv.id, 'słucham');
    expect((await ola.api.get('/api/chat/unread')).body.total).toBe(0);
    expect((await ala.api.get('/api/chat/unread')).body.total).toBe(1);
  });

  it('does not count a message that was deleted before it was read', async () => {
    const { ala, ola } = await twoAccounts();
    const conv = await thread(ala.api, ola.user.id);
    const sent = await say(ala.api, conv.id, 'kasuję to zanim przeczytasz');

    await ala.api.delete(`/api/chat/messages/${sent.body.id}`);

    expect((await ola.api.get('/api/chat/unread')).body.total).toBe(0);
    expect((await ola.api.get('/api/chat/conversations')).body.items[0]).toMatchObject({
      unread: 0,
      last_deleted: true,
    });
  });
});
