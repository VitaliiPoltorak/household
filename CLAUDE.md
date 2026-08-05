# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Root-level (runs across all apps/libs via Turborepo)
pnpm build         # Build all packages
pnpm dev           # Start all services in watch mode
pnpm lint          # Lint all packages
pnpm test          # Run all tests
pnpm format        # Prettier format

# Target a specific app (preferred during development)
pnpm --filter @household/api-gateway dev
pnpm --filter @household/auth-service dev
pnpm --filter @household/web dev          # React SPA at http://localhost:5173

# Web tests (no Docker needed)
pnpm --filter @household/web test:run     # 27 Vitest integration tests
pnpm --filter @household/web test:ui      # Vitest browser UI
pnpm --filter @household/api-gateway test:unit  # Redis throttler unit tests

# TypeORM migrations (same pattern for all services)
pnpm --filter @household/auth-service migration:generate -- -n MigrationName
pnpm --filter @household/auth-service migration:run
# Replace auth-service with: household-service, finance-service, shopping-service, integration-service

# Infrastructure
docker compose up -d        # Start postgres, redis, kafka, kafka-ui, adminer
docker compose down         # Stop all infrastructure
```

## Architecture

This is a **pnpm + Turborepo monorepo** containing NestJS microservices behind a single HTTP API Gateway. Clients never talk to services directly — everything flows through the gateway.

```
apps/
  api-gateway/         # Port 3000 — single entry point, JWT, proxy, Swagger
  auth-service/        # Port 3001 — Google/Apple/Facebook OAuth, JWT, Redis sessions
  household-service/   # Port 3002 — households, members (roles), Redis invites
  finance-service/     # Port 3003 — accounts, transactions, categories, reports
  shopping-service/    # Port 3004 — stores, products, shopping lists + items
  realtime-gateway/    # Port 3010 — Socket.IO, presence, Kafka→WS bridge
  integration-service/ # Phase 3 — Monobank sync
  notification-service/# Phase 3 — email + push
  web/                 # Port 5173 — React 18 + Vite SPA (Dashboard, Accounts,
                       #   Transactions, Shopping, Household settings)
  mobile/              # Phase 5 — React Native (Expo)

libs/
  common/     # HttpExceptionFilter, AppConfigModule
  contracts/  # Kafka envelope, Socket.IO event types, PaginationDto
  database/   # BaseEntity, createDataSourceOptions, ensureSchema
  kafka/      # KafkaModule, KafkaProducerService, KafkaConsumerService
  locales/    # Shared i18n JSON (en / uk / de / es) — used by web + mobile
  testing/    # createTestApp, cleanDatabase, kafka mocks (integration tests)
```

Infra services: **postgres:5432**, **redis:6379**, **kafka:9092**, **kafka-ui:8081**, **adminer:8080**.

### API Gateway pattern

The gateway (`apps/api-gateway`) does **not** contain business logic. It:
1. Parses and verifies the JWT via `jwt-express.middleware.ts` (sets `req.user`)
2. Extracts `X-Household-Id` from the incoming request header via `household-id.middleware.ts`
3. Proxies to the correct service using `http-proxy-middleware`, forwarding `X-User-Id`, `X-User-Email`, and `X-Household-Id` headers
4. Exposes Swagger at `/api/docs`

All API routes are prefixed `/api/v1`. Proxy route→service mapping lives in `apps/api-gateway/src/proxy/proxy-setup.ts`. Service URLs are configurable via env vars (`AUTH_SERVICE_URL`, `HOUSEHOLD_SERVICE_URL`, etc.) with localhost defaults.

Routes decorated with `@Public()` skip the JWT guard.

### Auth service

Uses **TypeORM** (not Prisma). OAuth strategies for Google, Apple, Facebook live in `src/auth/strategies/`. Issues short-lived JWT access tokens (15 min) and stores refresh tokens in Redis under `session:{userId}`. Publishes `auth.user.created` / `auth.user.deleted` to Kafka.

### Kafka event envelope

All inter-service events use this schema (defined in `libs/contracts` when built):

```typescript
{
  eventId: string;       // UUID
  eventType: string;     // domain.action, e.g. "auth.user.created"
  householdId?: string;
  userId?: string;
  payload: object;
  createdAt: string;     // ISO 8601
}
```

### Realtime Gateway pattern

`apps/realtime-gateway` is a **separate service** (port 3010, not proxied through api-gateway — different protocol). It:
1. Authenticates WebSocket connections via JWT passed in `socket.handshake.auth.token`
2. Auto-joins the client to `household:{householdId}` rooms for all their households
3. Consumes **all** Kafka topics and bridges relevant events to the appropriate room via `entity:created / entity:updated / entity:deleted`
4. Manages presence state in Redis (`presence:{householdId}` hash with 90s TTL, refreshed by client `presence:heartbeat` every 30s)
5. Handles `editing:start / editing:stop` events and broadcasts `presence:update` to the room

Multi-device handling: presence is keyed by `userId`, not `socketId` — a user on both web and mobile appears as one online user. Offline is only marked when all connections for that `userId` are gone (checked via Redis).

Horizontal scaling: `@socket.io/redis-adapter` synchronizes rooms across multiple instances.

Socket.IO event types (client ↔ server contract) are defined in `libs/contracts/src/realtime/`.

### Multi-tenancy

All business tables (except `users`) carry a `household_id` column. The gateway validates the JWT and passes `householdId` from the `X-Household-Id` request header downstream — services trust this header and do not re-verify the JWT.

### Error format

All services return:
```json
{ "statusCode": 502, "message": "...", "error": "Bad Gateway", "timestamp": "..." }
```

### Database

One PostgreSQL instance with **schema-per-service** (not separate databases). Each service manages its own schema and runs its own TypeORM migrations.

**Current state (dev):** `synchronize: true` — TypeORM auto-creates/alters tables on startup. Schema is created via `ensureSchema()` before TypeORM initializes.

**Phase 3 plan:** Generate initial migrations for each service once schemas stabilise. Switch from `synchronize` to `migrations: run`. This is safe in development and required for production.

**Phase 6 plan:** `synchronize: false` in all services. `migration:run` executes as part of the Docker entrypoint before the service starts.

## Testing policy (Phase 2+)

Every completed feature must have both before the issue is closed:
1. **Automated integration tests** — `apps/<service>/test/*.integration.spec.ts`
2. **Manual testing issue** in the GitHub Testing milestone with Postman checklist

### Integration tests

**Stack:** `jest` + `supertest` + shared `@household/testing` lib.

**Pattern** — copy from `apps/finance-service/test/`:
```typescript
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import request from 'supertest';

beforeAll(() => createTestApp(AppModule));   // boots real NestJS, mocks Kafka
beforeEach(() => { cleanDatabase(app); resetKafkaMocks(); });
afterAll(() => app.close());
```

**Run:**
```bash
docker compose up -d                                           # postgres + redis required
pnpm --filter @household/<service> test:integration            # single service
pnpm test:integration                                          # all services
```

**Test database:** `household_test` — created automatically by `ensureSchema()` on first run. Never use the dev database for tests.

**What to cover per feature:**
- Happy path (201/200 with correct body)
- householdId isolation (another household can't see/modify)
- Kafka assertions: `expect(mockKafkaProducer.emit).toHaveBeenCalledWith(...)`
- Key validation errors (400 for bad input, 401 for missing headers, 404 for not found)

**Each service needs:**
- `jest.integration.config.js` (copy from finance-service, change displayName)
- `tsconfig.test.json` (copy from finance-service, add `@household/testing` path)
- `"test:integration"` script in `package.json`

### Web app tests (Vitest)

**Stack:** Vitest v2 + @testing-library/react + MSW v2 (no Docker needed).

```bash
pnpm --filter @household/web test:run    # 27 tests, ~1s
pnpm --filter @household/web test        # watch mode
```

**Pattern** — copy from `apps/web/src/test/`:
```typescript
import { renderWithProviders } from './wrapper'; // sets tokens, wraps with providers
import { server } from './setup';               // MSW server (auto started in setup.ts)
// Override specific handlers per test:
server.use(http.get('/api/v1/accounts', () => HttpResponse.json([])));
```

Socket.IO is mocked globally in `setup.ts` — no WebSocket connections in tests.

### Manual testing

**Tool: Postman** — `docs/postman/household.postman_collection.json` + `household.postman_environment.json`.

Swagger at `/docs` per service is for endpoint reference during development only.

## Current implementation status

**Phases 0–4 complete.** Implemented:

**Libs:** `common`, `contracts`, `database`, `kafka`, `locales` (i18n en/uk/de/es), `testing`

**Backend services:**
- `api-gateway` — JWT proxy, Redis rate limiting, Swagger
- `auth-service` — Google/Apple/Facebook OAuth, JWT, Redis sessions
- `household-service` — CRUD households, members (owner/admin/member/viewer), Redis invites, Kafka consumer (auth.user.deleted → cleanup)
- `finance-service` — accounts with balance tracking, transactions, categories, recurring payments, reports (monthly/by-category/net-worth)
- `shopping-service` — stores, products, shopping lists + items, Kafka events
- `realtime-gateway` — Socket.IO (JWT auth, rooms, presence, Kafka→WS bridge)

**Web app** (`apps/web`, port 5173):
- React 18 + Vite 5 + TanStack Query + Tailwind CSS + react-i18next
- Pages: Dashboard, Accounts, Transactions (with transfer), Shopping lists, Household settings
- Auth: Google OAuth via @react-oauth/google, axios→fetch, auto token refresh
- Real-time: Socket.IO client (entity updates, presence avatars, editing indicators)
- i18n: 4 languages, language switcher in Header, user.locale sync

Next: **Phase 5** — React Native mobile app.