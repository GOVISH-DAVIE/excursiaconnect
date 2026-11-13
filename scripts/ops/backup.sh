#!/usr/bin/env bash
# The nightly backup (deploy.md, Backups and recovery): the database as a pg_dump custom archive and the uploads as
# a tarball, each with a SHA-256 beside it, kept for 30 days. This is the second copy: the 5-minute RPO comes from
# the database's point-in-time recovery; this one is what the restore drill (restore-drill.sh) restores, and what
# survives losing the database provider.
#
#   BACKUP_DATABASE_URL=postgresql://excursia_backup@db/excursia BACKUP_DIR=/srv/excursia/backups \
#   STORAGE_DIR=/srv/excursia/uploads scripts/ops/backup.sh
#
# Settings:
#   BACKUP_DATABASE_URL  a role that can read every table (the migrator, or a backup role with pg_read_all_data)
#   BACKUP_DIR           where backups go; on another disk than the database, copied off the server daily
#   STORAGE_DIR          the uploads folder (deploy.md, STORAGE_DIR); skipped when unset
#   KEEP_DAYS            how long backups are kept (30: the privacy notice says so)
#   BACKUP_GPG_RECIPIENT if set, each file is encrypted to this key and the plain copy removed
#   PG_BIN               the folder of the PostgreSQL tools matching the server's major version
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

: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-/srv/excursia/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$BACKUP_DIR"

say() { printf '[backup %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }

# a run that stops part-way leaves nothing behind: no half-written file, and no unencrypted copy of personal data
LEFT=()
on_exit() {
  local code=$?
  if [ "$code" != 0 ]; then
    for f in "${LEFT[@]+"${LEFT[@]}"}"; do rm -f "$f" "$f.sha256"; done
    echo "[backup] FAILED (exit $code): nothing from this run was kept" >&2
  fi
}
trap on_exit EXIT

# written beside, then renamed, so a half-written backup never looks complete
finish() {
  local part="$1" final="$2"
  LEFT+=("$part" "$final")
  if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
    # encrypted straight from the part file: the plain copy is never a finished backup
    LEFT+=("$final.gpg")
    gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" --output "$final.gpg.part" --encrypt "$part"
    rm -f "$part"
    mv "$final.gpg.part" "$final.gpg"
    final="$final.gpg"
  else
    mv "$part" "$final"
  fi
  (cd "$BACKUP_DIR" && sha "$(basename "$final")" > "$(basename "$final").sha256")
  say "$(basename "$final"): $(du -h "$final" | cut -f1)"
}

same_major "$BACKUP_DATABASE_URL"
start=$(date +%s)
DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
say "dumping the database"
pg_dump --format=custom --compress=6 --no-password --dbname="$BACKUP_DATABASE_URL" --file="$DB_FILE.part"
finish "$DB_FILE.part" "$DB_FILE"

if [ -n "${STORAGE_DIR:-}" ]; then
  if [ -d "$STORAGE_DIR" ]; then
    UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
    say "archiving the uploads"
    # .part files are uploads still being written; the next night's backup has them
    tar --exclude='*.part' -czf "$UP_FILE.part" -C "$STORAGE_DIR" .
    finish "$UP_FILE.part" "$UP_FILE"
  else
    say "STORAGE_DIR $STORAGE_DIR doesn't exist: no uploads archived" >&2
  fi
fi

# backups age out with the 30-day window: a file deleted at retention is gone from every backup within KEEP_DAYS
LEFT=() # everything above finished: keep it
pruned=$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*' -o -name 'uploads-*' \) -mtime +"$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')
say "done in $(( $(date +%s) - start )) s; $pruned file(s) older than $KEEP_DAYS days removed"
