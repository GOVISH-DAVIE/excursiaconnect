"use client";

import { useSearchParams } from "next/navigation";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../bits";
import { LiveBoardView } from "./board";

function Inner() {
  const eventId = useDealRoomEvent();
  const q = useSearchParams();
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  // the evening's report links to one day's close-out (?tab=closeout&day=)
  return <LiveBoardView key={q.toString()} eventId={eventId} day={q.get("day")} closeOut={q.get("tab") === "closeout"} />;
}

export function LiveGate() {
  return (
    <Signed>
      <Inner />
    </Signed>
  );
}
