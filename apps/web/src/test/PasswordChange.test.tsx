import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { SettingsPage } from '../pages/SettingsPage';
import { server } from './setup';

// SettingsPage renders many sections; this spec focuses on the
// ChangePasswordSection added in #186. We use the field labels (which are
// unique on the page) to reach into it.

const BASE = '/api/v1';
const STRONG = 'Journey-Windmill-Copper-12';

async function fillForm(user: ReturnType<typeof userEvent.setup>, currentPw: string, newPw: string) {
  await user.type(screen.getByLabelText('Current password'), currentPw);
  await user.type(screen.getByLabelText('New password'), newPw);
  await user.type(screen.getByLabelText('Repeat new password'), newPw);
}

describe('SettingsPage — change password section', () => {
  beforeEach(() => clearAuthTokens());

  it('rejects mismatched confirm client-side (no request fired)', async () => {
    const user = userEvent.setup();
    let requestFired = false;
    server.use(
      http.post(`${BASE}/auth/password/change`, () => {
        requestFired = true;
        return HttpResponse.json({ accessToken: 'x', expiresIn: 900 });
      }),
    );

    renderWithProviders(<SettingsPage />);

    await user.type(screen.getByLabelText('Current password'), 'anything');
    await user.type(screen.getByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Repeat new password'), `${STRONG}-typo`);
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(requestFired).toBe(false);
  });

  it('shows generic 401 message on wrong current password', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/password/change`, () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Invalid credentials' },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(<SettingsPage />);
    await fillForm(user, 'wrong-current', STRONG);
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('shows NO_PASSWORD_SET for OAuth-only accounts', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/password/change`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'NO_PASSWORD_SET', message: 'oauth-only' },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<SettingsPage />);
    await fillForm(user, 'anything', STRONG);
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(
      await screen.findByText(
        'This account signs in via a social provider and has no password set.',
      ),
    ).toBeInTheDocument();
  });

  it('shows SAME_PASSWORD when new equals current on the server', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/password/change`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'SAME_PASSWORD', message: 'reuse' },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<SettingsPage />);
    await fillForm(user, STRONG, STRONG);
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(
      await screen.findByText('Choose a password different from your current one.'),
    ).toBeInTheDocument();
  });

  it('shows success message on 200 and clears the form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await fillForm(user, STRONG, `${STRONG}-new`);
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(
      await screen.findByText('Password updated. Other devices have been signed out.'),
    ).toBeInTheDocument();
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
  });
});
