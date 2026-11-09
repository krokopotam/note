/**
 * Who is using the desktop right now.
 *
 * Three states and nothing else: deciding on boot, anonymous (login form), signed
 * in (the desktop). The session itself is an HttpOnly cookie — this store never
 * sees a token, so a cross-site script cannot read one out of it.
 */
import { create } from 'zustand';
import { fetchCurrentUser, logIn, logOut, registerAccount } from '../api/auth';
import type { LoginInput, RegisterInput } from '../api/auth';
import { ApiError, setUnauthorizedListener } from '../api/client';
import type { AuthUser } from '../api/types';

export type AuthStatus = 'booting' | 'anonymous' | 'signed-in';

export interface AuthStore {
  status: AuthStatus;
  user: AuthUser | null;
  /** A request is in flight: the form must not be submitted twice. */
  busy: boolean;
  /** Message to show above the form, in Polish, straight from the API. */
  error: string | null;
  boot: () => Promise<void>;
  logIn: (input: LoginInput) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<boolean>;
  logOut: () => Promise<void>;
  /** Drop a stale error, e.g. when the form is switched between the two modes. */
  clearError: () => void;
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: 'booting',
  user: null,
  busy: false,
  error: null,

  boot: async () => {
    try {
      const { user } = await fetchCurrentUser();
      set({ status: 'signed-in', user, error: null });
    } catch (error) {
      // 401 is the normal answer for a first visit; anything else is worth showing.
      const unauthorized = error instanceof ApiError && error.status === 401;
      set({
        status: 'anonymous',
        user: null,
        error: unauthorized ? null : describe(error),
      });
    }
  },

  logIn: async (input) => {
    set({ busy: true, error: null });
    try {
      const { user } = await logIn(input);
      set({ status: 'signed-in', user, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: describe(error), status: 'anonymous', user: null });
      return false;
    }
  },

  register: async (input) => {
    set({ busy: true, error: null });
    try {
      const { user } = await registerAccount(input);
      set({ status: 'signed-in', user, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: describe(error), status: 'anonymous', user: null });
      return false;
    }
  },

  logOut: async () => {
    try {
      await logOut();
    } catch {
      // A logout that never reached the server still ends the session here: the
      // shell must not keep showing somebody's desktop on top of a dead cookie.
    }
    set({ status: 'anonymous', user: null, busy: false, error: null });
  },

  clearError: () => {
    if (get().error !== null) set({ error: null });
  },
}));

/**
 * Any 401 from any data call means the session is gone mid-use (10 days passed,
 * the account was locked, the row was cleaned up). Fall back to the login form
 * instead of letting every window fail on its own.
 */
export function watchSessionLoss(): () => void {
  setUnauthorizedListener(() => {
    if (useAuth.getState().status === 'signed-in') {
      useAuth.setState({ status: 'anonymous', user: null, error: 'Sesja wygasła — zaloguj się ponownie.' });
    }
  });
  return () => setUnauthorizedListener(null);
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.summary;
  return 'Nie udało się połączyć z serwerem.';
}
