"use client";

import { compact, evidenceDate, lastActivity, missionName, oppParties, staffName } from "@/lib/dealroom/logic";
import type { DealRoomState, DrConfig, DrOpportunity, OppStage, OutcomeKind } from "@/lib/dealroom/types";
import { downloadCsv, row } from "@/lib/csv";
import { Pill } from "../bits";

const tone: Record<OppStage, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral"> = { "Follow-up": "coral", Diligence: "warn", Negotiation: "warn", "Closed – won": "okSolid", "Closed – lost": "mute" };
export const OppStagePill = ({ stage }: { stage: OppStage }) => <Pill tone={tone[stage]}>{stage}</Pill>;

/** The furthest evidenced value: received, then committed, then promised. Never added together. */
export function headline(o: DrOpportunity) {
  for (const k of ["Funds received", "Commitment", "Promise"] as OutcomeKind[]) {
    const xs = o.outcomes.filter((x) => x.kind === k && x.amount);
    if (xs.length) return `${k === "Commitment" ? "Committed" : k === "Promise" ? "Promised" : "Received"} ${compact(xs.reduce((n, x) => n + (x.amount ?? 0), 0), xs[0].currency)}`;
  }
  return o.outcomes.some((x) => x.kind === "Interest") ? "Interest" : "–";
}

export const oppTitle = (dr: DealRoomState, o: DrOpportunity) => {
  const { seeker, provider } = oppParties(dr, o);
  return `${seeker?.org.name} · ${provider?.org.name}`;
};

/** DL-12: the post-summit pack, one row per opportunity with every stage date and outcome value. */
export function exportPack(dr: DealRoomState, cfg: DrConfig, opps: DrOpportunity[]) {
  const sum = (o: DrOpportunity, k: OutcomeKind) => o.outcomes.filter((x) => x.kind === k).reduce((n, x) => n + (x.amount ?? 0), 0) || "";
  const first = (o: DrOpportunity, k: OutcomeKind) => o.outcomes.find((x) => x.kind === k)?.date ?? "";
  const head = ["Seeker ref", "Seeker", "Provider ref", "Provider", "Mission", "Sector", "Instrument", "Ask", "Currency", "Owner", "Stage", "Follow-up", "Diligence", "Negotiation", "Closed won", "Closed lost", "Close reason", "Next action", "Due", "Interest date", "Promised", "Promise date", "Committed", "Commitment date", "Received", "Received date", "Last activity", "Evidence date", "Reviews"];
  const lines = opps.map((o) => {
    const { seeker: s, provider: p } = oppParties(dr, o);
    const d = (st: OppStage) => o.stageDates[st]?.slice(0, 10) ?? "";
    return row([s?.ref, s?.org.name, p?.ref, p?.org.name, missionName(cfg, s?.mission ?? ""), s?.org.sector, s?.ask?.instrument, s?.ask?.amount, s?.ask?.currency, staffName(dr, o.owner), o.stage, d("Follow-up"), d("Diligence"), d("Negotiation"), d("Closed – won"), d("Closed – lost"), o.closed?.reason ?? "", o.nextAction, o.due, first(o, "Interest"), sum(o, "Promise"), first(o, "Promise"), sum(o, "Commitment"), first(o, "Commitment"), sum(o, "Funds received"), first(o, "Funds received"), lastActivity(o).slice(0, 10), evidenceDate(o) ?? "", o.reviews.map((r) => r.month).join(" ")]);
  });
  downloadCsv(`deal-room-post-summit-pack-${dr.clock.slice(0, 10)}.csv`, [row(head), ...lines]);
}
