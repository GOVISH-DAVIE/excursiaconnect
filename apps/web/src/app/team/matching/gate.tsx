"use client";

import { useSearchParams } from "next/navigation";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../bits";
import { Board } from "./board";

function Inner() {
  const eventId = useDealRoomEvent();
  const q = useSearchParams();
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  // a link may open on one participant (?who=), the expressions of interest (?tab=interest) or the pairs (?tab=pairs)
  const tab = q.get("tab");
  return <Board key={q.toString()} eventId={eventId} who={q.get("who") ?? ""} open={tab === "pairs" || tab === "interest" ? tab : null} />;
}

export function MatchingGate() {
  return (
    <Signed>
      <Inner />
    </Signed>
  );
}
