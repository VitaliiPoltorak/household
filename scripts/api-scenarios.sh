#!/usr/bin/env bash
# Runs the automated API scenario check (Newman over docs/postman/, #207)
# against a live docker-compose stack, bringing the stack up — and
# rebuilding only what actually changed — if it isn't already. Called from
# .githooks/pre-commit on every commit (#192/#208).
#
# #223: skipped entirely (stack left untouched, Docker not even required to
# be installed) when nothing staged could possibly affect API behavior —
# see the "API-relevant" check below. The maintainer decision is that when
# something IS relevant, this gate always runs — not gated on "stack
# already running" — so a documented escape hatch exists for genuine
# emergencies.
#
# Escape hatch: SKIP_API_SCENARIOS=1 git commit ...
# (strictly better than --no-verify, which also skips the unit tests)
#
# Design constraints — do not "simplify" these away without re-reading
# #207/#208, each exists because of a specific failure mode:
#   - NEVER `docker compose down` here. Leaving the stack up is what makes
#     the *next* commit fast.
#   - NEVER pass --bail to newman. It would skip the collection's Cleanup
#     folder on the first failed assertion, leaking a household + two live
#     sessions per failed run — the opposite of "cleans up after itself".
#   - NEVER pass --export-environment. It would rewrite the checked-in
#     docs/postman/household.postman_environment.json mid-commit.
#   - Only pattern-scoped Redis deletes for rate-limit keys below, NEVER
#     FLUSHALL — live sessions, the general throttler store, and invite
#     tokens all share the same Redis instance.

set -euo pipefail

if [[ "${SKIP_API_SCENARIOS:-}" == "1" ]]; then
  echo "api-scenarios: skipped (SKIP_API_SCENARIOS=1)"
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=./lib/changed-services.sh
source "$REPO_ROOT/scripts/lib/changed-services.sh"

# #223: skip the whole gate — not just the Docker rebuild — when nothing
# staged can possibly affect API behavior. A docs/README/comment-only commit
# cannot break a Newman assertion; running the full suite for it (and, worse,
# requiring Docker to even be running) is pure waste. "API-relevant" means:
# a mapped app/lib service (changed_services, same table #205's rebuild hook
# uses), OR the collection/environment itself, OR the scripts that drive this
# gate — a change to any of those genuinely needs re-verification.
STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR || true)"

# Declared unconditionally (even if left empty) — bash 3.2's `set -u`
# treats a never-assigned array as an unbound variable, even inside
# `${#arr[@]}`.
changed_targets=()
api_relevant=true
if [[ -n "$STAGED_FILES" ]]; then
  # shellcheck disable=SC2207
  changed_targets=($(printf '%s' "$STAGED_FILES" | changed_services))
  if [[ ${#changed_targets[@]} -eq 0 ]] && ! grep -qE '^(docs/postman/|scripts/)' <<<"$STAGED_FILES"; then
    api_relevant=false
  fi
fi
# No staged files at all (e.g. an unusual invocation outside a normal
# `git commit`) — stay on the safe default of running the gate.

if ! $api_relevant; then
  echo "api-scenarios: no API-relevant changes staged — skipping (stack left as-is)."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "api-scenarios: docker is not available — cannot run the API scenario gate." >&2
  echo "  Set SKIP_API_SCENARIOS=1 to bypass (not recommended — you'll skip this in CI too if you get used to it)." >&2
  exit 1
fi

# Opportunistic cache hygiene: every rebuild's `COPY . .` step invalidates
# cache for that layer onward for EVERY service (content-addressed — one
# changed byte anywhere in the build context busts it), so stale BuildKit
# layers accumulate commit over commit with nothing ever reclaiming them,
# until the Docker Desktop VM's disk fills ("no space left on device").
# Prune only cache older than 3 days — never touches running
# containers/volumes/images, so it can't undo the "leave the stack up"
# invariant above. Best-effort: a prune failure must never block a commit.
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true

RUNNING="$(docker compose ps --services --status=running 2>/dev/null || true)"

stack_incomplete=false
for svc in "${ALL_SERVICES[@]}"; do
  if ! grep -qx "$svc" <<<"$RUNNING"; then
    stack_incomplete=true
    break
  fi
done

if $stack_incomplete; then
  echo "api-scenarios: stack isn't fully up — starting it (cp .env.ci .env)…"
  cp .env.ci .env
  # No --build: if images already exist (the common case — stopped, not
  # removed) this is a fast start. A truly fresh clone with no images yet
  # still builds here (compose auto-builds a service with no image even
  # without --build), hence the generous timeout.
  docker compose up -d --wait --wait-timeout 600
elif [[ ${#changed_targets[@]} -gt 0 ]]; then
  # Stack is already up — rebuild only services whose staged sources
  # changed, so a same-service-only commit doesn't rebuild the other five.
  #
  # One service at a time, NOT `docker compose up --build svc1 svc2 …` in
  # one call — that builds them concurrently via buildx bake. On a dev
  # machine where Docker Desktop's VM is capped at a few CPUs / a couple GB
  # RAM (see `docker info`), N concurrent NestJS/tsc builds contend for that
  # tiny budget (swap pressure, not real parallelism) instead of actually
  # running in parallel, and pin the host CPU without proportionate gain
  # (#244). Sequential trades a longer per-commit wall clock for not
  # thrashing the whole machine.
  for svc in "${changed_targets[@]}"; do
    echo "api-scenarios: rebuilding ${svc} (staged changes)…"
    docker compose up -d --build --wait --wait-timeout 240 "$svc"
  done
fi

# .env is guaranteed to exist by this point (either just copied from
# .env.ci above, or it already existed — compose refuses to boot without
# it). Source it so E2E_* overrides (if a developer customized their local
# .env) reach both this script and the Newman invocation below.
set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env"
set +a

echo "api-scenarios: clearing auth rate-limit keys (email-rl:*, auth-rl:*)…"
docker compose exec -T redis sh -c \
  "redis-cli --scan --pattern 'email-rl:*' | xargs -r redis-cli del; \
   redis-cli --scan --pattern 'auth-rl:*'  | xargs -r redis-cli del" \
  >/dev/null

echo "api-scenarios: seeding E2E users…"
docker compose exec -T auth-service node scripts/seed-e2e-user.js

echo "api-scenarios: running Newman…"
pnpm test:postman -- \
  --env-var "userEmail=${E2E_EMAIL:-e2e-owner@household.local}" \
  --env-var "userPassword=${E2E_PASSWORD:-E2eScenario!Passw0rd}" \
  --env-var "inviteeEmail=${E2E_INVITEE_EMAIL:-e2e-invitee@household.local}"
