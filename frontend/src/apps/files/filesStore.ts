import { create } from 'zustand';
import { filesApi, uploadFile } from './filesApi';
import type { FileEntry, FileResource, ResourceMember, ShareableUsers } from '../../api/types';

/**
 * Files app state: resources on the left, their files on the right.
 *
 * The lists always come from the server — the role of the current user is decided
 * there too, so the UI never has to guess whether it may show "Wyślij": it asks
 * for the resource and obeys the `role` that comes back.
 */

/** One transfer in flight (or one that failed and says why). */
export interface Upload {
  key: string;
  name: string;
  /** 0..1; 1 means the bytes are up and the server is still answering. */
  progress: number;
  error: string | null;
}

interface FilesStore {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  resources: FileResource[];
  activeId: number | null;

  files: FileEntry[];
  filesError: string | null;
  query: string;

  uploads: Upload[];

  /** Sharing panel: open, and the data it needs (people are fetched once). */
  sharingOpen: boolean;
  members: ResourceMember[];
  people: ShareableUsers['items'];

  load: () => Promise<void>;
  select: (id: number) => Promise<void>;
  createResource: (name: string) => Promise<void>;
  renameResource: (id: number, name: string) => Promise<void>;
  removeResource: (id: number) => Promise<void>;

  searchFiles: (query: string) => Promise<void>;
  upload: (file: File) => Promise<void>;
  renameFile: (id: number, name: string) => Promise<void>;
  removeFile: (id: number) => Promise<void>;

  openSharing: () => Promise<void>;
  closeSharing: () => void;
  setPermission: (userId: number, permission: 'read' | 'edit' | null) => Promise<void>;

  dismissUpload: (key: string) => void;
}

/** State without the actions — the reset point, and what `reset()` restores. */
export const filesDefaults: Pick<
  FilesStore,
  | 'status'
  | 'error'
  | 'resources'
  | 'activeId'
  | 'files'
  | 'filesError'
  | 'query'
  | 'uploads'
  | 'sharingOpen'
  | 'members'
  | 'people'
> = {
  status: 'idle',
  error: null,
  resources: [],
  activeId: null,
  files: [],
  filesError: null,
  query: '',
  uploads: [],
  sharingOpen: false,
  members: [],
  people: [],
};

export const useFiles = create<FilesStore>((set, get) => ({
  ...filesDefaults,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const { items } = await filesApi.listResources();
      // Keep the selection when it survived (a rename, a friend revoking share…),
      // otherwise open the first resource so the window is never half empty.
      const keep = items.find((resource) => resource.id === get().activeId);
      const active = keep ?? items[0] ?? null;
      set({ resources: items, status: 'ready', activeId: active?.id ?? null });
      if (active) await get().select(active.id);
      else set({ files: [], members: [] });
    } catch (error) {
      set({ status: 'error', error: describe(error) });
    }
  },

  select: async (id) => {
    set({ activeId: id, sharingOpen: false, filesError: null });
    await loadFiles(set, get, id);
  },

  createResource: async (name) => {
    try {
      const created = await filesApi.createResource(name);
      set({ resources: [...get().resources, created].sort(byName) });
      await get().select(created.id);
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  renameResource: async (id, name) => {
    const before = get().resources;
    set({ resources: before.map((r) => (r.id === id ? { ...r, name } : r)).sort(byName) });
    try {
      const updated = await filesApi.renameResource(id, name);
      set({ resources: get().resources.map((r) => (r.id === id ? updated : r)).sort(byName) });
    } catch (error) {
      set({ resources: before, error: describe(error) });
    }
  },

  removeResource: async (id) => {
    const before = get();
    const rest = before.resources.filter((r) => r.id !== id);
    set({
      resources: rest,
      activeId: before.activeId === id ? (rest[0]?.id ?? null) : before.activeId,
      files: before.activeId === id ? [] : before.files,
    });
    try {
      await filesApi.removeResource(id);
      if (before.activeId === id && rest[0]) await get().select(rest[0].id);
    } catch (error) {
      set({ resources: before.resources, activeId: before.activeId, error: describe(error) });
    }
  },

  searchFiles: async (query) => {
    set({ query });
    const id = get().activeId;
    if (id !== null) await loadFiles(set, get, id);
  },

  upload: async (file) => {
    const resourceId = get().activeId;
    if (resourceId === null) {
      set({ error: 'najpierw wybierz zasób' });
      return;
    }

    const key = `${Date.now()}-${file.name}`;
    set({ uploads: [...get().uploads, { key, name: file.name, progress: 0, error: null }] });

    try {
      const saved = await uploadFile(resourceId, file, (progress) => {
        set({ uploads: get().uploads.map((u) => (u.key === key ? { ...u, progress } : u)) });
      });
      set({
        files: [saved, ...get().files],
        resources: get().resources.map((r) =>
          r.id === resourceId ? { ...r, file_count: r.file_count + 1 } : r,
        ),
        uploads: get().uploads.filter((u) => u.key !== key),
      });
    } catch (error) {
      // The row stays on screen with its reason: a 100 MB refusal should be readable.
      set({
        uploads: get().uploads.map((u) => (u.key === key ? { ...u, error: describe(error) } : u)),
      });
    }
  },

  renameFile: async (id, name) => {
    const before = get().files;
    set({ files: before.map((f) => (f.id === id ? { ...f, name } : f)) });
    try {
      const updated = await filesApi.renameFile(id, name);
      set({ files: get().files.map((f) => (f.id === id ? updated : f)) });
    } catch (error) {
      set({ files: before, error: describe(error) });
    }
  },

  removeFile: async (id) => {
    const before = get();
    const resourceId = before.activeId;
    set({
      files: before.files.filter((f) => f.id !== id),
      resources:
        resourceId === null
          ? before.resources
          : before.resources.map((r) =>
              r.id === resourceId ? { ...r, file_count: Math.max(0, r.file_count - 1) } : r,
            ),
    });
    try {
      await filesApi.removeFile(id);
    } catch (error) {
      set({ files: before.files, resources: before.resources, error: describe(error) });
    }
  },

  openSharing: async () => {
    const id = get().activeId;
    if (id === null) return;
    set({ sharingOpen: true });
    try {
      const [detail, people] = await Promise.all([filesApi.detail(id), filesApi.people()]);
      set({ members: detail.members, people: people.items });
    } catch (error) {
      set({ sharingOpen: false, error: describe(error) });
    }
  },

  closeSharing: () => set({ sharingOpen: false }),

  setPermission: async (userId, permission) => {
    const id = get().activeId;
    if (id === null) return;
    try {
      const result = await filesApi.setPermission(id, userId, permission);
      set({
        members: result.members,
        resources: get().resources.map((r) => (r.id === id ? result.resource : r)),
      });
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  dismissUpload: (key) => set({ uploads: get().uploads.filter((u) => u.key !== key) }),
}));

async function loadFiles(
  set: (partial: Partial<FilesStore>) => void,
  get: () => FilesStore,
  resourceId: number,
) {
  set({ filesError: null });
  try {
    const page = await filesApi.listFiles(resourceId, get().query || undefined);
    set({ files: page.items });
  } catch (error) {
    set({ files: [], filesError: describe(error) });
  }
}

const byName = (a: FileResource, b: FileResource) =>
  a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' });

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'nieznany błąd';
}

/** Used by the window closing: the next opening starts from a clean slate. */
export function resetFiles(): void {
  useFiles.setState(filesDefaults);
}
