import { request, uploadRaw } from '../../api/client';

/**
 * File API: resources, files, sharing.
 *
 * The file name of an upload travels in the URL and its bytes as the raw body, so
 * a 100 MB file never becomes JSON. Progress needs XHR — fetch reports none — which
 * is the one place besides `request()` that has to translate HTTP failures.
 */
import type {
  FilePage,
  FileResource,
  ResourceDetail,
  ResourceMember,
  ShareableUsers,
} from '../../api/types';

export const filesApi = {
  listResources: () => request<{ items: FileResource[] }>('/files/resources'),
  createResource: (name: string) =>
    request<FileResource>('/files/resources', { method: 'POST', body: { name } }),
  detail: (id: number) => request<ResourceDetail>(`/files/resources/${id}`),
  renameResource: (id: number, name: string) =>
    request<FileResource>(`/files/resources/${id}`, { method: 'PATCH', body: { name } }),
  removeResource: (id: number) => request<void>(`/files/resources/${id}`, { method: 'DELETE' }),

  listFiles: (resourceId: number, q?: string) =>
    request<FilePage>(`/files/resources/${resourceId}/files${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  renameFile: (id: number, name: string) =>
    request<FilePage['items'][number]>(`/files/${id}`, { method: 'PATCH', body: { name } }),
  removeFile: (id: number) => request<void>(`/files/${id}`, { method: 'DELETE' }),

  people: () => request<ShareableUsers>('/files/users'),
  setPermission: (resourceId: number, userId: number, permission: 'read' | 'edit' | null) =>
    request<{ resource: FileResource; members: ResourceMember[] }>(
      `/files/resources/${resourceId}/members`,
      { method: 'PUT', body: { user_id: userId, permission } },
    ),
};

/** Direct link the browser can follow — a plain <a download> keeps the session cookie. */
export function downloadUrl(fileId: number): string {
  return `/api/files/${fileId}`;
}


/**
 * Raw upload with progress — the bytes travel as they are, the name rides in the URL.
 *
 * @param onProgress fraction 0..1, for the bar next to the file name
 */
export function uploadFile(
  resourceId: number,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<FilePage['items'][number]> {
  return uploadRaw<FilePage['items'][number]>(
    `/files/resources/${resourceId}/files/${encodeURIComponent(file.name)}`,
    file,
    onProgress,
  );
}
