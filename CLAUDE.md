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

# TypeORM migrations (auth-service; other services will follow the same pattern)
pnpm --filter @household/auth-service migration:generate -- -n MigrationName
pnpm --filter @household/auth-service migration:run

# Infrastructure
docker compose up -d        # Start postgres, redis, kafka, kafka-ui, adminer
docker compose down         # Stop all infrastructure
```

## Architecture

This is a **pnpm + Turborepo monorepo** containing NestJS microservices behind a single HTTP API Gateway. Clients never talk to services directly — everything flows through the gateway.

```
apps/
  api-gateway/         # Port 3000 — single entry point, JWT, proxy, Swagger
  auth-service/        # Port 3001 — OAuth, JWT issuance, Redis sessions
  household-service/   # Port 3002 — households, members, invites (not yet scaffolded)
  finance-service/     # Port 3003 — accounts, transactions, categories (not yet scaffolded)
  shopping-service/    # Port 3004 — stores, products, shopping lists (not yet scaffolded)
  realtime-gateway/    # Port 3010 — Socket.IO, presence, Kafka→WS bridge (Phase 2)
  integration-service/ # Phase 3 — Monobank sync
  notification-service/# Phase 3 — email + push
  web/                 # Phase 4 — React + Vite SPA
  mobile/              # Phase 5 — React Native (Expo)

libs/
  common/     # Guards, decorators, pipes, exception filters (planned)
  contracts/  # Shared DTOs, event schemas, Socket.IO event types (planned)
  database/   # Base entities, migration helpers (planned)
  kafka/      # Producer/consumer wrappers, event envelope (planned)
  auth/       # Auth-related shared code (planned)
  config/     # Shared config helpers (planned)
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

## Testing policy

Starting from Phase 2, every completed feature issue must have a corresponding issue in the **Testing** GitHub milestone before it is considered done. Testing issues contain step-by-step Postman instructions.

**Tool: Postman** — collection at `docs/postman/household.postman_collection.json`, environment at `docs/postman/household.postman_environment.json`.

When finishing an issue:
1. Check existing testing issues in the Testing milestone — if none covers the feature, create one.
2. Run the relevant Postman requests and verify all test assertions pass.
3. Close the testing issue only after manual verification.

Swagger (`/docs` on each service) is for quick endpoint reference during development, not for integration testing.

## Current implementation status

Phase 0 and Phase 1 complete. Implemented:
- `libs/common`, `libs/contracts`, `libs/database`, `libs/kafka` — shared libs
- `api-gateway` — JWT proxy, rate limiting, Swagger
- `auth-service` — Google/Apple/Facebook OAuth, JWT, Redis sessions
- `household-service` — CRUD households, members (owner/admin/member/viewer roles), Redis-backed invites
- `finance-service` — accounts with balance tracking, transactions (income/expense/transfer/adjustment), categories, income sources, recurring payments

Next: Phase 2 — shopping-service, Kafka consumers between services, realtime-gateway (Socket.IO).