#!/usr/bin/env bash
#
# The restore drill.
#
# A backup nobody has restored is a guess with good intentions. This
# takes a dump, rebuilds it into a throwaway database, and then checks
# that the rebuilt copy actually contains the workshop -- not merely
# that `pg_restore` exited zero, which it will happily do for a schema
# with no rows in it.
#
# Times the restore and prints it, because "how long are we down for"
# is the question a drill exists to answer.
#
#   tools/staging/restore-drill.sh <dump-file> [scratch-db]
set -euo pipefail

PGBIN="${PGBIN:-E:/mop-fleet/pg/pgsql/bin}"
DUMP="${1:?usage: restore-drill.sh <dump-file> [scratch-db]}"
SCRATCH="${2:-mop_restore_drill}"
PGUSER="${PGUSER:-mop_dev}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-mop_dev_secret}"

psql_scratch() { "$PGBIN/psql.exe" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SCRATCH" -tAc "$1"; }
psql_admin()   { "$PGBIN/psql.exe" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres  -tAc "$1"; }

echo "== restore drill =="
echo "dump:    $DUMP"
echo "scratch: $SCRATCH"

# Integrity first. Restoring a corrupted dump and finding out from a
# constraint error halfway through is the slowest possible way to learn it.
if [ -f "$DUMP.sha256" ]; then
  echo "-- verifying checksum"
  sha256sum -c "$DUMP.sha256"
else
  echo "-- no checksum beside this dump; continuing, but that is a gap" >&2
fi

echo "-- dropping and recreating $SCRATCH"
psql_admin "DROP DATABASE IF EXISTS $SCRATCH;" > /dev/null
psql_admin "CREATE DATABASE $SCRATCH OWNER $PGUSER;" > /dev/null

echo "-- restoring"
START=$(date -u +%s)
# --exit-on-error: a partial restore that reports success is exactly the
# failure this drill exists to catch.
"$PGBIN/pg_restore.exe" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SCRATCH" --exit-on-error --no-owner "$DUMP"
END=$(date -u +%s)
SECONDS_TAKEN=$((END - START))

echo "-- verifying the restored copy holds a real workshop"
TABLES=$(psql_scratch "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
TENANTS=$(psql_scratch "SELECT count(*) FROM tenants;")
ACCOUNTS=$(psql_scratch "SELECT count(*) FROM accounts;")
WORK_ORDERS=$(psql_scratch "SELECT count(*) FROM work_orders;")
MIGRATIONS=$(psql_scratch "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")

echo "tables=$TABLES tenants=$TENANTS accounts=$ACCOUNTS work_orders=$WORK_ORDERS migrations=$MIGRATIONS"

# Schema alone is not a restore. A dump that rebuilt 78 empty tables
# would pass every check above except this one.
FAILED=0
[ "$TABLES"   -ge 70 ] || { echo "FAIL: only $TABLES tables restored"        >&2; FAILED=1; }
[ "$TENANTS"  -ge 1  ] || { echo "FAIL: no tenants in the restored copy"     >&2; FAILED=1; }
[ "$ACCOUNTS" -ge 1  ] || { echo "FAIL: no accounts in the restored copy"    >&2; FAILED=1; }
[ "$MIGRATIONS" -ge 1 ] || { echo "FAIL: migration history did not restore"  >&2; FAILED=1; }

echo "-- restore took ${SECONDS_TAKEN}s"

if [ "$FAILED" -ne 0 ]; then
  echo "DRILL FAILED" >&2
  exit 1
fi

echo "DRILL PASSED -- restored in ${SECONDS_TAKEN}s"
echo "scratch database $SCRATCH left in place for inspection; drop it when done"
