# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
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

This is a **pnpm + Turborepo monorepo** containing NestJS microservices behind a single HTTP API Gateway. Clients never talk to services directly — everything flows through the gateway. See `apps/` and `libs/` for the current service/lib list and ports (each service's `main.ts` binds its port).

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

All inter-service events use a shared schema (`eventId`, `eventType`, `householdId?`, `userId?`, `payload`, `createdAt`) — defined in `libs/contracts` when built.

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

All services return a consistent `{ statusCode, message, error, timestamp }` shape — see `HttpExceptionFilter` in `libs/common`.

### Database

One PostgreSQL instance with **schema-per-service** (not separate databases). Each service manages its own schema and runs its own TypeORM migrations.

**Current state (dev):** `synchronize: true` — TypeORM auto-creates/alters tables on startup. Schema is created via `ensureSchema()` before TypeORM initializes.

**Phase 3 plan:** Generate initial migrations for each service once schemas stabilise. Switch from `synchronize` to `migrations: run`. This is safe in development and required for production.

**Phase 6 plan:** `synchronize: false` in all services. `migration:run` executes as part of the Docker entrypoint before the service starts.

## Testing policy (Phase 2+)

Every completed feature must have both before the issue is closed: automated integration tests and an automated API scenario check (Postman/Newman). See the `testing-policy` skill for how to write and run them, the test database rules, and the scenario gate.

## Docker auto-rebuild on merge

The compose services are built into `household/<service>` images — a pulled/merged code change is invisible until the image is rebuilt. `.githooks/post-merge` and `.githooks/post-checkout` handle this automatically; see `scripts/rebuild-touched-services.sh` and `scripts/api-scenarios.sh` for the rebuild mechanics (one-service-at-a-time, `COMPOSE_BAKE=false`) and the Docker healthcheck design rationale — both are documented in those scripts' own comments.

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

See the `surfacing-issues` skill for how to handle a bug/design flaw found outside the current task's scope.

## Rules from past audits (apply while writing code, not just in review)

Three completed audits — Security (milestone 9), Bugs (milestone 10), Architecture/SOLID+GRASP (milestone 11) — found ~60 issues, almost all of them the same handful of mistakes repeated across services. The full checklist with rationale — including which rules caused the most churn from being fixed in one place but not generalized — lives in the `backend-hardening-checklist` skill (auto-loads for backend/auth/financial/Kafka work).

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
