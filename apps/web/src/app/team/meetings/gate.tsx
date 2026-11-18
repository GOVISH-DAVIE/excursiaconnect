"use client";

import { useSearchParams } from "next/navigation";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../bits";
import { ScheduleBoard } from "./schedule";

function Inner() {
  const eventId = useDealRoomEvent();
  const q = useSearchParams();
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  // a link may open on the moves waiting (?tab=changes), or on one meeting (?meeting=)
  return <ScheduleBoard key={q.toString()} eventId={eventId} tab={q.get("tab")} meeting={q.get("meeting")} />;
}

export function MeetingsGate() {
  return (
    <Signed>
      <Inner />
    </Signed>
  );
}
