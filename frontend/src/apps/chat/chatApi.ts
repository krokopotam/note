import { request } from '../../api/client';
import type {
  ChatPeer,
  Conversation,
  ConversationDetail,
  Message,
  MessagePage,
  Unread,
} from '../../api/types';

/** Chat endpoints. Everything is a short JSON call — the window polls, no socket. */
export const chatApi = {
  people: () => request<{ items: ChatPeer[] }>('/chat/people'),
  conversations: () => request<{ items: Conversation[] }>('/chat/conversations'),

  /** How much is waiting, for the badge on the icon — no window has to be open. */
  unread: () => request<Unread>('/chat/unread'),

  start: (userId: number) =>
    request<ConversationDetail>('/chat/conversations', { method: 'POST', body: { user_id: userId } }),

  /** One conversation with its members — what the header of the window shows. */
  detail: (conversationId: number) =>
    request<ConversationDetail>(`/chat/conversations/${conversationId}`),

  createGroup: (input: { title?: string; member_ids: number[] }) =>
    request<ConversationDetail>('/chat/conversations/group', { method: 'POST', body: input }),

  addMember: (conversationId: number, userId: number) =>
    request<ConversationDetail>(`/chat/conversations/${conversationId}/members`, {
      method: 'POST',
      body: { user_id: userId },
    }),

  /**
   * `since` is the watermark from the previous answer. It brings what arrived
   * since then, what was corrected and what was deleted — not only new lines.
   */
  messages: (conversationId: number, since?: string) =>
    request<MessagePage>(
      `/chat/conversations/${conversationId}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    ),

  send: (conversationId: number, body: string) =>
    request<Message>(`/chat/conversations/${conversationId}/messages`, { method: 'POST', body: { body } }),
  edit: (messageId: number, body: string) =>
    request<Message>(`/chat/messages/${messageId}`, { method: 'PATCH', body: { body } }),
  remove: (messageId: number) => request<void>(`/chat/messages/${messageId}`, { method: 'DELETE' }),
};
