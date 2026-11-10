/**
 * Pictures attached to chat messages.
 *
 * Rows live here, bytes live on disk (in the same store the Files app uses, under
 * `chat/<conversation id>`). The route is the only place that touches both: a
 * repository answers with the rows it removed and the caller deletes the files,
 * so nothing here needs to know that a filesystem exists.
 */
import { assertUserId } from '../domain/scope.js';

const nowIso = () => new Date().toISOString();

/** The disk folder of a conversation's pictures. */
export const storeFolder = (conversationId) => `chat/${conversationId}`;

function shapeAttachment(row) {
  return {
    id: row.id,
    file_name: row.file_name,
    mime: row.mime,
    size: row.size,
    created_at: row.created_at,
  };
}

/**
 * A picture that arrived and is waiting to be sent. It belongs to the conversation
 * it was uploaded into and to the person who uploaded it — nobody else can attach
 * it to a message.
 */
export function createAttachment(db, userId, conversationId, { storedName, fileName, mime, size }, now = nowIso()) {
  const me = assertUserId(userId);
  const info = db
    .prepare(
      `INSERT INTO message_attachments
         (conversation_id, uploader_id, stored_name, file_name, mime, size, message_id, created_at)
       VALUES (@conversation, @uploader, @stored, @name, @mime, @size, NULL, @created)`,
    )
    .run({
      conversation: conversationId,
      uploader: me,
      stored: storedName,
      name: fileName,
      mime,
      size,
      created: now,
    });

  return db.prepare('SELECT * FROM message_attachments WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Bind freshly uploaded pictures to the message that is being written.
 *
 * Only one's own, still unbound uploads inside that very conversation qualify —
 * otherwise a request could attach somebody else's upload, or a picture from a
 * different chat.
 */
export function attachToMessage(db, userId, conversationId, messageId, ids, now = nowIso()) {
  const me = assertUserId(userId);
  if (!ids || ids.length === 0) return [];

  // Every id gets its own named parameter: mixing anonymous and named ones in one
  // statement is how a binding ends up in the wrong column.
  const params = { message: messageId, conversation: conversationId, uploader: me };
  const keys = ids.map((id, index) => {
    params[`id${index}`] = id;
    return `@id${index}`;
  });

  const claim = db
    .prepare(
      `UPDATE message_attachments
          SET message_id = @message
        WHERE id IN (${keys.join(', ')})
          AND conversation_id = @conversation
          AND uploader_id = @uploader
          AND message_id IS NULL`,
    )
    .run(params);

  if (claim.changes !== ids.length) return null;

  return attachmentsForMessages(db, [messageId])[messageId] ?? [];
}

/** Attachments of a set of messages, grouped by message id (one query per page). */
export function attachmentsForMessages(db, messageIds) {
  if (messageIds.length === 0) return {};

  const placeholders = messageIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM message_attachments
        WHERE message_id IN (${placeholders})
        ORDER BY id ASC`,
    )
    .all(...messageIds);

  const grouped = {};
  for (const row of rows) {
    grouped[row.message_id] = [...(grouped[row.message_id] ?? []), shapeAttachment(row)];
  }
  return grouped;
}

/** A picture only when the asking user is in its conversation. */
export function getAttachment(db, userId, id) {
  const me = assertUserId(userId);
  return db
    .prepare(
      `SELECT a.* FROM message_attachments a
         JOIN conversation_members mine ON mine.conversation_id = a.conversation_id AND mine.user_id = @user
        WHERE a.id = @id`,
    )
    .get({ user: me, id });
}

/**
 * Free the pictures of a message that is being deleted.
 *
 * The rows go away; the files are the caller's job (it knows the store). What is
 * returned is enough to delete them.
 */
export function detachFromMessage(db, messageId) {
  const rows = db
    .prepare('SELECT * FROM message_attachments WHERE message_id = ?')
    .all(messageId);
  if (rows.length === 0) return [];

  db.prepare('DELETE FROM message_attachments WHERE message_id = ?').run(messageId);
  return rows;
}

/**
 * Uploads that never became a message: the person picked a picture, then closed
 * the window or the send failed. Older than the cutoff, nothing will claim them.
 *
 * @returns {object[]} the rows that were removed (their files go with them)
 */
export function pruneStaleAttachments(db, olderThanIso) {
  const rows = db
    .prepare(
      `SELECT * FROM message_attachments
        WHERE message_id IS NULL AND created_at < ?
        ORDER BY id ASC`,
    )
    .all(olderThanIso);
  if (rows.length === 0) return [];

  db.prepare(
    `DELETE FROM message_attachments WHERE message_id IS NULL AND created_at < ?`,
  ).run(olderThanIso);
  return rows;
}

/** Every picture inside a conversation (used when the conversation itself goes). */
export function attachmentsOfConversation(db, conversationId) {
  return db.prepare('SELECT * FROM message_attachments WHERE conversation_id = ?').all(conversationId);
}
