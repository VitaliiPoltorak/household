import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { AccountsPage } from '../pages/AccountsPage';
import { server } from './setup';
import { MOCK_ACCOUNT } from './handlers';

describe('AccountsPage', () => {
  beforeEach(() => {
    // View toggle is persisted globally; reset so cases don't leak into
    // each other (#164).
    localStorage.removeItem('accounts:view');
  });

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

  describe('Multi-currency estimated total (#80)', () => {
    const UAH_ACCOUNT = { ...MOCK_ACCOUNT, id: 'acc-uah', name: 'UAH Bank', currency: 'UAH', balance: 5000 };
    const USD_ACCOUNT = { ...MOCK_ACCOUNT, id: 'acc-usd', name: 'USD Savings', currency: 'USD', balance: 100 };

    beforeEach(() => {
      // Clean slate — the cache key is a shared side-channel we control.
      localStorage.removeItem('accounts:ratesCache');
      localStorage.setItem('accounts:baseCurrency', 'UAH');
    });

    it('shows the estimated total using live PrivatBank rates', async () => {
      server.use(
        http.get('/api/v1/accounts', () => HttpResponse.json([UAH_ACCOUNT, USD_ACCOUNT])),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([{ ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' }]),
        ),
      );

      renderWithProviders(<AccountsPage />);
      // Live total: 5000 + (100 * 41.50) = 9150 UAH
      await waitFor(() => expect(screen.getByText(/9,150\.00/)).toBeInTheDocument(), { timeout: 3000 });
      expect(screen.queryByText(/Exchange rates unavailable/)).not.toBeInTheDocument();
    });

    it('shows unavailable banner when PrivatBank fails and no cache exists', async () => {
      server.use(
        http.get('/api/v1/accounts', () => HttpResponse.json([UAH_ACCOUNT, USD_ACCOUNT])),
        http.get('/api/v1/rates/latest', () =>
          new HttpResponse(null, { status: 503 }),
        ),
      );

      renderWithProviders(<AccountsPage />);
      await waitFor(
        () => expect(screen.getByText('Exchange rates unavailable')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      // Critically: the aggregate is NOT rendered as ₴100 (silent 1:1 fallback).
      // Look for any UAH-formatted number matching a wrong value. Per-currency
      // breakdown still shows ($100.00 and ₴5,000.00) — but no bogus total.
      expect(screen.queryByText(/5,100/)).not.toBeInTheDocument();
    });

    it('falls back to cached rates when live fetch fails', async () => {
      // Prime the cache as if a previous successful fetch had written it.
      localStorage.setItem(
        'accounts:ratesCache',
        JSON.stringify({ rates: { UAH: 1, USD: 40 }, at: Date.now() - 60_000 }),
      );

      server.use(
        http.get('/api/v1/accounts', () => HttpResponse.json([UAH_ACCOUNT, USD_ACCOUNT])),
        http.get('/api/v1/rates/latest', () =>
          new HttpResponse(null, { status: 503 }),
        ),
      );

      renderWithProviders(<AccountsPage />);
      // Cached total: 5000 + (100 * 40) = 9000 UAH, tagged "cached"
      await waitFor(() => expect(screen.getByText(/9,000\.00/)).toBeInTheDocument(), { timeout: 3000 });
      expect(screen.getByText(/cached/)).toBeInTheDocument();
    });

    it('ignores stale cache older than 7 days and shows unavailable', async () => {
      const EIGHT_DAYS_AGO = Date.now() - 8 * 24 * 60 * 60 * 1000;
      localStorage.setItem(
        'accounts:ratesCache',
        JSON.stringify({ rates: { UAH: 1, USD: 40 }, at: EIGHT_DAYS_AGO }),
      );

      server.use(
        http.get('/api/v1/accounts', () => HttpResponse.json([UAH_ACCOUNT, USD_ACCOUNT])),
        http.get('/api/v1/rates/latest', () =>
          new HttpResponse(null, { status: 503 }),
        ),
      );

      renderWithProviders(<AccountsPage />);
      await waitFor(
        () => expect(screen.getByText('Exchange rates unavailable')).toBeInTheDocument(),
        { timeout: 3000 },
      );
    });

    it('does not fetch rates when all accounts share the base currency', async () => {
      let pbCalls = 0;
      server.use(
        http.get('/api/v1/accounts', () => HttpResponse.json([UAH_ACCOUNT])),
        http.get('/api/v1/rates/latest', () => {
          pbCalls++;
          return HttpResponse.json([]);
        }),
      );

      renderWithProviders(<AccountsPage />);
      await waitFor(() => screen.getByText('UAH Bank'), { timeout: 3000 });
      // Simple total renders, no banner, no rates request
      expect(screen.queryByText(/Exchange rates unavailable/)).not.toBeInTheDocument();
      expect(pbCalls).toBe(0);
    });
  });

  describe('View toggle (#164)', () => {
    // A dedicated fixture with >1 account so grid (multi cards) vs list
    // (single <ul>) is visually distinguishable in the DOM tree.
    const TWO_ACCOUNTS = [
      { ...MOCK_ACCOUNT, id: 'a1', name: 'Alpha Bank' },
      { ...MOCK_ACCOUNT, id: 'a2', name: 'Beta Cash', type: 'cash' as const },
    ];

    it('renders in grid view by default (no <ul role="list">)', async () => {
      server.use(http.get('/api/v1/accounts', () => HttpResponse.json(TWO_ACCOUNTS)));

      renderWithProviders(<AccountsPage />);
      await waitFor(() => screen.getByText('Alpha Bank'), { timeout: 3000 });

      // AccountRow renders as <li> inside a <ul role="list">. Grid uses
      // plain <div>s — so absence of role="list" ≡ grid mode.
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('switches to list view and persists the choice to localStorage', async () => {
      server.use(http.get('/api/v1/accounts', () => HttpResponse.json(TWO_ACCOUNTS)));

      renderWithProviders(<AccountsPage />);
      await waitFor(() => screen.getByText('Alpha Bank'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'List view' }));

      // Now rendered as a role="list" with two <li> children.
      const listEl = await screen.findByRole('list');
      expect(listEl).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);

      expect(localStorage.getItem('accounts:view')).toBe('list');

      // aria-pressed reflects active state so the toggle is a11y-correct.
      expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('restores list view from localStorage on next mount', async () => {
      localStorage.setItem('accounts:view', 'list');
      server.use(http.get('/api/v1/accounts', () => HttpResponse.json(TWO_ACCOUNTS)));

      renderWithProviders(<AccountsPage />);
      await waitFor(() => screen.getByText('Alpha Bank'), { timeout: 3000 });

      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('archive action works in list view (shared handlers via useAccountActions)', async () => {
      // Prove list ≠ dead UI: the same mutation fires and the DOM updates.
      let archived = false;
      localStorage.setItem('accounts:view', 'list');
      server.use(
        http.get('/api/v1/accounts', () => HttpResponse.json(archived ? [TWO_ACCOUNTS[1]] : TWO_ACCOUNTS)),
        http.delete('/api/v1/accounts/:id', () => {
          archived = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderWithProviders(<AccountsPage />);
      await waitFor(() => screen.getByText('Alpha Bank'), { timeout: 3000 });

      // Two rows → two 🗑 buttons. Click the first (Alpha Bank's row).
      await userEvent.click(screen.getAllByText('🗑')[0]);

      await waitFor(() => expect(screen.queryByText('Alpha Bank')).not.toBeInTheDocument(), { timeout: 3000 });
      expect(screen.getByText('Beta Cash')).toBeInTheDocument();
    });
  });
});
