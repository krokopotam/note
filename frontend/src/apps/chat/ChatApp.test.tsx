/**
 * The chat window, driven like a person: read the list, answer, fix a typo inside
 * the five minutes, start a thread with one person or with several.
 */
import { fireEvent, screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pickRowAction } from '../../test/rowMenu';
import { CHAT_ATTACHMENT_MAX_MB } from '@note/shared/manifest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi } from './chatApi';
import { ChatApp } from './ChatApp';
import { chatDefaults, useChat } from './chatStore';
import type { Conversation, Message } from '../../api/types';

// The API calls are mocks; `attachmentUrl` is a string builder and stays real, so
// the assertions below check the address a picture will actually be fetched from.
vi.mock('./chatApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chatApi')>()),
  chatApi: {
    people: vi.fn(),
    conversations: vi.fn(),
    detail: vi.fn(),
    start: vi.fn(),
    createGroup: vi.fn(),
    addMember: vi.fn(),
    unread: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    uploadAttachment: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
  },
}));

const api = vi.mocked(chatApi);

/** Still inside the window: the client hides the buttons once this moment passes. */
const stillEditable = new Date(Date.now() + 180_000).toISOString();
const MARK = '2026-01-05T09:30:00.000Z';

const conversation = (id: number, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  peer: { id: id + 10, username: id === 1 ? 'ola' : 'ivo' },
  title: id === 1 ? 'ola' : 'ivo',
  is_group: false,
  last_body: 'co słychać',
  last_at: '2026-01-05T10:00:00.000Z',
  last_from_me: false,
  last_deleted: false,
  last_has_attachment: false,
  unread: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const message = (id: number, overrides: Partial<Message> = {}): Message => ({
  id,
  conversation_id: 1,
  author_id: 1,
  author_name: 'ala',
  body: `wiadomość ${id}`,
  created_at: '2026-01-05T10:00:00.000Z',
  edited_at: null,
  from_me: true,
  editable_until: stillEditable,
  can_edit: true,
  deleted: false,
  attachments: [],
  ...overrides,
});

const page = (items: Message[], watermark = MARK) => ({ items, watermark });

function renderChat() {
  return render(<ChatApp windowKey="chat" appId="chat" payload={{}} />);
}

beforeEach(() => {
  useChat.setState(chatDefaults);
  vi.resetAllMocks();
  api.conversations.mockResolvedValue({ items: [conversation(1)] });
  api.detail.mockResolvedValue({ ...conversation(1), members: [{ id: 11, username: 'ola' }] });
  api.messages.mockResolvedValue(
    page([message(1), message(2, { author_id: 11, author_name: 'ola', can_edit: false, from_me: false })]),
  );
  api.people.mockResolvedValue({ items: [{ id: 5, username: 'ola' }, { id: 6, username: 'ivo' }] });
  api.start.mockResolvedValue({
    ...conversation(3, { peer: { id: 5, username: 'ola' } }),
    members: [{ id: 5, username: 'ola' }],
  });
  api.createGroup.mockResolvedValue({
    ...conversation(7, { is_group: true, title: 'Remont', peer: null }),
    members: [{ id: 5, username: 'ola' }, { id: 6, username: 'ivo' }],
  });
  api.addMember.mockResolvedValue({
    ...conversation(1),
    members: [{ id: 11, username: 'ola' }, { id: 6, username: 'ivo' }],
  });
  api.send.mockResolvedValue(message(9, { body: 'cześć' }));
  api.edit.mockImplementation(async (id, body) => message(id, { body, edited_at: '2026-01-05T10:02:00.000Z' }));
  api.remove.mockResolvedValue(undefined);
});

describe('reading', () => {
  it('shows conversations with their last words and unread count', async () => {
    api.conversations.mockResolvedValue({
      items: [conversation(1, { unread: 2 }), conversation(2, { last_from_me: true })],
    });

    renderChat();
    const row = await screen.findByTestId('conversation-1');

    expect(row).toHaveTextContent('ola');
    expect(row).toHaveTextContent('co słychać');
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-2')).toHaveTextContent('ty: co słychać');
  });

  it('says in the list that the last message is gone', async () => {
    api.conversations.mockResolvedValue({
      items: [conversation(1, { last_body: '', last_deleted: true })],
    });

    renderChat();

    expect(await screen.findByTestId('conversation-1')).toHaveTextContent('wiadomość usunięta');
  });

  it('opens the first conversation and lists its messages', async () => {
    renderChat();

    expect(await screen.findByTestId('message-1')).toHaveTextContent('wiadomość 1');
    expect(screen.getByTestId('message-2')).toHaveTextContent('ola');
  });

  it('switches to the conversation that is clicked', async () => {
    api.conversations.mockResolvedValue({ items: [conversation(1), conversation(2)] });

    renderChat();
    await screen.findByTestId('conversation-2');

    await userEvent.click(screen.getByTestId('conversation-2'));

    expect(api.messages).toHaveBeenLastCalledWith(2);
  });

  it('marks edited messages as edited', async () => {
    api.messages.mockResolvedValue({ items: [message(1, { edited_at: '2026-01-05T10:02:00.000Z' })], watermark: MARK });

    renderChat();

    expect(await screen.findByTestId('message-1')).toHaveTextContent('edytowane');
  });

  it('shows a deleted message as deleted instead of quoting it', async () => {
    api.messages.mockResolvedValue({
      items: [message(1, { body: '', deleted: true, can_edit: false })],
      watermark: MARK,
    });

    renderChat();
    const row = await screen.findByTestId('message-1');

    expect(row).toHaveTextContent('wiadomość usunięta');
    // Nothing left to do with it — no dots, no edit.
    expect(within(row).queryByRole('button', { name: 'Czynności wiadomości 1' })).not.toBeInTheDocument();
  });
});

describe('kształt wątku', () => {
  it('prints the name and the hour once per block, not once per line', async () => {
    api.messages.mockResolvedValue({
      items: [
        message(1, { body: 'od 12 do 13.30 mam spotkanie' }),
        message(2, { body: 'o której wracają?' }),
        message(3, { author_id: 11, author_name: 'ola', from_me: false, can_edit: false, body: 'Ok, potem obiad' }),
      ],
      watermark: MARK,
    });

    renderChat();
    await screen.findByTestId('message-3');

    expect(screen.getAllByText('Ty')).toHaveLength(1);
    expect(screen.getByTestId('message-2')).not.toHaveTextContent('Ty');
    expect(screen.getByTestId('message-3')).toHaveTextContent('ola');
  });

  it('breaks the block when the same person comes back after a pause', async () => {
    api.messages.mockResolvedValue({
      items: [
        message(1, { created_at: '2026-01-05T10:00:00.000Z' }),
        message(2, { created_at: '2026-01-05T12:30:00.000Z' }),
      ],
      watermark: MARK,
    });

    renderChat();
    await screen.findByTestId('message-2');

    expect(screen.getAllByText('Ty')).toHaveLength(2);
  });

  it('says which bubbles are mine', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    expect(screen.getByTestId('message-1')).toHaveAttribute('data-me');
    expect(screen.getByTestId('message-2')).not.toHaveAttribute('data-me');
  });

  it('folds the list of conversations behind a button in a narrow window', async () => {
    renderChat();
    expect(await screen.findByTestId('chat')).toHaveAttribute('data-side', 'closed');

    await userEvent.click(await screen.findByRole('button', { name: 'Rozmowy' }));
    expect(screen.getByTestId('chat')).toHaveAttribute('data-side', 'open');

    await userEvent.click(screen.getByRole('button', { name: 'Rozmowy' }));
    expect(screen.getByTestId('chat')).toHaveAttribute('data-side', 'closed');
  });

  it('counts characters only when the message gets long', async () => {
    renderChat();
    const field = await screen.findByRole('textbox', { name: 'Treść wiadomości' });

    expect(screen.queryByText(/\/2000/)).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'x'.repeat(1700) } });

    expect(screen.getByText('1700/2000')).toBeInTheDocument();
  });
});

describe('writing', () => {
  it('sends on Enter and empties the field', async () => {
    renderChat();
    const field = await screen.findByRole('textbox', { name: 'Treść wiadomości' });

    await userEvent.type(field, 'cześć');
    await userEvent.keyboard('{Enter}');

    expect(api.send).toHaveBeenCalledWith(1, 'cześć', []);
    expect(field).toHaveValue('');
    expect(await screen.findByTestId('message-9')).toBeInTheDocument();
  });

  it('keeps the text when the send fails', async () => {
    api.send.mockRejectedValue(new Error('serwer milczy'));

    renderChat();
    const field = await screen.findByRole('textbox', { name: 'Treść wiadomości' });
    await userEvent.type(field, 'zostanie tu');
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText('serwer milczy')).toBeInTheDocument();
    expect(field).toHaveValue('zostanie tu');
  });

  it('will not send an empty line', async () => {
    renderChat();
    const field = await screen.findByRole('textbox', { name: 'Treść wiadomości' });
    const send = () => screen.getByRole('button', { name: 'Wyślij' });

    // Spaces are not a message, and the button says so before any request.
    expect(send()).toBeDisabled();
    await userEvent.type(field, '   ');
    expect(send()).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    expect(api.send).not.toHaveBeenCalled();

    await userEvent.type(field, 'prawdziwe słowo');
    expect(send()).toBeEnabled();
  });
});

describe('fixing a message inside five minutes', () => {
  it('lets the author correct their own message', async () => {
    renderChat();
    const row = await screen.findByTestId('message-1');

    await pickRowAction(row, 'Czynności wiadomości 1', 'Popraw');
    const editor = await screen.findByRole('textbox', { name: 'Treść wiadomości 1' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'kupić baterie');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(api.edit).toHaveBeenCalledWith(1, 'kupić baterie');
    expect(await screen.findByTestId('message-1')).toHaveTextContent('kupić baterie');
  });

  it('gives the edit back when the author cancels', async () => {
    renderChat();
    const row = await screen.findByTestId('message-1');

    await pickRowAction(row, 'Czynności wiadomości 1', 'Popraw');
    const editor = await screen.findByRole('textbox', { name: 'Treść wiadomości 1' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'nie, jednak nie');
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));

    expect(api.edit).not.toHaveBeenCalled();
    expect(screen.getByTestId('message-1')).toHaveTextContent('wiadomość 1');
  });

  it('offers nothing on somebody else\'s message', async () => {
    renderChat();
    const row = await screen.findByTestId('message-2');

    // No dots at all: nothing to do with somebody else's message.
    expect(within(row).queryByRole('button', { name: 'Czynności wiadomości 2' })).not.toBeInTheDocument();
  });

  it('hides the buttons once the five minutes are past', async () => {
    api.messages.mockResolvedValue({
      items: [message(1, { can_edit: false, editable_until: null })],
      watermark: MARK,
    });

    renderChat();
    const row = await screen.findByTestId('message-1');

    expect(within(row).queryByRole('button', { name: 'Czynności wiadomości 1' })).not.toBeInTheDocument();
  });

  it('leaves a tombstone where its own message was', async () => {
    renderChat();
    const row = await screen.findByTestId('message-1');

    await pickRowAction(row, 'Czynności wiadomości 1', 'Usuń');

    expect(api.remove).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('message-1')).toHaveTextContent('wiadomość usunięta');
  });
});

describe('rozmowa z kilkoma osobami', () => {
  it('shows who is in a group and offers to add somebody', async () => {
    api.conversations.mockResolvedValue({
      items: [conversation(1, { is_group: true, title: 'Remont', peer: null })],
    });
    api.detail.mockResolvedValue({
      ...conversation(1),
      members: [{ id: 1, username: 'ala' }, { id: 11, username: 'ola' }],
    });

    renderChat();

    expect(await screen.findByRole('heading', { name: 'Remont' })).toBeInTheDocument();
    expect(screen.getByText('ala, ola')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj osobę' })).toBeInTheDocument();
  });

  it('does not offer to grow a 1:1 thread', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    expect(screen.queryByRole('button', { name: 'Dodaj osobę' })).not.toBeInTheDocument();
  });

  it('adds a person from the panel, without listing those already inside', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    await userEvent.click(screen.getByRole('button', { name: 'Nowy czat' }));
    await screen.findByTestId('new-chat');
    await userEvent.click(screen.getByRole('button', { name: 'Zamknij' }));

    // Opening the add-member panel through the header of a group.
    api.conversations.mockResolvedValue({
      items: [conversation(1, { is_group: true, title: 'Remont', peer: null })],
    });
    // The member ids are the ids from the people list — otherwise "already inside"
    // would be decided on a made-up number.
    api.detail.mockResolvedValue({ ...conversation(1), members: [{ id: 5, username: 'ola' }] });
    await useChat.getState().load();

    await userEvent.click(await screen.findByRole('button', { name: 'Dodaj osobę' }));
    const panel = await screen.findByTestId('add-member');

    expect(within(panel).getByRole('button', { name: 'Dodaj ivo' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Dodaj ola' })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Dodaj ivo' }));

    expect(api.addMember).toHaveBeenCalledWith(1, 6);
  });

  it('starts a thread with one person from the picker', async () => {
    renderChat();

    await userEvent.click(await screen.findByRole('button', { name: 'Nowy czat' }));
    const panel = await screen.findByTestId('new-chat');

    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Wybierz ola' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Utwórz rozmowę' }));

    expect(api.start).toHaveBeenCalledWith(5);
    expect(screen.queryByTestId('new-chat')).not.toBeInTheDocument();
  });

  it('makes a group out of two picked people and their name', async () => {
    const group = conversation(7, { is_group: true, title: 'Remont', peer: null });
    api.conversations.mockResolvedValue({ items: [group, conversation(1)] });
    renderChat();

    await userEvent.click(await screen.findByRole('button', { name: 'Nowy czat' }));
    const panel = await screen.findByTestId('new-chat');

    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Wybierz ola' }));
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Wybierz ivo' }));
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Nazwa rozmowy' }), 'Remont');
    await userEvent.click(within(panel).getByRole('button', { name: 'Utwórz grupę' }));

    expect(api.createGroup).toHaveBeenCalledWith({ title: 'Remont', member_ids: [5, 6] });
    expect(await screen.findByRole('heading', { name: 'Remont' })).toBeInTheDocument();
  });

  it('filters the list of people', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Nowy czat' }));
    const panel = await screen.findByTestId('new-chat');

    await userEvent.type(within(panel).getByRole('searchbox', { name: 'Szukaj osoby' }), 'ivo');

    expect(within(panel).getByText('ivo')).toBeInTheDocument();
    expect(within(panel).queryByText('ola')).not.toBeInTheDocument();
  });

  it('cannot create anything without picking anybody', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Nowy czat' }));
    const panel = await screen.findByTestId('new-chat');

    expect(within(panel).getByRole('button', { name: 'Utwórz rozmowę' })).toBeDisabled();
  });
});

describe('emotikonki', () => {
  it('opens the panel, puts the pick into the field and sends it with the text', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    await userEvent.click(screen.getByRole('button', { name: 'Wstaw emotikonkę' }));
    const panel = await screen.findByTestId('emoji-picker');

    const field = screen.getByRole('textbox', { name: 'Treść wiadomości' });
    await userEvent.type(field, 'cześć');
    await userEvent.click(within(panel).getByRole('button', { name: 'Wstaw 😀' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij' }));

    // The emoji lands where the caret was — at the end of what was typed.
    expect(api.send).toHaveBeenCalledWith(1, 'cześć😀', []);
  });

  it('leaves the caret right behind the emoji, so typing just continues', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Wstaw emotikonkę' }));
    const panel = await screen.findByTestId('emoji-picker');
    await userEvent.click(within(panel).getByRole('button', { name: 'Wstaw 😀' }));

    const field = screen.getByRole('textbox', { name: 'Treść wiadomości' }) as HTMLTextAreaElement;
    // '😀' is two code units, and the caret has to sit after both of them.
    await vi.waitFor(() => expect(field.selectionStart).toBe(2));

    await userEvent.type(field, '!');
    expect(field).toHaveValue('😀!');
  });

  it('keeps the panel open after a pick, because nobody sends one alone', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Wstaw emotikonkę' }));
    const panel = await screen.findByTestId('emoji-picker');

    await userEvent.click(within(panel).getByRole('button', { name: 'Wstaw 😂' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Wstaw 😍' }));

    expect(screen.getByRole('textbox', { name: 'Treść wiadomości' })).toHaveValue('😂😍');
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
  });

  it('changes the category without leaving the panel', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Wstaw emotikonkę' }));
    const panel = await screen.findByTestId('emoji-picker');

    expect(within(panel).getByRole('button', { name: 'Wstaw 😀' })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Zwierzęta' }));

    expect(within(panel).getByRole('button', { name: 'Wstaw 🐶' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Wstaw 😀' })).not.toBeInTheDocument();
  });

  it('closes the panel on request', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Wstaw emotikonkę' }));
    const panel = await screen.findByTestId('emoji-picker');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
    expect(panel).toBeDefined();
  });
});

describe('zdjęcia', () => {
  const picture = () => new File([new Uint8Array([1, 2, 3])], 'kot.png', { type: 'image/png' });

  it('draws a thumbnail for a picture that came with a message', async () => {
    api.messages.mockResolvedValue(
      page([message(1, { body: '', attachments: [{ id: 5, file_name: 'kot.png', mime: 'image/png', size: 3, created_at: MARK }] })]),
    );

    renderChat();

    const thumb = await screen.findByRole('img', { name: 'kot.png' });
    // `?v=` carries the moment of the upload: the same address must never stand
    // for two different pictures, however the database numbers them.
    expect(thumb.getAttribute('src')).toMatch(/^\/api\/chat\/attachments\/5\?v=/);
  });

  it('shows a picture of its own, without an empty bubble next to it', async () => {
    api.messages.mockResolvedValue(
      page([message(1, { body: '', attachments: [{ id: 5, file_name: 'wakacje.png', mime: 'image/png', size: 3, created_at: MARK }] })]),
    );

    renderChat();
    const row = await screen.findByTestId('message-1');

    expect(within(row).getByRole('img', { name: 'wakacje.png' })).toBeInTheDocument();
    // A picture on its own gets no empty bubble beside it.
    expect(row.querySelector('p')).toBeNull();
  });

  it('sends the bytes first and names the upload in the message', async () => {
    api.uploadAttachment.mockResolvedValue({
      id: 9,
      file_name: 'kot.png',
      mime: 'image/png',
      size: 3,
      created_at: MARK,
    });

    renderChat();
    await screen.findByTestId('message-1');

    fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), {
      target: { files: [picture()] },
    });

    const pending = await screen.findByTestId('pending-pictures');
    expect(within(pending).getByRole('img', { name: 'kot.png' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'Treść wiadomości' }), 'spójrz');
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij' }));

    expect(api.uploadAttachment).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'kot.png' }));
    expect(api.send).toHaveBeenCalledWith(1, 'spójrz', [9]);
  });

  it('lets a picture go out without a word', async () => {
    api.uploadAttachment.mockResolvedValue({
      id: 9,
      file_name: 'kot.png',
      mime: 'image/png',
      size: 3,
      created_at: MARK,
    });

    renderChat();
    await screen.findByTestId('message-1');

    const send = screen.getByRole('button', { name: 'Wyślij' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), {
      target: { files: [picture()] },
    });

    expect(send).toBeEnabled();
    await userEvent.click(send);

    expect(api.send).toHaveBeenCalledWith(1, '', [9]);
  });

  it('takes a picture away again before it is sent', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), {
      target: { files: [picture()] },
    });
    expect(await screen.findByTestId('pending-pictures')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Usuń kot.png' }));

    expect(screen.queryByTestId('pending-pictures')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wyślij' })).toBeDisabled();
  });

  it('refuses to carry something that is not a picture', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), {
      target: { files: [new File(['MZ'], 'instalator.exe', { type: 'application/octet-stream' })] },
    });

    expect(screen.queryByTestId('pending-pictures')).not.toBeInTheDocument();
  });

  it('stops a picture that is too big before it leaves the browser', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    const huge = new File([new Uint8Array(CHAT_ATTACHMENT_MAX_MB * 1024 * 1024 + 1)], 'olbrzym.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), { target: { files: [huge] } });

    expect(await screen.findByRole('status')).toHaveTextContent('olbrzym.png');
    expect(screen.queryByTestId('pending-pictures')).not.toBeInTheDocument();
    expect(api.uploadAttachment).not.toHaveBeenCalled();
  });

  it('keeps what fits and says which file did not', async () => {
    renderChat();
    await screen.findByTestId('message-1');

    const huge = new File([new Uint8Array(CHAT_ATTACHMENT_MAX_MB * 1024 * 1024 + 1)], 'olbrzym.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), {
      target: { files: [huge, picture()] },
    });

    expect(await screen.findByRole('status')).toHaveTextContent('olbrzym.png');
    expect(within(screen.getByTestId('pending-pictures')).getByRole('img', { name: 'kot.png' })).toBeInTheDocument();
  });

  it('shows each picked picture once and forgets only the one taken away', async () => {
    // jsdom has no object URLs, so they are made here from the file name: a
    // thumbnail must be made once per file and revoked when that file leaves.
    const urls = URL as unknown as { createObjectURL?: (file: File) => string; revokeObjectURL?: (url: string) => void };
    const created = urls.createObjectURL;
    const revoked = urls.revokeObjectURL;
    let made = 0;
    const dropped: string[] = [];
    urls.createObjectURL = (file) => {
      made += 1;
      return `blob:${file.name}#${made}`;
    };
    urls.revokeObjectURL = (url) => void dropped.push(url);

    try {
      renderChat();
      await screen.findByTestId('message-1');

      fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), { target: { files: [picture()] } });
      fireEvent.change(screen.getByLabelText('Wybierz zdjęcie'), {
        target: { files: [new File([new Uint8Array([9])], 'zachod.png', { type: 'image/jpeg' })] },
      });

      const pending = await screen.findByTestId('pending-pictures');
      expect([...pending.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
        'blob:kot.png#1',
        'blob:zachod.png#2',
      ]);

      await userEvent.click(screen.getByRole('button', { name: 'Usuń kot.png' }));

      // The picture that stayed kept its own address — a thumbnail remade on every
      // render is a thumbnail that visibly blinks (and leaks an URL each time).
      expect([...pending.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
        'blob:zachod.png#2',
      ]);
      expect(made).toBe(2);
      expect(dropped).toEqual(['blob:kot.png#1']);
    } finally {
      if (created) urls.createObjectURL = created;
      else delete urls.createObjectURL;
      if (revoked) urls.revokeObjectURL = revoked;
      else delete urls.revokeObjectURL;
    }
  });

  it('makes a picture bigger on a click and hides it again', async () => {
    api.messages.mockResolvedValue(
      page([message(1, { body: '', attachments: [{ id: 5, file_name: 'kot.png', mime: 'image/png', size: 3, created_at: MARK }] })]),
    );

    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Powiększ kot.png' }));

    const lightbox = await screen.findByTestId('lightbox');
    expect(within(lightbox).getByRole('img', { name: 'kot.png' }).getAttribute('src')).toMatch(
      /^\/api\/chat\/attachments\/5\?v=/,
    );

    await userEvent.click(within(lightbox).getByRole('button', { name: 'Zamknij' }));

    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });
});
