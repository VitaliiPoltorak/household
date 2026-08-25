---
name: testing-policy
description: How to write and run integration tests, web tests, and API scenario (Postman/Newman) checks for this repo, and what the scenario gate requires before a feature is shippable. Read before adding tests, running test:integration/test:postman, or touching the scenario
gate.
---

## Testing policy (Phase 2+)

Every completed feature must have both before the issue is closed:
1. **Automated integration tests** — `apps/<service>/test/*.integration.spec.ts`
2. **Automated API scenario check** — covered by `docs/postman/household.postman_collection.json` and passing `pnpm test:postman` (see Scenario gate below)

### Integration tests

**Stack:** `jest` + `supertest` + shared `@household/testing` lib.

**Pattern** — copy from `apps/finance-service/test/`:
```typescript
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import request from 'supertest';

beforeAll(() => createTestApp(AppModule));   // boots real NestJS, mocks Kafka
beforeEach(() => { cleanDatabase(app); resetKafkaMocks(); });
afterAll(() => app.close());

Run:
docker compose up -d                                           # postgres + redis required
pnpm --filter @household/<service> test:integration            # single service
pnpm test:integration                                          # all services

Test database: household_test — enforced by libs/testing/jest.env.js (registered in each service's jest.integration.config.js via setupFiles), which sets POSTGRES_DB=household_test before any module loads. cleanDatabase() and ensureSchema() additionally refuse to run if the
connected database name does not end in _test — so a misconfigured test can never wipe dev data.

If you add a new service with integration tests, its jest.integration.config.js MUST include <rootDir>/../../libs/testing/jest.env.js in setupFiles.

What to cover per feature:
- Happy path (201/200 with correct body)
- householdId isolation (another household can't see/modify)
- Kafka assertions: expect(mockKafkaProducer.emit).toHaveBeenCalledWith(...)
- Key validation errors (400 for bad input, 401 for missing headers, 404 for not found)

Each service needs:
- jest.integration.config.js (copy from finance-service, change displayName)
- tsconfig.test.json (copy from finance-service, add @household/testing path)
- "test:integration" script in package.json

Web app tests (Vitest)

Stack: Vitest v2 + @testing-library/react + MSW v2 (no Docker needed).

pnpm --filter @household/web test:run    # 27 tests, ~1s
pnpm --filter @household/web test        # watch mode

Pattern — copy from apps/web/src/test/:
import { renderWithProviders } from './wrapper'; // sets tokens, wraps with providers
import { server } from './setup';               // MSW server (auto started in setup.ts)
// Override specific handlers per test:
server.use(http.get('/api/v1/accounts', () => HttpResponse.json([])));

Socket.IO is mocked globally in setup.ts — no WebSocket connections in tests.

API scenario checks (Postman / Newman)

Tool: Newman, running docs/postman/household.postman_collection.json + household.postman_environment.json headlessly against a live stack — not a human walking through Postman by hand.

docker compose up -d --wait                                          # full stack; --wait waits for real readiness (#205)
docker compose exec -T auth-service node scripts/seed-e2e-user.js    # seeds two pre-verified users (#204)
pnpm test:postman

The collection logs in as the two seeded users (e2e-owner@household.local / e2e-invitee@household.local by default — override via E2E_EMAIL/E2E_PASSWORD/E2E_INVITEE_EMAIL), exercises the full API surface (auth, households + invites, finance, shopping), and cleans up after 
itself: every created entity's name carries a run-scoped {{runId}}, and a final Cleanup folder deletes the household (cascading to finance + shopping via the existing household.deleted Kafka consumers) and logs out both sessions. Never run it with --bail — that skips the Cleanup
folder on the first failed assertion and leaks state.

Deliberately manual-only, not covered by this collection:
- Real Google/Apple/Facebook OAuth consent — Google actively blocks scripted logins; the strategy code itself is covered by unit tests with mocked provider responses.
- POST /auth/register + POST /auth/verify-email — the 6-digit verification code only ever exists in Redis (email_verify:<email>) and an auth-service log line, not worth a test-only HTTP surface for a flow that rarely changes.

Swagger at /docs per service is for endpoint reference during development only.

Scenario gate

A feature is not shippable until both are green:

1. Automated integration tests: pnpm --filter @household/<service> test:integration
— golden path, tenant isolation, Kafka assertions, validation errors.
2. Automated API scenario check (Newman): pnpm test:postman, via
scripts/api-scenarios.sh — runs automatically on every commit
(.githooks/pre-commit, which brings the stack up itself if it isn't
already running) and on every PR that touches backend-relevant paths
(.github/workflows/api-scenarios.yml). Bypass locally in a genuine
emergency with SKIP_API_SCENARIOS=1 — strictly prefer this over
git commit --no-verify, which also skips the unit tests.
