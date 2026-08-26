import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { server } from './setup';
import { HouseholdPage } from '../pages/HouseholdPage';

describe('HouseholdPage — member display names (#166)', () => {
  const OWNER_ID = 'user-1'; // same as MOCK_USER.id from handlers
  const OTHER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('renders member display name from bulk /auth/users lookup', async () => {
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json([
          {
            id: 'm-1',
            householdId: 'hh-1',
            userId: OWNER_ID,
            role: 'owner',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'm-2',
            householdId: 'hh-1',
            userId: OTHER_ID,
            role: 'member',
            createdAt: '2026-01-02T00:00:00Z',
          },
        ]),
      ),
      http.get('/api/v1/auth/users', () =>
        HttpResponse.json([
          { id: OWNER_ID, displayName: 'Alice Owner', avatarUrl: null },
          { id: OTHER_ID, displayName: 'Bob Member', avatarUrl: null },
        ]),
      ),
    );

    renderWithProviders(<HouseholdPage />);

    await waitFor(
      () => expect(screen.getByText('Alice Owner')).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText('Bob Member')).toBeInTheDocument();
    // Raw UUID no longer used as the primary label — but its shortened form
    // still appears as the secondary line.
    expect(screen.queryByText(OTHER_ID)).not.toBeInTheDocument();
    expect(screen.getByText(`${OTHER_ID.slice(0, 8)}…`)).toBeInTheDocument();
  });

  it('shows a 1-letter role badge with the full role name as tooltip', async () => {
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json([
          {
            id: 'm-1',
            householdId: 'hh-1',
            userId: OWNER_ID,
            role: 'owner',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'm-2',
            householdId: 'hh-1',
            userId: OTHER_ID,
            role: 'admin',
            createdAt: '2026-01-02T00:00:00Z',
          },
        ]),
      ),
    );

    renderWithProviders(<HouseholdPage />);

    await waitFor(
      () => expect(screen.getAllByRole('img').length).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    // Look up the badge by its accessible label (the localized role name).
    const ownerBadge = screen.getByRole('img', { name: 'Owner' });
    expect(ownerBadge).toHaveTextContent('O');
    expect(ownerBadge).toHaveAttribute('title', 'Owner');

    const adminBadge = screen.getByRole('img', { name: 'Admin' });
    expect(adminBadge).toHaveTextContent('A');
  });

  it('falls back to shortened userId when no profile is returned', async () => {
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json([
          {
            id: 'm-lonely',
            householdId: 'hh-1',
            userId: OTHER_ID,
            role: 'viewer',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
      // Profile endpoint returns empty — user might be soft-deleted.
      http.get('/api/v1/auth/users', () => HttpResponse.json([])),
    );

    renderWithProviders(<HouseholdPage />);

    await waitFor(
      () =>
        expect(
          screen.getAllByText(`${OTHER_ID.slice(0, 8)}…`).length,
        ).toBeGreaterThan(0),
      { timeout: 3000 },
    );
  });
});

describe('HouseholdPage — copy invite link later (#267)', () => {
  const INVITE = {
    id: 'invite-1',
    householdId: 'hh-1',
    email: 'friend@example.com',
    token: 'tok-abc123',
    role: 'member',
    expiresAt: '2099-01-01T00:00:00Z',
    acceptedAt: null,
  };

  beforeEach(() => {
    // jsdom doesn't implement the Clipboard API — stub it so the component's
    // navigator.clipboard.writeText(...).catch(...) call has something to
    // resolve against instead of throwing on undefined.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('copies the invite link for an already-existing pending invite and shows feedback', async () => {
    server.use(
      http.get('/api/v1/households/:id/invites', () =>
        HttpResponse.json([INVITE]),
      ),
    );

    renderWithProviders(<HouseholdPage />);

    await waitFor(
      () => expect(screen.getByText('friend@example.com')).toBeInTheDocument(),
      {
        timeout: 3000,
      },
    );

    await userEvent.click(screen.getByText('Copy link'));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/invite?token=tok-abc123`,
      ),
    );
    expect(await screen.findByText('Link copied!')).toBeInTheDocument();
  });
});
