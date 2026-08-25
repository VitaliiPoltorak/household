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

// Post-#60 login response shape (LoginResponse in types/api.ts).
// refreshToken + sessionId are no longer returned in the body — they're set
// as HttpOnly cookies which MSW isn't wired to inspect. Tests exercise the
// endpoints through the api/client layer which handles cookies via fetch.
export const MOCK_LOGIN_RESPONSE = {
  accessToken: 'mock-access-token',
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
  transferDirection: null,
  createdAt: '2026-07-01T00:00:00Z',
  counterAccountId: null,
  counterTransactionId: null,
  counterAmount: null,
  counterCurrency: null,
};

// --- Handlers ---
export const handlers = [
  // Auth — OAuth + session lifecycle
  http.post(`${BASE}/auth/google`, () => HttpResponse.json(MOCK_LOGIN_RESPONSE)),
  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(MOCK_LOGIN_RESPONSE)),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/auth/logout-all`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/auth/me`, () => HttpResponse.json(MOCK_USER)),
  http.patch(`${BASE}/auth/me`, () => HttpResponse.json(MOCK_USER)),

  // Auth — email + password flow (#184, #185). Defaults are the happy path;
  // individual tests override via server.use(...) for error cases.
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({ userId: 'user-new', email: body.email }, { status: 202 });
  }),
  http.post(`${BASE}/auth/verify-email`, () => HttpResponse.json(MOCK_LOGIN_RESPONSE)),
  http.post(`${BASE}/auth/verify-email/resend`, () =>
    HttpResponse.json({ ok: true }, { status: 202 }),
  ),
  http.post(`${BASE}/auth/login`, () => HttpResponse.json(MOCK_LOGIN_RESPONSE)),
  http.post(`${BASE}/auth/unlock`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/auth/password/change`, () => HttpResponse.json(MOCK_LOGIN_RESPONSE)),

  // Bulk public profile lookup for member lists (#166). Filters MOCK_USER-only
  // by default; individual tests can override with server.use(...) for
  // richer fixtures.
  http.get(`${BASE}/auth/users`, ({ request }) => {
    const url = new URL(request.url);
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    const known: Array<{ id: string; displayName: string; avatarUrl: string | null }> = [
      { id: MOCK_USER.id, displayName: MOCK_USER.displayName, avatarUrl: MOCK_USER.avatarUrl },
    ];
    return HttpResponse.json(known.filter((u) => ids.includes(u.id)));
  }),

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
    HttpResponse.json({
      period: '2026-07',
      byCurrency: { UAH: { income: 5000, expense: 0, net: 5000 } },
      byDay: [{ date: '2026-07-01', currency: 'UAH', income: 5000, expense: 0 }],
    }),
  ),
  http.get(`${BASE}/reports/net-worth`, () =>
    HttpResponse.json({ totalBalance: 5000, byCurrency: { UAH: 5000 }, accounts: [MOCK_ACCOUNT] }),
  ),

  // Shopping
  http.get(`${BASE}/stores`, () => HttpResponse.json([])),
  http.get(`${BASE}/products`, () => HttpResponse.json([])),
  http.get(`${BASE}/shopping-lists`, () => HttpResponse.json([])),
  http.post(`${BASE}/shopping-lists`, async ({ request }) => {
    const body = await request.json() as { name: string };
    return HttpResponse.json({ id: 'list-1', householdId: 'hh-1', name: body.name, status: 'active', storeId: null, createdBy: 'user-1', createdAt: '2026-07-01T00:00:00Z', items: [] }, { status: 201 });
  }),
];
