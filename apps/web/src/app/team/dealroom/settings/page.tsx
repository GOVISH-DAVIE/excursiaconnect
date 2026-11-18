"use client";

import { PageHeader } from "@/components/ui";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../../bits";
import { Settings } from "./settings";

function Gate() {
  const eventId = useDealRoomEvent();
  if (!eventId) return <PageHeader title="Deal Room settings" kicker="You aren't on a Deal Room team." />;
  return <Settings eventId={eventId} />;
}

export default function SettingsPage() {
  return (
    <Signed>
      <Gate />
    </Signed>
  );
}
