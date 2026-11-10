import { create } from 'zustand';
import { ApiError } from '../../api/client';
import { chatApi } from './chatApi';
import type { ChatPeer, Conversation, Message } from '../../api/types';

/**
 * Chat window state.
 *
 * The store holds no timer: the component decides when to call `refresh`, so the
 * polling can be stopped by closing the window or hiding the tab without the store
 * having to know anything about either.
 *
 * Whether a message may still be edited never comes from a local clock — the server
 * answers with `can_edit`, and the client only draws it.
 */

interface ChatStore {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  conversations: Conversation[];
  activeId: number | null;
  messages: Message[];
  /** Highest message id we have; a poll asks only for what is newer. */
  watermark: number;

  people: ChatPeer[];
  newChatOpen: boolean;
  sending: boolean;

  load: () => Promise<void>;
  open: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
  start: (userId: number) => Promise<void>;
  openNewChat: () => Promise<void>;
  closeNewChat: () => void;
  send: (body: string) => Promise<boolean>;
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
  | 'watermark'
  | 'people'
  | 'newChatOpen'
  | 'sending'
> = {
  status: 'idle',
  error: null,
  conversations: [],
  activeId: null,
  messages: [],
  watermark: 0,
  people: [],
  newChatOpen: false,
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
      else set({ activeId: null, messages: [], watermark: 0 });
    } catch (error) {
      set({ status: 'error', error: describe(error) });
    }
  },

  open: async (id) => {
    set({ activeId: id, watermark: 0, newChatOpen: false });
    try {
      const page = await chatApi.messages(id);
      set({
        messages: page.items,
        watermark: page.items.at(-1)?.id ?? 0,
      });
      // Reading moves the unread counter, so the sidebar has to be re-read too.
      const { items } = await chatApi.conversations();
      set({ conversations: items });
    } catch (error) {
      set({ messages: [], watermark: 0, error: describe(error) });
    }
  },

  /** What the window calls every few seconds: new messages, updated counters. */
  refresh: async () => {
    const { activeId, watermark } = get();
    try {
      if (activeId !== null) {
        const page = await chatApi.messages(activeId, watermark || undefined);
        if (page.items.length > 0) {
          set({
            messages: merge(get().messages, page.items),
            watermark: page.items.at(-1)!.id,
          });
        }
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
      if (!get().conversations.some((entry) => entry.id === conversation.id)) {
        set({ conversations: [conversation, ...get().conversations] });
      }
      await get().open(conversation.id);
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

  send: async (body) => {
    const trimmed = body.trim();
    const activeId = get().activeId;
    if (!trimmed || activeId === null) return false;

    set({ sending: true, error: null });
    try {
      const message = await chatApi.send(activeId, trimmed);
      set({
        messages: [...get().messages, message],
        watermark: Math.max(get().watermark, message.id),
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

  remove: async (id) => {
    const before = get();
    set({ messages: before.messages.filter((message) => message.id !== id) });
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
 * are *replaced* rather than dropped — the server may be saying something new about
 * a message it sent before (it stopped being editable, its text was corrected).
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
