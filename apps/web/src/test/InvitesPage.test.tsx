import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { InvitesPage } from '../pages/InvitesPage';
import { server } from './setup';

const MOCK_HOUSEHOLD = {
  id: 'hh-1',
  name: 'Test Home',
  slug: 'test-home',
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
};

const OTHER_HOUSEHOLD = {
  id: 'hh-2',
  name: 'Vacation Home',
  slug: 'vacation-home',
  createdBy: 'other-user',
  createdAt: '2026-01-01T00:00:00Z',
};

const MOCK_INVITE = {
  id: 'invite-1',
  householdId: 'hh-2',
  email: 'test@example.com',
  token: 'tok-abc123',
  role: 'member',
  expiresAt: '2099-01-01T00:00:00Z',
  acceptedAt: null,
  household: OTHER_HOUSEHOLD,
};

describe('InvitesPage (#267)', () => {
  it('shows an empty state when there are no pending invites', async () => {
    server.use(http.get('/api/v1/invites', () => HttpResponse.json([])));

    renderWithProviders(<InvitesPage />);

    expect(await screen.findByText('No pending invites.')).toBeInTheDocument();
  });

  it('renders a pending invite with the target household name and role', async () => {
    server.use(
      http.get('/api/v1/invites', () => HttpResponse.json([MOCK_INVITE])),
    );

    renderWithProviders(<InvitesPage />);

    expect(await screen.findByText('Vacation Home')).toBeInTheDocument();
    expect(screen.getByText(/Member/)).toBeInTheDocument();
  });

  it('accepting an invite calls the accept endpoint and activates the joined household', async () => {
    let acceptedToken = '';
    server.use(
      http.get('/api/v1/invites', () => HttpResponse.json([MOCK_INVITE])),
      http.get('/api/v1/households', () =>
        HttpResponse.json([MOCK_HOUSEHOLD, OTHER_HOUSEHOLD]),
      ),
      http.post('/api/v1/invites/:token/accept', ({ params }) => {
        acceptedToken = params['token'] as string;
        return HttpResponse.json({
          id: 'member-1',
          householdId: 'hh-2',
          userId: 'user-1',
          role: 'member',
          createdAt: '2026-01-01T00:00:00Z',
        });
      }),
    );

    renderWithProviders(<InvitesPage />);
    await screen.findByText('Vacation Home');

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(acceptedToken).toBe('tok-abc123'));
    await waitFor(() =>
      expect(localStorage.getItem('activeHouseholdId')).toBe('hh-2'),
    );
  });

  it('declining an invite removes it from the list', async () => {
    let invites = [MOCK_INVITE];
    let declinedToken = '';
    server.use(
      http.get('/api/v1/invites', () => HttpResponse.json(invites)),
      http.post('/api/v1/invites/:token/decline', ({ params }) => {
        declinedToken = params['token'] as string;
        invites = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<InvitesPage />);
    await screen.findByText('Vacation Home');

    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(declinedToken).toBe('tok-abc123'));
    await waitFor(() =>
      expect(screen.getByText('No pending invites.')).toBeInTheDocument(),
    );
  });
});
