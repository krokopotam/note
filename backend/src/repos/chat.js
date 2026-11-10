/**
 * Conversations and messages.
 *
 * Two rules run through the whole file:
 *
 * 1. Everything is reached through membership. If you are not in the
 *    conversation, it does not exist for you — 404, the same way the rest of the
 *    API refuses to confirm that something of somebody else's is there.
 * 2. Whether a message may still be edited is decided here, by the server, and
 *    handed to the client as `can_edit`. The interface draws what it is told;
 *    it never decides for itself.
 */
import { HttpError } from '../domain/errors.js';
import { editableUntil, isEditable, pairKey } from '../domain/chat.js';
import { assertUserId } from '../domain/scope.js';

const nowIso = () => new Date().toISOString();

/** How many messages one page of a thread carries. */
const PAGE = 200;

const PEER_JOIN = `
  LEFT JOIN conversation_members theirs ON theirs.conversation_id = c.id AND theirs.user_id <> @user
  LEFT JOIN users peer ON peer.id = theirs.user_id`;

const LAST_JOIN = `
  LEFT JOIN messages last ON last.id =
    (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1)`;

/** One conversation as this user sees it: peer, last words, unread count. */
function shapeConversation(row, userId) {
  return {
    id: row.id,
    peer: row.peer_id === null ? null : { id: row.peer_id, username: row.peer_name },
    last_body: row.last_body,
    last_at: row.last_at,
    last_from_me: row.last_author_id === userId,
    unread: row.unread,
    created_at: row.created_at,
  };
}

/** Sidebar: every conversation this user is in, most recent activity first. */
export function listConversations(db, userId) {
  const me = assertUserId(userId);
  const rows = db
    .prepare(
      `SELECT c.id, c.created_at,
              peer.id AS peer_id, peer.username AS peer_name,
              last.body AS last_body, last.created_at AS last_at, last.author_id AS last_author_id,
              (SELECT COUNT(*) FROM messages unread
                WHERE unread.conversation_id = c.id
                  AND unread.created_at > mine.last_read_at
                  AND COALESCE(unread.author_id, -1) <> @user) AS unread
         FROM conversations c
         JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = @user
         ${PEER_JOIN}
         ${LAST_JOIN}
        ORDER BY COALESCE(last.created_at, c.created_at) DESC`,
    )
    .all({ user: me });

  return { items: rows.map((row) => shapeConversation(row, me)) };
}

/** One conversation, or null when this user is not a member of it. */
export function getConversation(db, userId, id) {
  const me = assertUserId(userId);
  const row = db
    .prepare(
      `SELECT c.id, c.created_at,
              peer.id AS peer_id, peer.username AS peer_name,
              last.body AS last_body, last.created_at AS last_at, last.author_id AS last_author_id,
              (SELECT COUNT(*) FROM messages unread
                WHERE unread.conversation_id = c.id
                  AND unread.created_at > mine.last_read_at
                  AND COALESCE(unread.author_id, -1) <> @user) AS unread
         FROM conversations c
         JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = @user
         ${PEER_JOIN}
         ${LAST_JOIN}
        WHERE c.id = @id`,
    )
    .get({ user: me, id });

  return row ? shapeConversation(row, me) : null;
}

/** Everyone this account could start a conversation with (nobody but accounts). */
export function chatPeers(db, userId) {
  const me = assertUserId(userId);
  return db
    .prepare('SELECT id, username FROM users WHERE id <> ? ORDER BY username COLLATE NOCASE ASC')
    .all(me);
}

/**
 * The thread with this person, existing or newly opened.
 *
 * `pair_key` is unique, so two accounts clicking at the same moment cannot end up
 * with two parallel conversations: the loser of the race reads what the winner
 * inserted.
 */
export function startConversation(db, userId, peerId, now = nowIso()) {
  const me = assertUserId(userId);
  if (peerId === me) throw new HttpError(400, 'self_chat', 'nie można pisać sam do siebie');
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(peerId)) {
    throw new HttpError(404, 'not_found', `konto ${peerId} nie istnieje`);
  }

  const key = pairKey(me, peerId);
  const existing = db.prepare('SELECT id FROM conversations WHERE pair_key = ?').get(key);
  if (existing) return getConversation(db, me, existing.id);

  try {
    db.transaction(() => {
      const { lastInsertRowid: conversationId } = db
        .prepare('INSERT INTO conversations (pair_key, created_at) VALUES (?, ?)')
        .run(key, now);
      const add = db.prepare(
        `INSERT INTO conversation_members (conversation_id, user_id, last_read_at, created_at)
         VALUES (@conversation, @user, @read, @created)`,
      );
      for (const member of [me, peerId]) {
        add.run({ conversation: conversationId, user: member, read: now, created: now });
      }
      return conversationId;
    })();
  } catch (error) {
    // Lost the race: somebody else opened exactly this pair a moment ago.
    if (!String(error.message).includes('conversations.pair_key')) throw error;
  }

  return getConversation(db, me, db.prepare('SELECT id FROM conversations WHERE pair_key = ?').get(key).id);
}

function isMember(db, userId, conversationId) {
  return Boolean(
    db
      .prepare('SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
      .get(conversationId, userId),
  );
}

function shapeMessage(row, userId, now) {
  const mine = row.author_id === userId;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    author_id: row.author_id,
    author_name: row.author_name ?? '—',
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    editable_until: mine ? editableUntil(row.created_at) : null,
    can_edit: isEditable(row.author_id, userId, row.created_at, now),
  };
}

/**
 * Messages oldest first, optionally only those newer than `after` (that is how the
 * window polls without resending the whole thread).
 *
 * Reading is also what marks the conversation read — a client that has the thread
 * on screen has read it, and asking it to say so separately would only add calls
 * that can fail.
 */
export function listMessages(db, userId, conversationId, { after } = {}, now = new Date()) {
  const me = assertUserId(userId);
  if (!isMember(db, me, conversationId)) return null;

  const rows = db
    .prepare(
      `SELECT m.*, u.username AS author_name
         FROM messages m LEFT JOIN users u ON u.id = m.author_id
        WHERE m.conversation_id = @conversation
          AND (@after IS NULL OR m.id > @after)
        ORDER BY m.id ASC
        LIMIT ${PAGE}`,
    )
    .all({ conversation: conversationId, after: after ?? null });

  db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
    now.toISOString(),
    conversationId,
    me,
  );

  return { items: rows.map((row) => shapeMessage(row, me, now)) };
}

/** Write one message. Membership checked before anything lands in the table. */
export function sendMessage(db, userId, conversationId, { body }, now = new Date()) {
  const me = assertUserId(userId);
  if (!isMember(db, me, conversationId)) return { error: 'conversation' };

  const stamp = now.toISOString();
  const info = db
    .prepare(
      `INSERT INTO messages (conversation_id, author_id, body, created_at)
       VALUES (@conversation, @author, @body, @created)`,
    )
    .run({ conversation: conversationId, author: me, body, created: stamp });

  // What you just wrote you have certainly read.
  db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
    stamp,
    conversationId,
    me,
  );

  const row = db
    .prepare('SELECT m.*, u.username AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.id = ?')
    .get(info.lastInsertRowid);
  return { message: shapeMessage(row, me, now) };
}

/**
 * Change a message — while the window is open.
 *
 * The window is measured from `created_at`, so the second edit does not get a
 * fresh five minutes, and the answer distinguishes "not yours" from "too late":
 * the person asking deserves to know which of the two happened.
 */
export function editMessage(db, userId, messageId, { body }, now = new Date()) {
  const me = assertUserId(userId);
  const row = messageWithMembership(db, me, messageId);
  if (!row) return { error: 'not_found' };
  if (row.author_id !== me) return { error: 'not_author' };
  if (!isEditable(row.author_id, me, row.created_at, now)) return { error: 'window_closed' };

  db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?').run(
    body,
    now.toISOString(),
    messageId,
  );

  const updated = db
    .prepare('SELECT m.*, u.username AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.id = ?')
    .get(messageId);
  return { message: shapeMessage(updated, me, now) };
}

/** Deleting stays possible without a time limit — a wrong message should not be forever. */
export function deleteMessage(db, userId, messageId) {
  const me = assertUserId(userId);
  const row = messageWithMembership(db, me, messageId);
  if (!row) return { error: 'not_found' };
  if (row.author_id !== me) return { error: 'not_author' };

  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  return { ok: true };
}

/** A message only when the asking user is in its conversation. */
function messageWithMembership(db, userId, messageId) {
  return db
    .prepare(
      `SELECT m.* FROM messages m
         JOIN conversation_members mine ON mine.conversation_id = m.conversation_id AND mine.user_id = @user
        WHERE m.id = @id`,
    )
    .get({ user: userId, id: messageId });
}

/** Ids of conversations an account takes part in (for the CLI: which rows to move). */
export function membershipIdsOf(db, userId) {
  return db
    .prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?')
    .all(userId)
    .map((row) => row.conversation_id);
}
