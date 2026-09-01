#!/usr/bin/env bash
# Restores a household-backup dump into a Postgres database (#306).
#
# Defaults to a SEPARATE target database (household_restore_check), never
# the live one — the whole point of a restore drill is proving a dump is
# usable without touching production data. Pass TARGET_DB=household
# explicitly for a genuine disaster-recovery restore.
#
# Usage:
#   restore-database.sh <dump-name|latest> [target-db]
#
# Examples:
#   restore-database.sh latest                              # drill, scratch DB
#   restore-database.sh household-20260901T031500Z.pgdump household
#                                                             # real DR restore
set -euo pipefail

DUMP_ARG="${1:?usage: restore-database.sh <dump-name|latest> [target-db]}"
TARGET_DB="${2:-household_restore_check}"

CONTAINER="${POSTGRES_CONTAINER:-household-postgres}"
DB_USER="${POSTGRES_USER:-household}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-r2-crypt:household-backups}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ "$DUMP_ARG" == "latest" ]]; then
  DUMP_NAME="$(rclone lsf "$RCLONE_REMOTE" --files-only \
    | grep -E '^household-[0-9]{8}T[0-9]{6}Z\.pgdump$' | sort -r | head -n1)"
  [[ -n "$DUMP_NAME" ]] || { echo "restore-database: no dumps found at ${RCLONE_REMOTE}" >&2; exit 1; }
else
  DUMP_NAME="$DUMP_ARG"
fi

DUMP_PATH="${TMP_DIR}/${DUMP_NAME}"
echo "==> Fetching ${DUMP_NAME} from ${RCLONE_REMOTE}"
rclone copyto "${RCLONE_REMOTE}/${DUMP_NAME}" "$DUMP_PATH"

if [[ "$TARGET_DB" == "household" ]]; then
  read -r -p "This will DROP AND RECREATE the live 'household' database. Type the database name to confirm: " CONFIRM
  [[ "$CONFIRM" == "household" ]] || { echo "restore-database: confirmation mismatch, aborting" >&2; exit 1; }
fi

echo "==> Recreating ${TARGET_DB} on ${CONTAINER}"
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";" \
  -c "CREATE DATABASE \"${TARGET_DB}\" OWNER \"${DB_USER}\";"

echo "==> Restoring into ${TARGET_DB}"
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$TARGET_DB" \
  --no-owner --no-privileges --exit-on-error < "$DUMP_PATH"

echo "==> Restore complete: ${DUMP_NAME} -> ${TARGET_DB}"
echo "    Point a service at POSTGRES_DB=${TARGET_DB} and confirm it boots and"
echo "    serves real data before trusting this backup — see README.md ->"
echo "    Deployment -> Database backups -> \"Testing a restore\"."
