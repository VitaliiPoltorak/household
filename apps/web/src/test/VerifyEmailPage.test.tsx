import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';
import { server } from './setup';
import {
  readPendingVerificationEmail,
  rememberPendingVerificationEmail,
} from '../lib/pending-verification';

const BASE = '/api/v1';

// Router state passed via renderWithProviders' initialEntries → tests need to
// preload navigation state on the entry, since VerifyEmailPage reads
// location.state.email.
function renderWithEmail(email = 'alice@example.com') {
  return renderWithProviders(<VerifyEmailPage />, {
    preloadTokens: false,
    initialEntries: [{ pathname: '/verify-email', state: { email } }],
  });
}

/** No nav state at all — a reload, a deep link, or a fresh tab. */
function renderWithoutNavState() {
  return renderWithProviders(<VerifyEmailPage />, {
    preloadTokens: false,
    initialEntries: ['/verify-email'],
  });
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    clearAuthTokens();
    sessionStorage.clear();
  });

  it('renders body with the caller email interpolated', () => {
    renderWithEmail('carol@example.com');
    expect(screen.getByText(/carol@example\.com/)).toBeInTheDocument();
  });

  it('auto-submits when 6 digits are entered', async () => {
    const user = userEvent.setup();
    let verified = false;
    server.use(
      http.post(`${BASE}/auth/verify-email`, () => {
        verified = true;
        return HttpResponse.json({ accessToken: 'x', expiresIn: 900 });
      }),
    );

    renderWithEmail();
    await user.type(screen.getByLabelText('Verification code'), '123456');

    await waitFor(() => expect(verified).toBe(true));
  });

  it('shows CODE_INVALID with attempts-remaining count and clears the field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/verify-email`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'CODE_INVALID',
            message: 'wrong',
            attemptsRemaining: 3,
          },
          { status: 400 },
        ),
      ),
    );

    renderWithEmail();
    const input = screen.getByLabelText('Verification code') as HTMLInputElement;
    await user.type(input, '000000');

    expect(await screen.findByText("That code isn't right.")).toBeInTheDocument();
    expect(screen.getByText('3 attempts left')).toBeInTheDocument();
    // Field is reset so the user doesn't have to select-and-delete.
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('shows CODE_EXPIRED_OR_MISSING on 400 with that code', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/verify-email`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'CODE_EXPIRED_OR_MISSING', message: 'expired' },
          { status: 400 },
        ),
      ),
    );

    renderWithEmail();
    await user.type(screen.getByLabelText('Verification code'), '000000');

    expect(
      await screen.findByText('Your code has expired. Request a new one.'),
    ).toBeInTheDocument();
  });

  it('triggers /verify-email/resend when the resend button is clicked', async () => {
    const user = userEvent.setup();
    let resent = false;
    server.use(
      http.post(`${BASE}/auth/verify-email/resend`, () => {
        resent = true;
        return HttpResponse.json({ ok: true }, { status: 202 });
      }),
    );

    renderWithEmail();
    await user.click(screen.getByRole('button', { name: 'Resend code' }));

    await waitFor(() => expect(resent).toBe(true));
    expect(await screen.findByText(/New code sent/)).toBeInTheDocument();
  });

  // #320 — the screen used to redirect to /register whenever it had no
  // location.state, which was a dead end: /register answers 409 for the
  // half-finished account the user is trying to verify.
  describe('recovering the address without nav state', () => {
    it('restores the address from the tab after a reload, code field ready', () => {
      rememberPendingVerificationEmail('dave@example.com');

      renderWithoutNavState();

      expect(screen.getByText(/dave@example\.com/)).toBeInTheDocument();
      expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    });

    it('asks for the address instead of bouncing away when nothing is stored', () => {
      renderWithoutNavState();

      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      // The verification screen is still the one on show — no redirect.
      expect(screen.getByText('Check your email')).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Verification code'),
      ).not.toBeInTheDocument();
    });

    it('moves to the code field once the user supplies the address', async () => {
      const user = userEvent.setup();
      renderWithoutNavState();

      await user.type(screen.getByLabelText('Email'), 'erin@example.com');
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(
        await screen.findByLabelText('Verification code'),
      ).toBeInTheDocument();
      expect(screen.getByText(/erin@example\.com/)).toBeInTheDocument();
      // Remembered, so the next reload skips the question.
      expect(readPendingVerificationEmail()).toBe('erin@example.com');
    });

    it('rejects a malformed address rather than adopting it', async () => {
      const user = userEvent.setup();
      renderWithoutNavState();

      await user.type(screen.getByLabelText('Email'), 'not-an-email');
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      expect(
        await screen.findByText('Enter a valid email address.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Verification code'),
      ).not.toBeInTheDocument();
    });

    it('can resend to an address recovered from storage', async () => {
      const user = userEvent.setup();
      let resentTo = '';
      server.use(
        http.post(`${BASE}/auth/verify-email/resend`, async ({ request }) => {
          resentTo = ((await request.json()) as { email: string }).email;
          return new HttpResponse(null, { status: 202 });
        }),
      );
      rememberPendingVerificationEmail('frank@example.com');

      renderWithoutNavState();
      await user.click(screen.getByRole('button', { name: 'Resend code' }));

      await waitFor(() => expect(resentTo).toBe('frank@example.com'));
    });

    it('"use a different email" drops the stored address and re-asks', async () => {
      const user = userEvent.setup();
      rememberPendingVerificationEmail('grace@example.com');

      renderWithoutNavState();
      await user.click(
        screen.getByRole('button', { name: 'Use a different email address' }),
      );

      expect(await screen.findByLabelText('Email')).toBeInTheDocument();
      expect(readPendingVerificationEmail()).toBe('');
    });

    it('forgets the address once verification succeeds', async () => {
      const user = userEvent.setup();
      server.use(
        http.post(`${BASE}/auth/verify-email`, () =>
          HttpResponse.json({ accessToken: 'x', expiresIn: 900 }),
        ),
      );
      rememberPendingVerificationEmail('heidi@example.com');

      renderWithoutNavState();
      await user.type(screen.getByLabelText('Verification code'), '123456');

      await waitFor(() => expect(readPendingVerificationEmail()).toBe(''));
    });
  });
});
