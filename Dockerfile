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
# Copy workspace manifests + source. We copy the whole tree because pnpm
# workspace resolution needs every package.json referenced in the lockfile.
# .dockerignore trims node_modules / dist / tests to keep context small.
COPY . .
# node-linker=hoisted flattens node_modules — required because compiled Nest
# dist resolves via classic Node lookup (walk up looking for node_modules),
# not via tsconfig paths. Without hoisting, `require('jsonwebtoken')` in a
# lib fails at runtime even though the dep is declared in libs/common.
# Scoped to the container; host dev keeps pnpm's default isolated layout.
RUN echo "node-linker=hoisted" > .npmrc
RUN pnpm install --frozen-lockfile
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
