import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';
import { server } from './setup';

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

describe('VerifyEmailPage', () => {
  beforeEach(() => clearAuthTokens());

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
});
