-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "mfa_grace_until" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "mfa_skipped" BOOLEAN NOT NULL DEFAULT false;
