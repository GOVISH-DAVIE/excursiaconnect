"use client";

/**
 * Meetings (M3.2), for operations, the lead and coordinators: the pairs both sides accepted, ready for a slot; the
 * schedule by day, room and table; the moves and confirmations waiting; and each party against its cap. A slot is
 * proposed by hand from the times the pair and a table are free, or for every ready pair at once by auto-propose.
 * The rules check every booking under the event's lock, and the database refuses a double booking whatever happens.
 */
import Link from "next/link";
import { useState } from "react";
import type { MeetingRow, Schedule } from "@excursia/contracts/meetings";
import { fmtStamp } from "@excursia/domain/time";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { useSchedule, useScheduleActions, useSlots } from "@/features/meetings/hooks/use-schedule";
import { Failed, Loading } from "../bits";

const TABS = ["Ready to schedule", "Schedule", "Changes", "Caps"] as const;
type Tab = (typeof TABS)[number];

export function ScheduleBoard({ eventId, tab, meeting }: { eventId: string; tab: string | null; meeting: string | null }) {
  const q = useSchedule(eventId);
  const [current, setCurrent] = useState<Tab>(tab === "changes" ? "Changes" : tab === "caps" ? "Caps" : meeting || tab === "schedule" ? "Schedule" : "Ready to schedule");
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const s = q.data;
  const changes = waiting(s).filter((m) => m.status === "Change requested").length;
  const booked = s.meetings.filter((m) => m.status !== "Cancelled" && !m.lapsed).length;
  return (
    <>
      <PageHeader
        title="Meetings"
        kicker={`${s.event.name}. ${booked} booked. A slot is ${s.rules.meetingMin} minutes (${s.rules.flaggedMin} for a DFI) with ${s.rules.bufferMin} between; a room, a table or a person is never booked twice. Each side confirms within ${s.rules.confirmHours} hours or the slot is released.`}
      />
      <Tabs tabs={TABS} value={current} onChange={setCurrent} counts={{ "Ready to schedule": s.ready.length, Changes: changes }} />
      {current === "Ready to schedule" && <Ready eventId={eventId} s={s} />}
      {current === "Schedule" && <Grid eventId={eventId} s={s} opened={meeting} />}
      {current === "Changes" && <Changes eventId={eventId} s={s} />}
      {current === "Caps" && <Caps s={s} />}
    </>
  );
}

/** The unconfirmed proposals and the moves, still open. */
const waiting = (s: Schedule) => s.meetings.filter((m) => !m.lapsed && (m.status === "Change requested" || m.status === "Proposed"));

function StatusPill({ m }: { m: MeetingRow }) {
  const [tone, label] = m.lapsed
    ? ["bg-paper-200 text-slate", "Lapsed"]
    : m.status === "Confirmed"
      ? ["bg-ok-50 text-ok", "Confirmed"]
      : m.status === "Held"
        ? ["bg-ink text-white", "Held"]
        : m.status === "In progress"
          ? ["bg-ok text-white", "Under way"]
          : m.status === "No-show" || m.status === "Cancelled"
            ? ["bg-bad-50 text-bad", m.status]
            : ["bg-warn-50 text-warn", m.status === "Change requested" ? "Move asked" : "Proposed"];
  return <span className={`pill whitespace-nowrap ${tone}`}>{label}</span>;
}

/* ---------- ready to schedule ---------- */

function Ready({ eventId, s }: { eventId: string; s: Schedule }) {
  const act = useScheduleActions(eventId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Section title={s.ready.length ? `${s.ready.length} pair${s.ready.length === 1 ? "" : "s"} ready to schedule` : "Ready to schedule"} flush>
        {s.ready.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>Every pair both sides accepted has a slot. New ones appear here as introductions are accepted, and again if a proposal lapses.</Empty>
          </div>
        ) : (
          <ul className="border-t border-line">
            {s.ready.map((p) => (
              <li key={p.matchId} className="border-b border-line px-5 py-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-[14px]">
                    <Link className="font-medium hover:underline" href={`/team/matching/${p.matchId}`}>
                      {p.seeker.org} · {p.provider.org}
                    </Link>
                    <span className="block text-[12px] text-slate">
                      {p.provider.label} · both accepted {fmtStamp(p.acceptedAt)}
                      {p.flagged ? ` · ${s.rules.flaggedMin}-minute slot` : ""}
                    </span>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => setOpen(open === p.matchId ? null : p.matchId)}>
                    {open === p.matchId ? "Close" : "Propose a slot"}
                  </button>
                </div>
                {open === p.matchId && <SlotPicker eventId={eventId} s={s} pair={p} onDone={() => setOpen(null)} />}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Auto-propose">
        <p className="text-[14px] text-slate">Proposes the earliest free slot for every ready pair, inside the rules and the caps. Confirmed meetings never move; each proposal still needs both sides to confirm.</p>
        {act.autoPropose.error && (
          <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
            {act.autoPropose.error.message}
          </p>
        )}
        {act.autoPropose.data && (
          <p className="mt-3 text-[14px] text-ok">
            {act.autoPropose.data.proposed} proposed{act.autoPropose.data.left ? `; ${act.autoPropose.data.left} found no free slot` : ""}. Both sides are emailed to confirm.
          </p>
        )}
        <button className="btn-primary mt-3 w-full sm:w-auto" disabled={!s.ready.length || act.autoPropose.isPending} onClick={() => act.autoPropose.mutate()}>
          {act.autoPropose.isPending ? "Proposing…" : "Propose a schedule"}
        </button>
      </Section>
    </div>
  );
}

/**
 * The slot picker: a day, then each time with the tables free for the pair, or why the pair can't meet then.
 * For a meeting being moved, its own slot counts as free.
 */
function SlotPicker({ eventId, s, pair, meeting, onDone }: { eventId: string; s: Schedule; pair: { matchId: string; flagged: boolean }; meeting?: MeetingRow; onDone: () => void }) {
  const act = useScheduleActions(eventId);
  const days = s.event.days.filter((d) => d >= s.event.now.slice(0, 10));
  const [day, setDay] = useState(meeting && days.includes(meeting.start.slice(0, 10)) ? meeting.start.slice(0, 10) : (days[0] ?? ""));
  const [flagged, setFlagged] = useState(meeting?.flagged ?? pair.flagged);
  const [time, setTime] = useState("");
  const [spot, setSpot] = useState("");
  const [override, setOverride] = useState("");
  const q = useSlots(eventId, day ? { matchId: pair.matchId, day, flagged, meetingId: meeting?.id } : null);
  const open = (q.data?.times ?? []).filter((t) => !t.problem);
  const chosen = open.find((t) => t.time === time);
  const table = chosen?.free.find((f) => `${f.roomId}:${f.table}` === spot) ?? chosen?.free[0];
  const caps = chosen?.caps ?? [];
  const mutation = meeting ? act.move : act.propose;
  const submit = () => {
    if (!chosen || !table) return;
    const body = { start: `${day} ${chosen.time}`, roomId: table.roomId, table: table.table, override: override.trim() || undefined };
    if (meeting) act.move.mutate({ meetingId: meeting.id, input: body }, { onSuccess: onDone });
    else act.propose.mutate({ ...body, matchId: pair.matchId, flagged }, { onSuccess: onDone });
  };
  return (
    <div className="mt-3 space-y-3 rounded-md bg-paper p-3">
      <div className="flex flex-wrap gap-1">
        {days.map((d) => (
          <button
            key={d}
            className={d === day ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            onClick={() => {
              setDay(d);
              setTime("");
              setSpot("");
            }}
          >
            {fmtStamp(`${d} 00:00`, false)}
          </button>
        ))}
      </div>
      {!meeting && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
          {s.rules.flaggedMin}-minute slot (a lead sponsor or a DFI)
        </label>
      )}
      {q.isPending ? (
        <p className="text-[13px] text-slate">Looking for free times…</p>
      ) : q.isError ? (
        <Failed error={q.error} />
      ) : open.length === 0 ? (
        <p className="text-[13px] text-slate">No time that day: {[...new Set((q.data?.times ?? []).map((t) => t.problem))].slice(0, 2).join("; ")}.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Time</span>
            <select
              className="input"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setSpot("");
              }}
            >
              <option value="">Choose ({open.length} free)</option>
              {open.map((t) => (
                <option key={t.time} value={t.time}>
                  {t.time} · {t.free.length} table{t.free.length === 1 ? "" : "s"}
                  {t.caps.length ? " · over a cap" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Room and table</span>
            <select className="input" value={table ? `${table.roomId}:${table.table}` : ""} disabled={!chosen} onChange={(e) => setSpot(e.target.value)}>
              {!chosen && <option value="">Choose a time first</option>}
              {chosen?.free.map((f) => (
                <option key={`${f.roomId}:${f.table}`} value={`${f.roomId}:${f.table}`}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {caps.length > 0 && (
        <div className="rounded-md bg-warn-50 px-3 py-2 text-[13px] text-warn">
          {caps.join("; ")}.{" "}
          {s.can.override ? (
            <input className="input mt-2 bg-white" placeholder="Why go over the cap (logged as an exception)" maxLength={300} value={override} onChange={(e) => setOverride(e.target.value)} />
          ) : (
            "Only operations or the lead can go over a cap."
          )}
        </div>
      )}
      {mutation.error && (
        <p role="alert" className="rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {mutation.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={!chosen || !table || mutation.isPending || (caps.length > 0 && !override.trim())} onClick={submit}>
          {mutation.isPending ? "Saving…" : meeting ? "Move it here" : "Propose this slot"}
        </button>
        <button className="btn-quiet btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
      {meeting && <p className="text-[12px] text-slate">A new time asks both sides to confirm again; the same time in another room keeps their confirmations.</p>}
    </div>
  );
}

/* ---------- the schedule by day ---------- */

function Grid({ eventId, s, opened }: { eventId: string; s: Schedule; opened: string | null }) {
  const first = s.meetings.find((m) => m.id === opened);
  const today = s.event.now.slice(0, 10);
  const [day, setDay] = useState(first?.start.slice(0, 10) ?? s.event.days.find((d) => d === today) ?? s.event.days[0]);
  const [pick, setPick] = useState<string | null>(first?.id ?? null);
  const todays = s.meetings.filter((m) => m.start.slice(0, 10) === day && m.status !== "Cancelled" && !m.lapsed);
  const rows = s.rooms.flatMap((r) => Array.from({ length: r.tables }, (_, i) => ({ r, table: i + 1 })));
  const short = (m: MeetingRow) => `${m.seeker.org.split(" ")[0]} · ${m.provider.org.split(" ")[0]}`;
  const tone = (m: MeetingRow) => (m.status === "Held" ? "bg-ink text-white" : m.status === "In progress" ? "bg-ok text-white" : m.status === "No-show" ? "bg-bad-50 text-bad" : m.status === "Confirmed" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn");
  const picked = s.meetings.find((m) => m.id === pick);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1">
        {s.event.days.map((d) => (
          <button key={d} className={d === day ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setDay(d)}>
            {fmtStamp(`${d} 00:00`, false)} ({s.meetings.filter((m) => m.start.slice(0, 10) === d && m.status !== "Cancelled" && !m.lapsed).length})
          </button>
        ))}
      </div>
      {picked && <MeetingPanel eventId={eventId} s={s} m={picked} onClose={() => setPick(null)} />}
      {/* a phone gets the day as a list; a wider screen the grid of rooms and times */}
      <Section title={`${todays.length} meeting${todays.length === 1 ? "" : "s"}`} flush className="sm:hidden">
        {todays.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>Nothing booked this day.</Empty>
          </div>
        ) : (
          <ul className="border-t border-line">
            {todays.map((m) => (
              <li key={m.id}>
                <button className="flex w-full items-start justify-between gap-2 border-b border-line px-5 py-3 text-left text-[14px] hover:bg-paper" onClick={() => setPick(m.id)}>
                  <span className="min-w-0">
                    {m.start.slice(11)} · {m.seeker.org} · {m.provider.org}
                    <span className="block text-[12px] text-slate">{m.where}</span>
                  </span>
                  <StatusPill m={m} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="surface hidden overflow-x-auto sm:block">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="th sticky left-0 z-10 bg-white">Room, table</th>
              {s.times.map((t) => (
                <th key={t} className="th px-1 text-center">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, table }) => (
              <tr key={`${r.id}:${table}`}>
                <td className="td sticky left-0 z-10 whitespace-nowrap bg-white">
                  {r.name}
                  {r.tables > 1 ? `, ${table}` : ""}
                </td>
                {s.times.map((t) => {
                  const m = todays.find((x) => x.roomId === r.id && x.table === table && x.start.slice(11) === t);
                  const busy = !m && todays.some((x) => x.roomId === r.id && x.table === table && x.start.slice(11) < t && x.end.slice(11) > t);
                  return (
                    <td key={t} className={`min-w-[92px] border border-line p-0.5 align-top ${busy ? "bg-paper-200" : ""}`}>
                      {m && (
                        <button className={`w-full rounded px-1.5 py-1 text-left ${tone(m)}`} onClick={() => setPick(m.id)}>
                          <span className="block truncate font-medium">{short(m)}</span>
                          <span className="block opacity-80">{m.status === "Change requested" ? "Move asked" : m.status}</span>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {todays.some((m) => m.online) && <p className="mt-2 text-[13px] text-slate">Online: {todays.filter((m) => m.online).map((m) => `${m.start.slice(11)} ${short(m)}`).join("; ")}</p>}
    </>
  );
}

/** One meeting: who, where, where it stands, its history, and what the team can do with it. */
function MeetingPanel({ eventId, s, m, onClose }: { eventId: string; s: Schedule; m: MeetingRow; onClose: () => void }) {
  const act = useScheduleActions(eventId);
  const [mode, setMode] = useState<"" | "move" | "cancel" | "decline">("");
  const [reason, setReason] = useState("");
  const live = !m.lapsed && (m.status === "Proposed" || m.status === "Confirmed" || m.status === "Change requested");
  const error = act.accept.error ?? act.cancel.error ?? act.decline.error;
  const confirmed = (c: string | null) => (c ? `confirmed ${fmtStamp(c)}` : "not confirmed");
  return (
    <Section
      title={`${fmtStamp(m.start)} to ${m.end.slice(11)}`}
      className="mb-4"
      action={
        <span className="flex items-center gap-2">
          <StatusPill m={m} />
          <button className="btn-quiet btn-sm" aria-label="Close the meeting" onClick={onClose}>
            ×
          </button>
        </span>
      }
    >
      <p className="text-[15px]">
        <Link className="font-medium hover:underline" href={`/team/matching/${m.matchId}`}>
          {m.seeker.org} · {m.provider.org}
        </Link>
        , {m.where}
        {m.flagged ? `, ${s.rules.flaggedMin} minutes` : ""}.
      </p>
      <p className="mt-1 text-[13px] text-slate">
        {m.seeker.org}: {confirmed(m.seeker.confirmed)}. {m.provider.org}: {confirmed(m.provider.confirmed)}.
        {m.confirmBy && !m.lapsed ? ` Lapses ${fmtStamp(m.confirmBy)} unless both confirm.` : ""}
        {m.override ? ` Over a cap: ${m.override}` : ""}
      </p>
      {m.change && m.status === "Change requested" && (
        <div className="mt-3 rounded-md bg-paper p-3 text-[14px]">
          {m.change.by === "seeker" ? m.seeker.org : m.provider.org} asks to move it{m.change.start ? ` to ${fmtStamp(m.change.start)}` : ""}: {m.change.reason}
          <span className="mt-1 block text-[13px] text-slate">
            {!m.change.start ? "No time named: move it to a slot that suits both, or decline." : m.change.agreed ? `The other side agreed ${fmtStamp(m.change.agreed)}: accept it to book the new time.` : "Waiting for the other side to agree."}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {error.message}
        </p>
      )}
      {live && !mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.status === "Change requested" && m.change?.start && m.change.agreed && (
            <button className="btn-primary btn-sm" disabled={act.accept.isPending} onClick={() => act.accept.mutate(m.id)}>
              Accept the move
            </button>
          )}
          {m.status === "Change requested" && (
            <button className="btn-secondary btn-sm" onClick={() => { setMode("decline"); setReason(""); }}>
              Decline the move
            </button>
          )}
          <button className="btn-secondary btn-sm" onClick={() => setMode("move")}>
            Move
          </button>
          <button className="btn-secondary btn-sm" onClick={() => { setMode("cancel"); setReason(""); }}>
            Cancel the meeting
          </button>
        </div>
      )}
      {mode === "move" && <SlotPicker eventId={eventId} s={s} pair={{ matchId: m.matchId, flagged: m.flagged }} meeting={m} onDone={() => setMode("")} />}
      {(mode === "cancel" || mode === "decline") && (
        <div className="mt-3 space-y-2">
          <input className="input" placeholder={mode === "cancel" ? "Why it is cancelled, for both sides" : "Why the move can't be made, for both sides"} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={!reason.trim() || act.cancel.isPending || act.decline.isPending}
              onClick={() =>
                mode === "cancel"
                  ? act.cancel.mutate({ meetingId: m.id, reason: reason.trim() }, { onSuccess: () => setMode("") })
                  : act.decline.mutate({ meetingId: m.id, reason: reason.trim() }, { onSuccess: () => setMode("") })
              }
            >
              {mode === "cancel" ? "Cancel it" : "Decline the move"}
            </button>
            <button className="btn-quiet btn-sm" onClick={() => setMode("")}>
              Back
            </button>
          </div>
        </div>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-[13px] text-slate">History, {m.history.length} {m.history.length === 1 ? "entry" : "entries"}</summary>
        <ul className="mt-2 space-y-1 text-[13px]">
          {[...m.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="text-slate">{fmtStamp(h.at)}</span> · {h.who}: {h.what}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

/* ---------- waiting on someone ---------- */

function Changes({ eventId, s }: { eventId: string; s: Schedule }) {
  const [pick, setPick] = useState<string | null>(null);
  const list = waiting(s).sort((a, b) => (a.status === b.status ? a.start.localeCompare(b.start) : a.status === "Change requested" ? -1 : 1));
  const picked = s.meetings.find((m) => m.id === pick);
  return (
    <>
      {picked && <MeetingPanel eventId={eventId} s={s} m={picked} onClose={() => setPick(null)} />}
      <Section title="Waiting on someone" flush>
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>Nothing waiting: every proposal is confirmed and no one asked to move a meeting.</Empty>
          </div>
        ) : (
          <ul className="border-t border-line">
            {list.map((m) => (
              <li key={m.id}>
                <button className="flex w-full flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3 text-left text-[14px] hover:bg-paper" onClick={() => setPick(m.id)}>
                  <span className="min-w-0">
                    {m.seeker.org} · {m.provider.org}
                    <span className="block text-[12px] text-slate">
                      {fmtStamp(m.start)} ·{" "}
                      {m.change && m.status === "Change requested"
                        ? `${m.change.by === "seeker" ? m.seeker.org : m.provider.org} asks to move it${m.change.start ? ` to ${fmtStamp(m.change.start)}` : ""}; ${!m.change.start ? "the team picks a time" : m.change.agreed ? "both agreed, ready to accept" : "waiting for the other side"}`
                        : `to confirm: ${[!m.seeker.confirmed && m.seeker.org, !m.provider.confirmed && m.provider.org].filter(Boolean).join(" and ")}${m.confirmBy ? `, by ${fmtStamp(m.confirmBy)}` : ""}`}
                    </span>
                  </span>
                  <StatusPill m={m} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/* ---------- caps ---------- */

function Caps({ s }: { s: Schedule }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Investors and partners, per day against their cap" flush>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Counterparty</th>
                {s.event.days.map((d) => (
                  <th key={d} className="th-r whitespace-nowrap">
                    {fmtStamp(`${d} 00:00`, false).split(" ").slice(1).join(" ")}
                  </th>
                ))}
                <th className="th-r">All</th>
              </tr>
            </thead>
            <tbody>
              {s.caps.providers.map((p) => (
                <tr key={p.id}>
                  <td className="td text-[13px]">{p.org}</td>
                  {p.days.map((n, i) => (
                    <td key={i} className={`td-r text-[13px] ${n >= p.perDay ? "font-medium text-bad" : ""}`}>
                      {n}/{p.perDay}
                    </td>
                  ))}
                  <td className={`td-r text-[13px] ${p.total >= p.perEvent ? "font-medium text-bad" : ""}`}>
                    {p.total}/{p.perEvent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={`Seekers, against the cap of ${s.rules.seekerCap}`} flush>
        {s.caps.seekers.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No seeker has a meeting yet.</Empty>
          </div>
        ) : (
          <table className="w-full">
            <tbody>
              {s.caps.seekers.map((x) => (
                <tr key={x.id}>
                  <td className="td text-[13px]">{x.org}</td>
                  <td className={`td-r text-[13px] ${x.total >= s.rules.seekerCap ? "font-medium text-bad" : ""}`}>
                    {x.total}/{s.rules.seekerCap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

