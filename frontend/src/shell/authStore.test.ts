import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from '../api/client';
import { logIn, logOut, registerAccount } from '../api/auth';
import { fetchCurrentUser } from '../api/auth';
import { useAuth, watchSessionLoss } from './authStore';

vi.mock('../api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  logIn: vi.fn(),
  registerAccount: vi.fn(),
  logOut: vi.fn(),
}));

const user = { id: 7, username: 'ala', created_at: 't', last_login_at: null };
const unauthorized = () => new ApiError(401, 'unauthorized', 'zaloguj się, żeby kontynuować');

beforeEach(() => {
  vi.resetAllMocks();
  useAuth.setState({ status: 'booting', user: null, busy: false, error: null });
});

describe('boot', () => {
  it('signs in whoever the cookie belongs to', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue({ user });

    await useAuth.getState().boot();

    expect(useAuth.getState()).toMatchObject({ status: 'signed-in', user: { username: 'ala' } });
  });

  it('sends a stranger to the login form without an alarming message', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValue(unauthorized());

    await useAuth.getState().boot();

    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', user: null, error: null });
  });

  it('says something when the server itself is the problem', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValue(new Error('offline'));

    await useAuth.getState().boot();

    expect(useAuth.getState().status).toBe('anonymous');
    expect(useAuth.getState().error).toMatch(/Nie udało się połączyć/);
  });
});

describe('logging in and out', () => {
  it('signs in with one password', async () => {
    vi.mocked(logIn).mockResolvedValue({ user });

    const ok = await useAuth.getState().logIn({ username: 'ala', password: 'x', remember: true });

    expect(ok).toBe(true);
    expect(logIn).toHaveBeenCalledWith({ username: 'ala', password: 'x', remember: true });
    expect(useAuth.getState()).toMatchObject({ status: 'signed-in', busy: false, error: null });
  });

  it('keeps the form open and explains a rejection', async () => {
    vi.mocked(logIn).mockRejectedValue(new ApiError(401, 'invalid_credentials', 'zły login lub hasło'));

    const ok = await useAuth.getState().logIn({ username: 'ala', password: 'x', remember: false });

    expect(ok).toBe(false);
    expect(useAuth.getState()).toMatchObject({
      status: 'anonymous',
      user: null,
      busy: false,
      error: 'zły login lub hasło',
    });
  });

  it('sends both passwords when registering and signs the new account in', async () => {
    vi.mocked(registerAccount).mockResolvedValue({ user });

    const ok = await useAuth.getState().register({
      username: 'ala',
      password: 'długiehaslo1',
      passwordConfirm: 'długiehaslo1',
      remember: false,
    });

    expect(ok).toBe(true);
    expect(registerAccount).toHaveBeenCalledWith({
      username: 'ala',
      password: 'długiehaslo1',
      passwordConfirm: 'długiehaslo1',
      remember: false,
    });
    expect(useAuth.getState().status).toBe('signed-in');
  });

  it('surfaces "konto istnieje" instead of swallowing it', async () => {
    vi.mocked(registerAccount).mockRejectedValue(new ApiError(409, 'username_taken', 'konto ala już istnieje'));

    await useAuth.getState().register({
      username: 'ala',
      password: 'długiehaslo1',
      passwordConfirm: 'długiehaslo1',
      remember: false,
    });

    expect(useAuth.getState().error).toBe('konto ala już istnieje');
  });

  it('signs out even when the server never answers', async () => {
    vi.mocked(logOut).mockRejectedValue(new Error('offline'));

    await useAuth.getState().logOut();

    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', user: null });
  });
});

describe('losing the session mid-work', () => {
  /** Answer every request with the given status, the way the real client reads it. */
  function answerWith(status: number, body: unknown) {
    vi.stubGlobal('fetch', async () => ({
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(body),
    }));
  }

  beforeEach(() => {
    useAuth.setState({ status: 'signed-in', user });
  });

  it('brings the login form back when a call reports 401', async () => {
    const stop = watchSessionLoss();
    answerWith(401, { error: { code: 'unauthorized', message: 'zaloguj się, żeby kontynuować' } });

    await expect(request('/notes')).rejects.toBeInstanceOf(ApiError);
    await Promise.resolve();

    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', user: null });
    expect(useAuth.getState().error).toMatch(/Sesja wygasła/);

    stop();
    vi.unstubAllGlobals();
  });

  it('does nothing once the user is already away', async () => {
    useAuth.setState({ status: 'anonymous', user: null });
    const stop = watchSessionLoss();
    answerWith(401, { error: { code: 'invalid_credentials', message: 'zły login lub hasło' } });

    // A failed login attempt is also a 401; it must not invent a "session expired" message.
    await expect(request('/auth/login')).rejects.toBeInstanceOf(ApiError);
    await Promise.resolve();

    expect(useAuth.getState().error).toBeNull();

    stop();
    vi.unstubAllGlobals();
  });

  it('stops listening when the shell unmounts', async () => {
    const stop = watchSessionLoss();
    stop();
    answerWith(401, { error: { code: 'unauthorized', message: 'x' } });

    await expect(request('/notes')).rejects.toBeInstanceOf(ApiError);
    await Promise.resolve();

    expect(useAuth.getState().status).toBe('signed-in');
    vi.unstubAllGlobals();
  });
});
