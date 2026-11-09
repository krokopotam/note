import { queryString, request } from '../../api/client';
import type { Note, NotePage, NoteRevision, NotepadSession, SortOrder } from '../../api/types';

/**
 * Every call the notepad makes, in one file.
 *
 * Components never call fetch themselves, so the URL shape lives in exactly one
 * place and a component test can stub this module instead of the network.
 */
export const notesApi = {
  list: (params: { q?: string; sort?: SortOrder; limit?: number; offset?: number } = {}) =>
    request<NotePage>(`/notes${queryString(params)}`),

  get: (id: number) => request<Note>(`/notes/${id}`),

  create: (body: { title?: string; body?: string }) =>
    request<Note>('/notes', { method: 'POST', body }),

  update: (id: number, patch: { title?: string; body?: string }) =>
    request<Note>(`/notes/${id}`, { method: 'PATCH', body: patch }),

  remove: (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' }),

  revisions: (id: number) => request<NoteRevision[]>(`/notes/${id}/revisions`),

  restore: (id: number, revisionId: number) =>
    request<Note>(`/notes/${id}/revisions/${revisionId}/restore`, { method: 'POST' }),

  session: () => request<NotepadSession>('/session/notepad'),

  saveSession: (session: NotepadSession) =>
    request<NotepadSession>('/session/notepad', { method: 'PUT', body: session }),
};
