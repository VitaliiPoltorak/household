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
| Web | React 18 + Vite 5 + TanStack Query + Tailwind CSS (class-based dark mode with light / dark / system toggle) · react-hook-form + zod for typed auth forms · brand kit (indigo/sand palette, Manrope + IBM Plex Mono via self-hosted `@fontsource`) · responsive below 768px — bottom tab bar + account menu sheet replace the sidebar/header |
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
| integration-service | 3005 | Monobank connection, statement sync (mapping to accounts — #21) |
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
pnpm --filter @household/integration-service dev
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
| Integration Service | http://localhost:3005/docs |

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
| `TOKEN_ENCRYPTION_KEY` | Encrypts bank connection tokens (e.g. Monobank) at rest on `integration-service` (AES-256-GCM). Same strength rule as `JWT_SECRET` — refuses to start empty/placeholder/short when `NODE_ENV=production`. Rotation: keep the previous value in `TOKEN_ENCRYPTION_KEY_PREV` while the new one propagates (#296) — same convention as `KAFKA_SIGNING_KEY_PREV`. |
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
| `AUTH_SERVICE_PORT`, `HOUSEHOLD_SERVICE_PORT`, `FINANCE_SERVICE_PORT`, `SHOPPING_SERVICE_PORT`, `INTEGRATION_SERVICE_PORT`, `REALTIME_GATEWAY_PORT` | `3001`–`3005`, `3010` | |
| `AUTH_SERVICE_URL` … `INTEGRATION_SERVICE_URL` | `http://localhost:300x` | Used by `api-gateway` for proxying. |
| `MONOBANK_API_BASE_URL` | `https://api.monobank.ua` | Override only for testing `integration-service` against a stub/mock server. |
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
pnpm gateway | pnpm auth | pnpm household | pnpm finance | pnpm shopping | pnpm integration | pnpm realtime | pnpm web

# Web app
pnpm --filter @household/web dev          # start dev server
pnpm --filter @household/web test:run     # Vitest integration tests (no Docker needed)
pnpm --filter @household/web test:ui      # Vitest UI

# Backend integration tests per service (requires docker compose up -d)
pnpm --filter @household/finance-service test:integration
pnpm --filter @household/shopping-service test:integration
pnpm --filter @household/integration-service test:integration

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

## Deployment

Production runs the same `docker-compose.yml` as local development, on a single VPS, with a thin
`docker-compose.prod.yml` overlay for the handful of values that differ. The web app is built and
served separately as static files.

| Piece | Where | Notes |
|---|---|---|
| Backend (7 services + Postgres + Redis + Kafka) | netcup VPS 500 G12 — 2 vCPU / 4 GB / 128 GB NVMe, Vienna | Single box, `docker compose`, ~€5.72/mo (no minimum contract term) |
| TLS + reverse proxy | Caddy on the host | Automatic Let's Encrypt; only `:80`/`:443` are open (ufw) |
| Web app | Cloudflare Pages | Static SPA build, auto-deploys on push to `main`, free tier |
| DNS | Cloudflare DNS (`h-holds.com`) | `app.h-holds.com` -> Cloudflare Pages, `api.h-holds.com` -> VPS. Both share the same registrable domain so the refresh cookie is no longer third-party in Safari/Firefox — see [#301](https://github.com/VitaliiPoltorak/household/issues/301) |

### Host prerequisites

Docker + Docker Compose, `git`, Caddy, a firewall allowing only SSH/80/443, and **2 GB of swap**.
Swap is not optional here: the full stack idles close to the 4 GB ceiling, and without swap the OOM
killer takes out Kafka or Postgres instead of the box briefly paging.

### Reverse proxy

Compose publishes every service on `127.0.0.1` only, so Caddy is the single public entry point. It
fronts `api-gateway` and routes the Socket.IO path to `realtime-gateway`:

```
api.h-holds.com {
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:3010
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

### The prod overlay

`docker-compose.prod.yml` overrides `NODE_ENV` for every service, plus the CORS allow-lists and
`AUTH_COOKIE_SECURE`:

```yaml
services:
  api-gateway:
    environment:
      NODE_ENV: production
      CORS_ORIGIN: https://app.h-holds.com
  auth-service:
    environment:
      NODE_ENV: production
      AUTH_COOKIE_SECURE: 'true'
  household-service:
    environment:
      NODE_ENV: production
  finance-service:
    environment:
      NODE_ENV: production
  shopping-service:
    environment:
      NODE_ENV: production
  integration-service:
    environment:
      NODE_ENV: production
  realtime-gateway:
    environment:
      NODE_ENV: production
      WS_CORS_ORIGINS: https://app.h-holds.com
```

All five database-backed services now run their initial migration (`migrationsRun: true` in
`apps/*/src/app.module.ts`) at bootstrap instead of relying on `synchronize`, so `NODE_ENV=production`
no longer disables schema creation ([#304](https://github.com/VitaliiPoltorak/household/issues/304)).
Each migration self-baselines: on a database `synchronize` already built, it detects the existing
tables and records itself as applied without re-running any DDL, so this is a safe no-op switch on
an existing deploy. This also restores the bootstrap fail-fast guards (`JWT_SECRET`/
`TOKEN_ENCRYPTION_KEY` strength checks, `GATEWAY_SIGNING_SECRET` required,
`AUTH_DEV_LOG_SECRETS` must not be `true`) on all five services.

Deploy commands always pass both files:

```bash
export COMPOSE_BAKE=false
docker compose -f docker-compose.yml -f docker-compose.prod.yml build <service>   # one at a time
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
```

Building one service at a time is deliberate on a 2-vCPU box — see the comments in
`scripts/rebuild-touched-services.sh` for why `COMPOSE_BAKE=false` plus a per-service `build` is the
only invocation that actually scopes to a single service.

The checkout on the server has `core.hooksPath` pointed at `.githooks`, so a `git pull` there
rebuilds and restarts exactly the services whose sources changed — the same mechanism used locally.

### Web app (Cloudflare Pages)

| Setting | Value |
|---|---|
| Root directory | *(repo root — do not set to `apps/web`)* |
| Build command | `pnpm install --filter @household/web... --frozen-lockfile && pnpm --filter @household/web build` |
| Build output | `apps/web/dist` |
| Env vars | `VITE_API_URL=https://api.h-holds.com/api/v1`, `VITE_WS_URL=wss://api.h-holds.com`, `VITE_GOOGLE_CLIENT_ID` |
| Custom domain | `app.h-holds.com` |

Root directory has to stay at the repo root: `apps/web` resolves `@household/locales` through a Vite
alias to `../../libs/locales/src` (`apps/web/vite.config.ts`), not through `node_modules`, so the
build breaks if `libs/` isn't in the checkout. The `--filter @household/web...` install keeps the
backend's dependencies out of the build.

`VITE_*` values are inlined at build time, so changing one requires a redeploy, not just a settings
save. `apps/web/public/_headers` sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` so
Google's popup sign-in can `postMessage` back to the app.

### Database backups

Nightly, off-box, encrypted Postgres backups ([#306](https://github.com/VitaliiPoltorak/household/issues/306)) — `scripts/backup-database.sh`, run by `household-backup.timer` on the VPS host:

1. `pg_dump -Fc` of the whole `household` database (one dump covers every service's schema — they
   all live in the same Postgres instance, schema-per-service).
2. Shipped to Cloudflare R2 through an rclone `crypt` remote — encrypted client-side before
   anything leaves the box, since the dump carries bank connection metadata and user emails.
3. `scripts/prune-backups.sh` keeps ~7 daily + ~4 weekly copies (grandfather-father-son), deletes
   the rest.
4. Pings a [healthchecks.io](https://healthchecks.io) URL on success. This is a dead-man's-switch,
   not just an error alert — healthchecks.io notices when the *timer stops firing entirely*, not
   only when the script errors, which is the actual "silently broken for a month" failure mode a
   backup job usually dies to.

**One-time setup on the VPS** (not automated — a deliberate manual step, same reasoning as the prod
overlay above): follow `infra/rclone/README.md` (create the R2 bucket + crypt remote) and
`infra/systemd/README.md` (install the timer). Both need a `/opt/household/.env.backup` populated
per the "Database backups" section of `.env.example`.

**Restoring:**

```bash
# Drill — restores into a scratch household_restore_check DB, never touches the live one.
scripts/restore-database.sh latest

# Real disaster recovery — restores into the live database (asks for confirmation).
scripts/restore-database.sh household-20260901T031500Z.pgdump household
```

Run the drill form periodically, not just once after setup — an untested backup is an assumption.
Point a service at `POSTGRES_DB=household_restore_check` afterward and confirm it actually boots and
serves real data; a `pg_restore` that exits 0 only proves the dump is well-formed, not that the app
works against it.

### Not yet automated

Pushes are deployed by hand (`git pull` on the server) — see [#305](https://github.com/VitaliiPoltorak/household/issues/305).

## Architecture overview

Clients (web / mobile) communicate only with the API Gateway over HTTPS/REST and WebSocket (Socket.IO, Phase 2). The Gateway validates JWT, extracts `userId` from the token, reads `X-Household-Id` from the request header, and proxies both as `X-User-Id` / `X-Household-Id` headers to downstream services. Services trust these headers and do not re-validate the JWT.

All business entities carry a `householdId` — multi-tenancy at the household level. A user can belong to multiple households.

Inter-service async communication uses Kafka. The Realtime Gateway (Phase 2) consumes Kafka events and broadcasts them to Socket.IO rooms (`household:{id}`), so all connected clients (web + mobile) see changes instantly.

See [`docs/PLAN.md`](docs/PLAN.md) for the full architecture, data model, Kafka event catalog, API endpoints, and development phases.
