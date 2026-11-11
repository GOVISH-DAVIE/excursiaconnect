"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/hooks/use-session";
import { homeOf } from "@/features/auth/roles";

/** The workspace opens on the person's own first screen: Algotech's queue, the organiser's KYC, or the review queue. */
export default function TeamHome() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.data && session.data.mfa !== "pending" && session.data.user.kind !== "participant") router.replace(homeOf(session.data));
  }, [session.data, router]);
  return <p className="text-[14px] text-slate">Opening your workspace…</p>;
}
