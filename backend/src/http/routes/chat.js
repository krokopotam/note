/**
 * Chat API: conversations, messages, editing inside its five minutes.
 *
 * No websockets: the window asks for new messages every few seconds. One process,
 * one port, no state to keep between requests — which is also what makes the whole
 * thing restartable at any moment.
 */
import { Router } from 'express';
import { MESSAGE_EDIT_MINUTES, ConversationCreateSchema, MessageCreateSchema, MessagePatchSchema, parseOrThrow } from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import {
  chatPeers,
  deleteMessage,
  editMessage,
  getConversation,
  listConversations,
  listMessages,
  sendMessage,
  startConversation,
} from '../../repos/chat.js';

/** Everything a client can be told about a refused write, in human Polish. */
const REFUSAL = {
  not_found: () => new HttpError(404, 'not_found', 'rozmowa nie istnieje'),
  conversation: () => new HttpError(404, 'not_found', 'rozmowa nie istnieje'),
  not_author: () => new HttpError(403, 'not_author', 'możesz zmieniać tylko własne wiadomości'),
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

  router.get('/people', (req, res) => {
    res.json({ items: chatPeers(db, req.userId) });
  });

  router.get('/conversations', (req, res) => {
    res.json(listConversations(db, req.userId));
  });

  /** Find the thread with this person or open it — calling it twice changes nothing. */
  router.post('/conversations', (req, res) => {
    const { user_id: peerId } = parseOrThrow(ConversationCreateSchema, req.body, 'validation_error');
    res.json(startConversation(db, req.userId, peerId));
  });

  router.get('/conversations/:id', (req, res) => {
    const conversation = getConversation(db, req.userId, idOf(req.params.id, 'rozmowa'));
    if (!conversation) throw REFUSAL.not_found();
    res.json(conversation);
  });

  /** `?after=<message id>` brings only what is new — that is what polling sends. */
  router.get('/conversations/:id/messages', (req, res) => {
    const after = req.query.after === undefined ? null : idOf(req.query.after, 'after');
    const page = listMessages(db, req.userId, idOf(req.params.id, 'rozmowa'), { after });
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
