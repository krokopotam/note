import { Router } from 'express';
import {
  NoteCreateSchema,
  NotePatchSchema,
  parseOrThrow,
} from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import { createNote, deleteNote, getNote, listNotes, updateNote } from '../../repos/notes.js';
import { parseListQuery } from '../middleware.js';

/** @param {import('better-sqlite3').Database} db */
export function notesRouter(db) {
  const router = Router();

  const idOf = (raw) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) {
      throw new HttpError(400, 'invalid_id', `invalid note id: ${raw}`);
    }
    return id;
  };

  router.get('/', (req, res) => {
    res.json(listNotes(db, req.userId, parseListQuery(req.query)));
  });

  router.post('/', (req, res) => {
    const input = parseOrThrow(NoteCreateSchema, req.body, 'validation_error');
    res.status(201).json(createNote(db, req.userId, input));
  });

  router.get('/:id', (req, res) => {
    const note = getNote(db, req.userId, idOf(req.params.id));
    if (!note) throw new HttpError(404, 'not_found', 'note does not exist');
    res.json(note);
  });

  router.patch('/:id', (req, res) => {
    const id = idOf(req.params.id);
    const patch = parseOrThrow(NotePatchSchema, req.body, 'validation_error');
    const note = updateNote(db, req.userId, id, patch);
    if (!note) throw new HttpError(404, 'not_found', 'note does not exist');
    res.json(note);
  });

  router.delete('/:id', (req, res) => {
    if (!deleteNote(db, req.userId, idOf(req.params.id))) {
      throw new HttpError(404, 'not_found', 'note does not exist');
    }
    res.status(204).end();
  });

  return router;
}
