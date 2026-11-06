"use client";

import { matchStage, type MatchStage } from "@/lib/dealroom/logic";
import type { DrMatch } from "@/lib/dealroom/types";
import { Pill, useDr } from "./bits";

export const stageTone: Record<MatchStage, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral"> = { Suggested: "coral", Deferred: "mute", Rejected: "bad", Approved: "warn", Introduced: "warn", Accepted: "okSolid", Declined: "bad", Expired: "mute" };
export function StagePill({ m }: { m: DrMatch }) {
  const { cfg, now } = useDr();
  const st = matchStage(m, cfg!, now);
  return <Pill tone={stageTone[st]}>{st}</Pill>;
}

