#!/usr/bin/env bash
# Nightly Postgres backup for production (#306). Runs on the VPS HOST (not
# inside a container) via household-backup.timer — see infra/systemd/.
#
# Flow: pg_dump inside the running postgres container (custom format, one
# file covers every service's schema since they all live in one `household`
# database) -> ship off-box via rclone through an encrypting "crypt" remote
# (client-side AES before anything leaves the box — the dump carries bank
# connection metadata and user emails) -> prune old copies -> ping
# healthchecks.io as a dead-man's-switch.
#
# The dead-man's-switch (not just "alert if the script errors") is the
# point: a cron job that stops firing entirely produces no error to catch,
# which is exactly the silent-failure mode #306 called out as "the classic
# way this gap survives having been fixed". healthchecks.io notices the
# ABSENCE of a ping within its configured grace period, not just a
# failure ping.
#
# Requires on the host: docker, rclone (configured per infra/rclone/README.md).
# Env: see the "Database backups" section in .env.example.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-household-postgres}"
DB_USER="${POSTGRES_USER:-household}"
DB_NAME="${POSTGRES_DB:-household}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-r2-crypt:household-backups}"
RETAIN_DAILY="${BACKUP_RETAIN_DAILY:-7}"
RETAIN_WEEKLY="${BACKUP_RETAIN_WEEKLY:-4}"
HEALTHCHECK_URL="${BACKUP_HEALTHCHECK_URL:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="household-${TIMESTAMP}.pgdump"
TMP_DIR="$(mktemp -d)"
DUMP_PATH="${TMP_DIR}/${DUMP_NAME}"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# Pings the /fail endpoint before exiting non-zero, so a genuine error (as
# opposed to the job never running at all) alerts immediately rather than
# waiting out the grace period. Best-effort — a ping failure must never mask
# the real error via set -e.
fail() {
  echo "backup-database: $*" >&2
  if [[ -n "$HEALTHCHECK_URL" ]]; then
    curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}/fail" || true
  fi
  exit 1
}
trap 'fail "unexpected error at line $LINENO"' ERR

if [[ -z "$HEALTHCHECK_URL" ]]; then
  echo "backup-database: WARNING — BACKUP_HEALTHCHECK_URL is unset, a failed" \
    "or silently-stopped backup job will NOT alert anyone. See README.md ->" \
    "Deployment -> Database backups." >&2
fi

echo "==> Dumping ${DB_NAME} from ${CONTAINER} (custom format, all schemas)"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_PATH"

[[ -s "$DUMP_PATH" ]] || fail "dump is empty"

echo "==> Shipping to ${RCLONE_REMOTE} (client-side encrypted via the crypt remote)"
rclone copyto "$DUMP_PATH" "${RCLONE_REMOTE}/${DUMP_NAME}"

echo "==> Pruning old backups (keep ${RETAIN_DAILY} daily + ${RETAIN_WEEKLY} weekly)"
"$SCRIPT_DIR/prune-backups.sh" "$RCLONE_REMOTE" "$RETAIN_DAILY" "$RETAIN_WEEKLY"

if [[ -n "$HEALTHCHECK_URL" ]]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL" || true
fi

echo "==> Backup complete: ${DUMP_NAME}"
