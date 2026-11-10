/**
 * Chat store: what a poll is allowed to change on screen, and what a failed call
 * must leave exactly as it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { chatApi } from './chatApi';
import { chatDefaults, useChat } from './chatStore';
import type { ChatPeer, Conversation, Message } from '../../api/types';

vi.mock('./chatApi', () => ({
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
    edit: vi.fn(),
    remove: vi.fn(),
  },
}));

const api = vi.mocked(chatApi);

/** The moment the first answer was handed over — polls travel with it. */
const MARK = '2026-01-05T09:30:00.000Z';

const ola: ChatPeer = { id: 5, username: 'ola' };

const conversation = (id: number, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  peer: { id: id + 10, username: `ola${id}` },
  title: `ola${id}`,
  is_group: false,
  last_body: 'co słychać',
  last_at: '2026-01-05T10:00:00.000Z',
  last_from_me: false,
  last_deleted: false,
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
  deleted: false,
  ...overrides,
});

const page = (items: Message[], watermark = MARK) => ({ items, watermark });

function stubEmptyApi() {
  api.conversations.mockResolvedValue({ items: [] });
  api.messages.mockResolvedValue(page([]));
  api.detail.mockResolvedValue({ ...conversation(1), members: [] });
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
    api.messages.mockResolvedValue(page([message(7), message(8)], '2026-01-05T10:00:00.000Z'));

    await useChat.getState().load();

    expect(useChat.getState().activeId).toBe(1);
    expect(api.messages).toHaveBeenCalledWith(1);
    expect(useChat.getState().messages.map((m) => m.id)).toEqual([7, 8]);
    expect(useChat.getState().watermark).toBe('2026-01-05T10:00:00.000Z');
    expect(useChat.getState().status).toBe('ready');
  });

  it('reads who is in the conversation it opens', async () => {
    api.conversations.mockResolvedValue({ items: [conversation(1, { is_group: true, title: 'Remont' })] });
    api.detail.mockResolvedValue({ ...conversation(1), members: [ola] });

    await useChat.getState().load();

    expect(api.detail).toHaveBeenCalledWith(1);
    expect(useChat.getState().members).toEqual([ola]);
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
  it('asks with the moment it was last given and appends what is new', async () => {
    useChat.setState({ activeId: 1, messages: [message(1)], watermark: MARK });
    api.messages.mockResolvedValue(page([message(2)], '2026-01-05T10:01:00.000Z'));

    await useChat.getState().refresh();

    expect(api.messages).toHaveBeenCalledWith(1, MARK);
    expect(useChat.getState().messages.map((m) => m.id)).toEqual([1, 2]);
    expect(useChat.getState().watermark).toBe('2026-01-05T10:01:00.000Z');
  });

  it('never repeats a message both sides already have', async () => {
    useChat.setState({ activeId: 1, messages: [message(1), message(2)], watermark: MARK });
    api.messages.mockResolvedValue(page([message(2), message(3)]));

    await useChat.getState().refresh();

    expect(useChat.getState().messages.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  /**
   * The reason the poll asks with a moment instead of a message id: the other
   * person may have corrected something they wrote a while ago.
   */
  it('shows the corrected text the other person sent', async () => {
    useChat.setState({ activeId: 1, messages: [message(4, { body: 'kupić bateree' })], watermark: MARK });
    api.messages.mockResolvedValue(
      page([message(4, { body: 'kupić baterie', edited_at: '2026-01-05T10:02:00.000Z' })]),
    );

    await useChat.getState().refresh();

    expect(useChat.getState().messages).toHaveLength(1);
    expect(useChat.getState().messages[0]).toMatchObject({
      body: 'kupić baterie',
      edited_at: '2026-01-05T10:02:00.000Z',
    });
  });

  it('turns a message into a tombstone when the author deletes it', async () => {
    useChat.setState({ activeId: 1, messages: [message(4)], watermark: MARK });
    api.messages.mockResolvedValue(page([message(4, { body: '', deleted: true, can_edit: false })]));

    await useChat.getState().refresh();

    expect(useChat.getState().messages[0]).toMatchObject({ deleted: true, body: '', can_edit: false });
  });

  it('refreshes the sidebar even when the thread is quiet', async () => {
    useChat.setState({ activeId: 1, messages: [message(1)], watermark: MARK });
    api.messages.mockResolvedValue(page([]));
    api.conversations.mockResolvedValue({ items: [conversation(1, { unread: 3 })] });

    await useChat.getState().refresh();

    expect(api.conversations).toHaveBeenCalled();
    expect(useChat.getState().conversations[0].unread).toBe(3);
  });

  it('keeps the thread on screen when a poll fails', async () => {
    useChat.setState({ messages: [message(1)], watermark: MARK, activeId: 1 });
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
    useChat.setState({ activeId: 1, messages: [message(1, { body: 'bateree' })], watermark: MARK });
    api.edit.mockRejectedValue(new ApiError(403, 'edit_window_closed', 'za późno'));
    api.messages.mockResolvedValue(page([message(1, { can_edit: false, editable_until: null })]));

    const ok = await useChat.getState().edit(1, 'baterie');

    expect(ok).toBe(false);
    expect(useChat.getState().error).toBe('za późno');
    expect(useChat.getState().messages[0].can_edit).toBe(false);
  });

  it('leaves a tombstone where the message was', async () => {
    useChat.setState({ activeId: 1, messages: [message(1), message(2)] });
    api.remove.mockResolvedValue(undefined);

    await useChat.getState().remove(1);

    expect(useChat.getState().messages.map((m) => [m.id, m.deleted])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('puts the message back when the server refuses the deletion', async () => {
    useChat.setState({ activeId: 1, messages: [message(1), message(2)] });
    api.remove.mockRejectedValue(new Error('403'));

    await useChat.getState().remove(1);

    expect(useChat.getState().messages.map((m) => [m.id, m.deleted])).toEqual([
      [1, false],
      [2, false],
    ]);
    expect(useChat.getState().error).toBe('403');
  });
});

describe('a new conversation', () => {
  it('opens the panel with the people list', async () => {
    api.people.mockResolvedValue({ items: [ola] });

    await useChat.getState().openNewChat();

    expect(useChat.getState()).toMatchObject({ newChatOpen: true });
    expect(useChat.getState().people).toEqual([ola]);
  });

  it('starts one and switches to it', async () => {
    api.start.mockResolvedValue({ ...conversation(4), members: [ola] });
    // The server's list now includes the thread that was just opened.
    api.conversations.mockResolvedValue({ items: [conversation(4)] });

    await useChat.getState().start(5);

    expect(api.start).toHaveBeenCalledWith(5);
    expect(useChat.getState()).toMatchObject({ activeId: 4, newChatOpen: false });
    expect(useChat.getState().conversations.map((c) => c.id)).toEqual([4]);
  });

  it('creates a group and remembers who is in it', async () => {
    api.createGroup.mockResolvedValue({
      ...conversation(9, { is_group: true, title: 'Remont' }),
      members: [ola, { id: 6, username: 'ivo' }],
    });
    api.conversations.mockResolvedValue({ items: [conversation(9, { is_group: true, title: 'Remont' })] });

    await useChat.getState().createGroup('Remont', [5, 6]);

    expect(api.createGroup).toHaveBeenCalledWith({ title: 'Remont', member_ids: [5, 6] });
    expect(useChat.getState()).toMatchObject({ activeId: 9, newChatOpen: false });
    expect(useChat.getState().members.map((m) => m.username)).toEqual(['ola', 'ivo']);
  });

  it('adds a person to the group that is open', async () => {
    useChat.setState({ activeId: 9, members: [ola] });
    api.addMember.mockResolvedValue({
      ...conversation(9, { is_group: true }),
      members: [ola, { id: 6, username: 'ivo' }],
    });

    await useChat.getState().addMember(6);

    expect(api.addMember).toHaveBeenCalledWith(9, 6);
    expect(useChat.getState().members.map((m) => m.username)).toEqual(['ola', 'ivo']);
    expect(useChat.getState().addMemberOpen).toBe(false);
  });

  it('opens the panel of people to add', async () => {
    api.people.mockResolvedValue({ items: [ola] });

    await useChat.getState().openAddMember();

    expect(useChat.getState()).toMatchObject({ addMemberOpen: true });
    expect(useChat.getState().people).toEqual([ola]);
  });

  it('closes the panel on request', async () => {
    useChat.setState({ newChatOpen: true, addMemberOpen: true });

    useChat.getState().closeNewChat();
    useChat.getState().closeAddMember();

    expect(useChat.getState()).toMatchObject({ newChatOpen: false, addMemberOpen: false });
  });
});
