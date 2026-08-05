import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { AccountsPage } from '../pages/AccountsPage';
import { server } from './setup';
import { MOCK_ACCOUNT } from './handlers';

describe('AccountsPage', () => {
  it('renders list of accounts from API', async () => {
    renderWithProviders(<AccountsPage />);
    await waitFor(() => expect(screen.getByText('Mono Card')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('bank')).toBeInTheDocument();
  });

  it('shows total section in header', async () => {
    renderWithProviders(<AccountsPage />);
    await waitFor(() => expect(screen.getByText(/Total/)).toBeInTheDocument(), { timeout: 3000 });
  });

  it('shows empty state when no accounts', async () => {
    server.use(http.get('/api/v1/accounts', () => HttpResponse.json([])));
    renderWithProviders(<AccountsPage />);
    await waitFor(() => expect(screen.getByText('No accounts yet.')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Add first account')).toBeInTheDocument();
  });

  it('opens create account modal', async () => {
    renderWithProviders(<AccountsPage />);
    await waitFor(() => screen.getByText('+ New account'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New account'));

    expect(screen.getByText('New account')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('creates a new account and closes modal', async () => {
    let accountList = [MOCK_ACCOUNT];
    server.use(
      http.get('/api/v1/accounts', () => HttpResponse.json(accountList)),
      http.post('/api/v1/accounts', async ({ request }) => {
        const body = await request.json() as { name: string; type: string };
        const newAcc = { ...MOCK_ACCOUNT, id: 'acc-new', name: body.name, type: body.type, balance: 0 };
        accountList = [...accountList, newAcc];
        return HttpResponse.json(newAcc, { status: 201 });
      }),
    );

    renderWithProviders(<AccountsPage />);
    await waitFor(() => screen.getByText('+ New account'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New account'));
    await userEvent.type(screen.getByLabelText('Name'), 'Cash Wallet');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Cash Wallet')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('archives account on archive button click', async () => {
    let archived = false;
    server.use(
      http.get('/api/v1/accounts', () => HttpResponse.json(archived ? [] : [MOCK_ACCOUNT])),
      http.delete('/api/v1/accounts/:id', () => {
        archived = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<AccountsPage />);
    await waitFor(() => screen.getByText('Mono Card'), { timeout: 3000 });
    await userEvent.click(screen.getByText('🗑'));

    await waitFor(() => expect(screen.queryByText('Mono Card')).not.toBeInTheDocument(), { timeout: 3000 });
  });
});
