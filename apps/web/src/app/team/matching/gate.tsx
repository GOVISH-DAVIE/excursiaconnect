"use client";

import { useSearchParams } from "next/navigation";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../bits";
import { Board } from "./board";

function Inner() {
  const eventId = useDealRoomEvent();
  const q = useSearchParams();
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  // a link may open on one participant (?who=) or on the pairs (?tab=pairs)
  return <Board key={q.toString()} eventId={eventId} who={q.get("who") ?? ""} pairs={q.get("tab") === "pairs"} />;
}

export function MatchingGate() {
  return (
    <Signed>
      <Inner />
    </Signed>
  );
}
