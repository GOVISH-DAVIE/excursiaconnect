"use client";

import { useSession } from "@/features/auth/hooks/use-session";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Queue } from "./queue";

export default function ApplicationsPage() {
  const session = useSession();
  const eventId = useDealRoomEvent();
  // until the session is known (or while the shell sends a signed-out visitor to sign in), ask the API nothing
  if (!session.data || session.data.mfa === "pending" || session.data.user.kind === "participant")
    return <p className="text-[14px] text-slate">Checking your sign-in…</p>;
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet. An Algotech admin adds staff to an event.</p>;
  return <Queue eventId={eventId} />;
}
