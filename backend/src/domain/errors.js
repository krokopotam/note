/**
 * Thrown by repositories and routes for conditions the client can act upon.
 * The error middleware maps it to a response; anything else is a bug and becomes 500.
 */
export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} code - stable machine-readable code, part of the API contract
   * @param {string} message - human-readable description
   * @param {Array<{path: string, message: string}>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

/** @param {number} id @returns {HttpError} */
export const notFound = (id) => new HttpError(404, 'not_found', `resource ${id} does not exist`);
