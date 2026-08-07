import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { PermanentDeleteModal } from '../components/categories/PermanentDeleteModal';
import { server } from './setup';
import type { Category } from '../types/api';

const CAT: Category = {
  id: 'c-1',
  householdId: 'hh-1',
  name: 'Groceries',
  type: 'expense',
  icon: null,
  parentId: null,
  isArchived: true,
};

function renderModal(onClose = () => {}) {
  return renderWithProviders(
    <PermanentDeleteModal category={CAT} householdId="hh-1" onClose={onClose} />,
  );
}

describe('PermanentDeleteModal', () => {
  it('shows the zero-state warning and fires DELETE ?permanent=true on confirm', async () => {
    let deleted = false;
    server.use(
      http.get('/api/v1/categories/c-1/impact', () =>
        HttpResponse.json({ categoryId: 'c-1', transactions: 0, recurringPayments: 0, subcategories: 0, lastUsedAt: null }),
      ),
      http.delete('/api/v1/categories/c-1', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('permanent') !== 'true') {
          return new HttpResponse(null, { status: 400 });
        }
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const onClose = vi.fn();
    renderModal(onClose);

    await waitFor(
      () => expect(screen.getByText(/This will permanently delete/)).toBeInTheDocument(),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(deleted).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('renders blocked state with impact counts when any dependent exists — no delete request fires', async () => {
    let deleteFired = false;
    server.use(
      http.get('/api/v1/categories/c-1/impact', () =>
        HttpResponse.json({ categoryId: 'c-1', transactions: 5, recurringPayments: 0, subcategories: 0, lastUsedAt: '2026-07-30T00:00:00Z' }),
      ),
      http.delete('/api/v1/categories/c-1', () => {
        deleteFired = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderModal();

    await waitFor(
      () => expect(screen.getByText(/can't permanently delete/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText('5 transactions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument();
    // Two "Close" buttons exist (× icon with aria-label + footer text button).
    // Assert both are present rather than expect a single match.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    expect(deleteFired).toBe(false);
  });

  it('switches to blocked state on 409 mid-confirm and does not close', async () => {
    server.use(
      http.get('/api/v1/categories/c-1/impact', () =>
        HttpResponse.json({ categoryId: 'c-1', transactions: 0, recurringPayments: 0, subcategories: 0, lastUsedAt: null }),
      ),
      http.delete('/api/v1/categories/c-1', () =>
        HttpResponse.json({
          statusCode: 409,
          error: 'Conflict',
          message: 'Cannot permanently delete category with existing references',
          impact: { transactions: 2, recurringPayments: 1, subcategories: 0 },
        }, { status: 409 }),
      ),
    );

    const onClose = vi.fn();
    renderModal(onClose);

    await waitFor(
      () => expect(screen.getByText(/This will permanently delete/)).toBeInTheDocument(),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    // Modal transitions to blocked state, driven by the impact in the 409 body
    await waitFor(
      () => expect(screen.getByText(/can't permanently delete/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText('2 transactions')).toBeInTheDocument();
    expect(screen.getByText('1 recurring payment')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel does not fire a delete request', async () => {
    let deleteFired = false;
    server.use(
      http.get('/api/v1/categories/c-1/impact', () =>
        HttpResponse.json({ categoryId: 'c-1', transactions: 0, recurringPayments: 0, subcategories: 0, lastUsedAt: null }),
      ),
      http.delete('/api/v1/categories/c-1', () => {
        deleteFired = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const onClose = vi.fn();
    renderModal(onClose);

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument(),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteFired).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows loading state before impact resolves', async () => {
    let resolveImpact: () => void = () => {};
    const impactPromise = new Promise<Response>(resolve => {
      resolveImpact = () => resolve(HttpResponse.json({
        categoryId: 'c-1', transactions: 0, recurringPayments: 0, subcategories: 0, lastUsedAt: null,
      }) as Response);
    });
    server.use(http.get('/api/v1/categories/c-1/impact', () => impactPromise));

    renderModal();

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    resolveImpact();
    await waitFor(
      () => expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
