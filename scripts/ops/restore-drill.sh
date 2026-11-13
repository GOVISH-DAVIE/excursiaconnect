#!/usr/bin/env bash
# The restore drill (deploy.md, Backups and recovery; docs/restore-drill.md): restores a backup into a new, empty
# database, times it against the RTO, checks what came back, and writes a report. Nothing touches the live
# database; the drill's copy is dropped at the end unless KEEP=1.
#
#   DRILL_ADMIN_URL=postgresql://postgres@db-drill/postgres scripts/ops/restore-drill.sh /srv/excursia/backups/db-….dump
#
# Settings:
#   DRILL_ADMIN_URL   a server where the drill may create and drop a database (never production's own)
#   BACKUP_DIR        where to find the newest backup when no file is named
#   STORAGE_DIR_DRILL if set, the uploads tarball beside the dump is unpacked here and counted
#   RTO_MINUTES       the target (60: the PRD's RTO)
#   REPORT            where the report goes (default: printed)
#   KEEP              1 to keep the restored database for a closer look
#   PG_BIN            the folder of the PostgreSQL tools matching the server's major version
set -euo pipefail

# pg_dump writes settings its own version knows; a restore into an older server then fails on them. Use the tools
# of the server's major version (PG_BIN, for example /usr/lib/postgresql/16/bin).
[ -n "${PG_BIN:-}" ] && export PATH="$PG_BIN:$PATH"
same_major() {
  local tools server
  tools=$(pg_dump --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)*.*/\1/')
  server=$(psql --no-psqlrc -qAt --dbname="$1" -c "SHOW server_version_num" | cut -c1-2)
  if [ "$tools" != "$server" ]; then
    echo "pg_dump is version $tools but the server is $server: set PG_BIN to the server's version's tools" >&2
    exit 2
  fi
}

: "${DRILL_ADMIN_URL:?set DRILL_ADMIN_URL to a server where the drill may create a database}"
BACKUP_DIR="${BACKUP_DIR:-/srv/excursia/backups}"
RTO_MINUTES="${RTO_MINUTES:-60}"
newest() { shopt -s nullglob; local all=("$BACKUP_DIR"/db-*.dump "$BACKUP_DIR"/db-*.dump.gpg); [ ${#all[@]} -gt 0 ] && ls -1t "${all[@]}" | head -1 || true; }
DUMP="${1:-$(newest)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "no backup to restore: name one, or set BACKUP_DIR" >&2; exit 2; }

DRILL_DB="excursia_drill_$(date -u +%Y%m%d%H%M%S)"
# the drill database's URL: the admin URL with its database name swapped
DRILL_URL="$(printf '%s' "$DRILL_ADMIN_URL" | sed -E "s#/[^/?]*(\?|$)#/$DRILL_DB\1#")"
say() { printf '[drill %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
q() { psql --no-psqlrc -qAt -v ON_ERROR_STOP=1 --dbname="$1" -c "$2"; }
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then q "$DRILL_ADMIN_URL" "DROP DATABASE IF EXISTS $DRILL_DB" >/dev/null 2>&1 || true; fi
  if [ -n "${PLAIN:-}" ]; then rm -f "$PLAIN"; fi
  return 0
}
trap cleanup EXIT

same_major "$DRILL_ADMIN_URL"
t0=$(date +%s)

# 1. the backup is whole: its checksum matches
# a backup without its checksum is one whose run didn't finish: the drill fails on it
if [ ! -f "$DUMP.sha256" ]; then
  CHECKSUM="missing"
elif (cd "$(dirname "$DUMP")" && if command -v sha256sum >/dev/null; then sha256sum -c "$(basename "$DUMP").sha256"; else shasum -a 256 -c "$(basename "$DUMP").sha256"; fi) >/dev/null 2>&1; then
  CHECKSUM="matches"
else
  CHECKSUM="does not match"
fi
if [ "$CHECKSUM" != "matches" ]; then
  echo "[drill] FAIL: $(basename "$DUMP")'s checksum $CHECKSUM; not restoring it" >&2
  exit 1
fi
FILE="$DUMP"
if [[ "$DUMP" == *.gpg ]]; then
  PLAIN="$(mktemp)"
  gpg --batch --yes --output "$PLAIN" --decrypt "$DUMP"
  FILE="$PLAIN"
fi

# 2. restore into a new database
say "restoring $(basename "$DUMP") into $DRILL_DB"
q "$DRILL_ADMIN_URL" "CREATE DATABASE $DRILL_DB" >/dev/null
q "$DRILL_URL" "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS btree_gist" >/dev/null 2>&1 || true
t1=$(date +%s)
pg_restore --no-owner --no-acl --exit-on-error --jobs=4 --dbname="$DRILL_URL" "$FILE" 2> >(grep -v 'already exists' >&2 || true)
t2=$(date +%s)

# 3. what came back
TABLES=$(q "$DRILL_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
MIGRATION=$(q "$DRILL_URL" "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")
UNFINISHED=$(q "$DRILL_URL" "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")
LATEST=$(q "$DRILL_URL" "SELECT coalesce(to_char(max(at) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS \"UTC\"'), 'none') FROM audit_entry")
COUNTS=""
for t in app_user organiser event dr_application dr_staff file outbox_message audit_entry; do
  COUNTS+="| \`$t\` | $(q "$DRILL_URL" "SELECT count(*) FROM $t") |"$'\n'
done
# the rules the schema enforces came back with it: the audit log's append-only grants are re-applied on provisioning,
# but its constraints and indexes are part of the dump
CONSTRAINTS=$(q "$DRILL_URL" "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'")
INDEXES=$(q "$DRILL_URL" "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")

TARBALL="$(dirname "$DUMP")/$(basename "$DUMP" | sed -E 's/^db-/uploads-/; s/\.dump(\.gpg)?$/.tar.gz\1/')"
if [ -z "${STORAGE_DIR_DRILL:-}" ]; then
  UPLOADS="not checked (STORAGE_DIR_DRILL unset)"
elif [ ! -f "$TARBALL" ]; then
  UPLOADS="MISSING: no $(basename "$TARBALL") beside the dump"
else
  mkdir -p "$STORAGE_DIR_DRILL"
  if [[ "$TARBALL" == *.gpg ]]; then gpg --batch --decrypt "$TARBALL" | tar -xzf - -C "$STORAGE_DIR_DRILL"; else tar -xzf "$TARBALL" -C "$STORAGE_DIR_DRILL"; fi
  ON_DISK=$(find "$STORAGE_DIR_DRILL" -type f ! -name '*.part' | wc -l | tr -d ' ')
  KEPT=$(q "$DRILL_URL" "SELECT count(*) FROM file WHERE deleted_at IS NULL AND state <> 'rejected'")
  UPLOADS="$ON_DISK files unpacked; the database lists $KEPT kept"
fi
t3=$(date +%s)

TOTAL=$(( t3 - t0 ))
VERDICT=$([ $TOTAL -le $(( RTO_MINUTES * 60 )) ] && [ "$UNFINISHED" = "0" ] && [[ "$UPLOADS" != MISSING* ]] && echo "PASS" || echo "FAIL")
SIZE=$(du -h "$DUMP" | cut -f1)

report=$(cat <<EOF
## Restore drill, $(date -u +"%Y-%m-%d %H:%M UTC"): $VERDICT

- **Backup:** \`$(basename "$DUMP")\` ($SIZE), checksum $CHECKSUM
- **Restored into:** \`$DRILL_DB\` on $(printf '%s' "$DRILL_ADMIN_URL" | sed -E 's#^[a-z]+://([^@/]*@)?([^/?]*).*#\2#')
- **Time:** $(( t2 - t1 )) s to restore, $TOTAL s in all, against an RTO of $RTO_MINUTES min
- **Schema:** $TABLES tables, $CONSTRAINTS constraints, $INDEXES indexes; latest migration \`$MIGRATION\`; $UNFINISHED unfinished
- **Newest audit entry:** $LATEST (how fresh this backup is: the RPO, had it been needed)
- **Uploads:** $UPLOADS

| Table | Rows |
| --- | ---: |
$COUNTS
EOF
)
if [ -n "${REPORT:-}" ]; then printf '%s\n' "$report" >> "$REPORT"; say "report added to $REPORT"; else printf '%s\n' "$report"; fi
say "$VERDICT in $TOTAL s$([ "${KEEP:-0}" = "1" ] && echo "; kept $DRILL_DB")"
if [ "$VERDICT" = "PASS" ]; then exit 0; else exit 1; fi
