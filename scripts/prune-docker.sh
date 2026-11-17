#!/usr/bin/env bash
# Keeps the production Docker disk usage bounded (#409).
#
# Every deploy rebuilds services, and BuildKit keeps every layer it ever
# produced (content-addressed — one changed byte busts a layer and everything
# after it) until something removes them. Nothing did on the VPS: by
# 2026-11-17 the build cache alone was 66 GB on a 125 GB disk.
#
# Two things are pruned, and only these two:
#   1. BuildKit build cache, down to a size cap (default 10GB). The most
#      recently used records survive, so the next build still hits warm
#      layers and the shared pnpm store cache mount is not thrown away.
#   2. DANGLING images older than a week. Deliberately NOT `image prune -a`:
#      `-a` would also remove every tagged image no container is running,
#      which includes household/<svc>:previous — the rollback target that
#      scripts/rebuild-touched-services.sh retags before each build and
#      scripts/rollback.sh restores. Without `-a` only untagged leftovers go,
#      and a tag (:latest, :previous) keeps its layers alive.
#
# Containers and volumes are never touched.
#
# Called by .github/workflows/deploy.yml (after every deploy, best-effort) and
# by household-docker-prune.timer (weekly safety net) — see infra/systemd/.
#
# Overrides (environment):
#   DOCKER_BUILD_CACHE_KEEP   build cache size cap          (default 10GB)
#   DOCKER_IMAGE_PRUNE_AGE    minimum age of dangling images to delete
#                             (default 168h = 7 days)
set -euo pipefail

KEEP="${DOCKER_BUILD_CACHE_KEEP:-10GB}"
IMAGE_AGE="${DOCKER_IMAGE_PRUNE_AGE:-168h}"

if ! command -v docker >/dev/null 2>&1; then
  echo "prune-docker: docker is not installed" >&2
  exit 1
fi

# Docker 28+ renamed --keep-storage to --reserved-space (the old name still
# works but is deprecated). Pick whichever this daemon's CLI knows rather than
# pinning one and breaking on the next Docker upgrade.
if docker builder prune --help 2>&1 | grep -q -- '--reserved-space'; then
  CAP_FLAG="--reserved-space"
else
  CAP_FLAG="--keep-storage"
fi

echo "==> before"
docker system df

echo "==> build cache: keeping at most ${KEEP}"
docker builder prune -f "$CAP_FLAG" "$KEEP"

echo "==> dangling images older than ${IMAGE_AGE}"
docker image prune -f --filter "until=${IMAGE_AGE}"

echo "==> after"
docker system df
