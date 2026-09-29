import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { NetWorthHistoryPage } from '../pages/NetWorthHistoryPage';
import { server } from './setup';
import type { NetWorthSnapshot } from '../types/api';

const MOCK_SNAPSHOTS: NetWorthSnapshot[] = [
  {
    id: 'snap-1',
    householdId: 'hh-1',
    snapshotDate: '2026-06-01',
    byCurrency: { UAH: 40000 },
    source: 'auto',
    createdAt: '2026-06-01T04:00:00Z',
    updatedAt: '2026-06-01T04:00:00Z',
  },
  {
    id: 'snap-2',
    householdId: 'hh-1',
    snapshotDate: '2026-07-01',
    byCurrency: { UAH: 45000 },
    source: 'manual',
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-01T10:00:00Z',
  },
];

describe('NetWorthHistoryPage (#379)', () => {
  it('shows an empty state when there is no history yet', async () => {
    server.use(
      http.get('/api/v1/reports/net-worth/snapshots', () =>
        HttpResponse.json([]),
      ),
    );
    renderWithProviders(<NetWorthHistoryPage />);

    await waitFor(
      () =>
        expect(
          screen.getByText(/No net-worth history yet/),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('renders the history list with source badges, newest first', async () => {
    server.use(
      http.get('/api/v1/reports/net-worth/snapshots', () =>
        HttpResponse.json(MOCK_SNAPSHOTS),
      ),
    );
    renderWithProviders(<NetWorthHistoryPage />);

    await waitFor(
      () => expect(screen.getByText('2026-07-01')).toBeInTheDocument(),
      {
        timeout: 3000,
      },
    );
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();

    // Newest first in the DOM order.
    const dates = screen
      .getAllByText(/^2026-0[67]-01$/)
      .map((el) => el.textContent);
    expect(dates).toEqual(['2026-07-01', '2026-06-01']);
  });

  it('adds a single entry and refreshes the list', async () => {
    let posted: Record<string, unknown> | null = null;
    let snapshots = [...MOCK_SNAPSHOTS];
    server.use(
      http.get('/api/v1/reports/net-worth/snapshots', () =>
        HttpResponse.json(snapshots),
      ),
      http.post('/api/v1/reports/net-worth/snapshots', async ({ request }) => {
        const body = (await request.json()) as {
          date: string;
          byCurrency: Record<string, number>;
        };
        posted = body;
        const created: NetWorthSnapshot = {
          id: 'snap-new',
          householdId: 'hh-1',
          snapshotDate: body.date,
          byCurrency: body.byCurrency,
          source: 'manual',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
        };
        snapshots = [...snapshots, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderWithProviders(<NetWorthHistoryPage />);
    await waitFor(() => screen.getByText('2026-07-01'), { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    await waitFor(() => screen.getByLabelText('UAH'));

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-08-01');
    await userEvent.type(screen.getByLabelText('UAH'), '48000');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posted).not.toBeNull(), { timeout: 3000 });
    expect(posted).toMatchObject({
      date: '2026-08-01',
      byCurrency: { UAH: 48000 },
    });
    await waitFor(() =>
      expect(screen.getByText('2026-08-01')).toBeInTheDocument(),
    );
  });

  it('blocks submit with no currency amount entered, without sending a request', async () => {
    let called = false;
    server.use(
      http.get('/api/v1/reports/net-worth/snapshots', () =>
        HttpResponse.json([]),
      ),
      http.post('/api/v1/reports/net-worth/snapshots', () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderWithProviders(<NetWorthHistoryPage />);
    await waitFor(() => screen.getByRole('button', { name: 'Add entry' }), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    await waitFor(() => screen.getByLabelText('UAH'));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      screen.getByText('Enter at least one currency amount.'),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('opens the edit modal pre-filled when a history row is clicked, and re-submitting upserts the same date', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/v1/reports/net-worth/snapshots', () =>
        HttpResponse.json(MOCK_SNAPSHOTS),
      ),
      http.post('/api/v1/reports/net-worth/snapshots', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { ...MOCK_SNAPSHOTS[1], byCurrency: posted.byCurrency },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<NetWorthHistoryPage />);
    await waitFor(() => screen.getByText('2026-07-01'), { timeout: 3000 });

    await userEvent.click(screen.getByText('2026-07-01'));
    await waitFor(() =>
      expect(screen.getByText('Edit entry')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('UAH')).toHaveValue(45000);

    await userEvent.clear(screen.getByLabelText('UAH'));
    await userEvent.type(screen.getByLabelText('UAH'), '46000');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posted).not.toBeNull(), { timeout: 3000 });
    expect(posted).toMatchObject({
      date: '2026-07-01',
      byCurrency: { UAH: 46000 },
    });
  });

  it('bulk import submits every filled row in one request', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/v1/reports/net-worth/snapshots', () =>
        HttpResponse.json([]),
      ),
      http.post(
        '/api/v1/reports/net-worth/snapshots/bulk',
        async ({ request }) => {
          posted = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ count: 2 }, { status: 201 });
        },
      ),
    );

    renderWithProviders(<NetWorthHistoryPage />);
    await waitFor(() => screen.getByRole('button', { name: 'Bulk import' }), {
      timeout: 3000,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }));
    await waitFor(() =>
      expect(screen.getAllByLabelText('Date')).toHaveLength(3),
    );

    const dateInputs = screen.getAllByLabelText('Date');
    const uahInputs = screen.getAllByLabelText('UAH');

    await userEvent.type(dateInputs[0], '2025-01-01');
    await userEvent.type(uahInputs[0], '1000');
    await userEvent.type(dateInputs[1], '2025-02-01');
    await userEvent.type(uahInputs[1], '1500');
    // Row 3 left blank — should be silently skipped, not sent as a snapshot.

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posted).not.toBeNull(), { timeout: 3000 });
    expect(posted!.snapshots).toEqual([
      { date: '2025-01-01', byCurrency: { UAH: 1000 } },
      { date: '2025-02-01', byCurrency: { UAH: 1500 } },
    ]);
  });

  // Trend chart also plots transaction activity between/around the
  // snapshots, anchored by the live total at "today" (#379 follow-up).
  // Dates are computed relative to the real clock (not faked) — vi's fake
  // timers deadlock against waitFor/React Query's own timer usage.
  describe('trend chart transaction activity', () => {
    const isoDaysAgo = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().slice(0, 10);
    };
    const OLD_SNAPSHOT_DATE = isoDaysAgo(60);
    const RECENT_SNAPSHOT_DATE = isoDaysAgo(30);
    const MID_ACTIVITY_DATE = isoDaysAgo(15);

    const baseTx = {
      id: 'tx-a',
      householdId: 'hh-1',
      accountId: 'acc-1',
      currency: 'UAH',
      categoryId: null,
      incomeSourceId: null,
      createdBy: 'user-1',
      transferPairId: null,
      transferDirection: null,
      counterAccountId: null,
      counterTransactionId: null,
      counterAmount: null,
      counterCurrency: null,
    };

    it('merges a transaction dated exactly on a snapshot day into that point, and adds a live "today" point', async () => {
      const snapshots: NetWorthSnapshot[] = [
        {
          id: 'snap-old',
          householdId: 'hh-1',
          snapshotDate: OLD_SNAPSHOT_DATE,
          byCurrency: { UAH: 40000 },
          source: 'auto',
          createdAt: `${OLD_SNAPSHOT_DATE}T04:00:00Z`,
          updatedAt: `${OLD_SNAPSHOT_DATE}T04:00:00Z`,
        },
        {
          id: 'snap-recent',
          householdId: 'hh-1',
          snapshotDate: RECENT_SNAPSHOT_DATE,
          byCurrency: { UAH: 45000 },
          source: 'manual',
          createdAt: `${RECENT_SNAPSHOT_DATE}T10:00:00Z`,
          updatedAt: `${RECENT_SNAPSHOT_DATE}T10:00:00Z`,
        },
      ];

      server.use(
        http.get('/api/v1/reports/net-worth/snapshots', () =>
          HttpResponse.json(snapshots),
        ),
        http.get('/api/v1/transactions', () =>
          HttpResponse.json([
            {
              ...baseTx,
              type: 'income',
              amount: 5000,
              description: 'Salary',
              date: RECENT_SNAPSHOT_DATE,
              createdAt: `${RECENT_SNAPSHOT_DATE}T00:00:00Z`,
            },
          ]),
        ),
        http.get('/api/v1/reports/net-worth', () =>
          HttpResponse.json({
            totalBalance: 46000,
            byCurrency: { UAH: 46000 },
            accounts: [],
          }),
        ),
      );

      renderWithProviders(<NetWorthHistoryPage />);
      await waitFor(() => screen.getByText(RECENT_SNAPSHOT_DATE), {
        timeout: 3000,
      });

      // 3 points: old snapshot, recent snapshot (+ same-day transaction),
      // today's live anchor.
      const circles = await waitFor(() => {
        const found = document.querySelectorAll('circle');
        expect(found.length).toBe(3);
        return found;
      });

      fireEvent.mouseEnter(circles[1]);
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent('Salary');
      expect(tooltip).toHaveTextContent(/5,000/);

      fireEvent.mouseEnter(circles[2]);
      const liveTooltip = await screen.findByRole('tooltip');
      expect(liveTooltip).toHaveTextContent('Today');
      expect(liveTooltip).toHaveTextContent(/46,000/);
    });

    it('adds a standalone activity point for a transaction day between two snapshots', async () => {
      const snapshots: NetWorthSnapshot[] = [
        {
          id: 'snap-old',
          householdId: 'hh-1',
          snapshotDate: OLD_SNAPSHOT_DATE,
          byCurrency: { UAH: 40000 },
          source: 'auto',
          createdAt: `${OLD_SNAPSHOT_DATE}T04:00:00Z`,
          updatedAt: `${OLD_SNAPSHOT_DATE}T04:00:00Z`,
        },
        {
          id: 'snap-today',
          householdId: 'hh-1',
          snapshotDate: isoDaysAgo(0),
          byCurrency: { UAH: 39700 },
          source: 'auto',
          createdAt: `${isoDaysAgo(0)}T04:00:00Z`,
          updatedAt: `${isoDaysAgo(0)}T04:00:00Z`,
        },
      ];

      server.use(
        http.get('/api/v1/reports/net-worth/snapshots', () =>
          HttpResponse.json(snapshots),
        ),
        http.get('/api/v1/transactions', () =>
          HttpResponse.json([
            {
              ...baseTx,
              id: 'tx-b',
              type: 'expense',
              amount: 300,
              description: 'Groceries',
              date: MID_ACTIVITY_DATE,
              createdAt: `${MID_ACTIVITY_DATE}T00:00:00Z`,
            },
          ]),
        ),
        http.get('/api/v1/reports/net-worth', () =>
          HttpResponse.json({
            totalBalance: 39700,
            byCurrency: { UAH: 39700 },
            accounts: [],
          }),
        ),
      );

      renderWithProviders(<NetWorthHistoryPage />);
      await waitFor(() => screen.getByText(OLD_SNAPSHOT_DATE), {
        timeout: 3000,
      });

      // old snapshot, mid-range activity point, today's snapshot (no
      // separate live point since it coincides with the snapshot date).
      const circles = await waitFor(() => {
        const found = document.querySelectorAll('circle');
        expect(found.length).toBe(3);
        return found;
      });

      fireEvent.mouseEnter(circles[1]);
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent('Groceries');
      expect(tooltip).toHaveTextContent(/39,700/); // 40000 - 300
    });
  });
});
