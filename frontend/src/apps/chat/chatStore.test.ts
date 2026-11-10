import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { chatApi } from './chatApi';
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

const conversation = (id: number, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  peer: { id: id + 10, username: `ola${id}` },
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
  from_me: true,
  editable_until: '2026-01-05T10:05:00.000Z',
  can_edit: true,
  ...overrides,
});

function stubEmptyApi() {
  api.conversations.mockResolvedValue({ items: [] });
  api.messages.mockResolvedValue({ items: [] });
  api.people.mockResolvedValue({ items: [] });
}

beforeEach(() => {
  useChat.setState(chatDefaults);
  vi.resetAllMocks();
  stubEmptyApi();
});

describe('opening the window', () => {
  it('loads conversations and opens the first one', async () => {
    api.conversations.mockResolvedValue({ items: [conversation(1), conversation(2)] });
    api.messages.mockResolvedValue({ items: [message(7), message(8)] });

    await useChat.getState().load();

    expect(useChat.getState().activeId).toBe(1);
    expect(api.messages).toHaveBeenCalledWith(1);
    expect(useChat.getState().messages.map((m) => m.id)).toEqual([7, 8]);
    expect(useChat.getState().watermark).toBe(8);
    expect(useChat.getState().status).toBe('ready');
  });

  it('keeps the conversation that is already open', async () => {
    useChat.setState({ activeId: 2 });
    api.conversations.mockResolvedValue({ items: [conversation(1), conversation(2)] });

    await useChat.getState().load();

    expect(useChat.getState().activeId).toBe(2);
    expect(api.messages).toHaveBeenCalledWith(2);
  });

  it('reports a broken API without throwing', async () => {
    api.conversations.mockRejectedValue(new Error('502'));

    await useChat.getState().load();

    expect(useChat.getState()).toMatchObject({ status: 'error', error: '502' });
  });
});

describe('polling', () => {
  it('asks only for what is newer and appends it', async () => {
    useChat.setState({ activeId: 1, messages: [message(1)], watermark: 1 });
    api.messages.mockResolvedValue({ items: [message(2)] });

    await useChat.getState().refresh();

    expect(api.messages).toHaveBeenCalledWith(1, 1);
    expect(useChat.getState().messages.map((m) => m.id)).toEqual([1, 2]);
    expect(useChat.getState().watermark).toBe(2);
  });

  it('never repeats a message both sides already have', async () => {
    useChat.setState({ activeId: 1, messages: [message(1), message(2)], watermark: 1 });
    api.messages.mockResolvedValue({ items: [message(2), message(3)] });

    await useChat.getState().refresh();

    expect(useChat.getState().messages.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('refreshes the sidebar even when the thread is quiet', async () => {
    useChat.setState({ activeId: 1, messages: [message(1)], watermark: 1 });
    api.messages.mockResolvedValue({ items: [] });
    api.conversations.mockResolvedValue({ items: [conversation(1, { unread: 3 })] });

    await useChat.getState().refresh();

    expect(api.conversations).toHaveBeenCalled();
    expect(useChat.getState().conversations[0].unread).toBe(3);
  });

  it('keeps the thread on screen when a poll fails', async () => {
    useChat.setState({ messages: [message(1)], watermark: 1, activeId: 1 });
    api.messages.mockRejectedValue(new Error('brak sieci'));

    await useChat.getState().refresh();

    expect(useChat.getState().messages).toHaveLength(1);
    expect(useChat.getState().error).toBe('brak sieci');
  });
});

describe('writing', () => {
  it('appends what the server confirmed and re-reads the sidebar', async () => {
    useChat.setState({ activeId: 1 });
    api.send.mockResolvedValue(message(9, { body: 'cześć' }));

    const ok = await useChat.getState().send('  cześć  ');

    expect(ok).toBe(true);
    expect(api.send).toHaveBeenCalledWith(1, 'cześć');
    expect(useChat.getState().messages.map((m) => m.id)).toEqual([9]);
    expect(api.conversations).toHaveBeenCalled();
  });

  it('keeps sending=false and reports the reason when it fails', async () => {
    useChat.setState({ activeId: 1 });
    api.send.mockRejectedValue(new Error('403'));

    const ok = await useChat.getState().send('nic z tego');

    expect(ok).toBe(false);
    expect(useChat.getState().sending).toBe(false);
    expect(useChat.getState().error).toBe('403');
    expect(useChat.getState().messages).toHaveLength(0);
  });

  it('refuses to send empty text or without a conversation', async () => {
    expect(await useChat.getState().send('   ')).toBe(false);
    expect(await useChat.getState().send('jest treść, nie ma rozmowy')).toBe(false);
    expect(api.send).not.toHaveBeenCalled();
  });

  it('edits a message in place', async () => {
    useChat.setState({ messages: [message(1, { body: 'bateree' })] });
    api.edit.mockResolvedValue(message(1, { body: 'baterie', edited_at: '2026-01-05T10:02:00.000Z' }));

    const ok = await useChat.getState().edit(1, 'baterie');

    expect(ok).toBe(true);
    expect(useChat.getState().messages[0]).toMatchObject({ body: 'baterie', edited_at: '2026-01-05T10:02:00.000Z' });
  });

  it('asks the server again when the five minutes ran out mid-edit', async () => {
    useChat.setState({ activeId: 1, messages: [message(1, { body: 'bateree' })], watermark: 1 });
    api.edit.mockRejectedValue(new ApiError(403, 'edit_window_closed', 'za późno'));
    api.messages.mockResolvedValue({ items: [message(1, { can_edit: false, editable_until: null })] });

    const ok = await useChat.getState().edit(1, 'baterie');

    expect(ok).toBe(false);
    expect(useChat.getState().error).toBe('za późno');
    expect(useChat.getState().messages[0].can_edit).toBe(false);
  });

  it('removes a message, and puts it back when the server refuses', async () => {
    useChat.setState({ activeId: 1, messages: [message(1), message(2)] });
    api.remove.mockRejectedValue(new Error('403'));

    await useChat.getState().remove(1);

    expect(useChat.getState().messages.map((m) => m.id)).toEqual([1, 2]);
    expect(useChat.getState().error).toBe('403');
  });
});

describe('a new conversation', () => {
  it('opens the panel with the people list', async () => {
    api.people.mockResolvedValue({ items: [{ id: 5, username: 'ola' }] });

    await useChat.getState().openNewChat();

    expect(useChat.getState()).toMatchObject({ newChatOpen: true });
    expect(useChat.getState().people).toEqual([{ id: 5, username: 'ola' }]);
  });

  it('starts one and switches to it', async () => {
    api.start.mockResolvedValue(conversation(4));
    // The server's list now includes the thread that was just opened.
    api.conversations.mockResolvedValue({ items: [conversation(4)] });

    await useChat.getState().start(5);

    expect(api.start).toHaveBeenCalledWith(5);
    expect(useChat.getState()).toMatchObject({ activeId: 4, newChatOpen: false });
    expect(useChat.getState().conversations.map((c) => c.id)).toEqual([4]);
  });

  it('closes the panel on request', async () => {
    useChat.setState({ newChatOpen: true });

    useChat.getState().closeNewChat();

    expect(useChat.getState().newChatOpen).toBe(false);
  });
});
