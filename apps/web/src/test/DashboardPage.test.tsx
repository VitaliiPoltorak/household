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

    await waitFor(
      () => {
        expect(screen.getByText('Total balance')).toBeInTheDocument();
        expect(screen.getByText('Income this month')).toBeInTheDocument();
        expect(screen.getByText('Expenses this month')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('shows account grid from API response', async () => {
    renderWithProviders(<DashboardPage />);

    // "Mono Card" now appears both in the accounts grid and (#161) in the
    // "By account" chart legend, so multiple hits are expected.
    await waitFor(
      () => {
        expect(screen.getAllByText('Mono Card').length).toBeGreaterThanOrEqual(
          1,
        );
      },
      { timeout: 3000 },
    );
  });

  it('shows empty state when no households', async () => {
    server.use(http.get('/api/v1/households', () => HttpResponse.json([])));

    renderWithProviders(<DashboardPage />);

    await waitFor(
      () => {
        expect(
          screen.getByText("You don't have any household yet."),
        ).toBeInTheDocument();
        expect(screen.getByText('Create your first home')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('opens create household modal on CTA click', async () => {
    server.use(http.get('/api/v1/households', () => HttpResponse.json([])));

    renderWithProviders(<DashboardPage />);

    await waitFor(() => screen.getByText('Create your first home'), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByText('Create your first home'));

    expect(screen.getByText('Create new home')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Home name…')).toBeInTheDocument();
  });

  it('creates a household and closes modal', async () => {
    server.use(http.get('/api/v1/households', () => HttpResponse.json([])));

    renderWithProviders(<DashboardPage />);
    await waitFor(() => screen.getByText('Create your first home'), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByText('Create your first home'));

    await userEvent.type(
      screen.getByPlaceholderText('Home name…'),
      'My New Home',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(
      () => {
        expect(screen.queryByText('Create new home')).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  describe('Multi-currency total balance (#160)', () => {
    const UAH_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-uah',
      name: 'UAH Bank',
      currency: 'UAH',
      balance: 5000,
    };
    const USD_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-usd',
      name: 'USD Savings',
      currency: 'USD',
      balance: 100,
    };

    beforeEach(() => {
      // Shared side-channel with AccountsPage — start each case from a clean state.
      localStorage.removeItem('accounts:ratesCache');
      localStorage.setItem('accounts:baseCurrency', 'UAH');
    });

    it('shows per-currency breakdown when household spans multiple currencies', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([
            { ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' },
          ]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Per-currency panel renders with both raw totals.
      await waitFor(
        () => expect(screen.getByText(/By currency/)).toBeInTheDocument(),
        { timeout: 3000 },
      );
      expect(screen.getByText(/UAH:/)).toBeInTheDocument();
      expect(screen.getByText(/USD:/)).toBeInTheDocument();
    });

    it('renders converted grand total when rates are ready', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([
            { ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' },
          ]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // 5000 UAH + (100 USD * 41.50) = 9150 UAH — must beat the backend's
      // naïve 5100 sum and show the honest converted total. Number now
      // appears in the Total balance card AND in the chart centre-total
      // (#161), so multiple matches are expected.
      await waitFor(
        () =>
          expect(
            screen.getAllByText(/9[\s ,]?150,00/).length,
          ).toBeGreaterThanOrEqual(1),
        { timeout: 3000 },
      );
      expect(
        screen.getByText(/converted from 2 currencies/),
      ).toBeInTheDocument();
    });

    it('hides the grand total when PrivatBank rates are unavailable', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get(
          '/api/v1/rates/latest',
          () => new HttpResponse(null, { status: 503 }),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // "unavailable" now appears in Total balance + income + expense cards
      // *and* in the chart section's "Charts hidden — exchange rates
      // unavailable" copy (#161). Multiple matches expected.
      await waitFor(
        () =>
          expect(
            screen.getAllByText(/unavailable/).length,
          ).toBeGreaterThanOrEqual(1),
        { timeout: 3000 },
      );
      // Backend's naïve 5100 sum must NOT leak through as the total.
      expect(screen.queryByText(/5[\s ,]?100,00/)).not.toBeInTheDocument();
    });

    it('picks up baseCurrency chosen on Accounts page via localStorage', async () => {
      localStorage.setItem('accounts:baseCurrency', 'USD');

      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([
            { ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' },
          ]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // In USD base: 100 USD + (5000 UAH / 41.50) ≈ 220.48 USD. Shown in
      // both the Total balance card and the chart centre-total (#161).
      await waitFor(
        () =>
          expect(screen.getAllByText(/220,48/).length).toBeGreaterThanOrEqual(
            1,
          ),
        { timeout: 3000 },
      );
    });

    it('skips per-currency block when household is single-currency', async () => {
      // Default handler already returns a single UAH account; just assert the
      // breakdown panel is absent and no rates request would be needed.
      renderWithProviders(<DashboardPage />);
      await waitFor(() =>
        expect(screen.getAllByText('Mono Card').length).toBeGreaterThanOrEqual(
          1,
        ),
      );
      // The per-currency breakdown badge is a "<span> By currency: </span>"
      // (dashboard.byCurrency). Chart panels also carry a "By currency"
      // title (dashboard.charts.byCurrency). Use an exact-only search that
      // excludes the badge form (which is followed by a colon).
      expect(screen.queryByText(/By currency:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/mixed currencies/)).not.toBeInTheDocument();
    });
  });

  describe('Multi-currency monthly income/expense (#175)', () => {
    const UAH_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-uah',
      name: 'UAH Bank',
      currency: 'UAH',
      balance: 5000,
    };
    const USD_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-usd',
      name: 'USD Savings',
      currency: 'USD',
      balance: 100,
    };

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
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get('/api/v1/reports/monthly', () =>
          HttpResponse.json(MULTI_CCY_MONTHLY),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([
            { ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' },
          ]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Income: 5000 UAH + (100 USD * 41.50) = 9150 UAH.
      // Total balance in this fixture also converts to 9150 UAH (same
      // per-currency amounts as monthly income) — both cards render the
      // same value, so getAllByText matches ≥2 elements.
      await waitFor(
        () =>
          expect(
            screen.getAllByText(/9[\s ,]?150,00/).length,
          ).toBeGreaterThanOrEqual(2),
        { timeout: 3000 },
      );
      // Expense: 800 UAH + (30 USD * 41.50) = 2045 UAH — unique on the page.
      expect(screen.getByText(/2[\s ,]?045,00/)).toBeInTheDocument();
    });

    it('shows "unavailable" for monthly cards when rates fail — no naïve sum leaks', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get('/api/v1/reports/monthly', () =>
          HttpResponse.json(MULTI_CCY_MONTHLY),
        ),
        http.get(
          '/api/v1/rates/latest',
          () => new HttpResponse(null, { status: 503 }),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Three "unavailable" labels: Total balance + Income + Expense cards.
      await waitFor(
        () =>
          expect(
            screen.getAllByText(/unavailable/).length,
          ).toBeGreaterThanOrEqual(3),
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

      await waitFor(() =>
        expect(screen.getAllByText('Mono Card').length).toBeGreaterThanOrEqual(
          1,
        ),
      );
      // Default MSW monthly handler returns UAH income = 5000. Total
      // balance card also shows 5000 UAH; chart centre-total adds a third.
      const uahAmounts = screen.getAllByText(/5[\s ,]?000,00/);
      expect(uahAmounts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Wealth breakdown charts (#161)', () => {
    const UAH_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-uah',
      name: 'UAH Bank',
      type: 'bank',
      currency: 'UAH',
      balance: 5000,
    };
    const USD_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-usd',
      name: 'USD Savings',
      type: 'bank',
      currency: 'USD',
      balance: 100,
    };
    const CASH_ACCOUNT = {
      ...MOCK_ACCOUNT,
      id: 'acc-cash',
      name: 'Wallet',
      type: 'cash',
      currency: 'UAH',
      balance: 200,
    };

    beforeEach(() => {
      localStorage.removeItem('accounts:ratesCache');
      localStorage.setItem('accounts:baseCurrency', 'UAH');
    });

    it('renders three charts when household is single-currency (no rates needed)', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5200,
            accounts: [UAH_ACCOUNT, CASH_ACCOUNT],
          }),
        ),
      );

      renderWithProviders(<DashboardPage />);

      await waitFor(
        () => expect(screen.getByText('Wealth breakdown')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      expect(screen.getByText('By account type')).toBeInTheDocument();
      expect(screen.getByText('By account')).toBeInTheDocument();
      // "By currency" also appears as the section heading elsewhere on the
      // page (locale key "dashboard.byCurrency"), so scope the check to
      // the h3 title of the third chart panel.
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.some((h) => h.textContent === 'By currency')).toBe(true);

      // Legend labels reflect the two account types — "bank" also appears
      // in the account grid tile below, hence getAllByText.
      expect(screen.getAllByText('bank').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('cash').length).toBeGreaterThanOrEqual(1);
    });

    it('renders charts when multi-currency + rates are ready', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get('/api/v1/rates/latest', () =>
          HttpResponse.json([
            { ccy: 'USD', base_ccy: 'UAH', buy: '41.50', sale: '42.00' },
          ]),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Wait for chart panel titles — appear only once chartData is
      // non-null (rates ready). Charts hidden with "Charts hidden" text
      // until then.
      await waitFor(
        () => expect(screen.getByText('By account type')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      // "By currency" legend row shows both currency labels.
      const uahLabels = screen.getAllByText('UAH');
      expect(uahLabels.length).toBeGreaterThanOrEqual(1);
      const usdLabels = screen.getAllByText('USD');
      expect(usdLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('hides charts and shows "rates unavailable" when multi-currency and rates fail', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({
            totalBalance: 5100,
            accounts: [UAH_ACCOUNT, USD_ACCOUNT],
          }),
        ),
        http.get(
          '/api/v1/rates/latest',
          () => new HttpResponse(null, { status: 503 }),
        ),
      );

      renderWithProviders(<DashboardPage />);

      await waitFor(
        () =>
          expect(
            screen.getByText(/Charts hidden — exchange rates unavailable/),
          ).toBeInTheDocument(),
        { timeout: 3000 },
      );
      // The chart panel titles must NOT be rendered when the honest data
      // isn't available.
      expect(screen.queryByText('By account type')).not.toBeInTheDocument();
      expect(screen.queryByText('By account')).not.toBeInTheDocument();
    });

    it('omits the chart section entirely when the household has no accounts', async () => {
      server.use(
        http.get('/api/v1/accounts/summary', () =>
          HttpResponse.json({ totalBalance: 0, accounts: [] }),
        ),
      );

      renderWithProviders(<DashboardPage />);

      // Wait for header to render so we know the page loaded.
      await waitFor(
        () => expect(screen.getByText('Total balance')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      expect(screen.queryByText('Wealth breakdown')).not.toBeInTheDocument();
    });
  });
});
