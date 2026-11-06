"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DR_ZONE, boardFlag, bothAccepted, drCan, occupies, staffName } from "@/lib/dealroom/logic";
import type { DrMeeting, DrOutcome } from "@/lib/dealroom/types";
import { addMinutes, fmtStamp } from "@/lib/time";
import { Refusal, useDr } from "../bits";
import { MeetingPill } from "../meetings/parts";

/** DO-7 to DO-11 and Flow 4: the summit day as it happens, with one tap per status. */
export default function LiveBoard() {
  const { state } = useStore();
  const { dr, cfg, me, now, dispatch } = useDr();
  const [pick, setPick] = useState<string | null>(null);
  if (!cfg) return null;
  if (!drCan(me, "liveboard") && !drCan(me, "outcome")) return <Refusal title="The live board is for operations and the lead" />;
  const day = now.slice(0, 10);
  const todays = dr.meetings.filter((m) => m.start.slice(0, 10) === day && m.status !== "Cancelled").sort((a, b) => a.start.localeCompare(b.start));
  const rooms = state.rooms.filter((r) => r.zoneId === DR_ZONE && cfg.rooms[r.id]);
  const flags = todays.map((m) => ({ m, f: boardFlag(m, cfg, now) })).filter((x) => x.f);
  const arrived = new Set(todays.flatMap((m) => [m.arrivals.seeker ? `s:${m.matchId}` : "", m.arrivals.provider ? `p:${m.matchId}` : ""]).filter(Boolean)).size;
  const picked = dr.meetings.find((m) => m.id === pick);
  const counts = { held: todays.filter((m) => m.status === "Held").length, live: todays.filter((m) => m.status === "In progress").length, noShow: todays.filter((m) => m.status === "No-show").length, upcoming: todays.filter((m) => m.status === "Confirmed").length };
  const conflicts = dr.conflicts.filter((c) => !c.resolved);

  if (day < state.events.find((e) => e.id === cfg.eventId)!.startDate || day > state.events.find((e) => e.id === cfg.eventId)!.endDate)
    return (
      <>
        <PageHeader title="Live board" />
        <Empty>The live board runs during summit week. The demo clock is {fmtStamp(now)}.</Empty>
      </>
    );

  return (
    <>
      <PageHeader
        title="Live board"
        kicker={`${fmtStamp(now)}. ${counts.held} held, ${counts.live} in progress, ${counts.upcoming} to come, ${counts.noShow} no-show today. ${arrived} arrivals recorded at the desk.`}
        actions={
          <>
            <button className={dr.offline ? "btn-primary" : "btn-secondary"} onClick={() => dispatch({ type: "dr/offline", on: !dr.offline })}>
              {dr.offline ? "Back online and sync" : "Work offline"}
            </button>
            <Link href={`/dealroom/reports?tab=Daily&day=${day}`} className="btn-secondary">
              Today&apos;s report
            </Link>
          </>
        }
      />
      {dr.offline && <div className="mb-3 rounded-lg border border-warn bg-warn-50 px-4 py-3 text-[14px]">Offline: the cached schedule is shown and outcomes wait on this device with their own ids. No new meetings can be booked. {dr.queue.filter((q) => q.device === "This device").length} waiting here.</div>}
      {!dr.offline && dr.queue.length > 0 && (
        <div className="mb-3 rounded-lg border border-line bg-paper px-4 py-3 text-[14px] flex flex-wrap items-center justify-between gap-2">
          <span>
            {dr.queue.length} record{dr.queue.length > 1 ? "s" : ""} waiting from {[...new Set(dr.queue.map((q) => q.device))].join(", ")}, captured while it was offline.
          </span>
          <button className="btn-primary btn-sm" onClick={() => dispatch({ type: "dr/sync" })}>
            Sync now
          </button>
        </div>
      )}
      {conflicts.length > 0 && (
        <Section title="Conflicts for the lead" className="mb-4">
          {conflicts.map((c) => (
            <div key={c.id} className="py-2 border-b border-line last:border-0 text-[14px]">
              The meeting of {fmtStamp(dr.meetings.find((m) => m.id === c.meetingId)?.start ?? "")} was recorded twice. Kept: <b className="font-medium">{c.kept.category}</b> ({staffName(dr, c.kept.by)}). From {c.incoming.device}: <b className="font-medium">{c.incoming.category}</b>
              {c.incoming.notes ? <>, &ldquo;{c.incoming.notes.replace(/\.+$/, "")}&rdquo;.</> : "."}
              {me?.role === "Lead" ? (
                <span className="ml-2 inline-flex gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/resolveConflict", conflictId: c.id, chose: "kept" })}>
                    Keep the recorded one
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/resolveConflict", conflictId: c.id, chose: "incoming" })}>
                    Use the device&apos;s
                  </button>
                </span>
              ) : (
                <span className="ml-2 text-slate">The lead resolves it; nothing is overwritten silently.</span>
              )}
            </div>
          ))}
        </Section>
      )}
      {flags.length > 0 && (
        <div className="mb-3 rounded-lg border border-bad/30 bg-bad-50 px-4 py-3 text-[14px]">
          {flags.map(({ m, f }) => {
            const mm = dr.matches.find((x) => x.id === m.matchId)!;
            const who = f!.missing.map((s) => dr.apps.find((a) => a.id === (s === "seeker" ? mm.seekerId : mm.providerId))?.org.name).join(" and ");
            return (
              <div key={m.id}>
                <button className="link" onClick={() => setPick(m.id)}>
                  {m.start.slice(11)}
                </button>{" "}
                {f!.kind === "outcome" ? `ended: record the outcome of ${dr.apps.find((a) => a.id === mm.seekerId)?.org.name} with ${dr.apps.find((a) => a.id === mm.providerId)?.org.name}` : f!.kind === "late" ? `starting soon, ${who} not checked in` : `${who} more than ${cfg.rules.lateMin} minutes late: mark a no-show?`}
              </div>
            );
          })}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-3">
          {rooms.map((r) =>
            Array.from({ length: cfg.rooms[r.id].tables }, (_, i) => i + 1).map((table) => {
              const list = todays.filter((m) => m.roomId === r.id && m.table === table);
              if (!list.length) return null;
              return (
                <section key={r.id + table} className="surface p-3">
                  <div className="mb-2 text-[13px] font-medium">
                    {r.name}
                    {cfg.rooms[r.id].tables > 1 ? `, table ${table}` : ""}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {list.map((m) => (
                      <Tile key={m.id} m={m} on={pick === m.id} onPick={() => setPick(m.id)} />
                    ))}
                  </div>
                </section>
              );
            }),
          )}
          {todays.some((m) => m.link) && (
            <section className="surface p-3">
              <div className="mb-2 text-[13px] font-medium">Online</div>
              <div className="flex gap-2 overflow-x-auto">
                {todays
                  .filter((m) => m.link)
                  .map((m) => (
                    <Tile key={m.id} m={m} on={pick === m.id} onPick={() => setPick(m.id)} />
                  ))}
              </div>
            </section>
          )}
        </div>
        <div className="lg:sticky lg:top-4 self-start">{picked ? <Actions m={picked} /> : <Empty>Tap a meeting to mark it in progress, record its outcome or refill a no-show.</Empty>}</div>
      </div>
    </>
  );
}

function Tile({ m, on, onPick }: { m: DrMeeting; on: boolean; onPick: () => void }) {
  const { dr, cfg, now } = useDr();
  const mm = dr.matches.find((x) => x.id === m.matchId)!;
  const flag = boardFlag(m, cfg!, now);
  const nowish = m.start <= now && now < m.end;
  return (
    <button onClick={onPick} className={`shrink-0 w-44 text-left rounded-md border px-2.5 py-2 text-[12px] ${on ? "border-ink" : flag?.kind === "no-show" ? "border-bad" : flag ? "border-warn" : nowish ? "border-ok" : "border-line"} ${m.status === "Held" ? "bg-paper" : "bg-white"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium tabular-nums">{m.start.slice(11)}</span>
        <MeetingPill m={m} />
      </div>
      <div className="mt-1 truncate">{dr.apps.find((a) => a.id === mm.seekerId)?.org.name}</div>
      <div className="truncate text-slate">{dr.apps.find((a) => a.id === mm.providerId)?.org.name}</div>
      <div className="mt-1 text-slate">
        {m.arrivals.seeker ? "●" : "○"} seeker {m.arrivals.provider ? "●" : "○"} provider
      </div>
    </button>
  );
}

function Actions({ m }: { m: DrMeeting }) {
  const { dr, cfg, me, now, can, dispatch } = useDr();
  const mm = dr.matches.find((x) => x.id === m.matchId)!;
  const s = dr.apps.find((a) => a.id === mm.seekerId)!;
  const p = dr.apps.find((a) => a.id === mm.providerId)!;
  const [attendance, setAttendance] = useState<"Held" | "No-show">("Held");
  const [noShow, setNoShow] = useState<"seeker" | "provider" | "both">(m.arrivals.seeker ? "provider" : m.arrivals.provider ? "seeker" : "both");
  const [o, setO] = useState<Omit<DrOutcome, "by" | "at" | "clientId">>({ category: "Positive", nextAction: "", owner: s.assignee ?? "st_lead", due: addMinutes(now, 7 * 1440).slice(0, 10), notes: "", sensitive: false });
  const owners = dr.staff.filter((x) => x.active && x.role !== "Operations");
  const present = m.status === "No-show" ? (m.noShow === "seeker" ? p : m.noShow === "provider" ? s : undefined) : undefined;
  const refill = present ? dr.matches.filter((x) => bothAccepted(x) && (x.seekerId === present.id || x.providerId === present.id) && x.id !== mm.id && !dr.meetings.some((y) => y.matchId === x.id && (occupies(y, cfg!, now) || y.status === "Held"))) : [];
  const canRecord = can("outcome") && ["Confirmed", "In progress"].includes(m.status) && m.start <= addMinutes(now, 30);
  return (
    <Section title={`${m.start.slice(11)} to ${m.end.slice(11)}`} action={<MeetingPill m={m} />}>
      <div className="text-[14px]">
        <b className="font-medium">{s.org.name}</b> ({s.decisionMaker.name}) with <b className="font-medium">{p.org.name}</b> ({p.decisionMaker.name})
      </div>
      <div className="mt-1 text-[13px] text-slate">
        Arrived: seeker {m.arrivals.seeker ? m.arrivals.seeker.slice(11) : "not yet"}, provider {m.arrivals.provider ? m.arrivals.provider.slice(11) : "not yet"}
      </div>
      {m.status === "Confirmed" && can("liveboard") && (
        <button className="btn-secondary btn-sm mt-3" onClick={() => dispatch({ type: "dr/startMeeting", meetingId: m.id })}>
          Mark in progress
        </button>
      )}
      {m.outcome && (
        <div className="mt-3 rounded-md bg-paper p-3 text-[13px]">
          <b className="font-medium">{m.outcome.category}</b>
          {m.outcome.nextAction && `. Next: ${m.outcome.nextAction}, ${staffName(dr, m.outcome.owner)}, by ${fmtStamp(m.outcome.due!, false)}`}
          {m.outcome.notes && (m.outcome.sensitive && !(me?.role === "Lead" || me?.id === m.outcome.owner) ? <div className="text-slate">Notes marked sensitive: the lead and the owner only.</div> : <div className="text-slate">{m.outcome.notes}</div>)}
        </div>
      )}
      {canRecord && (
        <div className="mt-4 grid gap-2 border-t border-line pt-3">
          <div className="flex gap-1">
            {(["Held", "No-show"] as const).map((x) => (
              <button key={x} className={attendance === x ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setAttendance(x)}>
                {x}
              </button>
            ))}
          </div>
          {attendance === "No-show" ? (
            <select className="input h-9 text-[13px]" value={noShow} onChange={(e) => setNoShow(e.target.value as typeof noShow)}>
              <option value="seeker">The seeker did not come</option>
              <option value="provider">The provider did not come</option>
              <option value="both">Neither came</option>
            </select>
          ) : (
            <>
              <select className="input h-9 text-[13px]" value={o.category} onChange={(e) => setO({ ...o, category: e.target.value as DrOutcome["category"] })}>
                <option>Positive</option>
                <option>Follow-up needed</option>
                <option>Not a fit</option>
              </select>
              <input className="input h-9 text-[13px]" placeholder="Next action, for example send the data room link" value={o.nextAction} onChange={(e) => setO({ ...o, nextAction: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input h-9 text-[13px]" aria-label="Owner" value={o.owner} onChange={(e) => setO({ ...o, owner: e.target.value })}>
                  {owners.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <input className="input h-9 text-[13px]" type="date" aria-label="Due" value={o.due} onChange={(e) => setO({ ...o, due: e.target.value })} />
              </div>
              <textarea className="input min-h-16 text-[13px]" placeholder="Notes" value={o.notes} onChange={(e) => setO({ ...o, notes: e.target.value })} />
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={!!o.sensitive} onChange={(e) => setO({ ...o, sensitive: e.target.checked })} />
                Sensitive: the lead and the owner only
              </label>
            </>
          )}
          <button
            className="btn-primary btn-sm"
            onClick={() =>
              dispatch({
                type: "dr/outcome",
                meetingId: m.id,
                attendance,
                noShow: attendance === "No-show" ? noShow : undefined,
                outcome: attendance === "Held" ? { ...o, nextAction: o.nextAction?.trim() || undefined, clientId: `cl_${m.id}_${now.replace(/\D/g, "")}` } : undefined,
              })
            }
          >
            {dr.offline ? "Save on this device" : "Record"}
          </button>
          {attendance === "Held" && o.nextAction?.trim() && <p className="text-[12px] text-slate">A next action opens an opportunity owned by {staffName(dr, o.owner)}.</p>}
        </div>
      )}
      {m.status === "No-show" && present && can("schedule") && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[13px] font-medium">Refill: {present.org.name} is here</div>
          {refill.length === 0 ? (
            <p className="text-[13px] text-slate">No other accepted match of theirs is waiting for a slot.</p>
          ) : (
            refill.map((x) => {
              const other = dr.apps.find((a) => a.id === (x.seekerId === present.id ? x.providerId : x.seekerId))!;
              return (
                <div key={x.id} className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                  {other.org.name}
                  <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/refill", meetingId: m.id, matchId: x.id })}>
                    Offer the next slot here
                  </button>
                </div>
              );
            })
          )}
          <p className="mt-2 text-[12px] text-slate">The other party must still confirm; the slot is offered at this table first.</p>
        </div>
      )}
      <ul className="mt-3 border-t border-line pt-2">
        {m.history.slice(-5).map((h, i) => (
          <li key={i} className="text-[12px] text-slate">
            {fmtStamp(h.at)} · {h.what}
          </li>
        ))}
      </ul>
    </Section>
  );
}
