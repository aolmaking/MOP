#!/usr/bin/env bash
#
# One dated backup of a MOP database.
#
# M-10 asks for a nightly dump and one scripted restore drill actually
# executed. This is the dump half. It is deliberately boring: custom
# format (so `pg_restore` can rebuild selectively), one file per run,
# named by database and UTC timestamp, and a checksum beside it so a
# silently truncated backup is a detectable one rather than a surprise
# on the worst day of the year.
#
# It does NOT rotate, encrypt or ship offsite. Those need a host and a
# place to ship to, which B-002 does not have -- see tools/staging/README.md.
#
#   tools/staging/backup.sh [database] [destination]
set -euo pipefail

PGBIN="${PGBIN:-E:/mop-fleet/pg/pgsql/bin}"
DB="${1:-mop_platform_dev}"
DEST="${2:-E:/mop-fleet/backups}"
PGUSER="${PGUSER:-mop_dev}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-mop_dev_secret}"

mkdir -p "$DEST"

# UTC, not local. The database is pinned to UTC (F-003) and a backup
# named in a shifting local time is a backup nobody can order correctly
# across a daylight-saving boundary.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DEST/$DB-$STAMP.dump"

echo "backing up $DB -> $FILE"
"$PGBIN/pg_dump.exe" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -Fc -f "$FILE"

# Written next to the dump rather than into a manifest: a checksum that
# lives somewhere else is a checksum that goes missing separately.
sha256sum "$FILE" > "$FILE.sha256"

BYTES=$(wc -c < "$FILE")
if [ "$BYTES" -lt 1024 ]; then
  echo "backup is only $BYTES bytes -- refusing to call that a backup" >&2
  exit 1
fi

echo "ok: $BYTES bytes, sha256 recorded"
echo "$FILE"
