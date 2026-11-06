"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section, Stat, Tabs } from "@/components/ui";
import { canSeeInternal, drCan, evidenceDate, lastActivity, missionName, oppOpen, oppOverdue, oppParties, oppStalled, reviewedThisMonth, STALL_DAYS, staffName } from "@/lib/dealroom/logic";
import type { DrOpportunity } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { Pill, Refusal, When, useDr } from "../bits";
import { OppStagePill, exportPack, headline, oppTitle } from "./parts";

const allTabs = ["Open", "Monthly review", "Closed", "Export"] as const;
type Tab = (typeof allTabs)[number];

/** DL-10 and the owner's list: every opportunity with its next action, overdue and stalled ones flagged. */
export default function Opportunities() {
  const { dr, cfg, me, now } = useDr();
  const q = useSearchParams();
  const lead = drCan(me, "conversion");
  const tabs = allTabs.filter((t) => lead || t === "Open" || t === "Closed");
  const asked = allTabs.find((t) => t === q.get("tab"));
  const [picked, setTab] = useState<Tab | null>(null);
  const tab = picked ?? (asked && tabs.includes(asked) ? asked : "Open");
  const [owner, setOwner] = useState(q.get("owner") ?? "");
  const [flag, setFlag] = useState(q.get("flag") ?? "");
  if (!cfg) return null;
  if (!me || (me.role !== "Lead" && me.role !== "Reviewer")) return <Refusal title="Opportunities are for their owners and the lead">Operations works the summit days; after the summit each opportunity has an owner from the reviewing team.</Refusal>;
  // a reviewer sees the opportunities they own; the lead sees all (PRD Reporting req. 5)
  const mine = dr.opportunities.filter((o) => o.eventId === cfg.eventId && (lead || o.owner === me.id));
  const open = mine.filter(oppOpen);
  const shown = (tab === "Closed" ? mine.filter((o) => !oppOpen(o)) : open).filter((o) => (!owner || o.owner === owner) && (flag !== "overdue" || oppOverdue(o, now)) && (flag !== "stalled" || oppStalled(o, now)));
  const owners = dr.staff.filter((s) => s.active && s.role !== "Operations");

  return (
    <>
      <PageHeader
        title="Opportunities"
        kicker={`${lead ? "Every opportunity" : "The opportunities you own"} from a meeting with a next action, tracked to ${fmtStamp(cfg.rules.conversionEnd, false)}. Figures as of ${fmtStamp(now)}.`}
      />
      {dr.archivedAt && <p className="mb-4 rounded-lg bg-paper-200 px-4 py-3 text-[14px]">Archived {fmtStamp(dr.archivedAt, false)}: tracking has ended and every record is read-only. The post-summit pack stays exportable.</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-5">
        <Stat label="Open" value={open.length} />
        <Stat label="Next action overdue" value={open.filter((o) => oppOverdue(o, now)).length} tone={open.some((o) => oppOverdue(o, now)) ? "bad" : undefined} />
        <Stat label={`Quiet for ${STALL_DAYS}+ days`} value={open.filter((o) => oppStalled(o, now)).length} tone={open.some((o) => oppStalled(o, now)) ? "warn" : undefined} />
        <Stat label="Won" value={mine.filter((o) => o.stage === "Closed – won").length} tone="ok" />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} counts={lead && !dr.archivedAt ? { "Monthly review": open.filter((o) => !reviewedThisMonth(o, now)).length } : undefined} />

      {(tab === "Open" || tab === "Closed") && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {lead && (
              <select className="input h-9 w-auto text-[13px]" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Every owner</option>
                {owners.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {tab === "Open" && (
              <select className="input h-9 w-auto text-[13px]" aria-label="Flag" value={flag} onChange={(e) => setFlag(e.target.value)}>
                <option value="">All open</option>
                <option value="overdue">Next action overdue</option>
                <option value="stalled">Quiet for {STALL_DAYS}+ days</option>
              </select>
            )}
          </div>
          <OppTable opps={shown} />
        </>
      )}
      {tab === "Monthly review" && <Review opps={open} />}
      {tab === "Export" && (
        <Section title="The post-summit pack">
          <p className="text-[14px]">One row per opportunity, {mine.length} in all: both parties, mission and sector, the owner, every stage date, the close reason, and interest, promised, committed and received with their dates.</p>
          <button className="btn-primary mt-3" onClick={() => exportPack(dr, cfg, mine)}>
            Download the pack (CSV)
          </button>
          <p className="mt-3 text-[13px] text-slate">Due at the end of the summit and again at close on {fmtStamp(cfg.rules.conversionEnd, false)}. Values are in the currency each was recorded in.</p>
        </Section>
      )}
    </>
  );
}

function OppTable({ opps }: { opps: DrOpportunity[] }) {
  const { dr, cfg, me, now } = useDr();
  if (!opps.length) return <Empty>Nothing here.</Empty>;
  return (
    <Section title={`${opps.length} opportunit${opps.length === 1 ? "y" : "ies"}`} flush>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Opportunity</th>
              <th className="th">Stage</th>
              <th className="th">Next action</th>
              <th className="th">Owner</th>
              <th className="th">Last activity</th>
              <th className="th-r">Value</th>
            </tr>
          </thead>
          <tbody>
            {[...opps]
              .sort((a, b) => a.due.localeCompare(b.due))
              .map((o) => {
                const { seeker } = oppParties(dr, o);
                return (
                  <tr key={o.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`/dealroom/opportunities/${o.id}`} className="font-medium hover:underline">
                        {oppTitle(dr, o)}
                      </Link>
                      <div className="text-[12px] text-slate">
                        {missionName(cfg!, seeker?.mission ?? "")} · {seeker?.org.sector}
                      </div>
                    </td>
                    <td className="td">
                      <OppStagePill stage={o.stage} />
                    </td>
                    <td className="td">
                      {oppOpen(o) ? (
                        <>
                          <div>{o.nextAction}</div>
                          <div className={`text-[12px] ${oppOverdue(o, now) ? "text-bad font-medium" : "text-slate"}`}>
                            {oppOverdue(o, now) ? "Overdue since " : "Due "}
                            {fmtStamp(o.due, false)}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate">{o.closed ? `Lost: ${o.closed.reason}` : "Won"}</span>
                      )}
                    </td>
                    <td className="td">{staffName(dr, o.owner)}</td>
                    <td className="td">
                      <When at={lastActivity(o)} time={false} />
                      {oppStalled(o, now) && (
                        <div className="mt-1">
                          <Pill tone="warn">Quiet</Pill>
                        </div>
                      )}
                    </td>
                    <td className="td-r whitespace-nowrap">{canSeeInternal(me, o.owner) ? headline(o) : <span className="text-slate">Lead only</span>}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

const drop = <T,>(r: Record<string, T>, k: string) => Object.fromEntries(Object.entries(r).filter(([x]) => x !== k));

/** DL-10: the lead reviews every open opportunity once a month and reassigns the quiet ones; each review is logged. */
function Review({ opps }: { opps: DrOpportunity[] }) {
  const { dr, now, dispatch } = useDr();
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [moving, setMoving] = useState<Record<string, { owner: string; reason: string }>>({});
  const month = new Date(now.slice(0, 7) + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const todo = opps.filter((o) => !reviewedThisMonth(o, now));
  const owners = dr.staff.filter((s) => s.active && s.role !== "Operations");
  if (dr.archivedAt) return <Empty>Tracking ended on {fmtStamp(dr.archivedAt, false)}. Each opportunity keeps its reviews, and the pack lists them.</Empty>;
  if (!opps.length) return <Empty>No open opportunities to review.</Empty>;
  return (
    <Section
      title={`${month}: ${todo.length} of ${opps.length} still to review`}
      flush
      action={
        <span className="flex flex-wrap items-center gap-2">
          <input className="input h-9 w-56 text-[13px]" placeholder="Review note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary btn-sm" disabled={!sel.length} onClick={() => { dispatch({ type: "dr/oppReview", oppIds: sel, note: note || "Monthly review" }); setSel([]); setNote(""); }}>
            Mark {sel.length || ""} reviewed
          </button>
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th w-8">
                <input type="checkbox" aria-label="Select all not yet reviewed" checked={todo.length > 0 && todo.every((o) => sel.includes(o.id))} onChange={(e) => setSel(e.target.checked ? todo.map((o) => o.id) : [])} />
              </th>
              <th className="th">Opportunity</th>
              <th className="th">Stage</th>
              <th className="th">Last update</th>
              <th className="th">Evidence dated</th>
              <th className="th">Owner</th>
              <th className="th">This month</th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => {
              const done = reviewedThisMonth(o, now);
              const m = moving[o.id];
              return (
                <tr key={o.id} className="hover:bg-paper align-top">
                  <td className="td">
                    <input type="checkbox" aria-label={`Select ${oppTitle(dr, o)}`} disabled={done} checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} />
                  </td>
                  <td className="td">
                    <Link href={`/dealroom/opportunities/${o.id}`} className="font-medium hover:underline">
                      {oppTitle(dr, o)}
                    </Link>
                    {oppOverdue(o, now) && <div className="text-[12px] text-bad">Next action overdue since {fmtStamp(o.due, false)}</div>}
                  </td>
                  <td className="td">
                    <OppStagePill stage={o.stage} />
                  </td>
                  <td className="td">
                    <When at={lastActivity(o)} time={false} />
                    {oppStalled(o, now) && <div className="text-[12px] text-warn">Quiet for {STALL_DAYS}+ days</div>}
                  </td>
                  <td className="td">{evidenceDate(o) ? fmtStamp(evidenceDate(o)!, false) : <span className="text-slate">None yet</span>}</td>
                  <td className="td">
                    {m ? (
                      <div className="grid gap-1.5 min-w-48">
                        <select className="input h-8 text-[13px]" aria-label="New owner" value={m.owner} onChange={(e) => setMoving({ ...moving, [o.id]: { ...m, owner: e.target.value } })}>
                          {owners
                            .filter((s) => s.id !== o.owner)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                        <input className="input h-8 text-[13px]" placeholder="Why" value={m.reason} onChange={(e) => setMoving({ ...moving, [o.id]: { ...m, reason: e.target.value } })} />
                        <span className="flex gap-2">
                          <button className="btn-primary btn-sm" disabled={!m.reason.trim()} onClick={() => { dispatch({ type: "dr/oppReassign", oppId: o.id, owner: m.owner, reason: m.reason }); setMoving(drop(moving, o.id)); }}>
                            Reassign
                          </button>
                          <button className="btn-quiet" onClick={() => { setMoving(drop(moving, o.id)); }}>
                            Cancel
                          </button>
                        </span>
                      </div>
                    ) : (
                      <>
                        {staffName(dr, o.owner)}
                        <button className="link block text-[12px]" onClick={() => setMoving({ ...moving, [o.id]: { owner: owners.find((s) => s.id !== o.owner)!.id, reason: oppStalled(o, now) ? `Quiet since ${fmtStamp(lastActivity(o), false)}` : "" } })}>
                          Reassign
                        </button>
                      </>
                    )}
                  </td>
                  <td className="td">{done ? <Pill tone="ok">Reviewed</Pill> : <Pill tone="coral">To review</Pill>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[12px] text-slate">Each review is logged on the opportunity with the month, who reviewed it and the note. Tracking continues to {fmtStamp(dr.configs[opps[0].eventId].rules.conversionEnd, false)}.</p>
    </Section>
  );
}
