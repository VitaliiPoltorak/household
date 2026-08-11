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
    server.use(http.get('/api/v1/accounts', () => HttpResponse.json([
      MOCK_ACCOUNT,
      { ...MOCK_ACCOUNT, id: 'acc-2', name: 'Cash' },
    ])));
    renderWithProviders(<TransactionsPage />);

    await waitFor(() => screen.getByText('⇄ Transfer'), { timeout: 3000 });
    await userEvent.click(screen.getByText('⇄ Transfer'));

    expect(screen.getByText('Transfer between accounts')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
  });

  it('shows warning when only 1 account available for transfer', async () => {
    server.use(http.get('/api/v1/accounts', () => HttpResponse.json([MOCK_ACCOUNT])));
    renderWithProviders(<TransactionsPage />);

    await waitFor(() => screen.getByText('⇄ Transfer'), { timeout: 3000 });
    await userEvent.click(screen.getByText('⇄ Transfer'));

    expect(screen.getByText('You need at least 2 accounts to make a transfer.')).toBeInTheDocument();
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
  });

  it('renders a transfer as a SINGLE row showing "From → To" (#167)', async () => {
    // Backend returns one row per transfer pair (deduped), with counter fields.
    server.use(
      http.get('/api/v1/accounts', () =>
        HttpResponse.json([
          MOCK_ACCOUNT,
          { ...MOCK_ACCOUNT, id: 'acc-2', name: 'Cash' },
        ]),
      ),
      http.get('/api/v1/transactions', () =>
        HttpResponse.json([
          {
            ...MOCK_TRANSACTION,
            id: 'tx-debit',
            type: 'transfer',
            amount: 500,
            description: null,
            transferPairId: 'pair-1',
            transferDirection: 'debit',
            accountId: 'acc-1',
            counterAccountId: 'acc-2',
            counterTransactionId: 'tx-credit',
            counterAmount: 500,
            counterCurrency: 'UAH',
          },
        ]),
      ),
    );

    renderWithProviders(<TransactionsPage />);

    // Both account names appear in ONE row — once in the description-fallback
    // span, once in the meta line under it. If we had rendered two rows (the
    // old bug), we'd see 4 matches. Two is the invariant.
    await waitFor(
      () => expect(screen.getAllByText(/Mono Card → Cash/)).toHaveLength(2),
      { timeout: 3000 },
    );
    // Only ONE 'transfer' badge in the list body (the row). Note the
    // TxFilters dropdown also contains the word 'transfer' capitalised
    // ('Transfer') via the type filter option, but the Badge renders the
    // raw lowercase enum — so we check the lowercase form and expect === 1.
    expect(screen.getAllByText('transfer')).toHaveLength(1);
  });

  it('cascades a transfer delete → both legs disappear on re-fetch (#167)', async () => {
    let deleted = false;
    server.use(
      http.get('/api/v1/accounts', () =>
        HttpResponse.json([
          MOCK_ACCOUNT,
          { ...MOCK_ACCOUNT, id: 'acc-2', name: 'Cash' },
        ]),
      ),
      http.get('/api/v1/transactions', () =>
        HttpResponse.json(deleted ? [] : [
          {
            ...MOCK_TRANSACTION,
            id: 'tx-debit',
            type: 'transfer',
            amount: 500,
            description: 'Rent transfer',
            transferPairId: 'pair-1',
            transferDirection: 'debit',
            accountId: 'acc-1',
            counterAccountId: 'acc-2',
            counterTransactionId: 'tx-credit',
            counterAmount: 500,
            counterCurrency: 'UAH',
          },
        ]),
      ),
      http.delete('/api/v1/transactions/:id', () => {
        // Backend cascades — single DELETE removes BOTH legs.
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<TransactionsPage />);
    await waitFor(() => screen.getByText('Rent transfer'), { timeout: 3000 });
    await userEvent.click(screen.getByText('✕'));

    // Row disappears after refetch (accounts + transactions invalidated together).
    await waitFor(() => expect(screen.queryByText('Rent transfer')).not.toBeInTheDocument(), { timeout: 3000 });
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
