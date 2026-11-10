import { create } from 'zustand';
import { ApiError } from '../../api/client';
import { chatApi } from './chatApi';
import type { ChatPeer, Conversation, ConversationDetail, Message } from '../../api/types';

/**
 * Chat window state.
 *
 * The store holds no timer: the component decides when to call `refresh`, so the
 * polling can be stopped by closing the window or hiding the tab without the store
 * having to know anything about either.
 *
 * Whether a message may still be edited never comes from a local clock — the server
 * answers with `can_edit`, and the client only draws it.
 *
 * What a poll brings is decided by the server: new lines, corrected lines and
 * tombstones of deleted ones. `watermark` is the moment the server handed over,
 * and it goes straight back on the next call.
 */

interface ChatStore {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  conversations: Conversation[];
  activeId: number | null;
  messages: Message[];
  /** Who is in the open conversation (a group shows them in its header). */
  members: ChatPeer[];
  /** Moment the server last answered with — send it back to get what changed. */
  watermark: string;

  people: ChatPeer[];
  newChatOpen: boolean;
  addMemberOpen: boolean;
  sending: boolean;

  load: () => Promise<void>;
  /** `known` is the conversation the server just handed back — no need to ask again. */
  open: (id: number, known?: ConversationDetail) => Promise<void>;
  refresh: () => Promise<void>;
  start: (userId: number) => Promise<void>;
  createGroup: (title: string, memberIds: number[]) => Promise<void>;
  openNewChat: () => Promise<void>;
  closeNewChat: () => void;
  openAddMember: () => Promise<void>;
  closeAddMember: () => void;
  addMember: (userId: number) => Promise<void>;
  /** Words, pictures picked a moment ago, or both. */
  send: (body: string, files?: File[]) => Promise<boolean>;
  edit: (id: number, body: string) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
}

export const chatDefaults: Pick<
  ChatStore,
  | 'status'
  | 'error'
  | 'conversations'
  | 'activeId'
  | 'messages'
  | 'members'
  | 'watermark'
  | 'people'
  | 'newChatOpen'
  | 'addMemberOpen'
  | 'sending'
> = {
  status: 'idle',
  error: null,
  conversations: [],
  activeId: null,
  messages: [],
  members: [],
  watermark: '',
  people: [],
  newChatOpen: false,
  addMemberOpen: false,
  sending: false,
};

export const useChat = create<ChatStore>((set, get) => ({
  ...chatDefaults,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const { items } = await chatApi.conversations();
      // Keep what is open if it survived, otherwise open the newest conversation
      // so the window does not start as an empty pane.
      const keep = items.find((conversation) => conversation.id === get().activeId);
      const active = keep ?? items[0] ?? null;
      set({ conversations: items, status: 'ready' });
      if (active) await get().open(active.id);
      else set({ activeId: null, messages: [], members: [], watermark: '' });
    } catch (error) {
      set({ status: 'error', error: describe(error) });
    }
  },

  open: async (id, known) => {
    set({ activeId: id, watermark: '', newChatOpen: false, addMemberOpen: false });
    try {
      const [page, conversation] = await Promise.all([
        chatApi.messages(id),
        known ? Promise.resolve(known) : chatApi.detail(id),
      ]);
      set({
        messages: page.items,
        watermark: page.watermark,
        members: conversation.members,
      });
      // Reading moves the unread counter, so the sidebar has to be re-read too.
      const { items } = await chatApi.conversations();
      set({ conversations: items });
    } catch (error) {
      set({ messages: [], watermark: '', members: [], error: describe(error) });
    }
  },

  /**
   * What the window calls every few seconds: what arrived, what was corrected,
   * what was deleted, and the counters of the sidebar.
   */
  refresh: async () => {
    const { activeId } = get();
    try {
      if (activeId !== null) {
        const page = await chatApi.messages(activeId, get().watermark || undefined);
        set({
          messages: merge(get().messages, page.items),
          watermark: page.watermark,
        });
      }
      const { items } = await chatApi.conversations();
      set({ conversations: items, error: null });
    } catch (error) {
      // A poll must not blank the screen: the next one will try again.
      set({ error: describe(error) });
    }
  },

  start: async (userId) => {
    try {
      const conversation = await chatApi.start(userId);
      set({ newChatOpen: false });
      await get().open(conversation.id, conversation);
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  createGroup: async (title, memberIds) => {
    try {
      const conversation = await chatApi.createGroup({ title: title.trim(), member_ids: memberIds });
      set({ newChatOpen: false });
      await get().open(conversation.id, conversation);
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  openNewChat: async () => {
    set({ newChatOpen: true, error: null });
    try {
      const { items } = await chatApi.people();
      set({ people: items });
    } catch (error) {
      set({ newChatOpen: false, error: describe(error) });
    }
  },

  closeNewChat: () => set({ newChatOpen: false }),

  openAddMember: async () => {
    set({ addMemberOpen: true, error: null });
    try {
      const { items } = await chatApi.people();
      set({ people: items });
    } catch (error) {
      set({ addMemberOpen: false, error: describe(error) });
    }
  },

  closeAddMember: () => set({ addMemberOpen: false }),

  addMember: async (userId) => {
    const activeId = get().activeId;
    if (activeId === null) return;
    try {
      const conversation = await chatApi.addMember(activeId, userId);
      set({ addMemberOpen: false, members: conversation.members });
      const { items } = await chatApi.conversations();
      set({ conversations: items });
    } catch (error) {
      set({ error: describe(error) });
    }
  },

  send: async (body, files = []) => {
    const trimmed = body.trim();
    const activeId = get().activeId;
    if ((!trimmed && files.length === 0) || activeId === null) return false;

    set({ sending: true, error: null });
    try {
      // Pictures first: the message names the uploads it carries.
      const ids: number[] = [];
      for (const file of files) {
        const uploaded = await chatApi.uploadAttachment(activeId, file);
        ids.push(uploaded.id);
      }
      const message = await chatApi.send(activeId, trimmed, ids);
      set({
        messages: merge(get().messages, [message]),
        sending: false,
      });
      // My own message moves the ordering of the sidebar as well.
      const { items } = await chatApi.conversations();
      set({ conversations: items });
      return true;
    } catch (error) {
      // The text stays in the composer — a failed send must not eat a sentence.
      set({ sending: false, error: describe(error) });
      return false;
    }
  },

  edit: async (id, body) => {
    const trimmed = body.trim();
    if (!trimmed) return false;
    const before = get().messages;
    try {
      const updated = await chatApi.edit(id, trimmed);
      set({ messages: get().messages.map((message) => (message.id === id ? updated : message)) });
      return true;
    } catch (error) {
      const reason = describe(error);
      set({ messages: before, error: reason });
      // "Too late" means our copy went stale mid-edit: ask again what is editable,
      // so the button disappears instead of failing on every try. The refresh must
      // not swallow the reason, or the person is left with a silent no-op.
      if (error instanceof ApiError && error.code === 'edit_window_closed') {
        await get().refresh();
        set({ error: reason });
      }
      return false;
    }
  },

  /** A deleted message stays on screen as "usunięta" — the other person has to
   * learn about the deletion, so it is not a message any more, it is a fact. */
  remove: async (id) => {
    const before = get();
    set({
      messages: before.messages.map((message) =>
        message.id === id ? { ...message, body: '', deleted: true, can_edit: false } : message,
      ),
    });
    try {
      await chatApi.remove(id);
      const { items } = await chatApi.conversations();
      set({ conversations: items });
    } catch (error) {
      set({ messages: before.messages, conversations: before.conversations, error: describe(error) });
    }
  },
}));

/**
 * Fold a poll into what is on screen: new ids go to the end, ids we already have
 * are *replaced* rather than dropped — the server is telling us something new about
 * a message we saw before (it was corrected, it stopped being editable, it is gone).
 */
function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'nieznany błąd';
}

/** Used when the window closes: the next opening starts from a clean slate. */
export function resetChat(): void {
  useChat.setState(chatDefaults);
}
