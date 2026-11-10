import { screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pickRowAction } from '../../test/rowMenu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notesApi } from './notesApi';
import { NotepadApp } from './NotepadApp';
import { cancelAutosave, notepadDefaults, useNotepad } from './notepadStore';
import type { Note } from '../../api/types';

vi.mock('./notesApi', () => ({
  notesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    session: vi.fn(),
    saveSession: vi.fn(),
  },
}));

const api = vi.mocked(notesApi);

const note = (id: number, overrides: Partial<Note> = {}): Note => ({
  id,
  title: `Notatka ${id}`,
  body: `treść ${id}`,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

function renderNotepad(payload: Record<string, unknown> = {}) {
  return render(<NotepadApp windowKey="notepad" appId="notepad" payload={payload} />);
}

beforeEach(() => {
  useNotepad.setState(notepadDefaults);
  vi.resetAllMocks();
  api.list.mockResolvedValue({ items: [note(1), note(2)], total: 2 });
  api.session.mockResolvedValue({ tabs: [1], active_note_id: 1 });
  api.get.mockResolvedValue(note(1));
  api.saveSession.mockResolvedValue({ tabs: [1], active_note_id: 1 });
  api.update.mockResolvedValue(note(1, { body: 'nowe' }));
});

afterEach(() => {
  cancelAutosave();
  vi.useRealTimers();
});

describe('notepad window', () => {
  it('lists notes with title, preview and timestamp', async () => {
    renderNotepad();

    const row = await screen.findByTestId('note-row-1');
    expect(row).toHaveTextContent('Notatka 1');
    expect(row).toHaveTextContent('treść 1');
    expect(screen.getByTestId('note-row-2')).toBeInTheDocument();
    expect(screen.getByText('2 notatek')).toBeInTheDocument();
  });

  it('opens the note saved as active in the session', async () => {
    renderNotepad();

    const editor = await screen.findByTestId('editor');
    expect(editor).toHaveValue('treść 1');
    expect(within(editor.parentElement as HTMLElement).getAllByRole('tab')).toHaveLength(1);
  });

  it('opens a note passed by the desktop menu', async () => {
    api.get.mockResolvedValue(note(55, { title: 'Z pulpitu', body: 'treść 55' }));

    renderNotepad({ noteId: 55 });

    expect(await screen.findByTestId('editor')).toHaveValue('treść 55');
    expect(api.get).toHaveBeenCalledWith(55);
  });

  it('opens a note pushed into the payload of an already open window', async () => {
    api.get.mockImplementation(async (id: number) => note(id, { title: `Notatka ${id}`, body: `treść ${id}` }));
    const { rerender } = renderNotepad();
    await screen.findByTestId('editor');

    rerender(<NotepadApp windowKey="notepad" appId="notepad" payload={{ noteId: 77 }} />);

    expect(await screen.findByTestId('editor')).toHaveValue('treść 77');
    expect(api.get).toHaveBeenCalledWith(77);
  });

  it('sends keywords to the API as the search box is used', async () => {
    renderNotepad();
    await screen.findByTestId('note-row-1');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Szukaj w notatkach' }), 'faktura');

    expect(api.list).toHaveBeenLastCalledWith({ q: 'faktura', sort: 'updated_desc' });
  });

  it('asks the backend to re-sort', async () => {
    renderNotepad();
    await screen.findByTestId('note-row-1');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sortuj' }), 'title_asc');

    expect(api.list).toHaveBeenLastCalledWith({ q: '', sort: 'title_asc' });
  });

  it('saves what is typed and reports it', async () => {
    renderNotepad();
    await screen.findByTestId('editor');

    await userEvent.type(screen.getByTestId('editor'), 'X');
    expect(screen.getByTestId('save-status')).toHaveTextContent('Zmiany do zapisania');

    await vi.waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { body: 'treść 1X' }));
    expect(screen.getByTestId('save-status')).toHaveTextContent('Zapisano');
  });

  it('opens a second tab from the list and can close it', async () => {
    api.get.mockImplementation(async (id: number) => note(id));
    renderNotepad();
    await screen.findByTestId('note-row-2');

    await userEvent.click(screen.getByTestId('note-row-2'));
    expect(await screen.findByTestId('tab-2')).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Zamknij zakładkę Notatka 2' }));
    expect(screen.queryByTestId('tab-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-1')).toHaveAttribute('aria-selected', 'true');
  });

  it('creates a note through the toolbar button', async () => {
    api.create.mockResolvedValue(note(3, { title: 'Bez tytułu', body: '' }));
    renderNotepad();
    await screen.findByTestId('editor');

    await userEvent.click(screen.getByRole('button', { name: 'Nowa notatka' }));

    expect(await screen.findByTestId('tab-3')).toBeInTheDocument();
    expect(api.saveSession).toHaveBeenCalledWith({ tabs: [1, 3], active_note_id: 3 });
  });

  it('renames on blur, not on every keystroke', async () => {
    renderNotepad();
    const title = await screen.findByRole('textbox', { name: 'Tytuł notatki' });

    await userEvent.clear(title);
    await userEvent.type(title, 'Nowy tytuł');
    expect(api.update).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(api.update).toHaveBeenCalledWith(1, { title: 'Nowy tytuł' });
  });

  it('deletes the note and switches to the remaining tab', async () => {
    renderNotepad();
    await screen.findByTestId('editor');

    await pickRowAction(await screen.findByTestId('note-footer'), /Czynności notatki/, 'Usuń notatkę');

    expect(api.remove).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Wybierz notatkę z listy albo utwórz nową.')).toBeInTheDocument();
  });

  it('shows an empty list message when the search matches nothing', async () => {
    api.list.mockImplementation(async ({ q } = {}) => (q ? { items: [], total: 0 } : { items: [note(1)], total: 1 }));
    renderNotepad();
    await screen.findByTestId('note-row-1');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Szukaj w notatkach' }), 'zero');

    expect(await screen.findByText('Brak notatek dla tych kryteriów.')).toBeInTheDocument();
  });
});
