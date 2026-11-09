import { describe, expect, it, vi } from 'vitest';
import { ApiError, queryString, request } from './client';

/** Replace fetch for one call and hand back the RequestInit it received. */
function stubFetch(response: { ok: boolean; status: number; body?: string }) {
  const spy = vi.fn(async (_input: string, _init?: RequestInit) => {
    // Mirrors the parts of the fetch contract the client actually uses.
    return {
      ok: response.ok,
      status: response.status,
      text: async () => response.body ?? '',
    } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('request', () => {
  it('prefixes /api and parses the body', async () => {
    const spy = stubFetch({ ok: true, status: 200, body: '{"items":[1]}' });

    await expect(request('/notes?q=x')).resolves.toEqual({ items: [1] });
    expect(spy).toHaveBeenCalledWith('/api/notes?q=x', expect.objectContaining({ method: 'GET' }));
  });

  it('sends JSON only when there is a body', async () => {
    const spy = stubFetch({ ok: true, status: 200, body: 'null' });

    await request('/desktop/items', { method: 'POST', body: { kind: 'folder' } });

    expect(spy).toHaveBeenCalledWith('/api/desktop/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"kind":"folder"}',
      signal: undefined,
    });

    await request('/desktop/items', { method: 'DELETE' });
    expect(spy.mock.calls[1][1]).toMatchObject({ method: 'DELETE', headers: {}, body: undefined });
  });

  it('treats 204 as no content', async () => {
    stubFetch({ ok: true, status: 204 });
    await expect(request('/notes/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('maps the documented error body to ApiError', async () => {
    stubFetch({
      ok: false,
      status: 400,
      body: '{"error":{"code":"validation_error","message":"zły tytuł","details":[{"path":"title","message":"za długi"}]}}',
    });

    const error = (await request('/notes', { method: 'POST', body: {} }).catch(
      (caught) => caught as ApiError,
    )) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'validation_error', message: 'zły tytuł' });
    expect(error.details).toEqual([{ path: 'title', message: 'za długi' }]);
    expect(error.summary).toBe('zły tytuł: title — za długi');
  });

  it('reports an unexpected error payload without crashing', async () => {
    stubFetch({ ok: false, status: 502, body: '<html>bad gateway</html>' });

    const error = (await request('/notes').catch((caught) => caught as ApiError)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'unexpected_response', details: [] });
  });
});

describe('queryString', () => {
  it('omits empty values so the API applies its own defaults', () => {
    expect(queryString({ q: '', sort: 'title_asc', limit: undefined, offset: 0 })).toBe(
      '?sort=title_asc&offset=0',
    );
  });

  it('returns an empty string when nothing is set', () => {
    expect(queryString({ q: undefined, limit: null })).toBe('');
  });

  it('escapes keywords', () => {
    expect(queryString({ q: 'costam & więcej' })).toBe('?q=costam+%26+wi%C4%99cej');
  });
});
