import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { SettingsPage } from '../pages/SettingsPage';
import { server } from './setup';
import { MOCK_USER, MOCK_OAUTH_USER } from './handlers';

const BASE = '/api/v1';
const STRONG = 'Journey-Windmill-Copper-12';

/**
 * Setting a first password on an OAuth-only account (#329).
 *
 * The visible bug was a dead form: an account created through Google / Apple /
 * Facebook was shown "current password", which it can never fill in. The
 * bigger one was behind it — such an account had no way to add email+password
 * at all, so losing the provider meant losing the account.
 */
describe('SettingsPage — set password section (#329)', () => {
  beforeEach(() => clearAuthTokens());

  const asOAuthUser = () =>
    server.use(http.get(`${BASE}/auth/me`, () => HttpResponse.json(MOCK_OAUTH_USER)));

  it('offers the set form, not the change form, to an OAuth-only account', async () => {
    asOAuthUser();
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByText('Set a password')).toBeInTheDocument();
    // The field that made the old form a dead end.
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat new password')).toBeInTheDocument();
  });

  it('names the provider so the missing password is explained, not just asserted', async () => {
    asOAuthUser();
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByText(/signs in with Google/i)).toBeInTheDocument();
  });

  it('keeps the change form for an account that already has a password', async () => {
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByLabelText('Current password')).toBeInTheDocument();
    expect(screen.queryByText('Set a password')).not.toBeInTheDocument();
  });

  it('sends only the new password and reports success', async () => {
    asOAuthUser();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/auth/password/set`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Repeat new password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(posted).not.toBeNull());
    // No currentPassword — the endpoint is only valid where there is none.
    expect(posted).toEqual({ newPassword: STRONG });
    expect(
      await screen.findByText('Password set. You can now sign in with your email address.'),
    ).toBeInTheDocument();
  });

  it('switches to the change form once the password exists', async () => {
    // /auth/me reports the account as OAuth-only until the set succeeds — the
    // response carries no tokens, so the UI has to re-read the profile itself.
    let hasPassword = false;
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(hasPassword ? MOCK_USER : MOCK_OAUTH_USER),
      ),
      http.post(`${BASE}/auth/password/set`, () => {
        hasPassword = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Repeat new password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(await screen.findByLabelText('Current password')).toBeInTheDocument();
    expect(screen.queryByText('Set a password')).not.toBeInTheDocument();
  });

  it('rejects a mismatched confirmation without calling the server', async () => {
    asOAuthUser();
    let fired = false;
    server.use(
      http.post(`${BASE}/auth/password/set`, () => {
        fired = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Repeat new password'), `${STRONG}-typo`);
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(fired).toBe(false);
  });

  it('surfaces the server refusal when a password already exists', async () => {
    asOAuthUser();
    server.use(
      http.post(`${BASE}/auth/password/set`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'PASSWORD_ALREADY_SET', message: 'already set' },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Repeat new password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(
      await screen.findByText(
        'This account already has a password. Use the change-password form instead.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the zxcvbn suggestions on a weak password', async () => {
    asOAuthUser();
    server.use(
      http.post(`${BASE}/auth/password/set`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'WEAK_PASSWORD',
            message: 'weak',
            score: 1,
            suggestions: ['Add another word or two.'],
          },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Repeat new password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    // Same strength bar as register, and the same actionable hints.
    expect(await screen.findByText('Add another word or two.')).toBeInTheDocument();
  });
});
