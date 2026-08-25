#!/usr/bin/env bash
# Rebuilds and restarts only the Docker Compose services whose sources
# changed between two git refs, and only if those services are currently
# running. Called by .githooks/post-merge and .githooks/post-checkout.
#
# Usage: rebuild-touched-services.sh <old_sha> <new_sha>
#
# Exits 0 always — a rebuild failure must not block the git operation
# that triggered it. Errors are surfaced via stderr.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib/changed-services.sh
source "$REPO_ROOT/scripts/lib/changed-services.sh"

OLD="${1:-}"
NEW="${2:-HEAD}"

# No baseline (e.g. first checkout on a fresh clone) → nothing to compare.
if [[ -z "$OLD" || "$OLD" == "0000000000000000000000000000000000000000" ]]; then
  exit 0
fi

# No range → identical commits, nothing changed.
if [[ "$OLD" == "$NEW" ]]; then
  exit 0
fi

# Skip if the user isn't running the compose stack. Faster than shelling
# out to `docker compose ps` when Docker isn't even installed.
if ! command -v docker >/dev/null 2>&1; then
  exit 0
fi

# Find the compose project's currently running services. If none of ours
# are up, there is nothing to do.
RUNNING=$(docker compose ps --services --status=running 2>/dev/null || true)
if [[ -z "$RUNNING" ]]; then
  exit 0
fi

CHANGED_FILES=$(git diff --name-only "$OLD" "$NEW" 2>/dev/null || true)
if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

# shellcheck disable=SC2207
affected=($(printf '%s' "$CHANGED_FILES" | changed_services))
if [[ ${#affected[@]} -eq 0 ]]; then
  exit 0
fi

# Intersect the affected set with what's actually running — this script
# never starts a service that wasn't already up.
targets=()
for svc in "${affected[@]}"; do
  if grep -qx "$svc" <<<"$RUNNING"; then
    targets+=("$svc")
  fi
done

if [[ ${#targets[@]} -eq 0 ]]; then
  exit 0
fi

echo "→ Docker: rebuilding ${targets[*]} (changed files trigger auto-rebuild)" >&2
# One service at a time — building several NestJS services concurrently via
# buildx bake overwhelms a Docker Desktop VM with only a few CPUs / a couple
# GB RAM (swap pressure instead of real parallelism, #244). A failure on one
# service must not skip rebuilding the rest.
failed=()
for svc in "${targets[@]}"; do
  if ! docker compose up -d --build "$svc" 1>&2; then
    failed+=("$svc")
  fi
done
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "⚠️  docker compose up -d --build failed for: ${failed[*]}" >&2
  echo "    Fix manually and re-run: docker compose up -d --build ${failed[*]}" >&2
fi

exit 0
