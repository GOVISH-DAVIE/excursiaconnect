"use client";

/** A pair's stage as a pill, the same everywhere the team sees it. */
import type { MatchStage } from "@excursia/contracts/matching";
import type { FitRow } from "@excursia/contracts/matching";
import { Tone } from "@/components/ui";

const TONE: Record<MatchStage, "ok" | "warn" | "bad" | "mute"> = {
  Suggested: "warn",
  Deferred: "mute",
  Rejected: "bad",
  Approved: "mute",
  Introduced: "warn",
  Accepted: "ok",
  Declined: "bad",
  Expired: "bad",
};

export function StagePill({ stage }: { stage: MatchStage }) {
  return <Tone tone={TONE[stage]}>{stage === "Approved" ? "Approved, not introduced" : stage}</Tone>;
}

/** What a pair meets and misses, as pills: a must-have miss in red, a preference in grey. */
export function FitPills({ fit, exclusionHit }: { fit: FitRow[]; exclusionHit: string | null }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {fit.map((f) => (
        <span key={f.field} className={`pill ${f.ok ? "bg-ok-50 text-ok" : f.mandatory ? "bg-bad-50 text-bad" : "bg-paper-200 text-slate"}`}>
          {f.ok ? "✓" : "✗"} {f.label}
          {f.field === "exclusions" && exclusionHit ? `: ${exclusionHit}` : ""}
        </span>
      ))}
    </div>
  );
}

/** Each matching field: what the seeker has against what the counterparty wants. */
export function FitDetail({ fit, provider }: { fit: FitRow[]; provider: string }) {
  return (
    <dl className="grid gap-2 text-[13px]">
      {fit.map((r) => (
        <div key={r.field} className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3">
          <dt className={r.ok ? "text-ok" : r.mandatory ? "text-bad" : "text-slate"}>
            {r.ok ? "✓" : "✗"} {r.label}
          </dt>
          <dd className="min-w-0">
            {r.has}
            <span className="block text-[12px] text-slate">
              {r.field === "exclusions" ? `${provider} excludes ${r.wants === "none set" ? "nothing" : r.wants}` : `${provider} wants ${r.wants}`}
              {!r.ok && !r.mandatory ? "; a preference, not a must" : ""}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
