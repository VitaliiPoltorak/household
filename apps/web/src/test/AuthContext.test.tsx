import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { useAuth } from '../contexts/AuthContext';
import { server } from './setup';

function AuthProbe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{user ? `logged in as ${user.displayName}` : 'logged out'}</p>;
}

describe('AuthContext — refresh rate-limit handling (#247)', () => {
  it('retries after a 429 from /auth/refresh instead of logging the user out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let calls = 0;
    server.use(
      http.post('/api/v1/auth/refresh', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            {
              statusCode: 429,
              message: 'Too many requests. Try again later.',
              error: 'Too Many Requests',
            },
            { status: 429 },
          );
        }
        return HttpResponse.json({
          accessToken: 'mock-access-token',
          expiresIn: 900,
        });
      }),
    );

    renderWithProviders(<AuthProbe />);

    // First attempt 429s — user must stay in the loading state, not be
    // bounced to "logged out", while the retry is pending.
    await waitFor(() => expect(calls).toBe(1));
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('logged out')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });

    await waitFor(() =>
      expect(screen.getByText(/logged in as/)).toBeInTheDocument(),
    );
    expect(calls).toBe(2);

    vi.useRealTimers();
  });

  it('logs the user out on a genuine 401 (not rate-limited)', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(<AuthProbe />);

    await waitFor(
      () => expect(screen.getByText('logged out')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
