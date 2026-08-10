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

# All backend services declared in docker-compose.yml. The web app runs
# via `pnpm --filter @household/web dev` on the host (not dockerized),
# so it is intentionally excluded.
ALL_SERVICES=(
  api-gateway
  auth-service
  household-service
  finance-service
  shopping-service
  realtime-gateway
)

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

# Decide the target set:
# - Any change under libs/, docker-compose.yml, Dockerfile, root
#   package.json, or pnpm-lock.yaml → rebuild every running backend
#   service (they all depend on the shared libs / base image).
# - Change under apps/<name>/ where <name> is in ALL_SERVICES → add
#   that service to the target set.
targets=()
rebuild_all=false

while IFS= read -r file; do
  case "$file" in
    libs/*|Dockerfile|docker-compose.yml|package.json|pnpm-lock.yaml)
      rebuild_all=true
      ;;
    apps/*)
      # apps/<name>/...
      svc="${file#apps/}"
      svc="${svc%%/*}"
      for known in "${ALL_SERVICES[@]}"; do
        if [[ "$svc" == "$known" ]]; then
          targets+=("$svc")
          break
        fi
      done
      ;;
  esac
done <<<"$CHANGED_FILES"

if $rebuild_all; then
  # Intersect ALL_SERVICES with what's actually running.
  targets=()
  for svc in "${ALL_SERVICES[@]}"; do
    if grep -qx "$svc" <<<"$RUNNING"; then
      targets+=("$svc")
    fi
  done
else
  # Dedupe + keep only running ones.
  if [[ ${#targets[@]} -eq 0 ]]; then
    exit 0
  fi
  # shellcheck disable=SC2207
  targets=($(printf '%s\n' "${targets[@]}" | sort -u))
  filtered=()
  for svc in "${targets[@]}"; do
    if grep -qx "$svc" <<<"$RUNNING"; then
      filtered+=("$svc")
    fi
  done
  targets=("${filtered[@]}")
fi

if [[ ${#targets[@]} -eq 0 ]]; then
  exit 0
fi

echo "→ Docker: rebuilding ${targets[*]} (changed files trigger auto-rebuild)" >&2
if ! docker compose up -d --build "${targets[@]}" 1>&2; then
  echo "⚠️  docker compose up -d --build failed for: ${targets[*]}" >&2
  echo "    Fix manually and re-run: docker compose up -d --build ${targets[*]}" >&2
fi

exit 0
