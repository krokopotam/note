import { Router } from 'express';
import { PinnedOnlySchema, StickyCreateSchema, StickyPatchSchema, parseOrThrow } from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import {
  createSticky,
  deleteSticky,
  getSticky,
  listStickies,
  updateSticky,
} from '../../repos/stickies.js';
import { parseListQuery } from '../middleware.js';

/** @param {import('better-sqlite3').Database} db */
export function stickiesRouter(db) {
  const router = Router();

  const idOf = (raw) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) {
      throw new HttpError(400, 'invalid_id', `invalid sticky id: ${raw}`);
    }
    return id;
  };

  router.get('/', (req, res) => {
    const query = parseListQuery(req.query);
    const onlyPinned = parseOrThrow(PinnedOnlySchema, req.query.pinned, 'invalid_query') === 'true';
    res.json(listStickies(db, { ...query, onlyPinned }));
  });

  router.post('/', (req, res) => {
    const input = parseOrThrow(StickyCreateSchema, req.body, 'validation_error');
    res.status(201).json(createSticky(db, input));
  });

  router.get('/:id', (req, res) => {
    const sticky = getSticky(db, idOf(req.params.id));
    if (!sticky) throw new HttpError(404, 'not_found', 'sticky does not exist');
    res.json(sticky);
  });

  router.patch('/:id', (req, res) => {
    const sticky = updateSticky(db, idOf(req.params.id), parseOrThrow(StickyPatchSchema, req.body, 'validation_error'));
    if (!sticky) throw new HttpError(404, 'not_found', 'sticky does not exist');
    res.json(sticky);
  });

  router.delete('/:id', (req, res) => {
    if (!deleteSticky(db, idOf(req.params.id))) {
      throw new HttpError(404, 'not_found', 'sticky does not exist');
    }
    res.status(204).end();
  });

  return router;
}
