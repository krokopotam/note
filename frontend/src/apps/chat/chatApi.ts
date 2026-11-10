import { request, uploadRaw } from '../../api/client';
import type {
  ChatAttachment,
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

  send: (conversationId: number, body: string, attachmentIds: number[] = []) =>
    request<Message>(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body, attachment_ids: attachmentIds },
    }),

  /**
   * A picture goes to the conversation first, then the message that claims it.
   * Two calls on purpose: the bytes are streamed, and a message that fails to
   * send leaves nothing on the server but one upload waiting to be swept.
   */
  uploadAttachment: (conversationId: number, file: File, onProgress?: (fraction: number) => void) =>
    uploadRaw<ChatAttachment>(
      `/chat/conversations/${conversationId}/attachments?name=${encodeURIComponent(file.name)}`,
      file,
      onProgress,
    ),
  edit: (messageId: number, body: string) =>
    request<Message>(`/chat/messages/${messageId}`, { method: 'PATCH', body: { body } }),
  remove: (messageId: number) => request<void>(`/chat/messages/${messageId}`, { method: 'DELETE' }),
};

/**
 * Address a browser can put in an <img>: the backend streams the picture itself.
 *
 * `createdAt` rides along as `?v=` on purpose. The picture is cached for a day, and
 * a query string is the only way to make the address differ for *this* upload —
 * otherwise a number that a database once handed out twice would paint an old,
 * deleted picture over a new one.
 */
export function attachmentUrl(attachment: { id: number; created_at: string }): string {
  return `/api/chat/attachments/${attachment.id}?v=${encodeURIComponent(attachment.created_at)}`;
}
