import { Router } from 'express';
import {
  NoteCreateSchema,
  NotePatchSchema,
  parseOrThrow,
} from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  listRevisions,
  restoreRevision,
  updateNote,
} from '../../repos/notes.js';
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
    res.json(listNotes(db, parseListQuery(req.query)));
  });

  router.post('/', (req, res) => {
    const input = parseOrThrow(NoteCreateSchema, req.body, 'validation_error');
    res.status(201).json(createNote(db, input));
  });

  router.get('/:id', (req, res) => {
    const note = getNote(db, idOf(req.params.id));
    if (!note) throw new HttpError(404, 'not_found', 'note does not exist');
    res.json(note);
  });

  router.patch('/:id', (req, res) => {
    const id = idOf(req.params.id);
    const patch = parseOrThrow(NotePatchSchema, req.body, 'validation_error');
    const note = updateNote(db, id, patch);
    if (!note) throw new HttpError(404, 'not_found', 'note does not exist');
    res.json(note);
  });

  router.delete('/:id', (req, res) => {
    if (!deleteNote(db, idOf(req.params.id))) {
      throw new HttpError(404, 'not_found', 'note does not exist');
    }
    res.status(204).end();
  });

  router.get('/:id/revisions', (req, res) => {
    const revisions = listRevisions(db, idOf(req.params.id));
    if (revisions === null) throw new HttpError(404, 'not_found', 'note does not exist');
    res.json(revisions);
  });

  router.post('/:id/revisions/:revisionId/restore', (req, res) => {
    const note = restoreRevision(db, idOf(req.params.id), idOf(req.params.revisionId));
    if (!note) throw new HttpError(404, 'not_found', 'note does not exist');
    res.json(note);
  });

  return router;
}
