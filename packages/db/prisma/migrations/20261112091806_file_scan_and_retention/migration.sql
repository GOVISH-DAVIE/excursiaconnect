-- AlterTable
ALTER TABLE "file" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "next_scan_at" TIMESTAMPTZ(3),
ADD COLUMN     "scan_note" TEXT,
ADD COLUMN     "scanned_at" TIMESTAMPTZ(3);

-- The worker's scan queue: only files still in quarantine
CREATE INDEX "file_quarantine_idx" ON "file" ("next_scan_at") WHERE "state" = 'quarantine' AND "deleted_at" IS NULL;

-- Files due for deletion at their retention date
CREATE INDEX "file_retention_due_idx" ON "file" ("retention_until") WHERE "retention_until" IS NOT NULL AND "deleted_at" IS NULL;
