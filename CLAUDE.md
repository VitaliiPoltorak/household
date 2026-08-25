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
docker compose up -d                          # Start postgres, redis, kafka + app services
docker compose --profile tools up -d          # Also start adminer (:8080) + kafka-ui (:8081)
docker compose down                           # Stop all infrastructure

# Git hooks (auto-rebuild Docker services when their sources change)
pnpm hooks:enable                             # activate .githooks/ (one-time, per clone)
pnpm hooks:disable                            # opt out
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
  integration-service/ # Phase 3 — Monobank sync (not implemented)
  notification-service/# Phase 6 — email + push (not implemented)
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

Infra services: **postgres:5432**, **redis:6379**, **kafka:9092**. Dev tools (gated behind `--profile tools`): **kafka-ui:8081**, **adminer:8080**.

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

**Token flow (post-#60):**
- **Access token** — returned in login/refresh response body. Web keeps it in memory only (never localStorage) — see `apps/web/src/api/client.ts` `setAccessToken/getAccessToken`. Sent as `Authorization: Bearer` on every API call.
- **Refresh token + session id** — packed as `base64(sessionId.refreshToken)` and set as `household_refresh` HttpOnly, Secure, SameSite=None cookie scoped to `Path=/api/v1/auth`. XSS cannot read it (HttpOnly).
- **CSRF token** — `household_csrf` cookie (readable by JS, deliberately) set alongside refresh cookie. The SPA echoes it in the `X-CSRF-Token` header on `/auth/refresh` — double-submit CSRF pattern.
- **On page load**, `AuthContext` reads the CSRF cookie as a cheap "is logged in?" probe. If present, it POSTs `/auth/refresh` (cookies auto-attached), gets a new access token, then loads `/auth/me`. Cookies auto-rotate.
- **Legacy migration** (from pre-#60 localStorage tokens): `MigrationBanner` gates the whole app when it detects remnants in localStorage. User re-authenticates once, banner disappears permanently after `MigrationBanner` clears the legacy keys.

Env: `AUTH_COOKIE_SECURE=true` (default). Set to `false` only for http:// dev on non-localhost.

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

Every completed feature must have both before the issue is closed: automated integration tests and an automated API scenario check (Postman/Newman). See the `testing-policy` skill for how to write and run them, the test database rules, and the scenario gate.

## Docker auto-rebuild on merge

The compose services are built into `household/<service>` images — a pulled/merged code change is invisible until the image is rebuilt. To avoid the "new endpoint returns 404 because the container is still on the old image" trap, the repo ships three git hooks in `.githooks/`:

- `post-merge` — runs after `git pull` / `git merge`.
- `post-checkout` — runs after `git checkout <branch>` (branch checkouts only, not file checkouts).
- `pre-commit` — runs `pnpm test:unit` then the API scenario gate (`scripts/api-scenarios.sh`) on every commit; see Scenario gate above.

`post-merge`/`post-checkout` delegate to `scripts/rebuild-touched-services.sh`, which:
1. Diffs the two refs to find changed files.
2. Maps `apps/<svc>/**` → that service, and `libs/**` (except `libs/locales`, a web/mobile-only i18n package no backend service imports, #243) / `Dockerfile` / `docker-compose.yml` / root `package.json` / `pnpm-lock.yaml` → all backend services — via the shared table in `scripts/lib/changed-services.sh` (also used by `scripts/api-scenarios.sh`, so the mapping can't drift between the two callers).
3. Intersects with `docker compose ps --services --status=running` — never starts a service that wasn't already up.
4. Runs `docker compose up -d --build <targets>` **one target at a time** (#244) with `COMPOSE_BAKE=false` (#251) — bake's default multi-target graph resolution would otherwise silently rebuild every backend service even when only one was passed, both overwhelming a resource-constrained Docker Desktop VM and defeating the point of the one-at-a-time loop.

Failures are logged, never blocking — the git operation succeeds either way.

### Docker health checks

All 6 app services (plus postgres/redis/kafka) have a `healthcheck` in `docker-compose.yml`, so `docker compose up -d --wait` actually waits for real readiness instead of just "container started". The internal services (auth/household/finance/shopping/realtime-gateway) use a plain TCP-connect probe on their own port rather than a dedicated HTTP health route: in every service's `main.ts`, `await app.listen(...)` is the last bootstrap step, after the TypeORM connection, `ensureSchema()`, `synchronize`, and Kafka `onModuleInit` all complete — so "port accepts a connection" already proves the schema exists and the service is genuinely ready. `api-gateway` uses its real `GET /api/v1/health` route instead (already public, excluded from auth middleware, and exempted from the global rate limiter so a busy-but-healthy gateway can't get marked unhealthy by its own throttler).

If a future refactor moves `app.listen()` earlier (e.g. a lazy DB connection), this "port-bound ⇒ bootstrap complete" assumption breaks silently — revisit the healthchecks in `docker-compose.yml` if that happens.

**Activation is opt-in** (git hooks are not auto-linked to `.githooks/` on clone): run `pnpm hooks:enable` once per clone. `pnpm hooks:disable` reverts.

## Language policy

**All project artifacts are English-only.** This includes: code, comments, commit messages, PR titles + bodies, GitHub issue titles + bodies, issue comments, documentation (README, PLAN, migration notes), env var names, log messages, error strings, and identifiers. Do NOT use Cyrillic (or any non-Latin script) anywhere in the repo or in GitHub metadata attached to it — even if the request that triggered the change was in another language. If you're translating an existing artifact that has non-English content, rewrite it in English rather than leaving mixed-language text.

## Documentation policy

**Every PR must leave `README.md` and `docs/PLAN.md` accurate.** Before opening a PR, check whether your change invalidates anything in either file — new/removed service or port, new env var or command, changed architecture, completed/moved phase, new API endpoint category, changed dev workflow. If it does, update the docs in the **same PR**, not a follow-up.

- `README.md` — user-facing overview: stack table, service+port table, prerequisites, quick-start commands, top-level features. Update when any of those change.
- `docs/PLAN.md` — the roadmap: phases, milestones, MVP scope, deploy notes, section-by-section design. Update when a phase advances, a milestone completes, or a design decision from the plan changes in code.

If a PR truly changes nothing user-visible or plan-relevant (e.g. an internal refactor with identical behaviour and no new deps), state that explicitly in the PR description — don't just skip the check silently.

## Git workflow

All changes — even one-line fixes — go through a branch and a PR, never a
direct commit to `main`:

1. Create a branch off `main` (e.g. `fix/<issue-number>-<short-slug>`,
   `docs/<short-slug>`).
2. Commit there, push, open a PR with `gh pr create`.
3. Wait for CI (`gh pr checks <n> --watch`). Once every check is green (or
   skipped because the change touches nothing CI tracks) **and** the
   underlying issue's fix is verified (tests pass, and a real browser check
   where relevant), merge immediately with squash + delete-branch — no need
   to ask for confirmation each time.
4. Fast-forward local `main` (`git pull`) and drop the local branch copy.

This mirrors the existing PR history (#233-#240) and keeps `main` always in
a state CI has actually validated.

## Surfacing problems as issues

When you notice a **potential problem outside the scope of the task you're working on** — a bug, a design flaw, a missing edge case, a stale comment, a place where a past-audit rule was quietly violated — do NOT silently fix it in the current PR (scope creep) and do NOT drop it on the floor.

Instead:
1. Note it briefly in your PR body under a "Follow-up findings" bullet, and
2. Propose creating a GitHub issue for it. Include: the location (`file.ts:LN`), the concrete symptom, the impact (who/what breaks and when), and a suggested fix or acceptance criteria. Cross-link with the PR/issue that surfaced it.

Ask the maintainer before opening the issue unless they've already said "just file it". This keeps the current PR reviewable and stops known-broken behaviour from rotting into the codebase under "we'll get to it later".

Examples of things worth an issue: naive `SUM` across currencies without a currency dimension, an unscoped `findOne(id)` that should be `findOne(id, householdId)`, a Kafka consumer that catch-logs-and-advances, a Redis `GET`-then-`DEL` on a single-use token, a `Number()` sum of decimals from Postgres.

## Rules from past audits (apply while writing code, not just in review)

Three completed audits — Security (milestone 9), Bugs (milestone 10), Architecture/SOLID+GRASP (milestone 11) — found ~60 issues, almost all of them the same handful of mistakes repeated across services. The full checklist with rationale lives in the `backend-hardening-checklist` skill (auto-loads for backend/auth/financial/Kafka work). The rules that caused the most churn (each was found and re-fixed in 2-5 places because the first fix wasn't generalized):

1. **Multi-tenant IDOR**: any ID coming from the client that references another entity (`accountId`, `categoryId`, `storeId`, room name) must be loaded via a household-scoped lookup (`findOne(id, householdId)`) before use — in every service, every entity relationship, not just the first one you touch. When you fix one, `grep` the monorepo for the same unscoped-lookup pattern and fix all of them.
2. **Balance/financial mutations** are one DB transaction with row locking — never compose separate read-modify-write calls. Sum money in SQL (`SUM`), never by adding `Number()`-converted JS values. Transfers (paired rows) must be created/updated/deleted as a unit keyed by an explicit pair id, never inferred from row order.
3. **Redis/cache is a performance layer, never an authority** — anything security-relevant (invite validity, refresh-token reuse, single-use tokens) must be checked against the DB or consumed atomically (`GETDEL`, not GET-then-DEL).
4. **Secrets/JWT config fails loudly at startup** if missing or weak — via one shared helper in `libs/common`, not per-service copy-paste. New cross-origin/inter-service surfaces (CORS, Socket.IO, bind address) default to deny, not wildcard.
5. **Kafka/queue consumer errors must retry + DLQ**, never catch-log-and-advance-offset (silently drops the event forever). If a client needs `.connect()` (e.g. Redis `lazyConnect`), call it explicitly in `onModuleInit` — don't rely on implicit connect-on-first-command.
6. **One service class = one aggregate.** When a second aggregate's rules start living in an existing service (e.g. members/invites logic inside a households service), split it out. New "variant" additions (OAuth provider, transaction type, proxy route, Kafka→WS event mapping) should be addable via a registry/config, not by editing a central switch statement.
7. **Domain rules live on the entity that owns the data** (balance delta, reversal eligibility), not scattered across orchestrating services (GRASP Information Expert) — avoids an anemic domain model.

## Current implementation status

**Phases 0–2 and 4 complete. Phase 3 (Integrations) partially done** — `auth-service` OAuth providers (Google/Apple/Facebook) are implemented; `integration-service` (Monobank connect + sync, transaction mapping) does not exist yet (issues #20, #21). Implemented so far:

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

Next: finish **Phase 3** (`integration-service` — Monobank sync), then **Phase 5** — React Native mobile app.
