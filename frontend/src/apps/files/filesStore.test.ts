import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filesApi, uploadFile } from './filesApi';
import { filesDefaults, useFiles } from './filesStore';
import type { FileEntry, FileResource } from '../../api/types';

vi.mock('./filesApi', () => ({
  filesApi: {
    listResources: vi.fn(),
    createResource: vi.fn(),
    detail: vi.fn(),
    renameResource: vi.fn(),
    removeResource: vi.fn(),
    listFiles: vi.fn(),
    renameFile: vi.fn(),
    removeFile: vi.fn(),
    people: vi.fn(),
    setPermission: vi.fn(),
  },
  uploadFile: vi.fn(),
}));

const api = vi.mocked(filesApi);

const resource = (id: number, overrides: Partial<FileResource> = {}): FileResource => ({
  id,
  name: `Zasób ${id}`,
  role: 'owner',
  file_count: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const file = (id: number, overrides: Partial<FileEntry> = {}): FileEntry => ({
  id,
  resource_id: 1,
  name: `plik-${id}.txt`,
  size: 12,
  content_type: 'text/plain',
  created_by: 1,
  created_by_name: 'ala',
  created_at: '2026-01-03T00:00:00.000Z',
  ...overrides,
});

/** The File an upload takes — jsdom has no File constructor with contents to read. */
const someFile = { name: 'wrut.txt', size: 12 } as File;

function stubEmptyApi() {
  api.listResources.mockResolvedValue({ items: [] });
  api.listFiles.mockResolvedValue({ items: [] });
  api.detail.mockResolvedValue({ resource: resource(1), members: [] });
  api.people.mockResolvedValue({ items: [] });
}

beforeEach(() => {
  useFiles.setState(filesDefaults);
  vi.resetAllMocks();
  stubEmptyApi();
});

describe('loading', () => {
  it('opens the first resource and reads its files', async () => {
    api.listResources.mockResolvedValue({ items: [resource(1), resource(2)] });
    api.listFiles.mockResolvedValue({ items: [file(7)] });

    await useFiles.getState().load();

    expect(useFiles.getState().activeId).toBe(1);
    expect(api.listFiles).toHaveBeenCalledWith(1, undefined);
    expect(useFiles.getState().files.map((entry) => entry.id)).toEqual([7]);
    expect(useFiles.getState().status).toBe('ready');
  });

  it('keeps the selected resource when it is still there', async () => {
    useFiles.setState({ activeId: 2 });
    api.listResources.mockResolvedValue({ items: [resource(1), resource(2, { name: 'Zmiana' })] });

    await useFiles.getState().load();

    expect(useFiles.getState().activeId).toBe(2);
    expect(api.listFiles).toHaveBeenCalledWith(2, undefined);
  });

  it('reports a broken API without clearing what is on screen', async () => {
    api.listResources.mockResolvedValue({ items: [resource(1)] });
    await useFiles.getState().load();
    api.listResources.mockRejectedValue(new Error('502'));

    await useFiles.getState().load();

    expect(useFiles.getState()).toMatchObject({ status: 'error', error: '502' });
    expect(useFiles.getState().resources).toHaveLength(1);
  });

  it('switching resource closes sharing and reads the new files', async () => {
    useFiles.setState({ sharingOpen: true, members: [{ user_id: 3, username: 'ola', permission: 'read' }] });
    api.listFiles.mockResolvedValue({ items: [file(9)] });

    await useFiles.getState().select(4);

    expect(useFiles.getState()).toMatchObject({ activeId: 4, sharingOpen: false });
    expect(useFiles.getState().files.map((entry) => entry.id)).toEqual([9]);
  });
});

describe('resources', () => {
  it('creates one and opens it', async () => {
    api.createResource.mockResolvedValue(resource(5, { name: 'Paragony' }));

    await useFiles.getState().createResource('Paragony');

    expect(api.createResource).toHaveBeenCalledWith('Paragony');
    expect(useFiles.getState().activeId).toBe(5);
    expect(useFiles.getState().resources.map((entry) => entry.name)).toEqual(['Paragony']);
  });

  it('keeps the list sorted the way the server lists it', async () => {
    api.createResource.mockResolvedValue(resource(5, { name: 'a-nowy' }));
    useFiles.setState({ resources: [resource(1, { name: 'Dokumenty' })] });

    await useFiles.getState().createResource('a-nowy');

    expect(useFiles.getState().resources.map((entry) => entry.name)).toEqual(['a-nowy', 'Dokumenty']);
  });

  it('renames without waiting for the reply', async () => {
    useFiles.setState({ resources: [resource(1, { name: 'Stara' })] });
    api.renameResource.mockResolvedValue(resource(1, { name: 'Nowa' }));

    await useFiles.getState().renameResource(1, 'Nowa');

    expect(useFiles.getState().resources[0].name).toBe('Nowa');
  });

  it('puts the old name back when the rename is refused', async () => {
    useFiles.setState({ resources: [resource(1, { name: 'Stara' })] });
    api.renameResource.mockRejectedValue(new Error('tylko właściciel'));

    await useFiles.getState().renameResource(1, 'Nie moja');

    expect(useFiles.getState().resources[0].name).toBe('Stara');
    expect(useFiles.getState().error).toBe('tylko właściciel');
  });

  it('deleting the open resource moves to the next one', async () => {
    useFiles.setState({ resources: [resource(1), resource(2)], activeId: 1, files: [file(3)] });

    await useFiles.getState().removeResource(1);

    expect(api.removeResource).toHaveBeenCalledWith(1);
    expect(useFiles.getState().resources.map((entry) => entry.id)).toEqual([2]);
    expect(useFiles.getState().activeId).toBe(2);
    expect(api.listFiles).toHaveBeenCalledWith(2, undefined);
  });

  it('puts a refused delete back on the list', async () => {
    api.removeResource.mockRejectedValue(new Error('403'));
    useFiles.setState({ resources: [resource(1)], activeId: 1 });

    await useFiles.getState().removeResource(1);

    expect(useFiles.getState().resources.map((entry) => entry.id)).toEqual([1]);
    expect(useFiles.getState().error).toBe('403');
  });
});

describe('files', () => {
  it('sends the search phrase to the API', async () => {
    useFiles.setState({ activeId: 1 });

    await useFiles.getState().searchFiles('paragon');

    expect(api.listFiles).toHaveBeenCalledWith(1, 'paragon');
  });

  it('tracks an upload and puts the finished file at the top', async () => {
    useFiles.setState({ activeId: 1, resources: [resource(1, { file_count: 2 })] });
    let onProgress: (fraction: number) => void = () => {};
    vi.mocked(uploadFile).mockImplementation((_r, _f, progress) => {
      onProgress = progress ?? (() => {});
      return Promise.resolve(file(11, { name: 'wrut.txt' }));
    });

    const pending = useFiles.getState().upload(someFile);
    expect(useFiles.getState().uploads).toHaveLength(1);

    onProgress(0.5);
    expect(useFiles.getState().uploads[0].progress).toBe(0.5);

    await pending;

    expect(useFiles.getState().uploads).toHaveLength(0);
    expect(useFiles.getState().files.map((entry) => entry.id)).toEqual([11]);
    expect(useFiles.getState().resources[0].file_count).toBe(3);
  });

  it('leaves a failed upload on screen with its reason', async () => {
    useFiles.setState({ activeId: 1 });
    vi.mocked(uploadFile).mockRejectedValue(new Error('plik jest za duży'));

    await useFiles.getState().upload(someFile);

    expect(useFiles.getState().uploads).toMatchObject([{ name: 'wrut.txt', error: 'plik jest za duży' }]);
    expect(useFiles.getState().files).toHaveLength(0);
  });

  it('refuses to upload before a resource is chosen', async () => {
    await useFiles.getState().upload(someFile);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(useFiles.getState().error).toBe('najpierw wybierz zasób');
  });

  it('renames a file and rolls the row back when the server says no', async () => {
    useFiles.setState({ files: [file(1, { name: 'stara.txt' })] });
    api.renameFile.mockResolvedValue(file(1, { name: 'nowa.txt' }));

    await useFiles.getState().renameFile(1, 'nowa.txt');
    expect(useFiles.getState().files[0].name).toBe('nowa.txt');

    api.renameFile.mockRejectedValue(new Error('tylko do odczytu'));
    await useFiles.getState().renameFile(1, 'jeszcze nowsza.txt');

    expect(useFiles.getState().files[0].name).toBe('nowa.txt');
    expect(useFiles.getState().error).toBe('tylko do odczytu');
  });

  it('deletes a file and its counter, restoring both on failure', async () => {
    useFiles.setState({ activeId: 1, resources: [resource(1, { file_count: 1 })], files: [file(1)] });
    api.removeFile.mockRejectedValue(new Error('403'));

    await useFiles.getState().removeFile(1);

    expect(useFiles.getState().files).toHaveLength(1);
    expect(useFiles.getState().resources[0].file_count).toBe(1);
    expect(useFiles.getState().error).toBe('403');
  });
});

describe('sharing', () => {
  it('loads the people and the current grants when the panel opens', async () => {
    useFiles.setState({ activeId: 1 });
    api.detail.mockResolvedValue({
      resource: resource(1),
      members: [{ user_id: 3, username: 'ola', permission: 'read' }],
    });
    api.people.mockResolvedValue({ items: [{ id: 3, username: 'ola' }] });

    await useFiles.getState().openSharing();

    expect(useFiles.getState()).toMatchObject({ sharingOpen: true });
    expect(useFiles.getState().members).toEqual([{ user_id: 3, username: 'ola', permission: 'read' }]);
    expect(useFiles.getState().people).toEqual([{ id: 3, username: 'ola' }]);
  });

  it('grants, changes and revokes access', async () => {
    useFiles.setState({ activeId: 1, resources: [resource(1)] });
    api.setPermission
      .mockResolvedValueOnce({
        resource: resource(1),
        members: [{ user_id: 3, username: 'ola', permission: 'read' }],
      })
      .mockResolvedValueOnce({ resource: resource(1), members: [] });

    await useFiles.getState().setPermission(3, 'read');
    expect(useFiles.getState().members).toHaveLength(1);

    await useFiles.getState().setPermission(3, null);
    expect(api.setPermission).toHaveBeenLastCalledWith(1, 3, null);
    expect(useFiles.getState().members).toHaveLength(0);
  });

  it('closes the panel and says why when sharing is refused', async () => {
    useFiles.setState({ activeId: 1 });
    api.detail.mockRejectedValue(new Error('403'));

    await useFiles.getState().openSharing();

    expect(useFiles.getState()).toMatchObject({ sharingOpen: false, error: '403' });
  });
});
