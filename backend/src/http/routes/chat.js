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
  MESSAGE_EDIT_MINUTES,
  ConversationCreateSchema,
  ConversationGroupCreateSchema,
  ConversationMemberSchema,
  MessageCreateSchema,
  MessagePatchSchema,
  parseOrThrow,
} from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import {
  addToGroup,
  chatPeers,
  createGroup,
  deleteMessage,
  editMessage,
  getConversation,
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

/** @param {import('better-sqlite3').Database} db */
export function chatRouter(db) {
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

  router.post('/conversations/:id/messages', (req, res) => {
    const input = parseOrThrow(MessageCreateSchema, req.body, 'validation_error');
    const result = sendMessage(db, req.userId, idOf(req.params.id, 'rozmowa'), input);
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
    refusal(deleteMessage(db, req.userId, idOf(req.params.id, 'wiadomość')));
    res.status(204).end();
  });

  return router;
}
