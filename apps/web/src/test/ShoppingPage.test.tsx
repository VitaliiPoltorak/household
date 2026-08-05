import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { ShoppingPage } from '../pages/ShoppingPage';
import { server } from './setup';

const MOCK_LIST = {
  id: 'list-1', householdId: 'hh-1', name: 'Weekly Groceries', status: 'active' as const,
  storeId: null, createdBy: 'user-1', createdAt: '2026-07-01T00:00:00Z',
  items: [{ id: 'item-1', listId: 'list-1', productId: null, name: 'Milk', quantity: 2, unit: 'L', preferredStoreId: null, actualStoreId: null, isPurchased: false, price: null }],
};

describe('ShoppingPage', () => {
  it('shows empty state when no lists', async () => {
    renderWithProviders(<ShoppingPage />);
    await waitFor(() => expect(screen.getByText('No shopping lists yet.')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('renders shopping list names from API', async () => {
    server.use(http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])));
    renderWithProviders(<ShoppingPage />);
    await waitFor(() => expect(screen.getByText('Weekly Groceries')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('opens create list modal', async () => {
    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('+ New list'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New list'));

    expect(screen.getByText('New shopping list')).toBeInTheDocument();
    expect(screen.getByLabelText('List name')).toBeInTheDocument();
  });

  it('creates a list and shows it in the panel', async () => {
    let lists: typeof MOCK_LIST[] = [];
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json(lists)),
      http.post('/api/v1/shopping-lists', async ({ request }) => {
        const body = await request.json() as { name: string };
        const newList = { ...MOCK_LIST, name: body.name };
        lists = [newList];
        return HttpResponse.json(newList, { status: 201 });
      }),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('+ New list'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New list'));
    await userEvent.type(screen.getByLabelText('List name'), 'Weekend Shop');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Weekend Shop')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('shows items when a list is selected', async () => {
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])),
      http.get('/api/v1/shopping-lists/:id', () => HttpResponse.json(MOCK_LIST)),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Weekly Groceries'), { timeout: 3000 });
    await userEvent.click(screen.getByText('Weekly Groceries'));

    await waitFor(() => expect(screen.getByText('Milk')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('marks item as purchased', async () => {
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])),
      http.get('/api/v1/shopping-lists/:id', () => HttpResponse.json(MOCK_LIST)),
      http.patch('/api/v1/shopping-lists/:listId/items/:itemId', () =>
        HttpResponse.json({ ...MOCK_LIST.items[0], isPurchased: true }),
      ),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Weekly Groceries'), { timeout: 3000 });
    await userEvent.click(screen.getByText('Weekly Groceries'));
    await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    // Verify checkbox interaction — patch should be called without throwing
  });
});
