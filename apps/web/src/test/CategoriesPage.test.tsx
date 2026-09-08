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

  // #325: before this the page could only archive, unarchive and permanently
  // delete — there was no way to produce a first category, so the whole
  // feature sat behind a door with no handle.
  describe('creating and editing (#325)', () => {
    it('creates a category from the header button', async () => {
      let posted: Record<string, unknown> | null = null;
      server.use(
        http.get('/api/v1/categories', () => HttpResponse.json(MOCK_CATEGORIES)),
        http.post('/api/v1/categories', async ({ request }) => {
          posted = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: 'c-new', householdId: 'hh-1', name: 'Transport',
            type: 'expense', icon: '🚌', parentId: null, isArchived: false,
          });
        }),
      );

      renderWithProviders(<CategoriesPage />);
      await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: '+ New category' }));
      await waitFor(() => expect(screen.getByText('New category')).toBeInTheDocument());

      await userEvent.type(screen.getByLabelText('Name'), 'Transport');
      await userEvent.type(screen.getByLabelText(/Icon/), '🚌');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(posted).not.toBeNull(), { timeout: 3000 });
      expect(posted).toMatchObject({ name: 'Transport', type: 'expense', icon: '🚌' });
    });

    it('offers a create button in the empty state, not just the header', async () => {
      // This is where a user actually is when they discover categories are
      // missing, so the way out has to be here too.
      server.use(http.get('/api/v1/categories', () => HttpResponse.json([])));
      renderWithProviders(<CategoriesPage />);

      await waitFor(
        () => expect(screen.getByText('No active categories.')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      expect(screen.getAllByRole('button', { name: '+ New category' })).toHaveLength(2);
    });

    it('edits an existing category through the same form', async () => {
      let patched: Record<string, unknown> | null = null;
      server.use(
        http.get('/api/v1/categories', () => HttpResponse.json(MOCK_CATEGORIES)),
        http.patch('/api/v1/categories/c-1', async ({ request }) => {
          patched = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...MOCK_CATEGORIES[0], name: 'Food' });
        }),
      );

      renderWithProviders(<CategoriesPage />);
      await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });

      await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
      await waitFor(() => expect(screen.getByText('Edit category')).toBeInTheDocument());

      const nameField = screen.getByLabelText('Name');
      expect(nameField).toHaveValue('Groceries');
      await userEvent.clear(nameField);
      await userEvent.type(nameField, 'Food');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(patched).not.toBeNull(), { timeout: 3000 });
      expect(patched).toMatchObject({ name: 'Food' });
    });

    it('shows the server message when the name is already taken', async () => {
      server.use(
        http.get('/api/v1/categories', () => HttpResponse.json(MOCK_CATEGORIES)),
        http.post('/api/v1/categories', () =>
          HttpResponse.json(
            {
              statusCode: 409,
              message: 'A category named "Groceries" already exists in this household',
            },
            { status: 409 },
          ),
        ),
      );

      renderWithProviders(<CategoriesPage />);
      await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument(), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: '+ New category' }));
      await userEvent.type(screen.getByLabelText('Name'), 'Groceries');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(
        () => expect(screen.getByRole('alert')).toHaveTextContent(/already exists/),
        { timeout: 3000 },
      );
      // Stays open with the typed name, so the user can adjust it.
      expect(screen.getByText('New category')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveValue('Groceries');
    });
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
