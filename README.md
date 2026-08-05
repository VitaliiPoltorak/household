# Household

Family finance & shopping management — NestJS microservices monorepo.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS + TypeScript, pnpm workspaces + Turborepo |
| Database | PostgreSQL 16 (schema-per-service) |
| Cache / Sessions | Redis 7 |
| Message bus | Apache Kafka (KRaft) |
| Real-time | Socket.IO |
| Web | React 18 + Vite 5 + TanStack Query + Tailwind CSS |
| i18n | react-i18next, shared `libs/locales` (en / uk / de / es) |
| Mobile | React Native / Expo (Phase 5) |

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
docker compose up -d
```

This starts PostgreSQL (5432), Redis (6379), Kafka (9092), Kafka UI (8081), Adminer (8080).

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

Dev tools:

| Tool | URL |
|------|-----|
| Adminer (DB UI) | http://localhost:8080 |
| Kafka UI | http://localhost:8081 |

## Environment variables

Copy `.env.example` to `.env`. Values marked **required** must be set before any service will start.

```bash
# ── Application ──────────────────────────────────────────────────────────────
NODE_ENV=development
API_PORT=3000

# ── PostgreSQL ────────────────────────────────────────────────────────────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=household
POSTGRES_PASSWORD=household_secret   # change in production
POSTGRES_DB=household

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_SECRET=change-me-in-production   # required — any long random string
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES_DAYS=30

# ── Auth Service ──────────────────────────────────────────────────────────────
AUTH_SERVICE_PORT=3001

# Google OAuth (see "Google OAuth setup" section below for full instructions)
GOOGLE_CLIENT_ID=                    # required for Google login

# Apple Sign In — https://developer.apple.com → Certificates, IDs & Profiles
APPLE_CLIENT_ID=                     # required for Apple login (App Store mandatory)

# Facebook OAuth — https://developers.facebook.com → My Apps
# (optional — Facebook login not required for App Store)

# ── Service Ports ─────────────────────────────────────────────────────────────
HOUSEHOLD_SERVICE_PORT=3002
FINANCE_SERVICE_PORT=3003

# ── Kafka ─────────────────────────────────────────────────────────────────────
KAFKA_BROKERS=localhost:9092

# ── Service URLs (used by API Gateway for proxying) ───────────────────────────
AUTH_SERVICE_URL=http://localhost:3001
HOUSEHOLD_SERVICE_URL=http://localhost:3002
FINANCE_SERVICE_URL=http://localhost:3003
SHOPPING_SERVICE_URL=http://localhost:3004

# ── Rate Limiting ─────────────────────────────────────────────────────────────
THROTTLE_TTL=60       # window in seconds
THROTTLE_LIMIT=100    # max requests per window per IP
```

## Development commands

```bash
pnpm build                  # build all packages
pnpm dev                    # start all backend services in watch mode
pnpm lint                   # lint all packages
pnpm test                   # run all tests
pnpm format                 # prettier format

# Web app
pnpm --filter @household/web dev          # start dev server
pnpm --filter @household/web test:run     # run Vitest integration tests (27 tests, no Docker needed)
pnpm --filter @household/web test:ui      # Vitest UI

# Backend integration tests (requires docker compose up -d)
pnpm --filter @household/finance-service test:integration
pnpm --filter @household/shopping-service test:integration

# Unit tests (no Docker needed)
pnpm --filter @household/api-gateway test:unit

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

The web app has 27 integration tests using **Vitest + @testing-library/react + MSW** (Mock Service Worker intercepts fetch at the network level). No Docker needed.

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
