import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

// --- Fixtures ---
export const MOCK_USER = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  locale: 'en',
  createdAt: '2026-01-01T00:00:00Z',
};

export const MOCK_TOKENS = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  sessionId: 'mock-session-id',
  expiresIn: 900,
};

export const MOCK_HOUSEHOLD = {
  id: 'hh-1',
  name: 'Test Home',
  slug: 'test-home',
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
};

export const MOCK_ACCOUNT = {
  id: 'acc-1',
  householdId: 'hh-1',
  name: 'Mono Card',
  type: 'bank',
  currency: 'UAH',
  balance: 5000,
  isArchived: false,
};

export const MOCK_TRANSACTION = {
  id: 'tx-1',
  householdId: 'hh-1',
  accountId: 'acc-1',
  type: 'income',
  amount: 5000,
  currency: 'UAH',
  categoryId: null,
  incomeSourceId: null,
  description: 'Salary',
  date: '2026-07-01',
  createdBy: 'user-1',
  transferPairId: null,
  createdAt: '2026-07-01T00:00:00Z',
};

// --- Handlers ---
export const handlers = [
  // Auth
  http.post(`${BASE}/auth/google`, () => HttpResponse.json(MOCK_TOKENS)),
  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(MOCK_TOKENS)),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/auth/me`, () => HttpResponse.json(MOCK_USER)),
  http.patch(`${BASE}/auth/me`, () => HttpResponse.json(MOCK_USER)),

  // Households
  http.get(`${BASE}/households`, () => HttpResponse.json([MOCK_HOUSEHOLD])),
  http.post(`${BASE}/households`, async ({ request }) => {
    const body = await request.json() as { name: string };
    return HttpResponse.json({ ...MOCK_HOUSEHOLD, id: 'hh-new', name: body.name }, { status: 201 });
  }),
  http.patch(`${BASE}/households/:id`, async ({ request }) => {
    const body = await request.json() as { name: string };
    return HttpResponse.json({ ...MOCK_HOUSEHOLD, name: body.name });
  }),
  http.get(`${BASE}/households/:id/members`, () =>
    HttpResponse.json([{ id: 'm-1', householdId: 'hh-1', userId: 'user-1', role: 'owner', createdAt: '2026-01-01T00:00:00Z' }]),
  ),
  http.get(`${BASE}/households/:id/invites`, () => HttpResponse.json([])),
  http.post(`${BASE}/households/:id/invites`, () =>
    HttpResponse.json({ id: 'inv-1', householdId: 'hh-1', email: 'guest@test.com', token: 'abc123', role: 'member', expiresAt: '2026-08-01T00:00:00Z', acceptedAt: null }, { status: 201 }),
  ),

  // Accounts
  http.get(`${BASE}/accounts`, () => HttpResponse.json([MOCK_ACCOUNT])),
  http.get(`${BASE}/accounts/summary`, () =>
    HttpResponse.json({ totalBalance: 5000, accounts: [MOCK_ACCOUNT] }),
  ),
  http.post(`${BASE}/accounts`, async ({ request }) => {
    const body = await request.json() as { name: string; type: string; currency?: string };
    return HttpResponse.json({ ...MOCK_ACCOUNT, id: 'acc-new', name: body.name, type: body.type, balance: 0 }, { status: 201 });
  }),
  http.delete(`${BASE}/accounts/:id`, () => new HttpResponse(null, { status: 204 })),

  // Transactions
  http.get(`${BASE}/transactions`, () => HttpResponse.json([MOCK_TRANSACTION])),
  http.post(`${BASE}/transactions`, async ({ request }) => {
    const body = await request.json() as object;
    return HttpResponse.json({ ...MOCK_TRANSACTION, id: 'tx-new', ...body }, { status: 201 });
  }),
  http.post(`${BASE}/transactions/transfer`, () =>
    HttpResponse.json([
      { ...MOCK_TRANSACTION, id: 'tx-debit', type: 'transfer', transferPairId: 'pair-1' },
      { ...MOCK_TRANSACTION, id: 'tx-credit', type: 'transfer', transferPairId: 'pair-1', accountId: 'acc-2' },
    ], { status: 201 }),
  ),
  http.delete(`${BASE}/transactions/:id`, () => new HttpResponse(null, { status: 204 })),

  // Categories
  http.get(`${BASE}/categories`, () => HttpResponse.json([])),

  // Recurring payments
  http.get(`${BASE}/recurring-payments`, () => HttpResponse.json([])),
  http.get(`${BASE}/recurring-payments/upcoming`, () => HttpResponse.json([])),

  // Reports
  http.get(`${BASE}/reports/monthly`, () =>
    HttpResponse.json({ period: '2026-07', totalIncome: 5000, totalExpense: 0, net: 5000, byDay: [] }),
  ),
  http.get(`${BASE}/reports/net-worth`, () =>
    HttpResponse.json({ totalBalance: 5000, byCurrency: { UAH: 5000 }, accounts: [MOCK_ACCOUNT] }),
  ),

  // Shopping
  http.get(`${BASE}/shopping-lists`, () => HttpResponse.json([])),
  http.post(`${BASE}/shopping-lists`, async ({ request }) => {
    const body = await request.json() as { name: string };
    return HttpResponse.json({ id: 'list-1', householdId: 'hh-1', name: body.name, status: 'active', storeId: null, createdBy: 'user-1', createdAt: '2026-07-01T00:00:00Z', items: [] }, { status: 201 });
  }),
];
