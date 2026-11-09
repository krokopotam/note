import { Router } from 'express';
import {
  DesktopItemCreateSchema,
  DesktopItemPatchSchema,
  FavoritesPutSchema,
  parseOrThrow,
} from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import { createItem, deleteItem, getItem, listItems, updateItem } from '../../repos/desktop.js';
import { getFavorites, putFavorites } from '../../repos/favorites.js';

/**
 * Desktop layout, favourites and the notepad session.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{apps?: Array<{id: string, title: string}>}} options - shell registry,
 *   used to reject icons pointing at an app that does not exist
 */
export function desktopRouter(db, { apps = [] } = {}) {
  const router = Router();
  const knownAppIds = new Set(apps.map((app) => app.id));

  const idOf = (raw) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) {
      throw new HttpError(400, 'invalid_id', `invalid item id: ${raw}`);
    }
    return id;
  };

  router.get('/items', (req, res) => {
    res.json({ items: listItems(db) });
  });

  router.post('/items', (req, res) => {
    const input = parseOrThrow(DesktopItemCreateSchema, req.body, 'validation_error');
    if (input.app_id && !knownAppIds.has(input.app_id)) {
      throw new HttpError(400, 'unknown_app', `app ${input.app_id} is not installed`);
    }
    res.status(201).json(createItem(db, input));
  });

  router.patch('/items/:id', (req, res) => {
    const patch = parseOrThrow(DesktopItemPatchSchema, req.body, 'validation_error');
    const item = updateItem(db, idOf(req.params.id), patch);
    if (!item) throw new HttpError(404, 'not_found', 'item does not exist');
    res.json(item);
  });

  router.delete('/items/:id', (req, res) => {
    if (!deleteItem(db, idOf(req.params.id))) {
      throw new HttpError(404, 'not_found', 'item does not exist');
    }
    res.status(204).end();
  });

  router.get('/favorites', (req, res) => {
    res.json({ slots: getFavorites(db) });
  });

  router.put('/favorites', (req, res) => {
    const { slot, app_ids: appIds } = parseOrThrow(FavoritesPutSchema, req.body, 'validation_error');
    const unknown = appIds.filter((appId) => !knownAppIds.has(appId));
    if (unknown.length) {
      throw new HttpError(400, 'unknown_app', `apps not installed: ${unknown.join(', ')}`);
    }
    res.json(putFavorites(db, slot, appIds));
  });

  return router;
}
