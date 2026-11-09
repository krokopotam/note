import { screen } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logIn, registerAccount } from '../api/auth';
import { ApiError } from '../api/client';
import { LoginScreen } from './LoginScreen';
import { useAuth } from './authStore';

vi.mock('../api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  logIn: vi.fn(),
  registerAccount: vi.fn(),
  logOut: vi.fn(),
}));

const user = { id: 1, username: 'ala', created_at: 't', last_login_at: null };

beforeEach(() => {
  vi.resetAllMocks();
  useAuth.setState({ status: 'anonymous', user: null, busy: false, error: null });
  vi.mocked(logIn).mockResolvedValue({ user });
  vi.mocked(registerAccount).mockResolvedValue({ user });
});

/** Type into the two fields everybody has to fill in. */
async function credentials(password = 'długiehaslo1') {
  await userEvent.type(screen.getByLabelText('Login'), 'ala');
  await userEvent.type(screen.getByLabelText('Hasło'), password);
}

describe('the login form', () => {
  it('asks for the password once', async () => {
    render(<LoginScreen />);

    expect(screen.queryByLabelText('Powtórz hasło')).not.toBeInTheDocument();

    await credentials();
    await userEvent.click(screen.getByRole('button', { name: 'Wejdź' }));

    expect(logIn).toHaveBeenCalledWith({ username: 'ala', password: 'długiehaslo1', remember: false });
    expect(registerAccount).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe('signed-in');
  });

  it('takes the login as it was typed but stores it lower-case', async () => {
    render(<LoginScreen />);

    await userEvent.type(screen.getByLabelText('Login'), '  Ala  ');
    await userEvent.type(screen.getByLabelText('Hasło'), 'długiehaslo1');
    await userEvent.click(screen.getByRole('button', { name: 'Wejdź' }));

    expect(logIn).toHaveBeenCalledWith({ username: 'ala', password: 'długiehaslo1', remember: false });
  });

  it('passes the ten day option on', async () => {
    render(<LoginScreen />);

    await credentials();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Zaloguj na 10 dni' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wejdź' }));

    expect(logIn).toHaveBeenCalledWith({ username: 'ala', password: 'długiehaslo1', remember: true });
  });

  it('shows the password rejection the server explained', async () => {
    vi.mocked(logIn).mockRejectedValue(new ApiError(401, 'invalid_credentials', 'zły login lub hasło'));
    render(<LoginScreen />);

    await credentials('obcehaslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Wejdź' }));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('zły login lub hasło');
    expect(useAuth.getState().status).toBe('anonymous');
  });

  it('does not submit twice while the server thinks', async () => {
    let release: () => void = () => {};
    vi.mocked(logIn).mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ user }); }),
    );
    render(<LoginScreen />);

    await credentials();
    const submit = screen.getByRole('button', { name: 'Wejdź' });
    await userEvent.click(submit);

    const busy = screen.getByRole('button', { name: 'Chwila…' });
    expect(busy).toBeDisabled();

    // A second click while waiting must not queue a second request.
    await userEvent.click(busy);
    expect(logIn).toHaveBeenCalledTimes(1);

    release();
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signed-in'));
  });
});

describe('registration', () => {
  it('asks for the password twice and sends both', async () => {
    render(<LoginScreen />);

    await userEvent.click(screen.getByRole('tab', { name: 'Załóż konto' }));
    expect(screen.getByLabelText('Powtórz hasło')).toBeInTheDocument();

    await credentials('pierwszehaslo1');
    await userEvent.type(screen.getByLabelText('Powtórz hasło'), 'pierwszehaslo1');
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto i wejdź' }));

    expect(registerAccount).toHaveBeenCalledWith({
      username: 'ala',
      password: 'pierwszehaslo1',
      passwordConfirm: 'pierwszehaslo1',
      remember: false,
    });
  });

  it('catches two different passwords before asking the server', async () => {
    render(<LoginScreen />);

    await userEvent.click(screen.getByRole('tab', { name: 'Załóż konto' }));
    await credentials('pierwszehaslo1');
    await userEvent.type(screen.getByLabelText('Powtórz hasło'), 'innehaslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto i wejdź' }));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('Hasła różnią się.');
    expect(registerAccount).not.toHaveBeenCalled();
  });

  it('catches a too short password before asking the server', async () => {
    render(<LoginScreen />);

    await userEvent.click(screen.getByRole('tab', { name: 'Załóż konto' }));
    await credentials('krotkie');
    await userEvent.type(screen.getByLabelText('Powtórz hasło'), 'krotkie');
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto i wejdź' }));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('8 znaków');
    expect(registerAccount).not.toHaveBeenCalled();
  });

  it('catches a login the server would not accept', async () => {
    render(<LoginScreen />);

    await userEvent.click(screen.getByRole('tab', { name: 'Załóż konto' }));
    await userEvent.type(screen.getByLabelText('Login'), 'założ');
    await userEvent.type(screen.getByLabelText('Hasło'), 'długiehaslo1');
    await userEvent.type(screen.getByLabelText('Powtórz hasło'), 'długiehaslo1');
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto i wejdź' }));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('Login:');
    expect(registerAccount).not.toHaveBeenCalled();
  });

  it('says so when the name is already taken', async () => {
    vi.mocked(registerAccount).mockRejectedValue(
      new ApiError(409, 'username_taken', 'konto ala już istnieje'),
    );
    render(<LoginScreen />);

    await userEvent.click(screen.getByRole('tab', { name: 'Załóż konto' }));
    await credentials();
    await userEvent.type(screen.getByLabelText('Powtórz hasło'), 'długiehaslo1');
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto i wejdź' }));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('konto ala już istnieje');
  });

  it('forgets a complaint when the form is switched', async () => {
    vi.mocked(logIn).mockRejectedValue(new ApiError(401, 'invalid_credentials', 'zły login lub hasło'));
    render(<LoginScreen />);

    await credentials('obcehaslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Wejdź' }));
    await screen.findByTestId('login-error');

    await userEvent.click(screen.getByRole('tab', { name: 'Załóż konto' }));

    expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
  });
});
