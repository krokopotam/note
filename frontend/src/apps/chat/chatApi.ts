import { request } from '../../api/client';
import type { ChatPeer, Conversation, Message, MessagePage } from '../../api/types';

/** Chat endpoints. Everything is a short JSON call — the window polls, no socket. */
export const chatApi = {
  people: () => request<{ items: ChatPeer[] }>('/chat/people'),
  conversations: () => request<{ items: Conversation[] }>('/chat/conversations'),
  start: (userId: number) =>
    request<Conversation>('/chat/conversations', { method: 'POST', body: { user_id: userId } }),
  messages: (conversationId: number, after?: number) =>
    request<MessagePage>(
      `/chat/conversations/${conversationId}/messages${after ? `?after=${after}` : ''}`,
    ),
  send: (conversationId: number, body: string) =>
    request<Message>(`/chat/conversations/${conversationId}/messages`, { method: 'POST', body: { body } }),
  edit: (messageId: number, body: string) =>
    request<Message>(`/chat/messages/${messageId}`, { method: 'PATCH', body: { body } }),
  remove: (messageId: number) => request<void>(`/chat/messages/${messageId}`, { method: 'DELETE' }),
};
