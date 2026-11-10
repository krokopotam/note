/**
 * Where the bytes live: data/files/<resource id>/<generated name>.
 *
 * The display name of a file is database business; this module only ever sees a
 * generated name it produced itself. Nothing from a request is put into a path,
 * and every read/write is checked to stay inside the resource directory, so
 * `../../etc/passwd` cannot be stored, fetched or deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const SLASHES = /[\\/]+/g;

/** Extension worth keeping, lowercase and short — purely cosmetic. */
function extensionOf(name) {
  const base = String(name).split(SLASHES).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext.length > 0 && ext.length <= 12 ? `.${ext}` : '';
}

/** Name we are willing to put on a disk: uuid + optional clean extension. */
export function generatedFileName(displayName = '') {
  return `${randomUUID()}${extensionOf(displayName)}`;
}

/**
 * @param {string} root - data/files
 * @returns the store used by the files repository and routes
 */
export function createFileStore(root) {
  const resourceDir = (resourceId) => path.join(root, String(resourceId));

  /** Resolve inside the resource directory or refuse. */
  const safePath = (resourceId, storedName) => {
    const dir = resourceDir(resourceId);
    const target = path.resolve(dir, String(storedName));
    if (!target.startsWith(dir + path.sep)) {
      throw new Error(`refusing to touch a path outside the resource folder: ${storedName}`);
    }
    return target;
  };

  return {
    root,

    ensureResource(resourceId) {
      fs.mkdirSync(resourceDir(resourceId), { recursive: true });
    },

    /**
     * Start an upload: the request body is piped into the returned stream, so the
     * bytes go to disk as they arrive. Nothing here holds a file in memory — a
     * hundred-megabyte upload must not cost a hundred megabytes of RAM on a server
     * that runs other things next door.
     *
     * @returns {{storedName: string, stream: fs.WriteStream}}
     */
    createWrite(resourceId, displayName = '') {
      this.ensureResource(resourceId);
      const storedName = generatedFileName(displayName);
      return { storedName, stream: fs.createWriteStream(safePath(resourceId, storedName)) };
    },

    /** Size actually on disk, or null when the file is not there (an aborted upload). */
    sizeOf(resourceId, storedName) {
      try {
        return fs.statSync(safePath(resourceId, storedName)).size;
      } catch {
        return null;
      }
    },

    /** Readable stream for download; null when the file is not on disk anymore. */
    read(resourceId, storedName) {
      const target = safePath(resourceId, storedName);
      if (!fs.existsSync(target)) return null;
      return fs.createReadStream(target);
    },

    remove(resourceId, storedName) {
      try {
        fs.unlinkSync(safePath(resourceId, storedName));
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    },

    /** Whole resource folder (used when a resource is deleted). */
    removeResource(resourceId) {
      fs.rmSync(resourceDir(resourceId), { recursive: true, force: true });
    },
  };
}
