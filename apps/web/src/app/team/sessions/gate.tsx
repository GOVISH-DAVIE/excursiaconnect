"use client";

import { useSearchParams } from "next/navigation";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../bits";
import { SessionsBoardView } from "./board";

function Inner() {
  const eventId = useDealRoomEvent();
  const q = useSearchParams();
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  // a link may open on one session (?s=)
  return <SessionsBoardView key={q.toString()} eventId={eventId} opened={q.get("s")} />;
}

export function SessionsGate() {
  return (
    <Signed>
      <Inner />
    </Signed>
  );
}
