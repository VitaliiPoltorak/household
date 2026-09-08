#!/usr/bin/env bash
# Rolls one or more services back to the image they were running before the
# last deploy, without rebuilding anything (#318).
#
# Usage:
#   scripts/rollback.sh [--list] [--yes] [service ...]
#
#   --list   Show what would be rolled back and exit. Safe to run any time.
#   --yes    Skip the confirmation prompt. Required when stdin is not a TTY
#            (the Rollback workflow passes it); without it a non-interactive
#            run aborts rather than guessing.
#   service  One or more compose service names. Default: every service that
#            actually has something to roll back to.
#
# Counterpart to scripts/rebuild-touched-services.sh, which is what creates
# the household/<svc>:previous tags this script consumes. Nothing here builds,
# pulls or touches the database — it is a tag swap plus a container recreate,
# so it completes in seconds rather than the minutes a rebuild costs on a
# 2-vCPU box. That speed is the whole point: `git revert` + push already
# worked, it just meant a full rebuild cycle of broken production.
#
# READ THIS BEFORE ROLLING BACK ACROSS A MIGRATION
# ------------------------------------------------
# Every service runs `migrationsRun: true` at boot, so a deploy migrates the
# database on the way up — and rolling the IMAGE back does not roll the SCHEMA
# back. TypeORM only ever runs *pending* migrations; it will not undo one.
# The rolled-back image therefore meets a schema newer than itself:
#
#   Additive migration (new table, new nullable column, new index)
#     -> safe. The old code does not know the new column exists and ignores it.
#
#   Destructive or tightening migration (dropped or renamed column, a column
#   made NOT NULL, a narrowed type, a changed enum)
#     -> NOT safe. The old code writes to something that is gone, or omits a
#        column the database now requires, and fails at runtime — often only
#        on the specific endpoint that touches it, so it can look healthy.
#
# If the deploy you are undoing carried a destructive migration, an image
# rollback alone is not enough: restore the database too (scripts/
# restore-database.sh, #306) or write and run a down-migration first. Check
# what shipped before deciding:
#
#   git log --oneline -1 && git diff --name-only HEAD~1 -- '*/migrations/*'
#
# bash 3.2 compatible on purpose — same constraint as the other scripts here
# (no mapfile/readarray).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# ALL_SERVICES lives there, so the set of rollable services cannot drift from
# the set the rebuild path knows about.
# shellcheck source=./lib/changed-services.sh
source "$REPO_ROOT/scripts/lib/changed-services.sh"

LIST_ONLY=false
ASSUME_YES=false
requested=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) LIST_ONLY=true; shift;;
    --yes|-y) ASSUME_YES=true; shift;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0;;
    -*) echo "rollback: unknown option '$1'" >&2; exit 2;;
    *) requested+=("$1"); shift;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "rollback: docker is not installed" >&2
  exit 1
fi

# Validate any explicitly named services against the known set, so a typo
# fails loudly instead of silently rolling back nothing.
candidates=()
if [[ ${#requested[@]} -gt 0 ]]; then
  for svc in "${requested[@]}"; do
    known=false
    for s in "${ALL_SERVICES[@]}"; do
      [[ "$svc" == "$s" ]] && known=true && break
    done
    if ! $known; then
      echo "rollback: '$svc' is not one of: ${ALL_SERVICES[*]}" >&2
      exit 2
    fi
    candidates+=("$svc")
  done
else
  candidates=("${ALL_SERVICES[@]}")
fi

img_id() { docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true; }
img_created() { docker image inspect --format '{{.Created}}' "$1" 2>/dev/null | cut -c1-19 || true; }
# 12 hex chars — the same short form `docker images` prints, so the ids here
# can be matched against it by eye during an incident.
short() { printf '%.12s' "${1#sha256:}"; }

# Work out what is actually rollable. A service is skipped when it has no
# :previous tag (never rebuilt since #318 landed) or when :previous and
# :latest are already the same image (the last build failed, or this is a
# second rollback in a row) — both are no-ops, not errors.
targets=()
printf '%-22s %-12s %-19s   %-12s %-19s\n' "SERVICE" "CURRENT" "BUILT" "PREVIOUS" "BUILT"
printf -- '-%.0s' $(seq 1 72); echo
for svc in "${candidates[@]}"; do
  cur="$(img_id "household/$svc:latest")"
  prev="$(img_id "household/$svc:previous")"
  if [[ -z "$prev" ]]; then
    printf '%-22s %-12s %-19s   (no :previous tag — nothing to roll back to)\n' \
      "$svc" "$(short "$cur")" "$(img_created "household/$svc:latest")"
    continue
  fi
  if [[ "$cur" == "$prev" ]]; then
    printf '%-22s %-12s %-19s   (already running the previous image)\n' \
      "$svc" "$(short "$cur")" "$(img_created "household/$svc:latest")"
    continue
  fi
  printf '%-22s %-12s %-19s -> %-12s %-19s\n' \
    "$svc" "$(short "$cur")" "$(img_created "household/$svc:latest")" \
    "$(short "$prev")" "$(img_created "household/$svc:previous")"
  targets+=("$svc")
done
echo

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "rollback: nothing to do."
  exit 0
fi

if $LIST_ONLY; then
  echo "rollback: --list given, stopping here. Re-run without it to apply."
  exit 0
fi

if ! $ASSUME_YES; then
  if [[ ! -t 0 ]]; then
    echo "rollback: refusing to roll back non-interactively without --yes." >&2
    exit 2
  fi
  echo "This recreates ${#targets[@]} container(s) from the images above."
  echo "Read the migration warning at the top of this script if the deploy you"
  echo "are undoing changed the database schema."
  printf 'Roll back %s? [y/N] ' "${targets[*]}"
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "rollback: aborted."; exit 1;;
  esac
fi

failed=()
for svc in "${targets[@]}"; do
  echo "→ rolling back $svc" >&2
  # Keep the image being replaced reachable by name. Without this it goes
  # dangling the moment :latest moves, and rolling FORWARD again (because the
  # new version turned out to be fine and the real fault was elsewhere) would
  # mean digging a digest out of `docker images -a` under time pressure.
  docker image tag "household/$svc:latest" "household/$svc:rolled-back" 2>/dev/null || true
  docker image tag "household/$svc:previous" "household/$svc:latest"

  # --no-deps so this touches exactly the named service and never restarts
  # postgres/redis/kafka underneath a running stack. --wait turns "the old
  # image also fails to come up" into a non-zero exit instead of a lie.
  if ! docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 "$svc" 1>&2; then
    failed+=("$svc")
  fi
done

echo
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "⚠️  rollback: these services did not come up healthy: ${failed[*]}" >&2
  echo "    Their images were still swapped. Check: docker compose logs --tail=50 ${failed[*]}" >&2
  exit 1
fi

echo "✔ rolled back: ${targets[*]}"
echo
echo "To roll forward again (the rolled-back version was not the problem):"
for svc in "${targets[@]}"; do
  echo "  docker image tag household/$svc:rolled-back household/$svc:latest"
done
echo "  docker compose up -d --no-deps --force-recreate --wait ${targets[*]}"
echo
echo "To make the rollback permanent, revert the commit on main — otherwise the"
echo "next deploy rebuilds the same broken code straight back over :latest."
