import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { LoginPage } from '../pages/LoginPage';
import { server } from './setup';

// Focused on the email/password branch of LoginPage — the Google OAuth
// branch is covered by the existing LoginPage.test.tsx.

const BASE = '/api/v1';
const STRONG = 'Journey-Windmill-Copper-12';

describe('LoginPage — email + password branch', () => {
  beforeEach(() => clearAuthTokens());

  it('shows generic error on 401 (does not disclose which field was wrong)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Invalid credentials' },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(<LoginPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('shows account-locked message on 403 ACCOUNT_LOCKED', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 403, code: 'ACCOUNT_LOCKED', message: 'locked' },
          { status: 403 },
        ),
      ),
    );

    renderWithProviders(<LoginPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        'Too many failed attempts. Check your email for an unlock link, then try again.',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT show a generic error on 403 EMAIL_NOT_VERIFIED (redirect branch)', async () => {
    // Positive signal for the redirect branch is hard to observe in a bare
    // <LoginPage /> render (MemoryRouter has no /verify-email route). The
    // negative signal — "no error banner shown" — proves the code took the
    // redirect branch instead of the generic-error branch.
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${BASE}/auth/login`, () => {
        called = true;
        return HttpResponse.json(
          {
            statusCode: 403,
            code: 'EMAIL_NOT_VERIFIED',
            message: 'verify first',
            email: 'alice@example.com',
          },
          { status: 403 },
        );
      }),
    );

    renderWithProviders(<LoginPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(called).toBe(true));
    // Wait for React to flush any state update from the response handler.
    await waitFor(() =>
      expect(screen.queryByText('Invalid email or password.')).not.toBeInTheDocument(),
    );
    // And no generic "unknown" fallback either.
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
  });
});
