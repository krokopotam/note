/**
 * What may be sent as a picture, decided from the name rather than from a header.
 *
 * A browser sends `Content-Type: image/png` because it believes the file is one.
 * The extension is what the byte stream actually carries in practice, so both have
 * to agree and the extension decides which MIME the response will claim. Anything
 * outside this list is refused before a byte is written: a chat is not a place to
 * park `.exe` files.
 */

export const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Lowercase extension of a display name, without any path in front of it. */
function extensionOf(name) {
  const base = String(name).split(/[\\/]+/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/**
 * @returns {{mime: string}|null} null when this is not a picture we agree to keep
 */
export function imageMime(name, declaredType) {
  const mime = IMAGE_TYPES[extensionOf(name)];
  if (!mime) return null;
  // If the client announced a type at all, it has to be a picture too.
  if (declaredType && !String(declaredType).toLowerCase().startsWith('image/')) return null;
  return { mime };
}
