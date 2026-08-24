# Household

Family finance & shopping management — NestJS microservices monorepo.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10 + TypeScript, pnpm 9 workspaces + Turborepo |
| Database | PostgreSQL 16 (schema-per-service) |
| Cache / Sessions | Redis 7 |
| Message bus | Apache Kafka (KRaft) — HMAC-signed envelopes, retry + DLQ |
| Real-time | Socket.IO + `@socket.io/redis-adapter` |
| Web | React 18 + Vite 5 + TanStack Query + Tailwind CSS (class-based dark mode with light / dark / system toggle) · react-hook-form + zod for typed auth forms |
| i18n | react-i18next, shared `libs/locales` (en / uk / de / es) |
| Auth | Google / Apple / Facebook OAuth · Email + password with 6-digit mailbox verification · HttpOnly refresh cookie + CSRF (double-submit) · logout-all · Redis sessions |
| Security | Helmet · gateway-signed trust headers · JWT algorithm allowlist · per-endpoint rate limiting · audit_log · Swagger gated behind `NODE_ENV !== 'production'` |
| Mobile | React Native / Expo (Phase 5) |

Shared libraries in `libs/`: `common` (config, filters, JWT verify, gateway signature), `contracts` (Kafka envelope, Socket.IO event types, `LIST_HARD_LIMIT`, `PaginationDto`), `database` (base entity, schema helper), `kafka` (producer/consumer wrappers with retry + DLQ), `audit` (audit_log entity + `@Audit()` decorator + interceptor), `locales` (i18n JSON, 4 languages), `testing` (integration test factory).

## Services

| Service | Port | Description |
|---------|------|-------------|
| api-gateway | 3000 | Single REST entry point, JWT auth, proxy, Swagger |
| auth-service | 3001 | Google / Apple / Facebook OAuth, email + password (with mailbox verification + authenticated password change), JWT, Redis sessions, public user directory |
| household-service | 3002 | Households, members, roles, invites |
| finance-service | 3003 | Accounts, transactions (incl. cross-currency transfers), categories, recurring payments |
| shopping-service | 3004 | Stores, products, shopping lists |
| realtime-gateway | 3010 | Socket.IO, presence, live updates |
| **web** | **5173** | **React SPA — dashboard, finance, shopping, household, email/password auth (register + verify + login + unlock + password change)** |

## Prerequisites

- Node.js ≥ 20
- pnpm 9 (`npm i -g pnpm`)
- Docker + Docker Compose

## Quick start

**1. Clone and install dependencies**

```bash
git clone git@github.com:VitaliiPoltorak/household.git
cd household
pnpm install
pnpm hooks:enable    # optional but recommended — auto-rebuild Docker services on git pull / branch checkout, and run the API scenario gate on every commit
```

**2. Configure environment**

```bash
cp .env.example .env
```

Open `.env` and fill in the required values (see [Environment variables](#environment-variables) below).

**3. Start infrastructure**

```bash
docker compose up -d                          # postgres + redis + kafka + all app services
docker compose --profile tools up -d          # also start Adminer (:8080) + Kafka UI (:8081)
```

Dev UIs (Adminer, Kafka UI) are gated behind the `tools` compose profile so a copy-paste of `docker-compose.yml` onto a public host doesn't expose the DB schema or Kafka messages (#68.5, #68.6).

**4. Run backend services**

```bash
pnpm dev
```

Or a single service:

```bash
pnpm --filter @household/api-gateway dev
pnpm --filter @household/auth-service dev
pnpm --filter @household/household-service dev
pnpm --filter @household/finance-service dev
pnpm --filter @household/shopping-service dev
pnpm --filter @household/realtime-gateway dev
```

**5. Run the web app**

```bash
cp apps/web/.env.local.example apps/web/.env.local
# Fill in VITE_GOOGLE_CLIENT_ID (see Google OAuth setup below)
pnpm --filter @household/web dev    # http://localhost:5173
```

The web app uses a Vite proxy — all `/api` requests are forwarded to the API Gateway on port 3000. The Socket.IO connection goes directly to the Realtime Gateway on port 3010.

**6. Open Swagger**

| Service | URL |
|---------|-----|
| API Gateway (all routes) | http://localhost:3000/api/docs |
| Auth Service | http://localhost:3001/docs |
| Household Service | http://localhost:3002/docs |
| Finance Service | http://localhost:3003/docs |

Dev tools (only available with `--profile tools`):

| Tool | URL |
|------|-----|
| Adminer (DB UI) | http://localhost:8080 |
| Kafka UI | http://localhost:8081 |

> Swagger is skipped in production (`NODE_ENV=production`) — see [#68.4](https://github.com/VitaliiPoltorak/household/issues/68).

## Environment variables

Copy `.env.example` to `.env`. Full annotated reference lives in [`.env.example`](.env.example) — the tables below summarise what's **required** vs optional and highlight the security defaults introduced by the 2026-08 audits.

### Required in every environment

| Var | Notes |
|---|---|
| `JWT_SECRET` | ≥ 32 chars, generated via `openssl rand -base64 48`. Service refuses to start with an empty or placeholder value (#53). |
| `CORS_ORIGIN` | Comma-separated allow-list for the REST API. `api-gateway` refuses to start with an empty value in production (#51). |
| `WS_CORS_ORIGINS` | Same, but for the Socket.IO handshake on `realtime-gateway` (#50). |
| `GOOGLE_CLIENT_ID` | Needed to complete Google login (see the Google OAuth setup section). |

### Required in production

| Var | Notes |
|---|---|
| `GATEWAY_SIGNING_SECRET` | HMAC secret used by `api-gateway` / `realtime-gateway` to sign the `X-User-Id` / `X-Household-Id` / `X-User-Email` trust headers. Downstream services verify the signature. Refuses to start empty when `NODE_ENV=production` (#46). |
| `KAFKA_SIGNING_KEY` | Optional in dev, expected in staging/prod — HMAC used to authenticate Kafka messages between services (#63). Rotation: keep the previous value in `KAFKA_SIGNING_KEY_PREV` while the new one propagates. |
| `AUTH_COOKIE_SECURE=true` | Default. Only set to `false` for local `http://` dev on non-localhost hosts — `SameSite=None` requires `Secure` (#60/#61). |

### Optional / defaulted

| Var | Default | Purpose |
|---|---|---|
| `LISTEN_HOST` | `127.0.0.1` for internal services, `0.0.0.0` for `api-gateway` + `realtime-gateway` | Bind address (#68.8). |
| `POSTGRES_HOST/PORT/USER/PASSWORD/DB` | `localhost:5432` `household:household_secret/household` | |
| `REDIS_HOST/PORT` | `localhost:6379` | |
| `KAFKA_BROKERS` | `localhost:9092` | |
| `JWT_ACCESS_EXPIRES` | `15m` | |
| `JWT_REFRESH_EXPIRES_DAYS` | `30` | |
| `AUTH_SERVICE_PORT`, `HOUSEHOLD_SERVICE_PORT`, `FINANCE_SERVICE_PORT`, `SHOPPING_SERVICE_PORT`, `REALTIME_GATEWAY_PORT` | `3001`–`3004`, `3010` | |
| `AUTH_SERVICE_URL` … `SHOPPING_SERVICE_URL` | `http://localhost:300x` | Used by `api-gateway` for proxying. |
| `PROXY_ROUTES_JSON` / `PROXY_ROUTES_PATH` | ships with `apps/api-gateway/src/proxy/routes.default.json` | Override the gateway's proxy table without recompiling (#88). |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60` / `100` | Redis rate limiting on `api-gateway`. |
| `APPLE_CLIENT_ID` | — | Required for Apple login (App Store mandatory once other providers are enabled). |
| `ARGON2_MEMORY_KIB` / `ARGON2_ITERATIONS` / `ARGON2_PARALLELISM` | `19456` / `2` / `1` | Argon2id parameters (OWASP 2024 baseline). Production refuses to start below these — see `docs/security/password-policy.md`. Tests use `8` / `1` / `1` for speed. |
| `EMAIL_VERIFICATION_TTL_SEC` | `900` | How long a 6-digit signup code is valid (15 min). |
| `EMAIL_VERIFICATION_MAX_ATTEMPTS` | `5` | Wrong-code attempts before the code is invalidated and the user must request a new one. |
| `ZXCVBN_MIN_SCORE` | `3` | zxcvbn strength threshold for new passwords (0–4). Score 3 = "safely unguessable — moderate protection". |
| `HIBP_ENABLED` / `HIBP_BASE_URL` / `HIBP_TIMEOUT_MS` | `true` / `https://api.pwnedpasswords.com/range` / `500` | Have-I-Been-Pwned Range API check on signup. Fails open on outage. Tests set `HIBP_ENABLED=false`. |
| `LOGIN_MAX_FAILS` / `LOGIN_FAILS_WINDOW_SEC` / `LOGIN_LOCK_TTL_SEC` / `UNLOCK_TOKEN_TTL_SEC` | `5` / `900` / `3600` / `3600` | Per-account soft-lock after 5 failed password attempts in 15 min; unlock link valid for 1 h. |

## Development commands

```bash
pnpm build                  # build all packages
pnpm dev                    # start all backend services in watch mode
pnpm lint                   # lint all packages
pnpm test                   # run all tests
pnpm test:unit              # unit tests only (no Docker required)
pnpm test:integration       # integration tests (requires `docker compose up -d`)
pnpm format                 # prettier format

# Per-service dev shortcuts (root-level scripts)
pnpm gateway | pnpm auth | pnpm household | pnpm finance | pnpm shopping | pnpm realtime | pnpm web

# Web app
pnpm --filter @household/web dev          # start dev server
pnpm --filter @household/web test:run     # Vitest integration tests (no Docker needed)
pnpm --filter @household/web test:ui      # Vitest UI

# Backend integration tests per service (requires docker compose up -d)
pnpm --filter @household/finance-service test:integration
pnpm --filter @household/shopping-service test:integration

# Unit tests per service (no Docker needed)
pnpm --filter @household/api-gateway test:unit
pnpm --filter @household/auth-service test:unit
pnpm --filter @household/household-service test:unit
pnpm --filter @household/finance-service test:unit
pnpm --filter @household/audit test:unit

# TypeORM migrations (same pattern for all services)
pnpm --filter @household/auth-service migration:generate -- -n InitAuth
pnpm --filter @household/auth-service migration:run
```

## Testing

### Backend — automated API scenario collection

The API scenario gate (`docs/postman/`) runs headlessly via **Newman** — not a human clicking through Postman. It logs in as two pre-verified users seeded by `scripts/seed-e2e-user.js`, exercises the full API surface (auth, households + invites, finance, shopping), and cleans up after itself (deletes the household it created, logs out both sessions) so repeated runs never collide.

**Files:**
- `docs/postman/household.postman_collection.json` — request collection
- `docs/postman/household.postman_environment.json` — local environment

**Run:**
```bash
docker compose up -d --wait                                          # full stack; --wait waits for real readiness
docker compose exec -T auth-service node scripts/seed-e2e-user.js    # seeds the two users the collection logs in as
pnpm test:postman
```

This also runs automatically on every commit (once `pnpm hooks:enable` is active, see above) and on every PR that touches backend-relevant paths — see "Scenario gate" in `CLAUDE.md`.

You can still import both JSON files into the Postman GUI for exploratory testing — select the **Household — Local** environment, run **Setup → Login (owner)** first, then anything else.

## Google OAuth setup

Required once to get a `GOOGLE_CLIENT_ID` and test tokens locally.

**1. Create OAuth credentials**

- Open [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
- Create Credentials → **OAuth 2.0 Client ID**
- Application type: **Web application**
- Authorized redirect URIs — add **both**:
  ```
  https://developers.google.com/oauthplayground
  http://localhost:3000
  ```
- Copy the **Client ID** → paste into `.env` as `GOOGLE_CLIENT_ID`

**2. Get an ID token for a manual OAuth check**

Real OAuth consent is verified manually, not by the automated collection above — Google actively blocks scripted logins. Do this once when touching the OAuth strategy code.

- Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
- Click ⚙️ → check **"Use your own OAuth credentials"** → enter your Client ID + Client Secret
- In the scope box select or type: `openid email profile`
- Click **Authorize APIs** → sign in with your Google account
- Click **Exchange authorization code for tokens**
- Copy the `id_token` value from the response
- `POST /api/v1/auth/google` with `{"idToken": "<the token>"}` (curl, Swagger's "Try it out", or a scratch Postman request) — expect `200` with an `accessToken`

> The `id_token` expires in ~1 hour. Repeat this when it expires.

Every completed feature is covered by the automated API scenario collection above (`pnpm test:postman`) and/or the integration test suite — not a manual checklist. The only things that stay deliberately manual are real OAuth consent (above) and the register/verify-email flow (the 6-digit code only exists in Redis and a service log line — see `CLAUDE.md`). Swagger (`/docs` on each service) is available for quick endpoint reference during development.

### Web — Vitest

The web app has integration tests using **Vitest + @testing-library/react + MSW** (Mock Service Worker intercepts fetch at the network level). No Docker needed.

```bash
pnpm --filter @household/web test:run   # run once
pnpm --filter @household/web test       # watch mode
pnpm --filter @household/web test:ui    # browser UI
```

**Covered flows:** login, dashboard (empty state + create household + multi-currency total with per-currency breakdown and PrivatBank conversion), accounts (list/create/archive + multi-currency estimated total), transactions (list/create/delete/filter/transfer incl. cross-currency with auto-rate + manual override), shopping lists (list/create/select/mark purchased).

## Architecture overview

Clients (web / mobile) communicate only with the API Gateway over HTTPS/REST and WebSocket (Socket.IO, Phase 2). The Gateway validates JWT, extracts `userId` from the token, reads `X-Household-Id` from the request header, and proxies both as `X-User-Id` / `X-Household-Id` headers to downstream services. Services trust these headers and do not re-validate the JWT.

All business entities carry a `householdId` — multi-tenancy at the household level. A user can belong to multiple households.

Inter-service async communication uses Kafka. The Realtime Gateway (Phase 2) consumes Kafka events and broadcasts them to Socket.IO rooms (`household:{id}`), so all connected clients (web + mobile) see changes instantly.

See [`docs/PLAN.md`](docs/PLAN.md) for the full architecture, data model, Kafka event catalog, API endpoints, and development phases.
