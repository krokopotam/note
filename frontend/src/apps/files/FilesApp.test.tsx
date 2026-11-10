/**
 * Files app, driven like a user: pick a resource, drop a file, rename, share.
 *
 * Queries go by role and label, never by class name, so restyling cannot break
 * these tests — and a control that cannot be found by name is a control a user
 * cannot find either.
 */
import { fireEvent, screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pickRowAction } from '../../test/rowMenu';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filesApi, uploadFile } from './filesApi';
import { FilesApp } from './FilesApp';
import { filesDefaults, useFiles } from './filesStore';
import type { FileEntry, FileResource } from '../../api/types';

// Only the network half of the module is fake; downloadUrl stays the real one, so
// the asserted href is the address the app would really use.
vi.mock('./filesApi', async (importOriginal) => {
  const real = await importOriginal<typeof import('./filesApi')>();
  return {
    ...real,
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
  };
});

const api = vi.mocked(filesApi);

const resource = (id: number, overrides: Partial<FileResource> = {}): FileResource => ({
  id,
  name: `Zasób ${id}`,
  role: 'owner',
  file_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const file = (id: number, overrides: Partial<FileEntry> = {}): FileEntry => ({
  id,
  resource_id: 1,
  name: `rachunek-${id}.pdf`,
  size: 2048,
  content_type: 'application/pdf',
  created_by: 1,
  created_by_name: 'ala',
  created_at: '2026-03-04T10:20:00.000Z',
  ...overrides,
});

function renderFiles() {
  return render(<FilesApp windowKey="files" appId="files" payload={{}} />);
}

/** What actually went to the upload helper — a File keeps `name` on its prototype. */
function sentFile() {
  const call = vi.mocked(uploadFile).mock.calls.at(-1);
  return { resourceId: call?.[0], name: call?.[1].name };
}

beforeEach(() => {
  useFiles.setState(filesDefaults);
  vi.resetAllMocks();
  api.listResources.mockResolvedValue({ items: [resource(1), resource(2, { name: 'Zdjęcia' })] });
  api.listFiles.mockResolvedValue({ items: [file(10)] });
  api.detail.mockResolvedValue({ resource: resource(1), members: [] });
  api.people.mockResolvedValue({ items: [{ id: 3, username: 'ola' }] });
  api.setPermission.mockResolvedValue({ resource: resource(1), members: [] });
  api.renameResource.mockImplementation(async (id, name) => resource(id, { name }));
  api.renameFile.mockImplementation(async (id, name) => file(id, { name }));
  api.removeFile.mockResolvedValue(undefined);
  api.removeResource.mockResolvedValue(undefined);
  api.createResource.mockImplementation(async (name) => resource(9, { name }));
  vi.mocked(uploadFile).mockImplementation(async (_resourceId, uploaded) =>
    file(77, { name: uploaded.name }),
  );
});

describe('browse', () => {
  it('shows the resources and the files of the first one', async () => {
    renderFiles();

    const sidebar = await screen.findByRole('navigation', { name: 'Zasoby' });
    expect(within(sidebar).getByText('Zasób 1')).toBeInTheDocument();
    expect(within(sidebar).getByText('Zdjęcia')).toBeInTheDocument();
    expect(await screen.findByTestId('file-10')).toHaveTextContent('rachunek-10.pdf');
    expect(screen.getByTestId('file-10')).toHaveTextContent('2 kB');
  });

  it('opens another resource when it is clicked', async () => {
    renderFiles();
    await screen.findByText('Zdjęcia');

    await userEvent.click(screen.getByTestId('resource-2'));

    expect(api.listFiles).toHaveBeenLastCalledWith(2, undefined);
  });

  it('links every file to its download address', async () => {
    renderFiles();
    const link = await screen.findByRole('link', { name: 'rachunek-10.pdf' });

    expect(link).toHaveAttribute('href', '/api/files/10');
    expect(link).toHaveAttribute('download', 'rachunek-10.pdf');
  });

  it('says there is nothing when the account has no resource yet', async () => {
    api.listResources.mockResolvedValue({ items: [] });

    renderFiles();

    expect(await screen.findByText(/Nie masz jeszcze żadnego zasobu/)).toBeInTheDocument();
  });

  it('searches inside the open resource', async () => {
    renderFiles();
    const field = await screen.findByRole('searchbox', { name: 'Szukaj plików' });

    await userEvent.type(field, 'rachunek');

    expect(api.listFiles).toHaveBeenLastCalledWith(1, 'rachunek');
  });
});

describe('upload', () => {
  it('sends a file chosen from the disk', async () => {
    renderFiles();
    await screen.findByTestId('file-10');

    const picked = new File(['dane'], 'faktura.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByLabelText('Wybierz pliki do wysłania'), picked);

    expect(sentFile()).toMatchObject({ resourceId: 1, name: 'faktura.txt' });
    expect(await screen.findByText('faktura.txt')).toBeInTheDocument();
  });

  it('sends files dropped on the panel', async () => {
    renderFiles();
    await screen.findByTestId('file-10');

    fireEvent.drop(screen.getByTestId('files-main'), {
      dataTransfer: { files: [new File(['a'], 'z-drag-and-drop.txt')] },
    });

    expect(sentFile()).toMatchObject({ resourceId: 1, name: 'z-drag-and-drop.txt' });
  });

  it('refuses a file over the limit without sending it', async () => {
    renderFiles();
    await screen.findByTestId('file-10');

    const huge = { name: 'colosal.mkv', size: 101 * 1024 * 1024 } as File;
    fireEvent.drop(screen.getByTestId('files-main'), { dataTransfer: { files: [huge] } });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(await screen.findByText(/większy niż 100 MB/)).toBeInTheDocument();
  });

  it('shows why an upload failed', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('plik jest za duży'));
    renderFiles();
    await screen.findByTestId('file-10');

    await userEvent.upload(
      screen.getByLabelText('Wybierz pliki do wysłania'),
      new File(['x'], 'nikt-nie-wierzy.txt'),
    );

    expect(await screen.findByText('plik jest za duży')).toBeInTheDocument();
  });
});

describe('renaming', () => {
  it('renames a file in place', async () => {
    renderFiles();
    const row = await screen.findByTestId('file-10');

    await pickRowAction(row, 'Czynności pliku rachunek-10.pdf', 'Zmień nazwę');
    const field = await screen.findByRole('textbox', { name: 'Nowa nazwa pliku rachunek-10.pdf' });
    await userEvent.clear(field);
    await userEvent.type(field, 'faktura-2026.pdf');
    await userEvent.keyboard('{Enter}');

    expect(api.renameFile).toHaveBeenCalledWith(10, 'faktura-2026.pdf');
    expect(await screen.findByRole('link', { name: 'faktura-2026.pdf' })).toBeInTheDocument();
  });

  it('renames the resource from its own row', async () => {
    const sidebar = await (await renderFiles()).findByRole('navigation', { name: 'Zasoby' });

    await pickRowAction(sidebar, 'Czynności zasobu Zasób 1', 'Zmień nazwę');
    const field = await screen.findByRole('textbox', { name: 'Nowa nazwa zasobu Zasób 1' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Paragony');
    await userEvent.keyboard('{Enter}');

    expect(api.renameResource).toHaveBeenCalledWith(1, 'Paragony');
    expect(within(sidebar).getByText('Paragony')).toBeInTheDocument();
  });

  it('creates a resource from the sidebar', async () => {
    renderFiles();
    const field = await screen.findByRole('textbox', { name: 'Nazwa nowego zasobu' });

    await userEvent.type(field, 'Garaż');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj zasób' }));

    expect(api.createResource).toHaveBeenCalledWith('Garaż');
    const sidebar = await screen.findByRole('navigation', { name: 'Zasoby' });
    expect(within(sidebar).getByText('Garaż')).toBeInTheDocument();
  });
});

describe('sharing', () => {
  it('opens the panel and sets what a person may do', async () => {
    renderFiles();
    await screen.findByTestId('file-10');

    const sidebar = await screen.findByRole('navigation', { name: 'Zasoby' });
    await pickRowAction(sidebar, 'Czynności zasobu Zasób 1', 'Udostępnij');
    const panel = await screen.findByTestId('sharing');
    const choice = within(panel).getByRole('combobox', { name: 'Dostęp dla ola' });

    await userEvent.selectOptions(choice, 'edit');

    expect(api.setPermission).toHaveBeenCalledWith(1, 3, 'edit');
  });

  it('hides the upload and the delete from a reader', async () => {
    api.listResources.mockResolvedValue({
      items: [resource(1, { role: 'read', name: 'Wspólne' })],
    });

    renderFiles();
    await screen.findByTestId('file-10');

    expect(screen.queryByLabelText('Wybierz pliki do wysłania')).not.toBeInTheDocument();
    expect(screen.getByText(/tylko do odczytu/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Czynności pliku rachunek-10.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Czynności zasobu Wspólne' })).not.toBeInTheDocument();
  });

  it('deletes a file when asked', async () => {
    renderFiles();
    const row = await screen.findByTestId('file-10');

    await pickRowAction(row, 'Czynności pliku rachunek-10.pdf', 'Usuń');

    expect(api.removeFile).toHaveBeenCalledWith(10);
    expect(screen.queryByTestId('file-10')).not.toBeInTheDocument();
  });
});
