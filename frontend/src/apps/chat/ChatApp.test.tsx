/**
 * The chat window, driven like a person: read the list, answer, fix a typo inside
 * the five minutes, start a new thread.
 */
import { screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pickRowAction } from '../../test/rowMenu';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi } from './chatApi';
import { ChatApp } from './ChatApp';
import { chatDefaults, useChat } from './chatStore';
import type { Conversation, Message } from '../../api/types';

vi.mock('./chatApi', () => ({
  chatApi: {
    people: vi.fn(),
    conversations: vi.fn(),
    start: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
  },
}));

const api = vi.mocked(chatApi);

/** Still inside the window: the client hides the buttons once this moment passes. */
const stillEditable = new Date(Date.now() + 180_000).toISOString();

const conversation = (id: number, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  peer: { id: id + 10, username: id === 1 ? 'ola' : 'ivo' },
  last_body: 'co słychać',
  last_at: '2026-01-05T10:00:00.000Z',
  last_from_me: false,
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
  editable_until: stillEditable,
  can_edit: true,
  ...overrides,
});

function renderChat() {
  return render(<ChatApp windowKey="chat" appId="chat" payload={{}} />);
}

beforeEach(() => {
  useChat.setState(chatDefaults);
  vi.resetAllMocks();
  api.conversations.mockResolvedValue({ items: [conversation(1)] });
  api.messages.mockResolvedValue({ items: [message(1), message(2, { author_id: 11, author_name: 'ola', can_edit: false })] });
  api.people.mockResolvedValue({ items: [{ id: 5, username: 'ola' }, { id: 6, username: 'ivo' }] });
  api.start.mockResolvedValue(conversation(3, { peer: { id: 5, username: 'ola' } }));
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
    api.messages.mockResolvedValue({ items: [message(1, { edited_at: '2026-01-05T10:02:00.000Z' })] });

    renderChat();

    expect(await screen.findByTestId('message-1')).toHaveTextContent('edytowane');
  });
});

describe('writing', () => {
  it('sends on Enter and empties the field', async () => {
    renderChat();
    const field = await screen.findByRole('textbox', { name: 'Treść wiadomości' });

    await userEvent.type(field, 'cześć');
    await userEvent.keyboard('{Enter}');

    expect(api.send).toHaveBeenCalledWith(1, 'cześć');
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
    });

    renderChat();
    const row = await screen.findByTestId('message-1');

    expect(within(row).queryByRole('button', { name: 'Czynności wiadomości 1' })).not.toBeInTheDocument();
  });

  it('deletes a message of one\'s own', async () => {
    renderChat();
    const row = await screen.findByTestId('message-1');

    await pickRowAction(row, 'Czynności wiadomości 1', 'Usuń');

    expect(api.remove).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId('message-1')).not.toBeInTheDocument();
  });
});

describe('a new conversation', () => {
  it('opens the person picker and starts the thread', async () => {
    renderChat();

    await userEvent.click(await screen.findByRole('button', { name: 'Nowy czat' }));
    const panel = await screen.findByTestId('new-chat');

    await userEvent.click(within(panel).getByRole('button', { name: 'Napisz do ola' }));

    expect(api.start).toHaveBeenCalledWith(5);
    expect(screen.queryByTestId('new-chat')).not.toBeInTheDocument();
  });

  it('filters the list of people', async () => {
    renderChat();
    await userEvent.click(await screen.findByRole('button', { name: 'Nowy czat' }));
    const panel = await screen.findByTestId('new-chat');

    await userEvent.type(within(panel).getByRole('searchbox', { name: 'Szukaj osoby' }), 'ivo');

    expect(within(panel).getByText('ivo')).toBeInTheDocument();
    expect(within(panel).queryByText('ola')).not.toBeInTheDocument();
  });
});
