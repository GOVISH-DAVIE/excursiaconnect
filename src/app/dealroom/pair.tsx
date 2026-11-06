"use client";

import { fitDetail, pairTimeline, type PairEvent } from "@/lib/dealroom/logic";
import type { DrApplication, DrMatch } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { useDr } from "./bits";

const dot: Record<PairEvent["kind"], string> = { match: "bg-ink", consent: "bg-ok", access: "bg-coral", meeting: "bg-warn", opportunity: "bg-ok" };

/** One pair's story, oldest first: decisions, introduction, consent, openings, meetings, the opportunity. */
export function PairTimeline({ m, newestFirst = false }: { m: DrMatch; newestFirst?: boolean }) {
  const { dr } = useDr();
  const events = pairTimeline(dr, m);
  if (newestFirst) events.reverse();
  return (
    <ol className="grid gap-2.5">
      {events.map((e, i) => (
        <li key={i} className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-3 text-[13px]">
          <span className={`mt-1.5 h-2 w-2 rounded-full ${dot[e.kind]}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block">{e.what}</span>
            <span className="block text-[12px] text-slate">
              {fmtStamp(e.at)} · {e.who}
              {e.ref ? ` · ${e.ref}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Each matching field: what the seeker has against what the provider's mandate asks. */
export function FitDetail({ seeker, provider }: { seeker: DrApplication; provider: DrApplication }) {
  const { cfg } = useDr();
  return (
    <dl className="grid gap-2 text-[13px]">
      {fitDetail(seeker, provider, cfg!).map((r) => (
        <div key={r.field} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3">
          <dt className={r.ok ? "text-ok" : r.mandatory ? "text-bad" : "text-slate"}>
            {r.ok ? "✓" : "✗"} {r.label}
          </dt>
          <dd className="min-w-0">
            {r.has}
            <span className="block text-[12px] text-slate">
              {r.field === "exclusions" ? `${provider.org.name} excludes ${r.wants === "none set" ? "nothing" : r.wants}` : `${provider.org.name} wants ${r.wants}`}
              {!r.ok && !r.mandatory ? "; advisory only" : ""}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
