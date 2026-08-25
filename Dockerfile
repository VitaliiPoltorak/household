# syntax=docker/dockerfile:1
#
# Multi-stage Dockerfile for any Nest service in the monorepo.
# Compose passes SERVICE=<name> per service so one Dockerfile serves all.
#
# Layout after Nest CLI build (tsconfig baseUrl=../..):
#   apps/<service>/dist/apps/<service>/src/main.js   ← entrypoint
#   apps/<service>/dist/libs/**                      ← compiled workspace libs
#
# Web app is intentionally NOT built here — vite dev on host gives the best
# HMR experience. See `pnpm web`.

# ─────────────────────────────────────────────────────────────
# base — pnpm-enabled Node 22 (matches CI + jsdom/undici floor)
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────
# manifests — the package.json list both `build` (needs devDeps to compile)
# and `runtime` (needs only prod deps) install from. Factored into its own
# stage so that list exists exactly once instead of duplicated per stage.
#
# Copy ONLY the manifests pnpm's workspace resolver needs — every
# package.json referenced by the lockfile, plus the lockfile itself. This is
# the whole fix: install then only invalidates when a dependency actually
# changes, not on every source edit anywhere in the monorepo. Before this
# split, `COPY . .` ran BEFORE install, so touching a single file in ANY
# service busted the cached install layer on EVERY build — full re-download,
# a fresh ~400MB layer, for a one-line source change. Multiply by 6 services
# rebuilding on every commit and that's what filled the Docker VM disk.
# No wildcard-preserving COPY in this BuildKit (COPY --parents needs a
# labs-channel frontend we don't have pulled), so each workspace member's
# package.json is listed explicitly — apps/web excluded, same as
# .dockerignore excludes it from the whole build context (built on host via
# Vite, never in these images). A new app/lib needs a line added here —
# `pnpm install` fails loudly (missing package.json) if one is forgotten, so
# this can't silently drift out of sync with pnpm-workspace.yaml.
# ─────────────────────────────────────────────────────────────
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY apps/auth-service/package.json apps/auth-service/package.json
COPY apps/finance-service/package.json apps/finance-service/package.json
COPY apps/household-service/package.json apps/household-service/package.json
COPY apps/realtime-gateway/package.json apps/realtime-gateway/package.json
COPY apps/shopping-service/package.json apps/shopping-service/package.json
COPY libs/audit/package.json libs/audit/package.json
COPY libs/common/package.json libs/common/package.json
COPY libs/contracts/package.json libs/contracts/package.json
COPY libs/database/package.json libs/database/package.json
COPY libs/kafka/package.json libs/kafka/package.json
COPY libs/locales/package.json libs/locales/package.json
COPY libs/testing/package.json libs/testing/package.json
# node-linker=hoisted flattens node_modules — required because compiled Nest
# dist resolves via classic Node lookup (walk up looking for node_modules),
# not via tsconfig paths. Without hoisting, `require('jsonwebtoken')` in a
# lib fails at runtime even though the dep is declared in libs/common.
# Scoped to the container; host dev keeps pnpm's default isolated layout.
RUN echo "node-linker=hoisted" > .npmrc

# ─────────────────────────────────────────────────────────────
# build — install ALL deps (incl. dev — needed to compile) + compile ONE
# service to dist
# ─────────────────────────────────────────────────────────────
FROM manifests AS build
ARG SERVICE
# The cache mount persists pnpm's content-addressable package store across
# ALL builds AND all 6 services (shared `id`) — a lockfile change only
# downloads what's new instead of every package, and node_modules content
# lives in the mount rather than getting baked into a disposable image
# layer every time.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# The rest of the source, brought in AFTER install. Source-only changes
# (the common case) now only invalidate this layer and the build step below
# — cheap, no network — while the install layer above stays cached.
COPY . .
RUN pnpm --filter @household/${SERVICE} build

# ─────────────────────────────────────────────────────────────
# runtime — a genuine prod-only install, plus just this one service's
# compiled output.
# ─────────────────────────────────────────────────────────────
FROM manifests AS runtime
ARG SERVICE
ENV NODE_ENV=production \
    SERVICE=${SERVICE} \
    LISTEN_HOST=0.0.0.0
# A real --prod install, not "install everything then try to strip dev
# deps back out" — pnpm has no reliable command for the latter (the
# previous approach here, `pnpm --filter X... prune --prod`, isn't a real
# pnpm command; it silently failed with "Unknown option: 'recursive'" and
# was swallowed by `|| true`, meaning every image had shipped every
# service's full devDependencies — jest, eslint, ts-node, the works — the
# whole time). Same cache mount as `build`, so this is a fast cache hit,
# not a slow re-download.
#
# This instruction (and its inputs, from `manifests`) is byte-identical
# regardless of ${SERVICE}, so unlike the old `COPY --from=build /app ./`
# (which bundled this same node_modules together with that one service's
# unique dist/ output into a single per-service layer, defeating sharing),
# this node_modules layer is genuinely shared across all 6 final images —
# fixed ~2.8GB of pure duplication measured across the 6 running images
# (`docker system df -v`: ~470MB "unique" per image, mostly this).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/${SERVICE}/dist ./apps/${SERVICE}/dist

# scripts/seed-e2e-user.js runs inside the auth-service container (`docker
# compose exec auth-service node scripts/seed-e2e-user.js`, see
# api-scenarios.sh) — the old `COPY --from=build /app ./` carried the whole
# build context along for free, but the scoped copy above doesn't. Copying
# it into every service's image (not just auth-service's) keeps this one
# instruction service-agnostic like the rest of this stage — the file is a
# few KB and content-identical across builds, so it's a shared layer too.
COPY scripts/seed-e2e-user.js ./scripts/seed-e2e-user.js

# Entrypoint resolved at runtime — one CMD for every service. sh -c because
# CMD-exec-form can't expand env vars.
CMD ["sh", "-c", "node apps/${SERVICE}/dist/apps/${SERVICE}/src/main.js"]
