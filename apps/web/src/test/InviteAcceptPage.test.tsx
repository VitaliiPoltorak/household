import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { InviteAcceptPage } from '../pages/InviteAcceptPage';
import { server } from './setup';

const BASE = '/api/v1';
const TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const MOCK_MEMBER = {
  id: 'member-1',
  householdId: 'hh-1',
  userId: 'user-1',
  role: 'member',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('InviteAcceptPage (#267)', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('prompts sign-in/sign-up and stashes the return path when not authenticated', async () => {
    clearAuthTokens();
    let accepted = false;
    server.use(
      http.post(`${BASE}/invites/:token/accept`, () => {
        accepted = true;
        return HttpResponse.json(MOCK_MEMBER);
      }),
    );

    renderWithProviders(<InviteAcceptPage />, {
      preloadTokens: false,
      initialEntries: [`/invite?token=${TOKEN}`],
    });

    expect(
      await screen.findByText(
        'Sign in or create an account to accept this invite.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(sessionStorage.getItem('auth:return_to')).toBe(
      `/invite?token=${TOKEN}`,
    );
    expect(accepted).toBe(false);
  });

  it('accepts automatically when already authenticated and sets the joined household active', async () => {
    let acceptedToken = '';
    server.use(
      http.post(`${BASE}/invites/:token/accept`, ({ params }) => {
        acceptedToken = params['token'] as string;
        return HttpResponse.json(MOCK_MEMBER);
      }),
    );

    renderWithProviders(<InviteAcceptPage />, {
      initialEntries: [`/invite?token=${TOKEN}`],
    });

    expect(
      await screen.findByText("You've joined the household! Redirecting…"),
    ).toBeInTheDocument();
    expect(acceptedToken).toBe(TOKEN);
    await waitFor(() =>
      expect(localStorage.getItem('activeHouseholdId')).toBe('hh-1'),
    );
  });

  it('shows an email-mismatch message on 403', async () => {
    server.use(
      http.post(`${BASE}/invites/:token/accept`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'Invite email does not match your account',
          },
          { status: 403 },
        ),
      ),
    );

    renderWithProviders(<InviteAcceptPage />, {
      initialEntries: [`/invite?token=${TOKEN}`],
    });

    expect(
      await screen.findByText(
        "This invite was sent to a different email address than the one you're signed in with.",
      ),
    ).toBeInTheDocument();
  });

  it('shows an invalid/expired message on 404', async () => {
    server.use(
      http.post(`${BASE}/invites/:token/accept`, () =>
        HttpResponse.json(
          { statusCode: 404, message: 'Invite not found' },
          { status: 404 },
        ),
      ),
    );

    renderWithProviders(<InviteAcceptPage />, {
      initialEntries: [`/invite?token=${TOKEN}`],
    });

    expect(
      await screen.findByText('This invite link is invalid or has expired.'),
    ).toBeInTheDocument();
  });

  it('shows a conflict message on 409 (already used / already a member)', async () => {
    server.use(
      http.post(`${BASE}/invites/:token/accept`, () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Already a member' },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<InviteAcceptPage />, {
      initialEntries: [`/invite?token=${TOKEN}`],
    });

    expect(
      await screen.findByText(
        "This invite has already been used, or you're already a member of this household.",
      ),
    ).toBeInTheDocument();
  });

  it('shows a generic error when the URL has no ?token=', async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/invites/:token/accept`, () => {
        called = true;
        return HttpResponse.json(MOCK_MEMBER);
      }),
    );

    renderWithProviders(<InviteAcceptPage />, { initialEntries: ['/invite'] });

    expect(
      await screen.findByText(
        'Something went wrong accepting this invite. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
