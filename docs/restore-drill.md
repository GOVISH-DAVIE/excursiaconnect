# Restore drill

How to prove the backups work, against the PRD's targets: **RTO 1 hour** (back up and serving within an hour) and **RPO 5 minutes** (at most five minutes of changes lost). Due before applications open on **Tue 15 Dec 2026**, again before **Mon 15 Feb 2027**, then monthly ([deploy.md](deploy.md), Backups and recovery). Each drill adds its report to the log at the end of this file.

## What there is to restore

| Copy | Made by | Covers | Kept |
| --- | --- | --- | --- |
| Point-in-time recovery | the database provider (or WAL archiving every 60 s) | every change, to the second | 30 days |
| Nightly backup | `scripts/ops/backup.sh` at 02:30 Nairobi time: a `pg_dump` archive and the uploads, each with a SHA-256 | the database and the files as they were that night | 30 days, then deleted |

The RPO of 5 minutes comes only from point-in-time recovery; the nightly backup alone could lose a day. The nightly backup is the copy that survives losing the database provider, and the one drill 1 restores.

## Drill 1: the nightly backup (every time)

On a machine that is **not** production (a staging server, or a laptop with the same PostgreSQL major version):

1. Copy the newest backup and its `.sha256` from the backup server.
2. Run the drill, timing it:

   ```bash
   PG_BIN=/usr/lib/postgresql/16/bin DRILL_ADMIN_URL=postgresql://postgres@localhost/postgres \
   BACKUP_DIR=/path/to/backups STORAGE_DIR_DRILL=/tmp/drill-uploads REPORT=docs/restore-drill.md \
   scripts/ops/restore-drill.sh
   ```

   It checks the checksum, restores into a new database, counts tables, constraints, indexes and the main tables' rows, names the newest migration and the newest audit entry, unpacks the uploads, and says PASS or FAIL against the RTO. The drill's database is dropped afterwards (`KEEP=1` keeps it).
3. Point a local API at the restored copy (`KEEP=1`, then `LOCAL_DATABASE=<the drill database> npm run dev:api`) and sign in, open an application and one of its documents. A backup that restores but can't be used is a failed drill.
4. Delete the copied backup and the unpacked uploads: they hold personal data.

`PG_BIN` must be the tools of the server's major version: a newer `pg_dump` writes settings an older server rejects. Both scripts refuse to run with a mismatch.

## Drill 2: point-in-time recovery (before 15 Dec and 15 Feb, then quarterly)

1. Note the time, then make a change you can find: an organiser's KYC note, say.
2. In the provider's console, restore the database **to a new instance** at a time just after that change. Never restore over production.
3. Time it from the start of the restore until the new instance accepts connections.
4. Check the change is there, and that nothing after the chosen time is.
5. Delete the new instance.

Together with re-pointing the API (`DATABASE_URL`, a restart) the total must stay under the hour.

## When it's real

1. Stop the API and the worker (`systemctl stop excursia-api@blue excursia-api@green excursia-worker`) so nothing writes to a database being replaced.
2. Restore to a point just before the damage (drill 2), or from the newest backup (drill 1) if the provider is gone. Restore the uploads from the same night's tarball into a fresh `STORAGE_DIR`.
3. Re-apply the roles' grants with the provisioning script (the dump restores tables, not role rights), then `npm run db:deploy` to confirm the schema is current.
4. Point `DATABASE_URL` and `WORKER_DATABASE_URL` at it, start the API, check `/health/ready` and `/health/queues`, then start the worker.
5. Tell Algotech's lead what was lost (the time of the restore point), and, if personal data was exposed or lost, follow the breach runbook: the Data Protection Commissioner within 72 hours.

## The log

Each drill's report goes below, newest last.

## Restore drill, 2026-11-12 10:06 UTC: PASS (local rehearsal)

- **Backup:** `db-20261112T100627Z.dump` (104K), checksum matches
- **Restored into:** `excursia_drill_20261112100629` on localhost (PostgreSQL 15)
- **Time:** 1 s to restore, 1 s in all, against an RTO of 60 min
- **Schema:** 30 tables, 47 constraints, 82 indexes; latest migration `20261112091806_file_scan_and_retention`; 0 unfinished
- **Newest audit entry:** 2026-11-12 09:25:38 UTC
- **Uploads:** 21 files unpacked (the local uploads folder is shared by every local database); the database lists 17 kept

| Table | Rows |
| --- | ---: |
| `app_user` | 13 |
| `organiser` | 3 |
| `event` | 3 |
| `dr_application` | 3 |
| `dr_staff` | 5 |
| `file` | 18 |
| `outbox_message` | 30 |
| `audit_entry` | 107 |

A rehearsal of the scripts on the walk-through database, not the drill the go-live needs: that one runs on staging against production's backups, and drill 2 against the provider's point-in-time recovery.
