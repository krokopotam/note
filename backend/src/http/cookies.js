/**
 * Cookies without a dependency: reading one value and writing the session cookie.
 *
 * `Secure` is decided per request rather than per deployment so the same code runs
 * behind nginx (https) and on http://localhost during development — a Secure cookie
 * over plain http is silently dropped by the browser.
 */

/** @param {string|undefined} header @returns {Record<string,string>} */
export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[name] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

/**
 * @param {string} name
 * @param {string} value
 * @param {{maxAgeSeconds?: number|null, secure?: boolean, httpOnly?: boolean}} [options]
 * @returns {string} a Set-Cookie header value
 */
export function serializeCookie(name, value, { maxAgeSeconds = null, secure = true, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/'];
  // SameSite=Lax keeps another site's POST from riding along with the session.
  parts.push('SameSite=Lax');
  if (httpOnly) parts.push('HttpOnly');
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** @returns {string} Set-Cookie value that removes the cookie */
export const clearCookie = (name, { secure = true } = {}) =>
  serializeCookie(name, '', { maxAgeSeconds: 0, secure });
