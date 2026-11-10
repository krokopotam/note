/**
 * Conversations and messages.
 *
 * Three rules run through the whole file:
 *
 * 1. Everything is reached through membership. If you are not in the
 *    conversation, it does not exist for you — 404, the same way the rest of the
 *    API refuses to confirm that something of somebody else's is there.
 * 2. Whether a message may still be edited is decided here, by the server, and
 *    handed to the client as `can_edit`. The interface draws what it is told;
 *    it never decides for itself.
 * 3. Everything a window can learn happens through `listMessages`: it answers with
 *    what was written, corrected *or deleted* since the moment the window last saw
 *    it. A state that only travels one way is not a conversation.
 */
import { HttpError } from '../domain/errors.js';
import { editableUntil, isEditable, pairKey } from '../domain/chat.js';
import { assertUserId } from '../domain/scope.js';
import { attachmentsForMessages, attachToMessage, detachFromMessage } from './attachments.js';

const nowIso = () => new Date().toISOString();

/** How many messages one page of a thread carries. */
const PAGE = 200;

/** How many names a conversation may show before it says "+N". */
const NAMED_MEMBERS = 4;

/**
 * One conversation as this user sees it, in SQL, without joins that could
 * multiply rows: a group has more than one "other", and a list row that appears
 * twice is a bug waiting to be found in the sidebar.
 */
const CONVERSATION_SELECT = `
  SELECT c.id, c.created_at, c.pair_key, c.title,
         (SELECT u.id FROM conversation_members m
            JOIN users u ON u.id = m.user_id
           WHERE m.conversation_id = c.id AND m.user_id <> @user
           ORDER BY m.user_id LIMIT 1) AS peer_id,
         (SELECT u.username FROM conversation_members m
            JOIN users u ON u.id = m.user_id
           WHERE m.conversation_id = c.id AND m.user_id <> @user
           ORDER BY m.user_id LIMIT 1) AS peer_name,
         (SELECT group_concat(name, ', ') FROM (
            SELECT u.username AS name FROM conversation_members m
              JOIN users u ON u.id = m.user_id
             WHERE m.conversation_id = c.id AND m.user_id <> @user
             ORDER BY u.username COLLATE NOCASE LIMIT ${NAMED_MEMBERS}
         )) AS others,
         (SELECT COUNT(*) FROM conversation_members m
           WHERE m.conversation_id = c.id AND m.user_id <> @user) AS others_count,
         last.body AS last_body,
         last.created_at AS last_at,
         last.author_id AS last_author_id,
         last.deleted_at AS last_deleted_at,
         (SELECT COUNT(*) FROM message_attachments media
           WHERE media.message_id = last.id) > 0 AS last_has_attachment,
         (SELECT COUNT(*) FROM messages unread
           WHERE unread.conversation_id = c.id
             AND unread.created_at > mine.last_read_at
             AND unread.deleted_at IS NULL
             AND COALESCE(unread.author_id, -1) <> @user) AS unread
    FROM conversations c
    JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = @user
    LEFT JOIN messages last ON last.id =
      (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1)`;

/** Titles are whatever the people agreed on; a bare group shows who is in it. */
function conversationTitle(row) {
  const given = (row.title ?? '').trim();
  if (given) return given;
  if (row.pair_key !== null) return row.peer_name ?? 'konto usunięte';

  const names = (row.others ?? '').split(', ').filter(Boolean);
  const extra = Math.max(0, (row.others_count ?? 0) - names.length);
  if (extra > 0) return [...names, `+${extra}`].join(', ');
  return names.length > 0 ? names.join(', ') : 'rozmowa';
}

function shapeConversation(row, userId) {
  const group = row.pair_key === null;
  return {
    id: row.id,
    peer: group || row.peer_id === null ? null : { id: row.peer_id, username: row.peer_name },
    title: conversationTitle(row),
    is_group: group,
    last_body: row.last_body,
    last_at: row.last_at,
    last_from_me: row.last_author_id === userId,
    last_deleted: row.last_deleted_at !== null,
    last_has_attachment: row.last_has_attachment === 1,
    unread: row.unread,
    created_at: row.created_at,
  };
}

/** Sidebar: every conversation this user is in, most recent activity first. */
export function listConversations(db, userId) {
  const me = assertUserId(userId);
  const rows = db
    .prepare(`${CONVERSATION_SELECT} ORDER BY COALESCE(last.created_at, c.created_at) DESC`)
    .all({ user: me });

  return { items: rows.map((row) => shapeConversation(row, me)) };
}

/** One conversation, or null when this user is not a member of it. */
export function getConversation(db, userId, id) {
  const me = assertUserId(userId);
  const row = db.prepare(`${CONVERSATION_SELECT} WHERE c.id = @id`).get({ user: me, id });
  if (!row) return null;

  return { ...shapeConversation(row, me), members: conversationMembers(db, id) };
}

/** Who is in the conversation — everybody in it sees the same list. */
export function conversationMembers(db, conversationId) {
  return db
    .prepare(
      `SELECT u.id, u.username FROM conversation_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = ?
        ORDER BY u.username COLLATE NOCASE ASC`,
    )
    .all(conversationId);
}

/** Everyone this account could start a conversation with (nobody but accounts). */
export function chatPeers(db, userId) {
  const me = assertUserId(userId);
  return db
    .prepare('SELECT id, username FROM users WHERE id <> ? ORDER BY username COLLATE NOCASE ASC')
    .all(me);
}

/**
 * Unread messages across every conversation — what the desktop lights up the chat
 * icon with, without opening a window.
 */
export function unreadTotal(db, userId) {
  const me = assertUserId(userId);
  const { total } = db
    .prepare(
      `SELECT COALESCE(SUM(counts.n), 0) AS total FROM (
         SELECT (SELECT COUNT(*) FROM messages m
                  WHERE m.conversation_id = mine.conversation_id
                    AND m.created_at > mine.last_read_at
                    AND m.deleted_at IS NULL
                    AND COALESCE(m.author_id, -1) <> @user) AS n
           FROM conversation_members mine
          WHERE mine.user_id = @user
       ) counts`,
    )
    .get({ user: me });

  return { total };
}

/** Members to write into a new conversation: the author plus the people asked for. */
function checkedMembers(db, me, memberIds) {
  const wanted = [...new Set(memberIds)].filter((id) => id !== me);
  if (wanted.length === 0) {
    throw new HttpError(400, 'no_members', 'wybierz przynajmniej jedną osobę');
  }

  const placeholders = wanted.map(() => '?').join(', ');
  const found = db
    .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
    .all(...wanted);
  if (found.length !== wanted.length) {
    throw new HttpError(404, 'not_found', 'któreś z kont już nie istnieje');
  }

  return [me, ...wanted];
}

function addMemberRow(db, conversationId, user, now) {
  db.prepare(
    `INSERT INTO conversation_members (conversation_id, user_id, last_read_at, created_at)
     VALUES (@conversation, @user, @read, @created)`,
  ).run({ conversation: conversationId, user, read: now, created: now });
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
      for (const member of [me, peerId]) addMemberRow(db, conversationId, member, now);
    })();
  } catch (error) {
    // Lost the race: somebody else opened exactly this pair a moment ago.
    if (!String(error.message).includes('conversations.pair_key')) throw error;
  }

  const { id } = db.prepare('SELECT id FROM conversations WHERE pair_key = ?').get(key);
  return getConversation(db, me, id);
}

/**
 * A conversation with several people.
 *
 * It has no `pair_key` on purpose: the unique pair stays a 1:1 rule, while a group
 * is whatever its members say it is — two people in a group is fine, and a third
 * can join later.
 */
export function createGroup(db, userId, { title = '', memberIds }, now = nowIso()) {
  const me = assertUserId(userId);
  const members = checkedMembers(db, me, memberIds);

  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO conversations (pair_key, title, created_at) VALUES (NULL, ?, ?)')
      .run(title.trim() || null, now);
    for (const member of members) addMemberRow(db, lastInsertRowid, member, now);
    return lastInsertRowid;
  })();

  return getConversation(db, me, id);
}

/**
 * Invite somebody into a group.
 *
 * Only groups grow: a 1:1 thread carries a `pair_key`, and a third person inside it
 * would stop being that pair while the key still claimed it was.
 */
export function addToGroup(db, userId, conversationId, peerId, now = nowIso()) {
  const me = assertUserId(userId);
  const conversation = db
    .prepare('SELECT c.pair_key FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ? WHERE c.id = ?')
    .get(me, conversationId);
  if (!conversation) return { error: 'not_found' };
  if (conversation.pair_key !== null) return { error: 'direct' };

  if (isMember(db, peerId, conversationId)) return { conversation: getConversation(db, me, conversationId) };
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(peerId)) {
    return { error: 'no_user' };
  }

  addMemberRow(db, conversationId, peerId, now);
  return { conversation: getConversation(db, me, conversationId) };
}

/** Membership without reading the whole conversation — asked before an upload starts. */
export function isMemberOf(db, userId, conversationId) {
  return isMember(db, assertUserId(userId), conversationId);
}

function isMember(db, userId, conversationId) {
  return Boolean(
    db
      .prepare('SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
      .get(conversationId, userId),
  );
}

function shapeMessage(row, userId, now, attachments = []) {
  const mine = row.author_id === userId;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    author_id: row.author_id,
    author_name: row.author_name ?? '—',
    body: row.deleted_at === null ? row.body : '',
    created_at: row.created_at,
    edited_at: row.edited_at,
    /** Kto to napisał — okno czatu rysuje bańkę po swojej stronie tylko dlatego, że serwer to mówi. */
    from_me: mine,
    editable_until: mine && row.deleted_at === null ? editableUntil(row.created_at) : null,
    can_edit: row.deleted_at === null && isEditable(row.author_id, userId, row.created_at, now),
    /** The message is gone; the fact that something was here is not. */
    deleted: row.deleted_at !== null,
    attachments,
  };
}

/** One query for the whole page, then the pictures are folded into their lines. */
function shapePage(db, rows, userId, now) {
  const grouped = attachmentsForMessages(db, rows.map((row) => row.id));
  return rows.map((row) => shapeMessage(row, userId, now, grouped[row.id] ?? []));
}

const MESSAGE_ROW = `SELECT m.*, u.username AS author_name FROM messages m
  LEFT JOIN users u ON u.id = m.author_id WHERE m.id = ?`;

/**
 * Messages oldest first, and — this is the part that matters — everything that
 * *changed* since the moment the window last saw the thread: new lines, corrected
 * lines and lines that were deleted. A poll that only carried new ids would leave
 * the other person reading a message that no longer exists.
 *
 * The answer carries the `watermark` to send back next time. It is the newest
 * timestamp actually handed over, never "server now", so a message written while
 * the query ran cannot fall between two polls.
 *
 * Reading is also what marks the conversation read — a client that has the thread
 * on screen has read it, and asking it to say so separately would only add calls
 * that can fail.
 */
export function listMessages(db, userId, conversationId, { since } = {}, now = new Date()) {
  const me = assertUserId(userId);
  if (!isMember(db, me, conversationId)) return null;

  const stamp = now.toISOString();
  const from = since ?? null;
  const rows = db
    .prepare(
      `SELECT m.*, u.username AS author_name
         FROM messages m LEFT JOIN users u ON u.id = m.author_id
        WHERE m.conversation_id = @conversation
          AND (@since IS NULL
               OR m.created_at >= @since
               OR COALESCE(m.edited_at, '') >= @since
               OR COALESCE(m.deleted_at, '') >= @since)
        ORDER BY m.id ASC
        LIMIT ${PAGE}`,
    )
    .all({ conversation: conversationId, since: from });

  db.prepare(
    'UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
  ).run(stamp, conversationId, me);

  const seen = rows.reduce(
    (latest, row) =>
      [row.created_at, row.edited_at, row.deleted_at].reduce((a, b) => (b && b > a ? b : a), latest),
    from ?? '',
  );

  return { items: shapePage(db, rows, me, now), watermark: seen || stamp };
}

/**
 * Write one message: words, pictures uploaded a moment ago, or both.
 *
 * Membership is checked before anything lands, and the pictures are claimed in the
 * same transaction — if an id turns out not to be this person's own unbound upload
 * in this conversation, the message is not written either.
 */
export function sendMessage(db, userId, conversationId, { body = '', attachmentIds = [] }, now = new Date()) {
  const me = assertUserId(userId);
  if (!isMember(db, me, conversationId)) return { error: 'conversation' };

  const stamp = now.toISOString();
  const write = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO messages (conversation_id, author_id, body, created_at)
         VALUES (@conversation, @author, @body, @created)`,
      )
      .run({ conversation: conversationId, author: me, body, created: stamp });

    const attachments = attachToMessage(db, me, conversationId, info.lastInsertRowid, attachmentIds, stamp);
    if (attachments === null) throw new AttachmentRefused();

    // What you just wrote you have certainly read.
    db.prepare(
      'UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
    ).run(stamp, conversationId, me);

    return info.lastInsertRowid;
  });

  let id;
  try {
    id = write();
  } catch (error) {
    if (error instanceof AttachmentRefused) return { error: 'attachment' };
    throw error;
  }

  const row = db.prepare(MESSAGE_ROW).get(id);
  return { message: shapeMessage(row, me, now, attachmentsForMessages(db, [id])[id] ?? []) };
}

/** Thrown to roll the transaction back when an attachment id does not check out. */
class AttachmentRefused extends Error {}

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
  if (row.deleted_at !== null) return { error: 'gone' };
  if (!isEditable(row.author_id, me, row.created_at, now)) return { error: 'window_closed' };

  db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?').run(
    body,
    now.toISOString(),
    messageId,
  );

  return { message: shapeMessage(db.prepare(MESSAGE_ROW).get(messageId), me, now) };
}

/**
 * Deleting stays possible without a time limit — a wrong message should not be
 * forever. It leaves a tombstone rather than removing the row: the other person's
 * window has to be told the message is gone, and it cannot learn that from a row
 * that stopped existing.
 */
export function deleteMessage(db, userId, messageId, now = new Date()) {
  const me = assertUserId(userId);
  const row = messageWithMembership(db, me, messageId);
  if (!row) return { error: 'not_found' };
  if (row.author_id !== me) return { error: 'not_author' };
  if (row.deleted_at !== null) return { ok: true };

  db.prepare('UPDATE messages SET body = ?, deleted_at = ? WHERE id = ?').run(
    '',
    now.toISOString(),
    messageId,
  );
  // The pictures of a deleted message go with it — the caller deletes the files.
  return { ok: true, files: detachFromMessage(db, messageId) };
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

/**
 * Threads nobody can reach any more.
 *
 * When the last member is gone the conversation goes too (its messages and
 * pictures follow by cascade): rows that no screen can ever list again are not
 * history, they are litter.
 *
 * @returns {number[]} ids of the conversations that were removed — the caller
 *   deletes their folders on disk, which a repository has no business touching
 */
export function pruneEmptyConversations(db) {
  const orphans = db
    .prepare(
      `SELECT id FROM conversations
        WHERE NOT EXISTS (
          SELECT 1 FROM conversation_members m WHERE m.conversation_id = conversations.id
        )`,
    )
    .all();
  if (orphans.length === 0) return [];

  db.prepare(
    `DELETE FROM conversations
      WHERE NOT EXISTS (
        SELECT 1 FROM conversation_members m WHERE m.conversation_id = conversations.id
      )`,
  ).run();
  return orphans.map((row) => row.id);
}

/** Ids of conversations an account takes part in (for the CLI: which rows to move). */
export function membershipIdsOf(db, userId) {
  return db
    .prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?')
    .all(userId)
    .map((row) => row.conversation_id);
}
