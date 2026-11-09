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

  if (!response.ok) throw toApiError(response.status, parsed);

  return parsed as T;
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
