import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { DashboardPage } from '../pages/DashboardPage';
import { server } from './setup';
import { MOCK_ACCOUNT } from './handlers';

describe('DashboardPage', () => {
  beforeEach(clearAuthTokens);

  it('shows balance summary cards after data loads', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Total balance')).toBeInTheDocument();
      expect(screen.getByText('Income this month')).toBeInTheDocument();
      expect(screen.getByText('Expenses this month')).toBeInTheDocument();
    });
  });

  it('shows account grid from API response', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Mono Card')).toBeInTheDocument();
    });
  });

  it('shows empty state when no households', async () => {
    server.use(
      http.get('/api/v1/households', () => HttpResponse.json([])),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("You don't have any household yet.")).toBeInTheDocument();
      expect(screen.getByText('Create your first home')).toBeInTheDocument();
    });
  });

  it('opens create household modal on CTA click', async () => {
    server.use(
      http.get('/api/v1/households', () => HttpResponse.json([])),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => screen.getByText('Create your first home'));
    await userEvent.click(screen.getByText('Create your first home'));

    expect(screen.getByText('Create new home')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Home name…')).toBeInTheDocument();
  });

  it('creates a household and closes modal', async () => {
    server.use(
      http.get('/api/v1/households', () => HttpResponse.json([])),
    );

    renderWithProviders(<DashboardPage />);
    await waitFor(() => screen.getByText('Create your first home'));
    await userEvent.click(screen.getByText('Create your first home'));

    await userEvent.type(screen.getByPlaceholderText('Home name…'), 'My New Home');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.queryByText('Create new home')).not.toBeInTheDocument();
    });
  });

  describe('Multi-currency total balance (#160)', () => {
    const UAH_ACCOUNT = { ...MOCK_ACCOUNT, id: 'acc-uah', name: 'UAH Bank', currency: 'UAH', balance: 5000 };
    const USD_ACCOUNT = { ...MOCK_ACCOUNT, id: 'acc-usd', name: 'USD Savings', currency: 'USD', balance: 100 };

    beforeEach(() => {
      // Shared side-channel with AccountsPage — start each case from a clean state.
      localStorage.removeItem('accounts:ratesCache');
      localStorage.setItem('accounts:baseCurrency', 'UAH');
    });

    it('shows per-currency breakdown when household spans multiple currencies', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 5100, accounts: [UAH_ACCOUNT, USD_ACCOUNT] }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([{ ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' }]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Per-currency panel renders with both raw totals.
      await waitFor(() => expect(screen.getByText(/By currency/)).toBeInTheDocument(), { timeout: 3000 });
      expect(screen.getByText(/UAH:/)).toBeInTheDocument();
      expect(screen.getByText(/USD:/)).toBeInTheDocument();
    });

    it('renders converted grand total when rates are ready', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 5100, accounts: [UAH_ACCOUNT, USD_ACCOUNT] }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([{ ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' }]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // 5000 UAH + (100 USD * 41.50) = 9150 UAH — must beat the backend's
      // naïve 5100 sum and show the honest converted total.
      await waitFor(() => expect(screen.getByText(/9[\s ,]?150,00/)).toBeInTheDocument(), { timeout: 3000 });
      expect(screen.getByText(/converted from 2 currencies/)).toBeInTheDocument();
    });

    it('hides the grand total when PrivatBank rates are unavailable', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 5100, accounts: [UAH_ACCOUNT, USD_ACCOUNT] }),
        ),
        http.get('/api/v1/rates/latest', () => new HttpResponse(null, { status: 503 })),
      );

      renderWithProviders(<DashboardPage />);

      await waitFor(
        () => expect(screen.getByText(/unavailable/)).toBeInTheDocument(),
        { timeout: 3000 },
      );
      // Backend's naïve 5100 sum must NOT leak through as the total.
      expect(screen.queryByText(/5[\s ,]?100,00/)).not.toBeInTheDocument();
    });

    it('picks up baseCurrency chosen on Accounts page via localStorage', async () => {
      localStorage.setItem('accounts:baseCurrency', 'USD');

      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 5100, accounts: [UAH_ACCOUNT, USD_ACCOUNT] }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([{ ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' }]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // In USD base: 100 USD + (5000 UAH / 41.50) ≈ 220.48 USD.
      // Use a loose regex on the digit sequence — the currency symbol
      // formatting differs by locale.
      await waitFor(
        () => expect(screen.getByText(/220,48/)).toBeInTheDocument(),
        { timeout: 3000 },
      );
    });

    it('skips per-currency block when household is single-currency', async () => {
      // Default handler already returns a single UAH account; just assert the
      // breakdown panel is absent and no rates request would be needed.
      renderWithProviders(<DashboardPage />);
      await waitFor(() => expect(screen.getByText('Mono Card')).toBeInTheDocument());
      expect(screen.queryByText(/By currency/)).not.toBeInTheDocument();
      expect(screen.queryByText(/mixed currencies/)).not.toBeInTheDocument();
    });
  });

  describe('Multi-currency monthly income/expense (#175)', () => {
    const UAH_ACCOUNT = { ...MOCK_ACCOUNT, id: 'acc-uah', name: 'UAH Bank', currency: 'UAH', balance: 5000 };
    const USD_ACCOUNT = { ...MOCK_ACCOUNT, id: 'acc-usd', name: 'USD Savings', currency: 'USD', balance: 100 };

    // Cross-currency month: 5000 UAH income + 800 UAH expense
    //                    + 100 USD income + 30 USD expense
    const MULTI_CCY_MONTHLY = {
      period: '2026-07',
      byCurrency: {
        UAH: { income: 5000, expense: 800, net: 4200 },
        USD: { income: 100, expense: 30, net: 70 },
      },
      byDay: [
        { date: '2026-07-01', currency: 'UAH', income: 5000, expense: 0 },
        { date: '2026-07-02', currency: 'UAH', income: 0, expense: 800 },
        { date: '2026-07-03', currency: 'USD', income: 100, expense: 0 },
        { date: '2026-07-04', currency: 'USD', income: 0, expense: 30 },
      ],
    };

    beforeEach(() => {
      localStorage.removeItem('accounts:ratesCache');
      localStorage.setItem('accounts:baseCurrency', 'UAH');
    });

    it('renders income + expense converted to baseCurrency when rates are ready', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 5100, accounts: [UAH_ACCOUNT, USD_ACCOUNT] }),
        ),
        http.get('/api/v1/reports/monthly', () => HttpResponse.json(MULTI_CCY_MONTHLY)),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([{ ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' }]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Income: 5000 UAH + (100 USD * 41.50) = 9150 UAH.
      // Total balance in this fixture also converts to 9150 UAH (same
      // per-currency amounts as monthly income) — both cards render the
      // same value, so getAllByText matches ≥2 elements.
      await waitFor(
        () => expect(screen.getAllByText(/9[\s ,]?150,00/).length).toBeGreaterThanOrEqual(2),
        { timeout: 3000 },
      );
      // Expense: 800 UAH + (30 USD * 41.50) = 2045 UAH — unique on the page.
      expect(screen.getByText(/2[\s ,]?045,00/)).toBeInTheDocument();
    });

    it('shows "unavailable" for monthly cards when rates fail — no naïve sum leaks', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 5100, accounts: [UAH_ACCOUNT, USD_ACCOUNT] }),
        ),
        http.get('/api/v1/reports/monthly', () => HttpResponse.json(MULTI_CCY_MONTHLY)),
        http.get('/api/v1/rates/latest', () => new HttpResponse(null, { status: 503 })),
      );

      renderWithProviders(<DashboardPage />);

      // Three "unavailable" labels: Total balance + Income + Expense cards.
      await waitFor(
        () => expect(screen.getAllByText(/unavailable/).length).toBeGreaterThanOrEqual(3),
        { timeout: 3000 },
      );
      // The old bug's smoking gun: 5100 (naïve income+expense across ccys) or
      // 5100/830/etc. must not appear as the card value.
      expect(screen.queryByText(/^5[\s ,]?100,00/)).not.toBeInTheDocument();
    });

    it('single-currency month shows unadorned native amount (no rates call needed)', async () => {
      // Default handler → single UAH account + single-UAH month.
      // Regression check that we didn't break the base case.
      renderWithProviders(<DashboardPage />);

      await waitFor(() => expect(screen.getByText('Mono Card')).toBeInTheDocument());
      // Default MSW monthly handler returns UAH income = 5000.
      // Total balance card also shows 5000 UAH → we assert the count.
      const uahAmounts = screen.getAllByText(/5[\s ,]?000,00/);
      expect(uahAmounts.length).toBeGreaterThanOrEqual(2); // total balance + income card
    });
  });
});
