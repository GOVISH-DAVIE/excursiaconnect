"use client";

import { useSession } from "@/features/auth/hooks/use-session";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Review } from "./review";

/** Waits for the session, then the review; the shell sends anyone not signed in to the sign-in page. */
export function ReviewGate({ id }: { id: string }) {
  const session = useSession();
  const eventId = useDealRoomEvent();
  if (!session.data || session.data.mfa === "pending" || session.data.user.kind === "participant") return <p className="text-[14px] text-slate">Checking your sign-in…</p>;
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  return <Review eventId={eventId} appId={id} />;
}
