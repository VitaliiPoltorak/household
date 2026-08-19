import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { UnlockAccountPage } from '../pages/UnlockAccountPage';
import { server } from './setup';

const BASE = '/api/v1';
const HEX64 = 'a'.repeat(64);

describe('UnlockAccountPage', () => {
  beforeEach(() => clearAuthTokens());

  it('auto-consumes the token from the URL and shows success on 204', async () => {
    let consumed = '';
    server.use(
      http.post(`${BASE}/auth/unlock`, async ({ request }) => {
        const body = (await request.json()) as { token: string };
        consumed = body.token;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<UnlockAccountPage />, {
      preloadTokens: false,
      initialEntries: [`/unlock?token=${HEX64}`],
    });

    expect(
      await screen.findByText('Your account is unlocked. You can sign in now.'),
    ).toBeInTheDocument();
    expect(consumed).toBe(HEX64);
  });

  it('shows INVALID_UNLOCK_TOKEN error on 400 with that code', async () => {
    server.use(
      http.post(`${BASE}/auth/unlock`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'INVALID_UNLOCK_TOKEN', message: 'nope' },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<UnlockAccountPage />, {
      preloadTokens: false,
      initialEntries: [`/unlock?token=${HEX64}`],
    });

    expect(
      await screen.findByText('This unlock link is invalid or has expired.'),
    ).toBeInTheDocument();
  });

  it('shows missing-token message when the URL has no ?token=', async () => {
    let fired = false;
    server.use(
      http.post(`${BASE}/auth/unlock`, () => {
        fired = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<UnlockAccountPage />, {
      preloadTokens: false,
      initialEntries: ['/unlock'],
    });

    expect(
      await screen.findByText(/link is missing an unlock token/i),
    ).toBeInTheDocument();
    expect(fired).toBe(false);
  });
});
