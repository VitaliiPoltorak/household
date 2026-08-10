import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { TransactionsPage } from '../pages/TransactionsPage';
import { server } from './setup';
import { MOCK_TRANSACTION, MOCK_ACCOUNT } from './handlers';

describe('TransactionsPage', () => {
  it('renders list of transactions from API', async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => expect(screen.getByText('Salary')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getAllByText('income').length).toBeGreaterThan(0);
  });

  it('shows empty state when no transactions', async () => {
    server.use(http.get('/api/v1/transactions', () => HttpResponse.json([])));
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => expect(screen.getByText('No transactions found.')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('opens create transaction modal', async () => {
    server.use(http.get('/api/v1/accounts', () => HttpResponse.json([MOCK_ACCOUNT])));
    renderWithProviders(<TransactionsPage />);

    await waitFor(() => screen.getByText('+ New'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New'));

    expect(screen.getByText('New transaction')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  it('creates a transaction and closes modal', async () => {
    server.use(http.get('/api/v1/accounts', () => HttpResponse.json([MOCK_ACCOUNT])));
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => screen.getByText('+ New'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New'));

    // Post-#92 refactor CreateTxModal starts with no default type — the user
    // must pick explicitly before Add is enabled. Reflect that here.
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'income');
    await userEvent.type(screen.getByLabelText('Amount'), '1500');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.queryByText('New transaction')).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it('deletes a transaction on ✕ click', async () => {
    let deleted = false;
    server.use(
      http.get('/api/v1/transactions', () => HttpResponse.json(deleted ? [] : [MOCK_TRANSACTION])),
      http.delete('/api/v1/transactions/:id', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<TransactionsPage />);
    await waitFor(() => screen.getByText('Salary'), { timeout: 3000 });
    await userEvent.click(screen.getByText('✕'));

    await waitFor(() => expect(screen.queryByText('Salary')).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it('opens transfer modal', async () => {
    server.use(http.get('/api/v1/accounts', () => HttpResponse.json([MOCK_ACCOUNT])));
    renderWithProviders(<TransactionsPage />);

    await waitFor(() => screen.getByText('⇄ Transfer'), { timeout: 3000 });
    await userEvent.click(screen.getByText('⇄ Transfer'));

    expect(screen.getByText('Transfer between accounts')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
  });

  it('filters by type: selecting expense shows no income transactions', async () => {
    server.use(
      http.get('/api/v1/transactions', ({ request }) => {
        const type = new URL(request.url).searchParams.get('type');
        return HttpResponse.json(type === 'expense' ? [] : [MOCK_TRANSACTION]);
      }),
    );

    renderWithProviders(<TransactionsPage />);
    await waitFor(() => screen.getByText('Salary'), { timeout: 3000 });

    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], 'expense');

    await waitFor(() => expect(screen.queryByText('Salary')).not.toBeInTheDocument(), { timeout: 3000 });
  });
});
