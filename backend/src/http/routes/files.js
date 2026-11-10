/**
 * Files API: resources, uploads, downloads, sharing.
 *
 * Uploads arrive as a raw body (`PUT .../files/<nazwa>`), which keeps the browser
 * side to one `fetch(url, { body: file })` and saves us a multipart parser. The
 * name travels in the URL, the bytes in the body, and neither of them ever
 * becomes a path — see files/store.js.
 */
import { Router } from 'express';
import {
  FilePatchSchema,
  FileResourceCreateSchema,
  FileResourcePatchSchema,
  MAX_UPLOAD_MB,
  ResourceMemberPutSchema,
  parseOrThrow,
} from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import {
  createResource,
  deleteResource,
  getResource,
  listMembers,
  listResources,
  renameResource,
  setMember,
  shareableUsers,
} from '../../repos/resources.js';
import { addFile, deleteFile, displayName, getFile, getFileForDownload, listFiles, renameFile } from '../../repos/files.js';

const idOf = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'invalid_id', `${label}: ${raw}`);
  return id;
};

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{store: object, maxUploadBytes?: number}} options
 */
export function filesRouter(db, { store, maxUploadBytes = MAX_UPLOAD_MB * 1024 * 1024 }) {
  const router = Router();

  // --- resources -------------------------------------------------------------

  router.get('/resources', (req, res) => {
    res.json(listResources(db, req.userId));
  });

  router.post('/resources', (req, res) => {
    const { name } = parseOrThrow(FileResourceCreateSchema, req.body, 'validation_error');
    res.status(201).json(createResource(db, req.userId, { name }));
  });

  router.get('/resources/:id', (req, res) => {
    const resource = getResource(db, req.userId, idOf(req.params.id, 'zasób'));
    if (!resource) throw notFound('zasób');
    res.json({ resource, members: listMembers(db, resource.id) });
  });

  router.patch('/resources/:id', (req, res) => {
    const { name } = parseOrThrow(FileResourcePatchSchema, req.body, 'validation_error');
    const resource = renameResource(db, req.userId, idOf(req.params.id, 'zasób'), name);
    if (!resource) throw notFound('zasób');
    res.json(resource);
  });

  router.delete('/resources/:id', (req, res) => {
    const removed = deleteResource(db, req.userId, idOf(req.params.id, 'zasób'));
    if (!removed) throw notFound('zasób');
    // The rows are gone by cascade; the folder on disk is ours to remove.
    store.removeResource(removed.id);
    res.status(204).end();
  });

  // --- udostępnianie ---------------------------------------------------------

  router.get('/users', (req, res) => {
    res.json({ items: shareableUsers(db, req.userId) });
  });

  router.put('/resources/:id/members', (req, res) => {
    const input = parseOrThrow(ResourceMemberPutSchema, req.body, 'validation_error');
    const result = setMember(db, req.userId, idOf(req.params.id, 'zasób'), input);
    if (!result) throw notFound('zasób');
    res.json(result);
  });

  // --- pliki -----------------------------------------------------------------

  router.get('/resources/:id/files', (req, res) => {
    const page = listFiles(db, req.userId, idOf(req.params.id, 'zasób'), {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    if (!page) throw notFound('zasób');
    res.json(page);
  });

  /**
   * Upload: the body is piped straight to disk.
   *
   * Two rules matter here. Permission is decided before a single byte is written,
   * so a read-only friend cannot fill the disk with attempts. And the size is
   * counted chunk by chunk instead of trusting a parser to buffer the file — a
   * hundred-megabyte upload costs a hundred megabytes of disk, never of RAM.
   */
  router.put('/resources/:id/files/:name', (req, res) => {
    const resourceId = idOf(req.params.id, 'zasób');
    const resource = getResource(db, req.userId, resourceId);
    if (!resource) throw notFound('zasób');
    if (resource.role === 'read') {
      throw new HttpError(403, 'read_only', 'ten zasób jest tylko do odczytu');
    }

    const reply = (status, code, message) => {
      if (!res.headersSent) res.status(status).json({ error: { code, message } });
    };

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxUploadBytes) {
      throw tooLarge();
    }

    // Express already URL-decodes path params; decoding twice would eat the
    // percent in a name like "100% rabatu.txt".
    const name = displayName(req.params.name ?? '');
    const target = store.createWrite(resourceId, name);
    let received = 0;
    let settled = false;

    /** One answer per request, and never a half-written file left behind. */
    const fail = (status, code, message) => {
      if (settled) return;
      settled = true;
      store.remove(resourceId, target.storedName);
      req.destroy();
      reply(status, code, message);
    };

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxUploadBytes) fail(413, 'file_too_large', 'plik jest za duży');
    });
    req.on('aborted', () => fail(400, 'upload_interrupted', 'wysyłanie przerwane'));
    req.on('error', () => fail(400, 'upload_interrupted', 'wysyłanie przerwane'));
    target.stream.on('error', () => fail(500, 'write_failed', 'nie udało się zapisać pliku'));

    target.stream.on('close', () => {
      if (settled) return;
      settled = true;

      if (received === 0) {
        store.remove(resourceId, target.storedName);
        return reply(400, 'empty_upload', 'plik jest pusty — nic nie przyszło');
      }

      // The size on disk, not the size the client claims.
      const size = store.sizeOf(resourceId, target.storedName) ?? received;
      const result = addFile(db, req.userId, resourceId, {
        name,
        storedName: target.storedName,
        size,
        contentType: firstContentType(req.get('content-type')),
      });

      if (result.error) {
        store.remove(resourceId, target.storedName);
        return result.error === 'permission'
          ? reply(403, 'read_only', 'ten zasób jest tylko do odczytu')
          : reply(404, 'not_found', 'zasób nie istnieje');
      }

      res.status(201).json(result.file);
    });

    req.pipe(target.stream);
  });

  // Uwaga: ten router wisi na /api/files, więc pojedynczy plik to /api/files/:id.
  // Trasy statyczne (/resources, /users) są zadeklarowane wyżej i przez to wygrywają.
  router.get('/:id', (req, res) => {
    const found = getFileForDownload(db, req.userId, idOf(req.params.id, 'plik'));
    if (!found) throw notFound('plik');

    const stream = store.read(found.file.resource_id, found.storedName);
    if (!stream) {
      throw new HttpError(410, 'file_missing', 'pliku nie ma już na dysku');
    }

    res.setHeader('Content-Type', found.file.content_type);
    res.setHeader('Content-Length', String(found.file.size));
    res.setHeader('Content-Disposition', attachmentHeader(found.file.name));
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });

  router.patch('/:id', (req, res) => {
    const { name } = parseOrThrow(FilePatchSchema, req.body, 'validation_error');
    const file = renameFile(db, req.userId, idOf(req.params.id, 'plik'), name);
    if (!file) throw notFound('plik');
    res.json(file);
  });

  router.delete('/:id', (req, res) => {
    const removed = deleteFile(db, req.userId, idOf(req.params.id, 'plik'));
    if (!removed) throw notFound('plik');
    store.remove(removed.resource_id, removed.stored_name);
    res.status(204).end();
  });

  return router;
}

const notFound = (what) => new HttpError(404, 'not_found', `${what} nie istnieje`);
const tooLarge = () => new HttpError(413, 'file_too_large', 'plik jest za duży');

/** A browser sends whatever it guessed; keep the media type, drop its parameters. */
function firstContentType(header) {
  if (!header) return 'application/octet-stream';
  const [type] = String(header).split(';');
  return type.trim() || 'application/octet-stream';
}

/**
 * RFC 6266 + 5987: an ASCII fallback for old clients and the exact UTF-8 name for
 * everything else, so "rozdziennik óż.pdf" downloads with Polish letters intact.
 */
export function attachmentHeader(name) {
  const fallback = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
