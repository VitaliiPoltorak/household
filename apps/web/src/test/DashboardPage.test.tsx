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
});
