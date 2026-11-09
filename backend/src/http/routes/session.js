import { Router } from 'express';
import { NotepadSessionSchema, parseOrThrow } from '@note/shared';
import { getSession, putSession } from '../../repos/session.js';

/** Persisted notepad tabs — one set per account (the shell restores them on the next visit). */
export function sessionRouter(db) {
  const router = Router();

  router.get('/notepad', (req, res) => {
    res.json(getSession(db, req.userId));
  });

  router.put('/notepad', (req, res) => {
    const session = parseOrThrow(NotepadSessionSchema, req.body, 'validation_error');
    res.json(putSession(db, req.userId, session));
  });

  return router;
}
