import { request } from '../../api/client';
import { ApiError } from '../../api/client';
import { reportStatus } from '../../api/client';

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
 * Raw upload with progress.
 *
 * @param onProgress fraction 0..1, for the bar next to the file name
 */
export function uploadFile(
  resourceId: number,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<FilePage['items'][number]> {
  const url = `/api/files/resources/${resourceId}/files/${encodeURIComponent(file.name)}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'nie udało się połączyć z serwerem'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
        return;
      }
      reportStatus(xhr.status);
      reject(httpError(xhr));
    };

    xhr.send(file);
  });
}

/** nginx or a proxy can answer instead of the app, so the body may not be our shape. */
function httpError(xhr: XMLHttpRequest): ApiError {
  const fallback = new ApiError(xhr.status, 'unexpected_response', `serwer odpowiedział ${xhr.status}`);
  let code: unknown;
  let message: unknown;
  try {
    const body = JSON.parse(xhr.responseText) as { error?: { code?: unknown; message?: unknown } };
    code = body.error?.code;
    message = body.error?.message;
  } catch {
    return fallback;
  }
  if (typeof code !== 'string' || typeof message !== 'string') return fallback;
  return new ApiError(xhr.status, code, message);
}
