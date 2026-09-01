#!/usr/bin/env bash
# Grandfather-father-son pruning for household-backup dumps on an rclone
# remote (#306). Keeps the newest N dumps unconditionally (the daily tier),
# then walks the rest keeping the newest dump from each of the next M
# distinct ISO weeks (the weekly tier), and deletes everything else.
#
# A plain S3/R2 lifecycle rule can only expire objects after a fixed age —
# it cannot express "keep 7 daily + 4 weekly", which needs the actual
# filename timestamps to decide what to keep, hence this script instead of
# a bucket lifecycle policy.
#
# Usage: prune-backups.sh <rclone-remote-path> <retain-daily> <retain-weekly>
#
# Requires GNU date (`date -d`) — true on the Debian/Ubuntu VPS this targets;
# not portable to macOS's BSD date without coreutils' `gdate`.
set -euo pipefail

REMOTE="${1:?usage: prune-backups.sh <remote-path> <retain-daily> <retain-weekly>}"
RETAIN_DAILY="${2:?}"
RETAIN_WEEKLY="${3:?}"

# One filename per line, newest first: household-20260901T031500Z.pgdump
mapfile -t FILES < <(rclone lsf "$REMOTE" --files-only 2>/dev/null \
  | grep -E '^household-[0-9]{8}T[0-9]{6}Z\.pgdump$' | sort -r)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "prune-backups: no dumps found at ${REMOTE}, nothing to do"
  exit 0
fi

KEEP=()

# Tier 1: newest RETAIN_DAILY dumps, unconditionally kept.
for ((i = 0; i < ${#FILES[@]} && i < RETAIN_DAILY; i++)); do
  KEEP+=("${FILES[$i]}")
done

# Tier 2: from the remainder (oldest-first order doesn't matter here, we
# just need "newest per week"), keep the first dump encountered for each of
# the next RETAIN_WEEKLY distinct ISO weeks — FILES is newest-first, so the
# first one seen per week is that week's newest.
declare -A SEEN_WEEK
WEEKS_KEPT=0
for ((i = RETAIN_DAILY; i < ${#FILES[@]}; i++)); do
  [[ $WEEKS_KEPT -ge $RETAIN_WEEKLY ]] && break
  f="${FILES[$i]}"
  ts="${f#household-}"
  ts="${ts%.pgdump}"                    # 20260901T031500Z
  d="${ts:0:4}-${ts:4:2}-${ts:6:2}"     # 2026-09-01
  week="$(date -u -d "$d" +%G-W%V)"
  if [[ -z "${SEEN_WEEK[$week]:-}" ]]; then
    SEEN_WEEK["$week"]=1
    KEEP+=("$f")
    # NOT `((WEEKS_KEPT++))` — under `set -e`, a postfix `((x++))` whose
    # PRE-increment value is 0 (i.e. the very first match) returns exit
    # status 1 and aborts the script right here. Plain arithmetic
    # assignment doesn't have that trap.
    WEEKS_KEPT=$((WEEKS_KEPT + 1))
  fi
done

is_kept() {
  local target="$1" k
  for k in "${KEEP[@]}"; do
    [[ "$k" == "$target" ]] && return 0
  done
  return 1
}

DELETED=0
for f in "${FILES[@]}"; do
  if ! is_kept "$f"; then
    echo "  pruning ${f}"
    rclone delete "${REMOTE}/${f}"
    DELETED=$((DELETED + 1))   # see the WEEKS_KEPT comment above
  fi
done

echo "==> kept ${#KEEP[@]}, pruned ${DELETED}"
