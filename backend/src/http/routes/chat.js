/**
 * Chat API: conversations (one-on-one or with several people), messages, editing
 * inside its five minutes.
 *
 * No websockets: the window asks for what changed every few seconds and the desktop
 * asks, more slowly, whether anything arrived at all. One process, one port, no
 * state to keep between requests — which is also what makes the whole thing
 * restartable at any moment.
 */
import { Router } from 'express';
import {
  CHAT_ATTACHMENT_MAX_MB,
  MESSAGE_EDIT_MINUTES,
  ConversationCreateSchema,
  ConversationGroupCreateSchema,
  ConversationMemberSchema,
  MessageCreateSchema,
  MessagePatchSchema,
  parseOrThrow,
} from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import { imageMime } from '../../domain/media.js';
import { createAttachment, getAttachment, storeFolder } from '../../repos/attachments.js';
import {
  addToGroup,
  chatPeers,
  createGroup,
  deleteMessage,
  editMessage,
  getConversation,
  isMemberOf,
  listConversations,
  listMessages,
  sendMessage,
  startConversation,
  unreadTotal,
} from '../../repos/chat.js';

/** Everything a client can be told about a refused write, in human Polish. */
const REFUSAL = {
  not_found: () => new HttpError(404, 'not_found', 'rozmowa nie istnieje'),
  conversation: () => new HttpError(404, 'not_found', 'rozmowa nie istnieje'),
  no_user: () => new HttpError(404, 'not_found', 'konto nie istnieje'),
  attachment: () =>
    new HttpError(400, 'invalid_attachment', 'zdjęcie nie należy do ciebie ani do tej rozmowy'),
  gone: () => new HttpError(410, 'message_gone', 'wiadomość została usunięta'),
  not_author: () => new HttpError(403, 'not_author', 'możesz zmieniać tylko własne wiadomości'),
  direct: () =>
    new HttpError(409, 'direct_conversation', 'rozmowa dwie-osoby ma swój wątek; założ grupę'),
  window_closed: () =>
    new HttpError(403, 'edit_window_closed', `wiadomość można zmieniać do ${MESSAGE_EDIT_MINUTES} minut`),
};

const refusal = (result) => {
  if (!result || !result.error) return null;
  throw (REFUSAL[result.error] ?? REFUSAL.not_found)();
};

const tooLarge = () => new HttpError(413, 'file_too_large', 'zdjęcie jest za duże');

/** Name worth showing under a picture — never a path, never a disk name. */
function displayName(raw) {
  const base = String(raw ?? '').split(/[\\/]+/).pop().trim();
  return (base || 'zdjęcie').slice(0, 120);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{store?: ReturnType<typeof import('../../files/store.js').createFileStore>,
 *   maxAttachmentBytes?: number}} options
 */
export function chatRouter(db, { store = null, maxAttachmentBytes = CHAT_ATTACHMENT_MAX_MB * 1024 * 1024 } = {}) {
  const router = Router();

  const idOf = (raw, label = 'id') => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'invalid_id', `${label}: ${raw}`);
    return id;
  };

  /** A moment in time a client already has. Sent back by the previous poll. */
  const sinceOf = (raw) => {
    if (raw === undefined) return null;
    const stamp = String(raw);
    if (Number.isNaN(Date.parse(stamp))) {
      throw new HttpError(400, 'invalid_since', `since: ${raw}`);
    }
    return stamp;
  };

  router.get('/people', (req, res) => {
    res.json({ items: chatPeers(db, req.userId) });
  });

  /** For the badge on the chat icon: anything waiting, without opening a window. */
  router.get('/unread', (req, res) => {
    res.json(unreadTotal(db, req.userId));
  });

  router.get('/conversations', (req, res) => {
    res.json(listConversations(db, req.userId));
  });

  /** Find the thread with this person or open it — calling it twice changes nothing. */
  router.post('/conversations', (req, res) => {
    const { user_id: peerId } = parseOrThrow(ConversationCreateSchema, req.body, 'validation_error');
    res.json(startConversation(db, req.userId, peerId));
  });

  /** A conversation with several people; two people here is still a group. */
  router.post('/conversations/group', (req, res) => {
    const input = parseOrThrow(ConversationGroupCreateSchema, req.body, 'validation_error');
    res.status(201).json(createGroup(db, req.userId, { title: input.title, memberIds: input.member_ids }));
  });

  router.get('/conversations/:id', (req, res) => {
    const conversation = getConversation(db, req.userId, idOf(req.params.id, 'rozmowa'));
    if (!conversation) throw REFUSAL.not_found();
    res.json(conversation);
  });

  /** Invite somebody — groups only, and only from inside the group. */
  router.post('/conversations/:id/members', (req, res) => {
    const { user_id: peerId } = parseOrThrow(ConversationMemberSchema, req.body, 'validation_error');
    const result = addToGroup(db, req.userId, idOf(req.params.id, 'rozmowa'), peerId);
    refusal(result);
    res.json(result.conversation);
  });

  /**
   * `?since=<watermark>` brings everything that happened since that moment: new
   * messages, corrections and deletions. Without it, the whole thread.
   */
  router.get('/conversations/:id/messages', (req, res) => {
    const page = listMessages(db, req.userId, idOf(req.params.id, 'rozmowa'), {
      since: sinceOf(req.query.since),
    });
    if (!page) throw REFUSAL.not_found();
    res.json(page);
  });

  /**
   * A picture waiting to be sent: the bytes are piped straight to disk and the
   * size is counted chunk by chunk, so an eight-megabyte photo costs disk and not
   * RAM. Permission (membership) is decided before anything is written.
   */
  router.post('/conversations/:id/attachments', (req, res) => {
    const conversationId = idOf(req.params.id, 'rozmowa');
    if (!store) throw new HttpError(500, 'storage_missing', 'brak miejsca na pliki');
    if (!isMemberOf(db, req.userId, conversationId)) throw REFUSAL.conversation();

    const name = displayName(req.query.name);
    const picture = imageMime(name, req.get('content-type'));
    if (!picture) {
      throw new HttpError(415, 'not_an_image', 'w czacie trzymamy tylko obrazki');
    }

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxAttachmentBytes) throw tooLarge();

    const folder = storeFolder(conversationId);
    const reply = (status, code, message) => {
      if (!res.headersSent) res.status(status).json({ error: { code, message } });
    };

    const target = store.createWrite(folder, name);
    let received = 0;
    let settled = false;

    /** One answer per request, and never a half-written file left behind. */
    const fail = (status, code, message) => {
      if (settled) return;
      settled = true;
      store.remove(folder, target.storedName);
      req.destroy();
      reply(status, code, message);
    };

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxAttachmentBytes) fail(413, 'file_too_large', `zdjęcie może mieć do ${CHAT_ATTACHMENT_MAX_MB} MB`);
    });
    req.on('aborted', () => fail(400, 'upload_interrupted', 'wysyłanie przerwane'));
    req.on('error', () => fail(400, 'upload_interrupted', 'wysyłanie przerwane'));
    target.stream.on('error', () => fail(500, 'write_failed', 'nie udało się zapisać zdjęcia'));

    target.stream.on('close', () => {
      if (settled) return;
      settled = true;

      if (received === 0) {
        store.remove(folder, target.storedName);
        return reply(400, 'empty_upload', 'zdjęcie jest puste — nic nie przyszło');
      }

      const size = store.sizeOf(folder, target.storedName) ?? received;
      const row = createAttachment(db, req.userId, conversationId, {
        storedName: target.storedName,
        fileName: name,
        mime: picture.mime,
        size,
      });

      res.status(201).json({
        id: row.id,
        file_name: row.file_name,
        mime: row.mime,
        size: row.size,
        created_at: row.created_at,
      });
    });

    req.pipe(target.stream);
  });

  /** A picture of a message — only for people inside that conversation. */
  router.get('/attachments/:id', (req, res) => {
    const row = getAttachment(db, req.userId, idOf(req.params.id, 'zdjęcie'));
    if (!row) throw REFUSAL.not_found();

    const stream = store.read(storeFolder(row.conversation_id), row.stored_name);
    if (!stream) throw new HttpError(410, 'file_missing', 'zdjęcia nie ma już na dysku');

    res.setHeader('Content-Type', row.mime);
    res.setHeader('Content-Length', String(row.size));
    // Inline, so an <img> shows it; the name is only what a "save as" would offer.
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });

  router.post('/conversations/:id/messages', (req, res) => {
    const input = parseOrThrow(MessageCreateSchema, req.body, 'validation_error');
    const result = sendMessage(db, req.userId, idOf(req.params.id, 'rozmowa'), {
      body: input.body,
      attachmentIds: input.attachment_ids,
    });
    refusal(result);
    res.status(201).json(result.message);
  });

  router.patch('/messages/:id', (req, res) => {
    const input = parseOrThrow(MessagePatchSchema, req.body, 'validation_error');
    const result = editMessage(db, req.userId, idOf(req.params.id, 'wiadomość'), input);
    refusal(result);
    res.json(result.message);
  });

  router.delete('/messages/:id', (req, res) => {
    const result = deleteMessage(db, req.userId, idOf(req.params.id, 'wiadomość'));
    refusal(result);
    // The rows are gone; the bytes of its pictures go now too.
    for (const file of result.files ?? []) {
      store?.remove(storeFolder(file.conversation_id), file.stored_name);
    }
    res.status(204).end();
  });

  return router;
}
