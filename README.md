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
| Web | React 18 + Vite 5 + TanStack Query + Tailwind CSS |
| i18n | react-i18next, shared `libs/locales` (en / uk / de / es) |
| Auth | Google / Apple / Facebook OAuth · HttpOnly refresh cookie + CSRF (double-submit) · logout-all · Redis sessions |
| Security | Helmet · gateway-signed trust headers · JWT algorithm allowlist · per-endpoint rate limiting · audit_log · Swagger gated behind `NODE_ENV !== 'production'` |
| Mobile | React Native / Expo (Phase 5) |

Shared libraries in `libs/`: `common` (config, filters, JWT verify, gateway signature), `contracts` (Kafka envelope, Socket.IO event types, `LIST_HARD_LIMIT`, `PaginationDto`), `database` (base entity, schema helper), `kafka` (producer/consumer wrappers with retry + DLQ), `audit` (audit_log entity + `@Audit()` decorator + interceptor), `locales` (i18n JSON, 4 languages), `testing` (integration test factory).

## Services

| Service | Port | Description |
|---------|------|-------------|
| api-gateway | 3000 | Single REST entry point, JWT auth, proxy, Swagger |
| auth-service | 3001 | Google / Apple / Facebook OAuth, JWT, Redis sessions |
| household-service | 3002 | Households, members, roles, invites |
| finance-service | 3003 | Accounts, transactions, categories, recurring payments |
| shopping-service | 3004 | Stores, products, shopping lists |
| realtime-gateway | 3010 | Socket.IO, presence, live updates |
| **web** | **5173** | **React SPA — dashboard, finance, shopping, household** |

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
pnpm --filter @household/web test:run     # Vitest integration tests (42 tests, no Docker needed)
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

### Backend — Postman + integration tests

Integration tests use **Postman**. The collection covers full request flows with automatic token extraction and environment variable chaining (login → set `accessToken` → use in all subsequent requests).

**Files:**
- `docs/postman/household.postman_collection.json` — request collection
- `docs/postman/household.postman_environment.json` — local environment

**Import into Postman:**
1. File → Import → select both JSON files
2. Select **Household — Local** environment (top-right dropdown)
3. Start infrastructure and services (steps above)
4. Set up Google OAuth and get an ID token (see section below)
5. Paste the token into `googleIdToken` env var → run **Auth / Login with Google**
6. Run the collection — all env vars (`accessToken`, `householdId`, `accountId`, etc.) populate automatically

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

**2. Get an ID token for Postman testing**

- Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
- Click ⚙️ → check **"Use your own OAuth credentials"** → enter your Client ID + Client Secret
- In the scope box select or type: `openid email profile`
- Click **Authorize APIs** → sign in with your Google account
- Click **Exchange authorization code for tokens**
- Copy the `id_token` value from the response
- Paste into Postman environment variable `googleIdToken`

> The `id_token` expires in ~1 hour. Repeat step 2 when it expires.

Each completed feature has a manual testing checklist in the [Testing milestone](https://github.com/VitaliiPoltorak/household/milestone/8) on GitHub. Swagger (`/docs` on each service) is available for quick endpoint reference during development.

### Web — Vitest

The web app has 42 integration tests using **Vitest + @testing-library/react + MSW** (Mock Service Worker intercepts fetch at the network level). No Docker needed.

```bash
pnpm --filter @household/web test:run   # run once
pnpm --filter @household/web test       # watch mode
pnpm --filter @household/web test:ui    # browser UI
```

**Covered flows:** login, dashboard (empty state + create household), accounts (list/create/archive), transactions (list/create/delete/filter/transfer), shopping lists (list/create/select/mark purchased).

## Architecture overview

Clients (web / mobile) communicate only with the API Gateway over HTTPS/REST and WebSocket (Socket.IO, Phase 2). The Gateway validates JWT, extracts `userId` from the token, reads `X-Household-Id` from the request header, and proxies both as `X-User-Id` / `X-Household-Id` headers to downstream services. Services trust these headers and do not re-validate the JWT.

All business entities carry a `householdId` — multi-tenancy at the household level. A user can belong to multiple households.

Inter-service async communication uses Kafka. The Realtime Gateway (Phase 2) consumes Kafka events and broadcasts them to Socket.IO rooms (`household:{id}`), so all connected clients (web + mobile) see changes instantly.

See [`docs/PLAN.md`](docs/PLAN.md) for the full architecture, data model, Kafka event catalog, API endpoints, and development phases.
