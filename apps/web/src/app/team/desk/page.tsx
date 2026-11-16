"use client";

import { PageHeader } from "@/components/ui";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../bits";
import { DeskScanners } from "./scanners";

function Gate() {
  const eventId = useDealRoomEvent();
  if (!eventId) return <PageHeader title="Desk scanners" kicker="You aren't on a Deal Room team." />;
  return <DeskScanners eventId={eventId} />;
}

export default function DeskScannersPage() {
  return (
    <Signed>
      <Gate />
    </Signed>
  );
}
