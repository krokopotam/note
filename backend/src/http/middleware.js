import { HttpError } from '../domain/errors.js';
import { ListQuerySchema, parseOrThrow } from '@note/shared';

/**
 * Express middleware: every failure leaves through here as the one error shape
 * the frontend knows ({ error: { code, message, details? } }). Anything that is
 * not an HttpError is a bug, so it keeps its 500 status and the message goes to
 * the log instead of the client.
 */

/** @param {import('express').Request} req @param {import('express').Response} res */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `no route ${req.path}` } });
}

/**
 * @param {Error & {status?: number, code?: string, details?: unknown, type?: string}} err
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Malformed JSON body: express throws a SyntaxError that already carries
  // status 400, so it has to be recognised before the generic status branch.
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { code: 'invalid_json', message: 'request body is not valid JSON' } });
  }

  if (err instanceof HttpError || err.status) {
    const body = {
      error: {
        code: err.code ?? 'request_error',
        message: err.message,
      },
    };
    if (err.details) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  console.error('[note] unhandled error', err);
  return res.status(500).json({ error: { code: 'internal_error', message: 'internal error' } });
}

/**
 * Parse `?q=&sort=&limit=&offset=` with the shared list contract.
 *
 * A sort value outside the enum is a client error, not a silent fallback: the UI
 * must not quietly show a different ordering than it asked for.
 */
export function parseListQuery(query) {
  return parseOrThrow(ListQuerySchema, query, 'invalid_query');
}
