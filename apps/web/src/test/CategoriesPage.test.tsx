import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { CategoriesPage } from '../pages/CategoriesPage';
import { server } from './setup';

const MOCK_CATEGORIES = [
  { id: 'c-1', householdId: 'hh-1', name: 'Groceries', type: 'expense', icon: null, parentId: null, isArchived: false },
  { id: 'c-2', householdId: 'hh-1', name: 'Salary',    type: 'income',  icon: null, parentId: null, isArchived: false },
  { id: 'c-3', householdId: 'hh-1', name: 'Fuel',      type: 'expense', icon: null, parentId: null, isArchived: true  },
];

describe('CategoriesPage', () => {
  it('renders active categories grouped by type', async () => {
    server.use(http.get('/api/v1/categories', () => HttpResponse.json(MOCK_CATEGORIES)));
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.queryByText('Fuel')).not.toBeInTheDocument(); // archived, section collapsed
  });

  it('archives a category via the confirmation dialog and refetches', async () => {
    let deleted = false;
    server.use(
      http.get('/api/v1/categories', () =>
        HttpResponse.json(deleted
          ? MOCK_CATEGORIES.map(c => c.id === 'c-1' ? { ...c, isArchived: true } : c)
          : MOCK_CATEGORIES,
        ),
      ),
      http.delete('/api/v1/categories/c-1', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });

    // First Archive button in the DOM belongs to the Groceries row
    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' })[0]);

    // Confirmation dialog appears
    await waitFor(() => expect(screen.getByText('Archive category?')).toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!);

    // Category no longer in active list after refetch
    await waitFor(() => expect(screen.queryByText('Groceries')).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it('shows archived category after expanding the archived section', async () => {
    server.use(http.get('/api/v1/categories', () => HttpResponse.json(MOCK_CATEGORIES)));
    renderWithProviders(<CategoriesPage />);

    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: /Archived/ }));

    expect(await screen.findByText('Fuel')).toBeInTheDocument();
  });

  it('unarchives a category from the archived section', async () => {
    let unarchived = false;
    server.use(
      http.get('/api/v1/categories', () =>
        HttpResponse.json(unarchived
          ? MOCK_CATEGORIES.map(c => c.id === 'c-3' ? { ...c, isArchived: false } : c)
          : MOCK_CATEGORIES,
        ),
      ),
      http.post('/api/v1/categories/c-3/unarchive', () => {
        unarchived = true;
        return HttpResponse.json({ ...MOCK_CATEGORIES[2], isArchived: false });
      }),
    );

    renderWithProviders(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: /Archived/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    // "Fuel" moves out of the archived list into the active expense group
    await waitFor(() => {
      const fuelCells = screen.getAllByText('Fuel');
      // Now visible in active section (no line-through)
      expect(fuelCells.some(el => !el.className.includes('line-through'))).toBe(true);
    }, { timeout: 3000 });
  });
});
