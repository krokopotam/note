/**
 * The only screen an anonymous visitor sees.
 *
 * Two modes in one form: signing in needs the password once, creating an account
 * asks for it twice (the server checks that twice as well — this form only makes
 * the mistake obvious before a round trip). "Zaloguj na 10 dni" is the long-lived
 * cookie; without it the session still lasts a few hours.
 */
import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, USERNAME_HINT, USERNAME_PATTERN } from '@note/shared/manifest';
import { useAuth } from './authStore';
import styles from './LoginScreen.module.css';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const busy = useAuth((state) => state.busy);
  const serverError = useAuth((state) => state.error);
  const logIn = useAuth((state) => state.logIn);
  const register = useAuth((state) => state.register);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [remember, setRemember] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const switchTo = (next: Mode) => {
    setMode(next);
    setLocalError(null);
    setPasswordConfirm('');
    // A complaint about the login form is not a complaint about registration.
    useAuth.getState().clearError();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const login = username.trim().toLowerCase();
    const problem = check(mode, login, password, passwordConfirm);
    if (problem) {
      setLocalError(problem);
      return;
    }

    const entered =
      mode === 'login'
        ? await logIn({ username: login, password, remember })
        : await register({ username: login, password, passwordConfirm, remember });

    // The desktop takes over on success; the password is not left lying in the form.
    if (entered) {
      setPassword('');
      setPasswordConfirm('');
    }
  };

  return (
    <main className={styles.screen} data-testid="login-screen">
      <form className={styles.card} onSubmit={submit} aria-busy={busy}>
        <span className={styles.brand}>note</span>
        <p className={styles.tagline}>Pulpit z notatkami, karteczkami i kalkulatorem</p>

        <div className={styles.tabs} role="tablist" aria-label="Logowanie">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? styles.tabActive : styles.tab}
            onClick={() => switchTo('login')}
          >
            Zaloguj się
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? styles.tabActive : styles.tab}
            onClick={() => switchTo('register')}
          >
            Załóż konto
          </button>
        </div>

        {(localError ?? serverError) && (
          <p className={styles.error} role="alert" data-testid="login-error">
            {localError ?? serverError}
          </p>
        )}

        <label className={styles.field}>
          Login
          <input
            name="username"
            type="text"
            value={username}
            autoComplete="username"
            autoFocus
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          Hasło
          <input
            name="password"
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {mode === 'register' && (
          <label className={styles.field}>
            Powtórz hasło
            <input
              name="password_confirm"
              type="password"
              value={passwordConfirm}
              autoComplete="new-password"
              data-testid="password-confirm"
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>
        )}

        <label className={styles.remember}>
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Zaloguj na 10 dni
        </label>

        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Chwila…' : mode === 'login' ? 'Wejdź' : 'Załóż konto i wejdź'}
        </button>

        <p className={styles.hint}>
          {mode === 'login'
            ? 'Nie masz konta? Wpisz login i hasło dwa razy w zakładce „Załóż konto”.'
            : 'Masz już konto? Wróć do zakładki „Zaloguj się”.'}
        </p>
      </form>
    </main>
  );
}

/** Local sanity checks, so an obvious typo is fixed without asking the server. */
function check(mode: Mode, login: string, password: string, passwordConfirm: string): string | null {
  if (!login) return 'Wpisz login.';
  if (!password) return 'Wpisz hasło.';
  if (mode === 'register' && !USERNAME_PATTERN.test(login)) return `Login: ${USERNAME_HINT}`;
  if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) {
    return `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`;
  }
  if (mode === 'register' && password !== passwordConfirm) return 'Hasła różnią się.';
  return null;
}
