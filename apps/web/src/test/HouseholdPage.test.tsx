import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { server } from './setup';
import { HouseholdPage } from '../pages/HouseholdPage';
import { MOCK_BANK_CONNECTION, MOCK_SYNC_LOG } from './handlers';

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
    // Caller is a 'viewer' here (not the owner/admin under test) — #280
    // replaces the badge with a role-picker <select> for any row the caller
    // can manage, so this stays a pure badge-rendering test only if neither
    // displayed row is manageable by whoever's logged in.
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json([
          {
            id: 'm-caller',
            householdId: 'hh-1',
            userId: OWNER_ID,
            role: 'viewer',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'm-owner',
            householdId: 'hh-1',
            userId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
            role: 'owner',
            createdAt: '2026-01-02T00:00:00Z',
          },
          {
            id: 'm-admin',
            householdId: 'hh-1',
            userId: OTHER_ID,
            role: 'admin',
            createdAt: '2026-01-03T00:00:00Z',
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

describe("HouseholdPage — change a member's role (#280)", () => {
  const CALLER_ID = 'user-1'; // matches MOCK_USER.id from handlers
  const TARGET_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  function membersWith(callerRole: string, targetRole: string) {
    return [
      {
        id: 'm-caller',
        householdId: 'hh-1',
        userId: CALLER_ID,
        role: callerRole,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'm-target',
        householdId: 'hh-1',
        userId: TARGET_ID,
        role: targetRole,
        createdAt: '2026-01-02T00:00:00Z',
      },
    ];
  }

  it('shows a role picker for a manageable row and PATCHes the new role on change', async () => {
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json(membersWith('owner', 'member')),
      ),
      http.patch(
        '/api/v1/households/:id/members/:memberId',
        async ({ request }) => {
          patchBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: 'm-target',
            householdId: 'hh-1',
            userId: TARGET_ID,
            role: patchBody['role'],
            createdAt: '2026-01-02T00:00:00Z',
          });
        },
      ),
    );

    renderWithProviders(<HouseholdPage />);
    const picker = await screen.findByRole('combobox');
    await userEvent.selectOptions(picker, 'admin');

    await waitFor(() => expect(patchBody?.['role']).toBe('admin'), {
      timeout: 3000,
    });
  });

  it("does not show a picker for the owner's own row", async () => {
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json(membersWith('owner', 'member')),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await waitFor(
      () => expect(screen.getAllByRole('img').length).toBeGreaterThan(0),
      { timeout: 3000 },
    );

    // Only the target's row gets a picker — the caller's own owner row
    // stays a badge (matches the backend's strict-inequality canManage
    // rule: an owner can't touch another owner, including themselves).
    expect(screen.getByRole('img', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('does not show a picker for a peer row the caller (admin) cannot manage', async () => {
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json(membersWith('admin', 'admin')),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await waitFor(
      () => expect(screen.getAllByRole('img').length).toBeGreaterThan(0),
      { timeout: 3000 },
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows an inline error instead of silently failing on a 403', async () => {
    server.use(
      http.get('/api/v1/households/:id/members', () =>
        HttpResponse.json(membersWith('admin', 'member')),
      ),
      http.patch('/api/v1/households/:id/members/:memberId', () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'Cannot grant a role equal to or above your own',
          },
          { status: 403 },
        ),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    const picker = await screen.findByRole('combobox');
    await userEvent.selectOptions(picker, 'admin');

    expect(
      await screen.findByText(
        "You don't have permission to change this member's role.",
      ),
    ).toBeInTheDocument();
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

describe('HouseholdPage — bank connections (#291)', () => {
  it('shows empty state when no bank connections', async () => {
    renderWithProviders(<HouseholdPage />);
    expect(
      await screen.findByText('No bank accounts connected yet.'),
    ).toBeInTheDocument();
  });

  it('renders a connected bank with masked account and status', async () => {
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([MOCK_BANK_CONNECTION]),
      ),
    );

    renderWithProviders(<HouseholdPage />);

    expect(await screen.findByText('444455******1234')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Never synced')).toBeInTheDocument();
  });

  it('connects a Monobank account and shows it in the list', async () => {
    let connections: (typeof MOCK_BANK_CONNECTION)[] = [];
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json(connections),
      ),
      http.post(
        '/api/v1/integrations/monobank/connect',
        async ({ request }) => {
          const body = (await request.json()) as { token: string };
          expect(body.token).toBe('mono-token-abc');
          connections = [MOCK_BANK_CONNECTION];
          return HttpResponse.json(MOCK_BANK_CONNECTION, { status: 201 });
        },
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('+ Connect bank'));
    await userEvent.type(
      screen.getByLabelText('Personal API token'),
      'mono-token-abc',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Connect bank' }));

    expect(await screen.findByText('444455******1234')).toBeInTheDocument();
  });

  it('shows an inline error for an invalid Monobank token, modal stays open', async () => {
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([]),
      ),
      http.post('/api/v1/integrations/monobank/connect', () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Invalid or revoked Monobank token' },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('+ Connect bank'));
    await userEvent.type(
      screen.getByLabelText('Personal API token'),
      'bad-token',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Connect bank' }));

    expect(
      await screen.findByText('This token is invalid or has been revoked.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Personal API token')).toBeInTheDocument();
  });

  it('syncs a connection and reflects the new last-sync time', async () => {
    let connection = { ...MOCK_BANK_CONNECTION };
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([connection]),
      ),
      http.post('/api/v1/integrations/monobank/connections/:id/sync', () => {
        connection = { ...connection, lastSyncAt: '2026-07-02T10:00:00Z' };
        return HttpResponse.json(
          { ...MOCK_SYNC_LOG, status: 'success' },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<HouseholdPage />);
    expect(await screen.findByText('Never synced')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sync now'));

    await waitFor(() =>
      expect(screen.queryByText('Never synced')).not.toBeInTheDocument(),
    );
  });

  it('shows a specific inline message when a sync is already in progress (409)', async () => {
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([MOCK_BANK_CONNECTION]),
      ),
      http.post('/api/v1/integrations/monobank/connections/:id/sync', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'A sync for this connection is already in progress',
          },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('Sync now'));

    expect(
      await screen.findByText(
        'A sync for this connection is already in progress.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a specific inline message when rate-limited (409)', async () => {
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([MOCK_BANK_CONNECTION]),
      ),
      http.post('/api/v1/integrations/monobank/connections/:id/sync', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message:
              'Monobank allows one statement request per 60s per token — try again in 42s',
          },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('Sync now'));

    expect(
      await screen.findByText(
        'Monobank allows one sync per minute — try again shortly.',
      ),
    ).toBeInTheDocument();
  });

  it('disconnects a bank connection after confirmation', async () => {
    let connections = [MOCK_BANK_CONNECTION];
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json(connections),
      ),
      http.delete('/api/v1/integrations/monobank/connections/:id', () => {
        connections = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('Disconnect'));

    await waitFor(() =>
      expect(
        screen.getByText('No bank accounts connected yet.'),
      ).toBeInTheDocument(),
    );
  });

  it('does not disconnect when the confirmation is cancelled', async () => {
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([MOCK_BANK_CONNECTION]),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('Disconnect'));

    expect(screen.getByText('444455******1234')).toBeInTheDocument();
  });

  it('shows sync history in a modal', async () => {
    server.use(
      http.get('/api/v1/integrations/monobank/connections', () =>
        HttpResponse.json([MOCK_BANK_CONNECTION]),
      ),
      http.get('/api/v1/integrations/monobank/connections/:id/logs', () =>
        HttpResponse.json([MOCK_SYNC_LOG]),
      ),
    );

    renderWithProviders(<HouseholdPage />);
    await userEvent.click(await screen.findByText('Sync history'));

    expect(await screen.findByText('3 transactions')).toBeInTheDocument();
  });
});
