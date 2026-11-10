/** Failure of an API call, carrying everything the UI needs to explain it. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Array<{ path: string; message: string }>;

  constructor(status: number, code: string, message: string, details: Array<{ path: string; message: string }> = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Short text for a toast/banner; field-level problems are appended. */
  get summary(): string {
    if (this.details.length === 0) return this.message;
    return `${this.message}: ${this.details.map((d) => `${d.path} — ${d.message}`).join('; ')}`;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

type UnauthorizedListener = () => void;

let unauthorizedListener: UnauthorizedListener | null = null;

/**
 * Tell the shell when the server stopped accepting our session (expired, logged in
 * from another window and killed, …). The auth store decides what that means; the
 * client only reports, so no component has to look for a 401.
 */
export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

/**
 * Same report for calls that cannot go through `request` (an XHR upload needs
 * progress events, which fetch does not give).
 */
export function reportStatus(status: number): void {
  if (status === 401) unauthorizedListener?.();
}

/**
 * The single place the frontend talks to the backend.
 *
 * Every non-2xx response becomes an ApiError, so callers never branch on
 * `response.ok` and no component has to know what an HTTP status means.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = safeJson(text);

  if (!response.ok) {
    const error = toApiError(response.status, parsed);
    if (error.status === 401) unauthorizedListener?.();
    throw error;
  }

  return parsed as T;
}

/**
 * Send one file as the raw body of a POST, with progress.
 *
 * `fetch` reports no upload progress, so this is the second place that has to turn
 * an HTTP failure into an ApiError — and the reason the bytes go out as they are:
 * a picture does not become JSON on its way to the server.
 *
 * @param path app-relative, e.g. `/chat/conversations/3/attachments?name=kot.png`
 * @param onProgress fraction 0..1
 */
export function uploadRaw<T>(path: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'nie udało się połączyć z serwerem'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as T);
        return;
      }
      reportStatus(xhr.status);
      reject(fromXhr(xhr));
    };

    xhr.send(file);
  });
}

/** nginx or a proxy can answer instead of the app, so the body may not be our shape. */
function fromXhr(xhr: XMLHttpRequest): ApiError {
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

/** Relative URL for a keyword/sort/pagination query; empty values are omitted. */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && `${value}` !== '') search.set(key, `${value}`);
  }
  const line = search.toString();
  return line ? `?${line}` : '';
}

/**
 * Read the documented `{ error: { code, message, details } }` body defensively.
 *
 * The backend guarantees that shape (it is validated there with ApiErrorSchema);
 * here it is only read, because an nginx error page or a proxy timeout arrives on
 * the same path and must still produce something the UI can show.
 */
function toApiError(status: number, parsed: unknown): ApiError {
  const body = parsed as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null;
  const error = body?.error;

  if (!error || typeof error.code !== 'string' || typeof error.message !== 'string') {
    return new ApiError(status, 'unexpected_response', `API zwrócił ${status}`);
  }

  const details = Array.isArray(error.details)
    ? (error.details as Array<{ path: string; message: string }>)
    : [];
  return new ApiError(status, error.code, error.message, details);
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
