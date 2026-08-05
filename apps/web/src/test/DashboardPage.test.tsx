import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { DashboardPage } from '../pages/DashboardPage';
import { server } from './setup';

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
});
