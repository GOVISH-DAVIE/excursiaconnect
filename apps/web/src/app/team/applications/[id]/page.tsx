"use client";

import { use } from "react";
import { useSession } from "@/features/auth/hooks/use-session";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { Review } from "./review";

export default function ReviewPage({ params }: PageProps<"/team/applications/[id]">) {
  const { id } = use(params);
  const session = useSession();
  const eventId = useDealRoomEvent();
  if (!session.data || session.data.mfa === "pending" || session.data.user.kind === "participant") return <p className="text-[14px] text-slate">Checking your sign-in…</p>;
  if (!eventId) return <p className="text-[14px] text-slate">You aren&apos;t on a Deal Room team yet.</p>;
  return <Review eventId={eventId} appId={id} />;
}
