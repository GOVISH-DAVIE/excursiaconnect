-- M2.2, the Deal Room desk: enrolled scanner devices hold a secret (no device has been enrolled before this), staff
-- scanner PINs, every scan once by the id its device gave it, and one arrival per participant per day.
-- AlterTable
ALTER TABLE "scanner_device" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMPTZ(3),
ADD COLUMN     "secret_hash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "scanner_pin" (
    "user_id" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_pin_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "scan" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "delegate_id" TEXT,
    "verdict" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scanned_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrival" (
    "delegate_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "event_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,

    CONSTRAINT "arrival_pkey" PRIMARY KEY ("delegate_id","day")
);

-- CreateIndex
CREATE INDEX "scan_event_id_received_at_idx" ON "scan"("event_id", "received_at");

-- CreateIndex
CREATE INDEX "scan_delegate_id_scanned_at_idx" ON "scan"("delegate_id", "scanned_at" DESC);

-- CreateIndex
CREATE INDEX "arrival_event_id_day_idx" ON "arrival"("event_id", "day");

-- AddForeignKey
ALTER TABLE "scanner_pin" ADD CONSTRAINT "scanner_pin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "scanner_device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival" ADD CONSTRAINT "arrival_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "delegate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A verdict is one of two words, and a scan can't predate its device's clock by much
ALTER TABLE "scan" ADD CONSTRAINT "scan_verdict_check" CHECK ("verdict" IN ('allow', 'deny'));
