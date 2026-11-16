"use client";

import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Signed } from "../../bits";
import { Match } from "./match";

function Inner({ matchId }: { matchId: string }) {
  const eventId = useDealRoomEvent();
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  return <Match eventId={eventId} matchId={matchId} />;
}

export function MatchGate({ matchId }: { matchId: string }) {
  return (
    <Signed>
      <Inner matchId={matchId} />
    </Signed>
  );
}
