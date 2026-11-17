"use client";

/**
 * The live board (M3.4), for the lead, operations, coordinators and reviewers on the summit days, built for a phone
 * in the hand. What needs attention comes first (someone late, a no-show to mark, an outcome to record); then each
 * room and table as a row of the day's meetings, opened on the one happening now. A tap opens the meeting: on a
 * phone as a sheet from the bottom, on a big screen beside the board. Every phone asks every 3 seconds whether the
 * board changed, so the team sees the same board within seconds.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LiveBoard, LiveMeeting, OutcomeEntry } from "@excursia/contracts/live";
import { OUTCOMES } from "@excursia/contracts/sessions";
import { addMinutes, fmtStamp } from "@excursia/domain/time";
import { Empty, PageHeader, Section } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { useLiveActions, useLiveBoard, useLiveOffline } from "@/features/live/hooks/use-live";
import { deviceName, type SyncedResults } from "@/features/live/offline";
import type { OfflineRecord } from "@excursia/contracts/live";
import { Failed, Loading } from "../bits";

const STATUS: Record<LiveMeeting["status"], { label: string; tone: string }> = {
  Proposed: { label: "Proposed", tone: "bg-warn-50 text-warn" },
  "Change requested": { label: "Move asked", tone: "bg-warn-50 text-warn" },
  Rescheduled: { label: "Moved", tone: "bg-warn-50 text-warn" },
  Confirmed: { label: "To come", tone: "bg-paper-200 text-ink" },
  "In progress": { label: "Under way", tone: "bg-ok text-white" },
  Held: { label: "Held", tone: "bg-ink text-white" },
  "No-show": { label: "No-show", tone: "bg-bad-50 text-bad" },
  Cancelled: { label: "Cancelled", tone: "bg-paper-200 text-slate" },
};

export function LiveBoardView({ eventId, day, closeOut }: { eventId: string; day: string | null; closeOut: boolean }) {
  const [shown, setShown] = useState<string | null>(day);
  const [tab, setTab] = useState<"board" | "closeout">(closeOut ? "closeout" : "board");
  const [pick, setPick] = useState<string | null>(null);
  const session = useSession();
  const [device] = useState(() => deviceName(session.data?.user.name ?? ""));
  const q = useLiveBoard(eventId, shown, device);
  const off = useLiveOffline(eventId, q.data, q.dataUpdatedAt);
  if (q.isPending) return <Loading />;
  if (q.isError && !q.data) return <Failed error={q.error} />;
  const b = q.data!;
  const picked = b.meetings.find((m) => m.id === pick);
  const queued = (meetingId: string) => off.queue.find((r) => r.meetingId === meetingId);
  return (
    <>
      <PageHeader
        title="Live board"
        kicker={
          <>
            {fmtStamp(b.event.now)}. {b.counts.live} under way, {b.counts.upcoming} to come, {b.counts.held} held, {b.counts.noShow} no-show{b.counts.noShow === 1 ? "" : "s"}; {b.counts.arrived} checked in at the desk.
          </>
        }
        actions={<Freshness updatedAt={q.dataUpdatedAt} failing={q.isError} />}
      />
      {q.isError && (
        <p role="status" className="mb-4 rounded-md bg-warn-50 px-4 py-3 text-[14px] text-ink">
          <b className="font-medium">No connection{off.since ? ` since ${off.since.slice(11)}` : ""}.</b> The board shows what this phone last had. Outcomes you record wait on this phone
          {off.queue.length ? ` (${off.queue.length} waiting)` : ""} and send themselves when the connection is back.
        </p>
      )}
      {off.failed && off.queue.length > 0 && (
        <p role="alert" className="mb-4 rounded-md bg-bad-50 px-4 py-3 text-[14px] text-bad">
          {off.queue.length} record{off.queue.length === 1 ? "" : "s"} on this phone couldn&apos;t be sent: {off.failed} They stay here; tell the Deal Room lead.
        </p>
      )}
      {!q.isError && !off.failed && off.queue.length > 0 && (
        <p role="status" className="mb-4 rounded-md bg-paper-200 px-4 py-3 text-[14px]">
          Sending {off.queue.length} record{off.queue.length === 1 ? "" : "s"} kept on this phone…
        </p>
      )}
      {off.synced && <Synced summary={off.synced} b={b} onDismiss={off.dismiss} />}
      {b.conflicts.length > 0 && <Conflicts eventId={eventId} day={shown} b={b} record={off.record} />}
      {!b.inSummit && (
        <p className="mb-4 rounded-md bg-paper-200 px-4 py-3 text-[14px]">The summit isn&apos;t on today. This is {fmtStamp(`${b.day} 00:00`, false)} as planned; starting meetings and recording outcomes open on the day.</p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Summit days">
          {b.event.days.map((d, i) => (
            <button
              key={d}
              role="tab"
              aria-selected={d === b.day}
              className={d === b.day ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
              onClick={() => {
                setShown(d);
                setPick(null);
              }}
            >
              {/* one span: the button's flex gap would part the day's number from its date */}
              <span>
                Day {i + 1}
                <span className="hidden sm:inline">, {fmtStamp(`${d} 00:00`, false)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="tablist" aria-label="View">
          <button role="tab" aria-selected={tab === "board"} className={tab === "board" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setTab("board")}>
            Board
          </button>
          <button role="tab" aria-selected={tab === "closeout"} className={tab === "closeout" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setTab("closeout")}>
            Close-out
          </button>
        </div>
      </div>
      {tab === "closeout" ? (
        <CloseOut b={b} />
      ) : (
        <>
          <Attention b={b} onPick={setPick} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              <Rooms b={b} pick={pick} onPick={setPick} queued={(id) => !!queued(id)} />
            </div>
            {/* beside the board on a big screen; on a phone, a sheet from the bottom, where the thumb is */}
            {picked && <button className="fixed inset-0 z-30 bg-black/30 lg:hidden" aria-label="Close the meeting" onClick={() => setPick(null)} />}
            <div
              className={
                picked
                  ? "fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-[var(--r-lg)] bg-paper px-3 pb-[calc(24px+env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] lg:sticky lg:top-4 lg:z-auto lg:max-h-none lg:self-start lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none"
                  : "hidden lg:sticky lg:top-4 lg:block lg:self-start"
              }
              role={picked ? "dialog" : undefined}
              aria-label={picked ? `Meeting at ${picked.start.slice(11)}` : undefined}
            >
              {picked && (
                <div className="relative mb-1 flex h-11 items-center justify-center lg:hidden">
                  <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
                  <button className="btn-secondary btn-sm absolute right-0 top-1" onClick={() => setPick(null)}>
                    Close
                  </button>
                </div>
              )}
              {picked ? <Actions key={picked.id} eventId={eventId} day={shown} b={b} m={picked} waiting={queued(picked.id)} record={off.record} /> : <Empty>Tap a meeting to start it, record its outcome or offer a no-show&apos;s slot.</Empty>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** How fresh the board is: every phone asks every 3 seconds. */
function Freshness({ updatedAt, failing }: { updatedAt: number; failing: boolean }) {
  // the clock, ticked once a second: render stays pure
  const [now, setNow] = useState(updatedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  const ago = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] ${failing ? "text-bad" : "text-slate"}`} aria-live="polite">
      <span className={`size-2 rounded-full ${failing ? "bg-bad" : "bg-ok"}`} aria-hidden="true" />
      {failing ? "Can't reach the server: retrying" : ago <= 4 ? "Up to date" : `Updated ${ago} s ago`}
    </span>
  );
}

/** What needs attention now, each a tap away from its meeting. */
function Attention({ b, onPick }: { b: LiveBoard; onPick: (id: string) => void }) {
  const flagged = b.meetings.filter((m) => m.flag);
  if (!flagged.length) return null;
  const who = (m: LiveMeeting) => m.flag!.missing.map((s) => (s === "seeker" ? m.seeker.org : m.provider.org)).join(" and ");
  return (
    <section className="mb-4 rounded-[var(--r-md)] border border-line-strong bg-white" aria-labelledby="attention-title">
      <h2 id="attention-title" className="h2 px-4 pt-3">
        Needs attention, {flagged.length}
      </h2>
      <ul className="mt-1">
        {flagged.map((m) => (
          <li key={m.id} className="border-t border-line first:border-t-0">
            <button className="flex w-full items-start gap-3 px-4 py-3 text-left text-[14px] hover:bg-paper" onClick={() => onPick(m.id)}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${m.flag!.kind === "no-show" ? "bg-bad" : m.flag!.kind === "late" ? "bg-warn" : "bg-ink"}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-medium tabular-nums">{m.start.slice(11)}</span> · {m.where}
                <span className="block text-slate">
                  {m.flag!.kind === "outcome"
                    ? `Ended: record the outcome of ${m.seeker.org} with ${m.provider.org}`
                    : m.flag!.kind === "late"
                      ? `Starting soon; ${who(m)} not checked in`
                      : `${who(m)} more than ${b.lateMin} minutes late: mark a no-show?`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Each room and table as a row of the day's meetings, opened on the one happening now or next. */
function Rooms({ b, pick, onPick, queued }: { b: LiveBoard; pick: string | null; onPick: (id: string) => void; queued: (meetingId: string) => boolean }) {
  const rows = useMemo(() => {
    const out: { key: string; label: string; list: LiveMeeting[] }[] = [];
    for (const r of b.rooms)
      for (let t = 1; t <= r.tables; t++) {
        const list = b.meetings.filter((m) => m.roomId === r.id && m.table === t);
        if (list.length) out.push({ key: `${r.id}:${t}`, label: `${r.name}${r.tables > 1 ? `, table ${t}` : ""}`, list });
      }
    const online = b.meetings.filter((m) => m.online);
    if (online.length) out.push({ key: "online", label: "Online", list: online });
    return out;
  }, [b]);
  if (!rows.length) return <Empty>No meetings this day.</Empty>;
  return (
    <>
      {rows.map((r) => (
        <section key={r.key} className="surface p-3" aria-label={r.label}>
          <h3 className="mb-2 text-[13px] font-medium">{r.label}</h3>
          <Row focus={r.list.find((m) => m.end > b.event.now)?.id}>
            {r.list.map((m) => (
              <Tile key={m.id} m={m} now={b.event.now} on={pick === m.id} onPick={() => onPick(m.id)} waiting={queued(m.id)} />
            ))}
          </Row>
        </section>
      ))}
    </>
  );
}

function Row({ focus, children }: { focus?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const did = useRef(false);
  // open scrolled to the meeting happening now or next, once: a poll mustn't pull the row from under a thumb
  useEffect(() => {
    if (did.current) return;
    const row = ref.current;
    const tile = focus ? row?.querySelector<HTMLElement>(`[data-meeting="${focus}"]`) : null;
    if (row && tile) {
      row.scrollLeft = tile.offsetLeft - row.offsetLeft - 4;
      did.current = true;
    }
  }, [focus]);
  return (
    <div ref={ref} className="relative flex snap-x gap-2 overflow-x-auto pb-1">
      {children}
    </div>
  );
}

function Tile({ m, now, on, onPick, waiting }: { m: LiveMeeting; now: string; on: boolean; onPick: () => void; waiting: boolean }) {
  // a record kept on this phone shows here until it is sent
  const s = waiting ? { label: "On this phone", tone: "bg-warn-50 text-ink" } : STATUS[m.status];
  const nowish = m.start <= now && now < m.end;
  const ring = on ? "border-ink" : m.flag?.kind === "no-show" ? "border-bad" : m.flag ? "border-warn" : nowish ? "border-ok" : "border-line";
  return (
    // relative: the screen-reader text inside stays in the row that scrolls sideways, not off the page's edge
    <button data-meeting={m.id} onClick={onPick} aria-pressed={on} className={`relative w-48 shrink-0 snap-start rounded-[var(--r-sm)] border-2 px-3 py-2.5 text-left text-[13px] ${ring} ${m.status === "Held" ? "bg-paper" : "bg-white"}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium tabular-nums">{m.start.slice(11)}</span>
        <span className={`pill whitespace-nowrap ${s.tone}`}>{s.label}</span>
      </span>
      <Arrived label={m.seeker.org} at={m.seeker.arrived} />
      <Arrived label={m.provider.org} at={m.provider.arrived} />
    </button>
  );
}

function Arrived({ label, at }: { label: string; at: string | null }) {
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <span className={`size-2 shrink-0 rounded-full ${at ? "bg-ok" : "border border-line-strong"}`} aria-hidden="true" />
      <span className="truncate">{label}</span>
      <span className="sr-only">{at ? `checked in ${at.slice(11)}` : "not checked in"}</span>
    </span>
  );
}

/** One meeting: who, whether they are in, and the one tap for what comes next. */
function Actions({ eventId, day, b, m, waiting, record }: { eventId: string; day: string | null; b: LiveBoard; m: LiveMeeting; waiting?: OfflineRecord; record: (meetingId: string, input: OutcomeEntry) => void }) {
  const act = useLiveActions(eventId, day, record);
  const recorded = m.status === "Held" || m.status === "No-show";
  const [paper, setPaper] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<"Held" | "No-show">(!m.seeker.arrived || !m.provider.arrived ? (m.flag?.kind === "no-show" ? "No-show" : "Held") : "Held");
  const [noShow, setNoShow] = useState<"seeker" | "provider" | "both">(m.seeker.arrived ? "provider" : m.provider.arrived ? "seeker" : "both");
  const [category, setCategory] = useState<string>("Follow-up meeting");
  const [nextAction, setNextAction] = useState("");
  const [owner, setOwner] = useState(b.owners[0]?.id ?? "");
  const [due, setDue] = useState(addMinutes(b.event.now, 7 * 1440).slice(0, 10));
  const [notes, setNotes] = useState("");
  const [sensitive, setSensitive] = useState(false);
  // one id per record made here, so a retry or a second tap is recorded once
  const [clientId, setClientId] = useState(() => `web-${m.id}-${Date.now().toString(36)}`);
  const error = act.start.error ?? act.outcome.error ?? act.refill.error;
  const canForm = !waiting && (m.can.record || (m.can.paper && paper !== null));
  const s = STATUS[m.status];
  const submit = () =>
    act.outcome.mutate(
      {
        meetingId: m.id,
        input: {
          attendance,
          noShow: attendance === "No-show" ? noShow : undefined,
          outcome: attendance === "Held" ? { category: category as (typeof OUTCOMES)[number], nextAction: nextAction.trim() || undefined, owner: nextAction.trim() ? owner : undefined, due: nextAction.trim() ? due : undefined, notes: notes.trim() || undefined, sensitive } : undefined,
          paper: recorded ? (paper ?? "").trim() : undefined,
          clientId,
        },
      },
      {
        onSuccess: () => {
          setPaper(null);
          setClientId(`web-${m.id}-${Date.now().toString(36)}`);
        },
      },
    );
  return (
    <Section title={`${m.start.slice(11)} to ${m.end.slice(11)}`} action={<span className={`pill whitespace-nowrap ${s.tone}`}>{s.label}</span>}>
      <p className="text-[15px]">
        <b className="font-medium">{m.seeker.org}</b> ({m.seeker.person}) with <b className="font-medium">{m.provider.org}</b> ({m.provider.person})
      </p>
      <p className="mt-1 text-[14px] text-slate">{m.where}</p>
      <ul className="mt-3 space-y-1 text-[14px]">
        <li className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${m.seeker.arrived ? "bg-ok" : "border border-line-strong"}`} aria-hidden="true" />
          {m.seeker.org}: {m.seeker.arrived ? `checked in ${m.seeker.arrived.slice(11)}` : "not checked in"}
        </li>
        <li className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${m.provider.arrived ? "bg-ok" : "border border-line-strong"}`} aria-hidden="true" />
          {m.provider.org}: {m.provider.arrived ? `checked in ${m.provider.arrived.slice(11)}` : "not checked in"}
        </li>
      </ul>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {error.message}
        </p>
      )}

      {waiting && (
        <p className="mt-4 rounded-md bg-warn-50 px-3 py-2 text-[14px] text-ink">
          <b className="font-medium">Recorded on this phone at {waiting.at.slice(11)}:</b> {waiting.attendance === "No-show" ? "a no-show" : `held, ${waiting.outcome?.category.toLowerCase()}`}. It is sent when the connection is back.
        </p>
      )}
      {m.can.start && (
        <button className="btn-secondary mt-4 w-full sm:w-auto" disabled={act.start.isPending} onClick={() => act.start.mutate(m.id)}>
          {act.start.isPending ? "Starting…" : "Mark it under way"}
        </button>
      )}

      {m.outcome && (
        <div className="mt-4 rounded-md bg-paper-200 p-3 text-[14px]">
          <b className="font-medium">{m.outcome.category}</b>
          {m.outcome.nextAction && (
            <span className="block">
              Next: {m.outcome.nextAction}
              {m.outcome.owner ? `, ${m.outcome.owner}` : ""}
              {m.outcome.due ? `, by ${fmtStamp(`${m.outcome.due} 00:00`, false)}` : ""}
            </span>
          )}
          {m.outcome.sensitive && !m.outcome.notes ? <span className="block text-slate">Notes marked sensitive: the lead and the owner only.</span> : m.outcome.notes && <span className="block text-slate">{m.outcome.notes}</span>}
          <span className="mt-1 block text-[13px] text-slate">
            Recorded by {m.outcome.by}, {m.outcome.at.slice(11)}
          </span>
        </div>
      )}
      {m.can.paper && paper === null && (
        <button className="link mt-3 text-[14px]" onClick={() => setPaper("")}>
          Enter from the paper sheet
        </button>
      )}

      {canForm && (
        <form
          className="mt-4 grid gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {recorded && (
            <label className="block">
              <span className="label">Why the paper sheet replaces what&apos;s on record</span>
              <input className="input" placeholder="For example, the tablet was lost in the outage" maxLength={300} value={paper ?? ""} onChange={(e) => setPaper(e.target.value)} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Attendance">
            {(["Held", "No-show"] as const).map((x) => (
              <button type="button" role="radio" aria-checked={attendance === x} key={x} className={attendance === x ? "btn-primary" : "btn-secondary"} onClick={() => setAttendance(x)}>
                {x === "Held" ? "Held" : "No-show"}
              </button>
            ))}
          </div>
          {attendance === "No-show" ? (
            <label className="block">
              <span className="label">Who didn&apos;t come</span>
              <select className="input" value={noShow} onChange={(e) => setNoShow(e.target.value as typeof noShow)}>
                <option value="seeker">{m.seeker.org}</option>
                <option value="provider">{m.provider.org}</option>
                <option value="both">Neither of them</option>
              </select>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="label">Outcome</span>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {OUTCOMES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Next action (opens a follow-up with its owner)</span>
                <input className="input" placeholder="For example, send the data-room link" maxLength={300} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
              </label>
              {nextAction.trim() && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">Owner</span>
                    <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                      {b.owners.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Due</span>
                    <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                  </label>
                </div>
              )}
              <label className="block">
                <span className="label">Notes (optional)</span>
                <textarea className="input min-h-20" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
                Sensitive: the lead and the owner only
              </label>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary w-full sm:w-auto" disabled={act.outcome.isPending || (recorded && !paper?.trim())}>
              {act.outcome.isPending ? "Saving…" : recorded ? "Replace with the paper sheet" : attendance === "No-show" ? "Record the no-show" : "Record the outcome"}
            </button>
            {recorded && (
              <button type="button" className="btn-quiet" onClick={() => setPaper(null)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {m.status === "No-show" && m.refill.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-[15px] font-medium">Offer this slot</h3>
          <p className="mt-1 text-[13px] text-slate">The one who came has other pairs waiting for a time. The next free slot at this table goes to the pair chosen; both still confirm.</p>
          <ul className="mt-2 space-y-2">
            {m.refill.map((x) => (
              <li key={x.matchId} className="flex items-center justify-between gap-2 text-[14px]">
                {x.with}
                {m.can.refill ? (
                  <button className="btn-secondary btn-sm" disabled={act.refill.isPending} onClick={() => act.refill.mutate({ meetingId: m.id, matchId: x.matchId })}>
                    Offer it
                  </button>
                ) : (
                  <span className="text-[13px] text-slate">On the day, by operations or the lead</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-[13px] text-slate">Recent history</summary>
        <ul className="mt-2 space-y-1">
          {[...m.history].reverse().map((h, i) => (
            <li key={i} className="text-[13px] text-slate">
              {fmtStamp(h.at)} · {h.what}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

/** The day's close-out: the paper's checklist and what the records show, as the 19:00 report will. */
function CloseOut({ b }: { b: LiveBoard }) {
  const c = b.closeOut;
  const checks: [boolean, string][] = [
    [c.meetingsWithoutOutcome === 0, c.meetingsWithoutOutcome ? `${c.meetingsWithoutOutcome} meeting${c.meetingsWithoutOutcome === 1 ? "" : "s"} ended without an outcome` : `${c.meetingsHeld} meeting${c.meetingsHeld === 1 ? "" : "s"} held, every outcome recorded`],
    [c.sessionsWithoutAttendance === 0, c.sessionsWithoutAttendance ? `${c.sessionsWithoutAttendance} session${c.sessionsWithoutAttendance === 1 ? "" : "s"} ended with no attendance taken` : `${c.sessionsHeld} session${c.sessionsHeld === 1 ? "" : "s"} held, attendance taken`],
    [c.sessionOutcomesOpen === 0, c.sessionOutcomesOpen ? `${c.sessionOutcomesOpen} session attendee${c.sessionOutcomesOpen === 1 ? "" : "s"} without an outcome` : "Every session attendee has an outcome"],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={`Day ${b.event.days.indexOf(b.day) + 1}: ${fmtStamp(`${b.day} 00:00`, false)}`}>
        <p className="text-[15px]">{c.emphasis}</p>
        <h3 className="mt-4 text-[13px] font-medium text-slate">The close-out confirms</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
          {c.checklist.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Section>
      <Section title="What the records show">
        <ul className="space-y-2 text-[14px]">
          {checks.map(([ok, text]) => (
            <li key={text} className="flex items-start gap-2">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
              <span>
                <span className="sr-only">{ok ? "Done: " : "To do: "}</span>
                {text}
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-paper-200" aria-hidden="true" />
            {c.noShows} no-show{c.noShows === 1 ? "" : "s"}; {c.arrivals} checked in at the desk
          </li>
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[13px] text-slate">{c.reportSentAt ? `The day's report went to the lead at ${c.reportSentAt.slice(11)}.` : "The day's report goes to the lead at 19:00."}</p>
      </Section>
      {b.incidents.length > 0 && (
        <Section title="Outages today" className="lg:col-span-2">
          <ul className="space-y-2 text-[14px]">
            {b.incidents.map((i) => (
              <li key={i.id}>
                <b className="font-medium">
                  {i.startedAt.slice(11)} to {i.endedAt ? i.endedAt.slice(11) : "now"}
                </b>
                : {i.cause}.{" "}
                {i.synced + i.duplicates + i.conflicts === 0
                  ? "Nothing was recorded on it meanwhile."
                  : [i.synced ? `${i.synced} synced` : "", i.duplicates ? `${i.duplicates} already on record` : "", i.conflicts ? `${i.conflicts} for the lead to choose` : ""].filter(Boolean).join(", ") + "."}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** What the last sync did with this phone's records: nothing lost, and why anything was refused. */
function Synced({ summary, b, onDismiss }: { summary: SyncedResults; b: LiveBoard; onDismiss: () => void }) {
  const r = summary.results;
  const n = (k: string) => r.filter((x) => x.result === k).length;
  const refused = r.filter((x) => x.result === "refused");
  const when = (id: string) => b.meetings.find((m) => m.id === id)?.start.slice(11) ?? "";
  return (
    <section role="status" className="mb-4 rounded-md bg-ok-50 px-4 py-3 text-[14px] text-ink">
      <div className="flex items-start justify-between gap-3">
        <p>
          <b className="font-medium">Back online.</b>{" "}
          {[
            n("recorded") ? `${n("recorded")} record${n("recorded") === 1 ? "" : "s"} from this phone synced` : "",
            n("duplicate") ? `${n("duplicate")} already on record` : "",
            n("conflict") ? `${n("conflict")} disagree${n("conflict") === 1 ? "s" : ""} with another phone's record: the lead chooses` : "",
            refused.length ? `${refused.length} not recorded` : "",
          ]
            .filter(Boolean)
            .join(", ")
            .replace(/^./, (c) => c.toUpperCase())}
          .
        </p>
        <button className="btn-quiet btn-sm shrink-0" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {refused.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {refused.map((x) => (
            <li key={x.clientId}>
              {when(x.meetingId)}: not recorded. {x.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Two phones recorded a meeting differently during an outage: both kept, and the lead chooses. */
function Conflicts({ eventId, day, b, record }: { eventId: string; day: string | null; b: LiveBoard; record: (meetingId: string, input: OutcomeEntry) => void }) {
  const act = useLiveActions(eventId, day, record);
  return (
    <section className="mb-4 rounded-[var(--r-md)] border border-line-strong bg-white" aria-labelledby="conflicts-title">
      <h2 id="conflicts-title" className="h2 px-4 pt-3">
        Two phones disagree, {b.conflicts.length}
      </h2>
      <p className="px-4 text-[13px] text-slate">{b.can.resolve ? "Choose which record stands. The other is kept in the meeting's history." : "Recorded differently on two phones during an outage. The lead chooses; nothing is overwritten meanwhile."}</p>
      {act.resolve.error && (
        <p role="alert" className="mx-4 mt-2 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {act.resolve.error.message}
        </p>
      )}
      <ul className="mt-2">
        {b.conflicts.map((c) => (
          <li key={c.id} className="border-t border-line px-4 py-3 text-[14px]">
            <p>
              <b className="font-medium tabular-nums">{c.start.slice(11)}</b> · {c.where} · {c.pair}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-paper-200 px-3 py-2">
                <span className="block text-[13px] text-slate">On record, by {c.kept.by} at {c.kept.at.slice(11)}</span>
                {c.kept.label}
                {b.can.resolve && (
                  <button className="btn-secondary btn-sm mt-2 w-full" disabled={act.resolve.isPending} onClick={() => act.resolve.mutate({ conflictId: c.id, chose: "kept" })}>
                    Keep this one
                  </button>
                )}
              </div>
              <div className="rounded-md bg-paper-200 px-3 py-2">
                <span className="block text-[13px] text-slate">
                  From {c.incoming.device}, by {c.incoming.by} at {c.incoming.at.slice(11)}
                </span>
                {c.incoming.label}
                {b.can.resolve && (
                  <button className="btn-secondary btn-sm mt-2 w-full" disabled={act.resolve.isPending} onClick={() => act.resolve.mutate({ conflictId: c.id, chose: "incoming" })}>
                    Use this one
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
