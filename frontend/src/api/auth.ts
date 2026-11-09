/**
 * Account endpoints. Kept apart from the data client so the login screen can be
 * reasoned about on its own — it is the only part of the app an anonymous visitor
 * can reach.
 */
import { request } from './client';
import type { AuthUser } from './types';

export interface LoginInput {
  username: string;
  password: string;
  /** "Zaloguj na 10 dni" */
  remember: boolean;
}

export interface RegisterInput extends LoginInput {
  /** Typed twice on purpose; the server checks the two agree. */
  passwordConfirm: string;
}

/** Who is this cookie? Rejects with a 401 ApiError when nobody is signed in. */
export function fetchCurrentUser(): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/auth/me');
}

export function logIn(input: LoginInput): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/auth/login', { method: 'POST', body: input });
}

export function registerAccount(input: RegisterInput): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: {
      username: input.username,
      password: input.password,
      password_confirm: input.passwordConfirm,
      remember: input.remember,
    },
  });
}

export function logOut(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' });
}
