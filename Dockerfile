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
# build — install ALL deps + compile ONE service to dist
# ─────────────────────────────────────────────────────────────
FROM base AS build
ARG SERVICE
# Copy ONLY the manifests pnpm's workspace resolver needs first — every
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
# runtime — copy built workspace, drop dev deps
# ─────────────────────────────────────────────────────────────
FROM base AS runtime
ARG SERVICE
ENV NODE_ENV=production \
    SERVICE=${SERVICE} \
    LISTEN_HOST=0.0.0.0
# Copy the whole built workspace. `pnpm prune --prod` then removes dev deps.
# Simpler + smaller final image than the alternative (re-installing --prod
# from scratch, which has to re-resolve every workspace symlink).
COPY --from=build /app ./
RUN pnpm --filter @household/${SERVICE}... prune --prod || true

# Entrypoint resolved at runtime — one CMD for every service. sh -c because
# CMD-exec-form can't expand env vars.
CMD ["sh", "-c", "node apps/${SERVICE}/dist/apps/${SERVICE}/src/main.js"]
