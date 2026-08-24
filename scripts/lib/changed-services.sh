#!/usr/bin/env bash
# Shared "which files map to which docker-compose service" table (#208).
# Single source of truth so scripts/rebuild-touched-services.sh and
# scripts/api-scenarios.sh can't drift into two different mappings.
#
# Source this file, then call `changed_services` with a newline-separated
# list of changed file paths on stdin — it prints affected service names,
# one per line, deduped and sorted. A change under libs/, docker-compose.yml,
# Dockerfile, root package.json, or pnpm-lock.yaml maps to EVERY service
# (they all share the base image / shared libs), not just the touched one.
#
# This file only computes "which services are affected" — it has no opinion
# on what to do about it. That policy differs by caller:
#   - rebuild-touched-services.sh: best-effort, only touches services
#     already running, always exits 0 (called from post-merge/post-checkout,
#     must never block the git operation).
#   - api-scenarios.sh: starts the whole stack if it's not up at all,
#     otherwise rebuilds only what changed, and propagates failure (#192
#     scenario gate).
#
# bash 3.2 compatible on purpose — that's what ships as /bin/bash on macOS,
# and this repo's other hook scripts target it (no mapfile/readarray).

ALL_SERVICES=(
  api-gateway
  auth-service
  household-service
  finance-service
  shopping-service
  realtime-gateway
)

changed_services() {
  local files
  files="$(cat)"
  if [[ -z "$files" ]]; then
    return 0
  fi

  local targets=()
  local rebuild_all=false

  while IFS= read -r file; do
    case "$file" in
      libs/*|Dockerfile|docker-compose.yml|package.json|pnpm-lock.yaml)
        rebuild_all=true
        ;;
      apps/*)
        local svc="${file#apps/}"
        svc="${svc%%/*}"
        for known in "${ALL_SERVICES[@]}"; do
          if [[ "$svc" == "$known" ]]; then
            targets+=("$svc")
            break
          fi
        done
        ;;
    esac
  done <<<"$files"

  if $rebuild_all; then
    printf '%s\n' "${ALL_SERVICES[@]}"
  elif [[ ${#targets[@]} -gt 0 ]]; then
    # shellcheck disable=SC2207
    targets=($(printf '%s\n' "${targets[@]}" | sort -u))
    printf '%s\n' "${targets[@]}"
  fi
}
