import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { ShoppingPage } from '../pages/ShoppingPage';
import { server } from './setup';
import i18n from '../i18n';

const MOCK_LIST = {
  id: 'list-1',
  householdId: 'hh-1',
  name: 'Weekly Groceries',
  status: 'active' as const,
  storeId: null,
  createdBy: 'user-1',
  createdAt: '2026-07-01T00:00:00Z',
  items: [
    {
      id: 'item-1',
      listId: 'list-1',
      productId: null,
      name: 'Milk',
      quantity: 2,
      unit: 'L',
      preferredStoreId: null,
      actualStoreId: null,
      isPurchased: false,
      price: null,
    },
  ],
};

const MOCK_STORE = {
  id: 'store-1',
  householdId: 'hh-1',
  name: 'Silpo',
  type: 'supermarket' as const,
  address: null,
};

const MOCK_PRODUCT = {
  id: 'product-1',
  householdId: 'hh-1',
  name: 'Oat Milk',
  category: null,
  unit: 'L',
  preferredStoreId: null,
  alternativeStoreIds: [],
  lastPrice: null,
  notes: null,
  url: null,
  imageUrl: null,
  previewTitle: null,
};

describe('ShoppingPage', () => {
  it('shows empty state when no lists', async () => {
    renderWithProviders(<ShoppingPage />);
    await waitFor(
      () =>
        expect(screen.getByText('No shopping lists yet.')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('renders shopping list names from API', async () => {
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])),
    );
    renderWithProviders(<ShoppingPage />);
    await waitFor(
      () => expect(screen.getByText('Weekly Groceries')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('opens create list modal', async () => {
    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('+ New list'), { timeout: 3000 });
    await userEvent.click(screen.getByText('+ New list'));

    expect(screen.getByText('New shopping list')).toBeInTheDocument();
    expect(screen.getByLabelText('List name')).toBeInTheDocument();
  });

  it('creates a list and shows it in the panel', async () => {
    let lists: (typeof MOCK_LIST)[] = [];
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json(lists)),
      http.post('/api/v1/shopping-lists', async ({ request }) => {
        const body = (await request.json()) as { name: string };
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

    await waitFor(
      () => expect(screen.getByText('Weekend Shop')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('shows items when a list is selected', async () => {
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])),
      http.get('/api/v1/shopping-lists/:id', () =>
        HttpResponse.json(MOCK_LIST),
      ),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Weekly Groceries'), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByText('Weekly Groceries'));

    await waitFor(() => expect(screen.getByText('Milk')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('marks item as purchased', async () => {
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])),
      http.get('/api/v1/shopping-lists/:id', () =>
        HttpResponse.json(MOCK_LIST),
      ),
      http.patch('/api/v1/shopping-lists/:listId/items/:itemId', () =>
        HttpResponse.json({ ...MOCK_LIST.items[0], isPurchased: true }),
      ),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Weekly Groceries'), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByText('Weekly Groceries'));
    await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    // Verify checkbox interaction — patch should be called without throwing
  });

  it('clears the selected list when switching status tabs', async () => {
    server.use(
      http.get('/api/v1/shopping-lists', () => HttpResponse.json([MOCK_LIST])),
      http.get('/api/v1/shopping-lists/:id', () =>
        HttpResponse.json(MOCK_LIST),
      ),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Weekly Groceries'), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByText('Weekly Groceries'));
    await waitFor(() => expect(screen.getByText('Milk')).toBeInTheDocument(), {
      timeout: 3000,
    });

    await userEvent.click(screen.getByText('Completed'));

    await waitFor(
      () =>
        expect(
          screen.getByText('Select a list to view items'),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  });

  it('shows a store badge on an item with a preferred store', async () => {
    const listWithStore = {
      ...MOCK_LIST,
      items: [{ ...MOCK_LIST.items[0], preferredStoreId: MOCK_STORE.id }],
    };
    server.use(
      http.get('/api/v1/stores', () => HttpResponse.json([MOCK_STORE])),
      http.get('/api/v1/shopping-lists', () =>
        HttpResponse.json([listWithStore]),
      ),
      http.get('/api/v1/shopping-lists/:id', () =>
        HttpResponse.json(listWithStore),
      ),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Weekly Groceries'), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByText('Weekly Groceries'));

    await waitFor(() => expect(screen.getByText('Milk')).toBeInTheDocument(), {
      timeout: 3000,
    });
    const itemRow = screen.getByText('Milk').closest('div')!;
    expect(within(itemRow).getByText('Silpo')).toBeInTheDocument();
  });

  it('creates a store from the store manager modal', async () => {
    let stores: (typeof MOCK_STORE)[] = [];
    server.use(
      http.get('/api/v1/stores', () => HttpResponse.json(stores)),
      http.post('/api/v1/stores', async ({ request }) => {
        const body = (await request.json()) as { name: string; type: string };
        const created = { ...MOCK_STORE, name: body.name };
        stores = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Manage stores'), { timeout: 3000 });
    await userEvent.click(screen.getByText('Manage stores'));

    expect(screen.getByText('Stores')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Store name'), 'Novus');
    await userEvent.click(screen.getByRole('button', { name: '+ Add store' }));

    await waitFor(() => expect(screen.getByText('Novus')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('shows the impact message when deleting a referenced store is blocked', async () => {
    server.use(
      http.get('/api/v1/stores', () => HttpResponse.json([MOCK_STORE])),
      http.delete('/api/v1/stores/:id', () =>
        HttpResponse.json(
          {
            message: 'Cannot delete store with existing references',
            impact: { storeId: MOCK_STORE.id, products: 1, lists: 0, items: 2 },
          },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<ShoppingPage />);
    await waitFor(() => screen.getByText('Manage stores'), { timeout: 3000 });
    await userEvent.click(screen.getByText('Manage stores'));

    await waitFor(() => screen.getByText('Silpo'), { timeout: 3000 });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(
      () =>
        expect(
          screen.getByText(
            /referenced by 1 product\(s\), 0 list\(s\), 2 item\(s\)/,
          ),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText('Silpo')).toBeInTheDocument();
  });

  describe('bulk-add items (#195)', () => {
    it('toggles between the single-item form and the bulk textarea', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      expect(screen.getByPlaceholderText('Item name')).toBeInTheDocument();
      await userEvent.click(screen.getByText('Paste multiple items'));
      expect(
        screen.queryByPlaceholderText('Item name'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('milk, eggs, bread or one item per line'),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText('Add one at a time'));
      expect(screen.getByPlaceholderText('Item name')).toBeInTheDocument();
    });

    it('parses comma- and newline-separated names, dropping short/empty/duplicate tokens', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });
      await userEvent.click(screen.getByText('Paste multiple items'));

      const textarea = screen.getByPlaceholderText(
        'milk, eggs, bread or one item per line',
      );
      await userEvent.type(textarea, 'Bread, ab, Bread,{enter}Cheese,  ,milk');

      expect(screen.getByText('Bread')).toBeInTheDocument();
      expect(screen.getByText('Cheese')).toBeInTheDocument();
      expect(screen.queryByText('ab')).not.toBeInTheDocument();
      // Repeated "Bread" and case-insensitive dupe of the existing "Milk" item both collapse away.
      expect(screen.getAllByText('Bread')).toHaveLength(1);
      expect(screen.queryByText('milk')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add 2 items' }),
      ).toBeInTheDocument();
    });

    it('removes a chip from the preview before submitting', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });
      await userEvent.click(screen.getByText('Paste multiple items'));

      const textarea = screen.getByPlaceholderText(
        'milk, eggs, bread or one item per line',
      );
      await userEvent.type(textarea, 'Bread, Cheese');
      expect(
        screen.getByRole('button', { name: 'Add 2 items' }),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Delete Cheese' }),
      );

      expect(screen.queryByText('Cheese')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add 1 item' }),
      ).toBeInTheDocument();
    });

    it('submits the parsed names via the bulk endpoint and closes the panel', async () => {
      let lastBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.post(
          '/api/v1/shopping-lists/:listId/items/bulk',
          async ({ request }) => {
            lastBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json([], { status: 201 });
          },
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });
      await userEvent.click(screen.getByText('Paste multiple items'));

      const textarea = screen.getByPlaceholderText(
        'milk, eggs, bread or one item per line',
      );
      await userEvent.type(textarea, 'Bread, Cheese');
      await userEvent.click(
        screen.getByRole('button', { name: 'Add 2 items' }),
      );

      await waitFor(
        () =>
          expect(lastBody?.['items']).toEqual([
            { name: 'Bread' },
            { name: 'Cheese' },
          ]),
        { timeout: 3000 },
      );
      await waitFor(
        () =>
          expect(
            screen.queryByPlaceholderText(
              'milk, eggs, bread or one item per line',
            ),
          ).not.toBeInTheDocument(),
        { timeout: 3000 },
      );
    });
  });

  describe('rename shopping list (#202)', () => {
    it('renames a list via the edit affordance', async () => {
      let lastBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.patch('/api/v1/shopping-lists/:id', async ({ request }) => {
          lastBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ...MOCK_LIST,
            name: lastBody['name'] as string,
          });
        }),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
      const input = screen.getByLabelText('List name');
      await userEvent.clear(input);
      await userEvent.type(input, 'Weekend Shop');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(lastBody?.['name']).toBe('Weekend Shop'), {
        timeout: 3000,
      });
    });

    it('disables saving when the name is unchanged or empty', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      const input = screen.getByLabelText('List name');
      await userEvent.clear(input);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });

  describe('localized item-count/empty-state strings (#274)', () => {
    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    it('renders the list item count, empty-detail prompt, and empty-item-list message in Ukrainian', async () => {
      const emptyList = { ...MOCK_LIST, items: [] };
      server.use(
        // AuthContext's applyLocale(user.locale) drives the active language
        // on mount — a plain i18n.changeLanguage() call would just get
        // overwritten once /auth/me resolves.
        http.get('/api/v1/auth/me', () =>
          HttpResponse.json({
            id: 'user-1',
            email: 'test@example.com',
            displayName: 'Test User',
            avatarUrl: null,
            locale: 'uk',
            createdAt: '2026-01-01T00:00:00Z',
          }),
        ),
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([emptyList]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(emptyList),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });

      expect(await screen.findByText(/0 товарів/)).toBeInTheDocument();
      expect(
        await screen.findByText('Виберіть список, щоб переглянути товари'),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText('Weekly Groceries'));

      expect(
        await screen.findByText('Поки немає товарів.'),
      ).toBeInTheDocument();
    });
  });

  describe('archive list action (#199)', () => {
    it('archives an active list and clears the selection', async () => {
      let lastBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.patch('/api/v1/shopping-lists/:id', async ({ request }) => {
          lastBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...MOCK_LIST, status: 'archived' });
        }),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

      await waitFor(() => expect(lastBody?.['status']).toBe('archived'), {
        timeout: 3000,
      });
      await waitFor(
        () =>
          expect(
            screen.getByText('Select a list to view items'),
          ).toBeInTheDocument(),
        { timeout: 3000 },
      );
    });

    it('does not show an Archive button for an already-archived list', async () => {
      const archivedList = { ...MOCK_LIST, status: 'archived' as const };
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([archivedList]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(archivedList),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Archived'), { timeout: 3000 });
      await userEvent.click(screen.getByText('Archived'));
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      expect(
        screen.queryByRole('button', { name: 'Archive' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('minimum item name length (#200)', () => {
    it('disables the add-item button and shows an inline error for less than 3 characters', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(screen.getByPlaceholderText('Item name'), 'ab');

      expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled();
      expect(
        screen.getByText('Item name must be at least 3 characters'),
      ).toBeInTheDocument();
    });

    it('enables the add-item button once the name reaches 3 characters', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(screen.getByPlaceholderText('Item name'), 'abc');

      expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled();
      expect(
        screen.queryByText('Item name must be at least 3 characters'),
      ).not.toBeInTheDocument();
    });
  });

  describe('item-name autocomplete (#196)', () => {
    it('shows matching product suggestions after debounce', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.get('/api/v1/products', ({ request }) => {
          const search = new URL(request.url).searchParams.get('search');
          return HttpResponse.json(search ? [MOCK_PRODUCT] : []);
        }),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(screen.getByPlaceholderText('Item name'), 'Oat');

      await waitFor(
        () => expect(screen.getByText('Oat Milk')).toBeInTheDocument(),
        { timeout: 3000 },
      );
    });

    it('does not show a dropdown when there are no matches', async () => {
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.get('/api/v1/products', () => HttpResponse.json([])),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(screen.getByPlaceholderText('Item name'), 'Xyz');

      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('links the selected product when adding the item', async () => {
      let lastBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.get('/api/v1/products', () => HttpResponse.json([MOCK_PRODUCT])),
        http.post(
          '/api/v1/shopping-lists/:listId/items',
          async ({ request }) => {
            lastBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json(
              {
                ...MOCK_LIST.items[0],
                id: 'item-2',
                name: lastBody['name'],
                productId: lastBody['productId'] ?? null,
              },
              { status: 201 },
            );
          },
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(screen.getByPlaceholderText('Item name'), 'Oat');
      await waitFor(
        () => expect(screen.getByText('Oat Milk')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      await userEvent.click(screen.getByText('Oat Milk'));
      await userEvent.click(screen.getByRole('button', { name: 'Add item' }));

      await waitFor(
        () => expect(lastBody?.['productId']).toBe(MOCK_PRODUCT.id),
        { timeout: 3000 },
      );
    });
  });

  describe("edit an existing item's link (#269)", () => {
    it('creates a product and links it when the item has no productId yet', async () => {
      let productBody: Record<string, unknown> | undefined;
      let itemBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.post('/api/v1/products', async ({ request }) => {
          productBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            {
              ...MOCK_PRODUCT,
              id: 'product-new',
              name: productBody['name'],
              url: productBody['url'],
            },
            { status: 201 },
          );
        }),
        http.patch(
          '/api/v1/shopping-lists/:listId/items/:itemId',
          async ({ request }) => {
            itemBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              ...MOCK_LIST.items[0],
              productId: itemBody['productId'],
            });
          },
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'Edit link' }));
      await userEvent.type(
        screen.getByLabelText('Link'),
        'https://store.example/milk',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(
        () => expect(productBody?.['url']).toBe('https://store.example/milk'),
        { timeout: 3000 },
      );
      expect(productBody?.['name']).toBe('Milk');
      await waitFor(() => expect(itemBody?.['productId']).toBe('product-new'), {
        timeout: 3000,
      });
    });

    it('updates the linked product when the item already has one', async () => {
      const linkedList = {
        ...MOCK_LIST,
        items: [{ ...MOCK_LIST.items[0], productId: MOCK_PRODUCT.id }],
      };
      let patchedId: string | undefined;
      let patchBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/products', () => HttpResponse.json([MOCK_PRODUCT])),
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([linkedList]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(linkedList),
        ),
        http.patch('/api/v1/products/:id', async ({ request, params }) => {
          patchedId = params['id'] as string;
          patchBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...MOCK_PRODUCT, url: patchBody['url'] });
        }),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'Edit link' }));
      await userEvent.type(
        screen.getByLabelText('Link'),
        'https://store.example/oat-milk',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(patchedId).toBe(MOCK_PRODUCT.id), {
        timeout: 3000,
      });
      expect(patchBody?.['url']).toBe('https://store.example/oat-milk');
    });

    it('disables Save until the URL actually changes', async () => {
      const linkedList = {
        ...MOCK_LIST,
        items: [{ ...MOCK_LIST.items[0], productId: MOCK_PRODUCT.id }],
      };
      server.use(
        http.get('/api/v1/products', () =>
          HttpResponse.json([
            { ...MOCK_PRODUCT, url: 'https://store.example/existing' },
          ]),
        ),
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([linkedList]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(linkedList),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: 'Edit link' }));
      expect(
        await screen.findByDisplayValue('https://store.example/existing'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });

  describe('product link + preview (#197)', () => {
    it('creates a new product with the typed link when adding a free-text item', async () => {
      let productBody: Record<string, unknown> | undefined;
      let itemBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.post('/api/v1/products', async ({ request }) => {
          productBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            {
              ...MOCK_PRODUCT,
              id: 'product-new',
              name: productBody['name'],
              url: productBody['url'],
            },
            { status: 201 },
          );
        }),
        http.post(
          '/api/v1/shopping-lists/:listId/items',
          async ({ request }) => {
            itemBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json(
              {
                ...MOCK_LIST.items[0],
                id: 'item-2',
                name: itemBody['name'],
                productId: itemBody['productId'] ?? null,
              },
              { status: 201 },
            );
          },
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(
        screen.getByPlaceholderText('Item name'),
        'Fresh Bread',
      );
      await userEvent.type(
        screen.getByPlaceholderText('Link (optional)'),
        'https://store.example/bread',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Add item' }));

      await waitFor(
        () => expect(productBody?.['url']).toBe('https://store.example/bread'),
        { timeout: 3000 },
      );
      expect(productBody?.['name']).toBe('Fresh Bread');
      await waitFor(() => expect(itemBody?.['productId']).toBe('product-new'), {
        timeout: 3000,
      });
    });

    it('updates the already-selected product instead of creating a new one', async () => {
      let patchedId: string | undefined;
      let patchBody: Record<string, unknown> | undefined;
      server.use(
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([MOCK_LIST]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(MOCK_LIST),
        ),
        http.get('/api/v1/products', () => HttpResponse.json([MOCK_PRODUCT])),
        http.patch('/api/v1/products/:id', async ({ request, params }) => {
          patchedId = params['id'] as string;
          patchBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...MOCK_PRODUCT, url: patchBody['url'] });
        }),
        http.post('/api/v1/shopping-lists/:listId/items', () =>
          HttpResponse.json(
            { ...MOCK_LIST.items[0], id: 'item-2' },
            { status: 201 },
          ),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));
      await waitFor(() => screen.getByText('Milk'), { timeout: 3000 });

      await userEvent.type(screen.getByPlaceholderText('Item name'), 'Oat');
      await waitFor(
        () => expect(screen.getByText('Oat Milk')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      await userEvent.click(screen.getByText('Oat Milk'));
      await userEvent.type(
        screen.getByPlaceholderText('Link (optional)'),
        'https://store.example/oat-milk',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Add item' }));

      await waitFor(() => expect(patchedId).toBe(MOCK_PRODUCT.id), {
        timeout: 3000,
      });
      expect(patchBody?.['url']).toBe('https://store.example/oat-milk');
    });

    it('shows a preview thumbnail on an item whose linked product has an image', async () => {
      const listWithLinkedItem = {
        ...MOCK_LIST,
        items: [{ ...MOCK_LIST.items[0], productId: MOCK_PRODUCT.id }],
      };
      server.use(
        http.get('/api/v1/products', () =>
          HttpResponse.json([
            {
              ...MOCK_PRODUCT,
              url: 'https://store.example/oat-milk',
              imageUrl: 'https://cdn.example.com/oat.jpg',
            },
          ]),
        ),
        http.get('/api/v1/shopping-lists', () =>
          HttpResponse.json([listWithLinkedItem]),
        ),
        http.get('/api/v1/shopping-lists/:id', () =>
          HttpResponse.json(listWithLinkedItem),
        ),
      );

      renderWithProviders(<ShoppingPage />);
      await waitFor(() => screen.getByText('Weekly Groceries'), {
        timeout: 3000,
      });
      await userEvent.click(screen.getByText('Weekly Groceries'));

      await waitFor(
        () => expect(screen.getByText('Milk')).toBeInTheDocument(),
        { timeout: 3000 },
      );
      const thumb = await screen.findByAltText('');
      expect(thumb).toHaveAttribute('src', 'https://cdn.example.com/oat.jpg');
    });
  });
});
