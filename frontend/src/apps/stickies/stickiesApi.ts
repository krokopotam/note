import { queryString, request } from '../../api/client';
import type { SortOrder, Sticky, StickyPage } from '../../api/types';

/** All backend calls the stickies app makes. */
export const stickiesApi = {
  list: (
    params: { q?: string; sort?: SortOrder; pinned?: boolean; limit?: number; offset?: number } = {},
  ) => {
    const { pinned, ...rest } = params;
    return request<StickyPage>(
      `/stickies${queryString({ ...rest, pinned: pinned ? 'true' : undefined })}`,
    );
  },

  create: (body: { body?: string; color?: string; pinned?: boolean }) =>
    request<Sticky>('/stickies', { method: 'POST', body }),

  update: (id: number, patch: { body?: string; color?: string; pinned?: boolean }) =>
    request<Sticky>(`/stickies/${id}`, { method: 'PATCH', body: patch }),

  remove: (id: number) => request<void>(`/stickies/${id}`, { method: 'DELETE' }),
};
