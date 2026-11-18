"use client";

/**
 * Sessions (M3.3), for the lead, operations, coordinators and reviewers: the decision paper's formats beyond
 * one-to-one meetings, day by day. The lead, operations and coordinators plan them in the session rooms, invite
 * approved or verified participants, move and cancel them; on the day, attendance is taken and each attendee's
 * outcome recorded. A session someone accepted holds their time: no meeting goes over it, and it can't be moved
 * onto a meeting of theirs.
 */
import { useState } from "react";
import type { SessionInput, SessionPhase, SessionPerson, SessionRow, SessionsBoard } from "@excursia/contracts/sessions";
import { OUTCOMES } from "@excursia/contracts/sessions";
import { fmtStamp } from "@excursia/domain/time";
import { Empty, PageHeader, Section } from "@/components/ui";
import { useInvitable, useSessionActions, useSessionsBoard } from "@/features/sessions/hooks/use-sessions";
import { Failed, Loading } from "../bits";

const PHASE_TONE: Record<SessionPhase, string> = { Planned: "bg-paper-200 text-ink", "In progress": "bg-ok text-white", Held: "bg-ink text-white", Cancelled: "bg-bad-50 text-bad" };

export function SessionsBoardView({ eventId, opened }: { eventId: string; opened: string | null }) {
  const q = useSessionsBoard(eventId);
  const first = q.data?.sessions.find((s) => s.id === opened);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(opened);
  const [planning, setPlanning] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const b = q.data;
  const today = b.event.now.slice(0, 10);
  const current = day ?? first?.start.slice(0, 10) ?? b.event.days.find((d) => d === today) ?? b.event.days[0];
  const list = b.sessions.filter((s) => s.start.slice(0, 10) === current);
  const picked = b.sessions.find((s) => s.id === pick);
  return (
    <>
      <PageHeader
        title="Sessions"
        kicker={`${b.event.name}. Presentations, briefings, clinics and roundtables in the session rooms. A session someone accepts holds their time: no meeting is booked over it.`}
        actions={
          b.can.plan ? (
            <button className="btn-primary" onClick={() => setPlanning((v) => !v)}>
              {planning ? "Close the form" : "Plan a session"}
            </button>
          ) : undefined
        }
      />
      {planning && (
        <PlanForm
          eventId={eventId}
          b={b}
          day={current}
          onDone={(id) => {
            setPlanning(false);
            if (id) setPick(id);
          }}
        />
      )}
      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Summit days">
        {b.event.days.map((d, i) => (
          <button key={d} role="tab" aria-selected={d === current} className={d === current ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setDay(d)}>
            {/* one span: the button's flex gap would part the day's number from its date */}
            <span>
              Day {i + 1}
              <span className="hidden sm:inline">, {fmtStamp(`${d} 00:00`, false)}</span> · {b.sessions.filter((s) => s.start.slice(0, 10) === d && s.phase !== "Cancelled").length}
            </span>
          </button>
        ))}
      </div>
      {picked && <SessionPanel key={picked.id} eventId={eventId} b={b} s={picked} onClose={() => setPick(null)} />}
      <Section title={`${list.filter((s) => s.phase !== "Cancelled").length} session${list.length === 1 ? "" : "s"}`} flush>
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No sessions this day.{b.can.plan ? " Plan one with the button above." : ""}</Empty>
          </div>
        ) : (
          <ul className="border-t border-line">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line px-5 py-3 text-left text-[14px] hover:bg-paper sm:grid-cols-[120px_minmax(0,1fr)_150px_170px_auto] sm:items-start ${pick === s.id ? "bg-paper" : ""}`}
                  aria-expanded={pick === s.id}
                  onClick={() => setPick(pick === s.id ? null : s.id)}
                >
                  <span className="tabular-nums text-slate sm:text-ink">
                    {s.start.slice(11)} to {s.end.slice(11)}
                    <span className="sm:hidden"> · {s.room}</span>
                  </span>
                  <span className="justify-self-end sm:order-last sm:justify-self-start">
                    <span className={`pill whitespace-nowrap ${PHASE_TONE[s.phase]}`}>{s.phase}</span>
                  </span>
                  <span className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-[13px] text-slate">
                      {s.short} · {s.host ? `hosted by ${s.host.org}` : "run by the Deal Room team"}
                    </span>
                  </span>
                  <span className="hidden sm:block">{s.room}</span>
                  <span className="col-span-2 text-[13px] text-slate sm:col-span-1">
                    {s.counts.accepted} going, {s.counts.declined} declined, {s.counts.waiting} to answer
                    {s.phase !== "Planned" && s.phase !== "Cancelled" ? ` · ${s.counts.attended} attended${s.counts.outcomesOpen ? `, ${s.counts.outcomesOpen} outcome${s.counts.outcomesOpen === 1 ? "" : "s"} to record` : ""}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** Plan a session, or change one: the rules check it on the server and say why not. */
function PlanForm({ eventId, b, day, session, onDone }: { eventId: string; b: SessionsBoard; day: string; session?: SessionRow; onDone: (id?: string) => void }) {
  const act = useSessionActions(eventId);
  const [format, setFormat] = useState<SessionInput["format"]>(session?.format ?? b.formats[0].format);
  const [title, setTitle] = useState(session?.title ?? "");
  const [date, setDate] = useState(session?.start.slice(0, 10) ?? day);
  const [start, setStart] = useState(session?.start.slice(11) ?? "14:00");
  const [end, setEnd] = useState(session?.end.slice(11) ?? "15:00");
  const [roomId, setRoom] = useState(session?.roomId ?? b.rooms[0]?.id ?? "");
  const [host, setHost] = useState(session?.host?.id ?? "");
  const [track, setTrack] = useState(session?.track?.id ?? "");
  const info = b.formats.find((f) => f.format === format)!;
  const hosts = b.candidates.filter((c) => info.hostKind === "none" || c.hosts.includes(info.hostKind));
  const mutation = session ? act.update : act.plan;
  const input: SessionInput = { format, title, start: `${date} ${start}`, end: `${date} ${end}`, roomId, host: host || null, track: track || null };
  const submit = () => (session ? act.update.mutate({ sessionId: session.id, input }, { onSuccess: () => onDone() }) : act.plan.mutate(input, { onSuccess: (row) => onDone(row.id) }));
  const form = (
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block sm:col-span-2">
          <span className="label">Format</span>
          <select
            className="input"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as SessionInput["format"]);
              setHost("");
            }}
          >
            {b.formats.map((f) => (
              <option key={f.format} value={f.format}>
                {f.format}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Title</span>
          <input className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="Scale-up pitches: AI, software and fintech" />
        </label>
        <label className="block">
          <span className="label">Day</span>
          <select className="input" value={date} onChange={(e) => setDate(e.target.value)}>
            {b.event.days.map((d, i) => (
              <option key={d} value={d}>
                Day {i + 1}, {fmtStamp(`${d} 00:00`, false)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">From</span>
          <input className="input" type="time" step={300} min={b.dayStart} max={b.dayEnd} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input className="input" type="time" step={300} min={b.dayStart} max={b.dayEnd} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Room</span>
          <select className="input" value={roomId} onChange={(e) => setRoom(e.target.value)}>
            {b.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">{info.hostKind === "none" ? "Host (optional: the team runs this format)" : "Host"}</span>
          <select className="input" value={host} onChange={(e) => setHost(e.target.value)}>
            <option value="">{info.hostKind === "none" ? "The Deal Room team" : "Choose who hosts"}</option>
            {hosts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.org}, {c.label.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Strategic track (optional)</span>
          <select className="input" value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="">Any</option>
            {b.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} {t.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[13px] text-slate sm:col-span-2 lg:col-span-4">{info.what}</p>
        {mutation.error && (
          <p role="alert" className="rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad sm:col-span-2 lg:col-span-4">
            {mutation.error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn-primary" disabled={mutation.isPending || !title.trim()}>
            {mutation.isPending ? "Saving…" : session ? "Save the change" : "Plan it"}
          </button>
          <button type="button" className="btn-quiet" onClick={() => onDone()}>
            Cancel
          </button>
        </div>
      </form>
  );
  // planning stands on its own; a change sits inside the open session, so it takes no second card
  return session ? (
    <div>
      <h3 className="mb-3 text-[15px] font-medium">Move or change it</h3>
      {form}
    </div>
  ) : (
    <Section title="Plan a session" className="mb-4">
      {form}
    </Section>
  );
}

/** One session: its details, who is in it and how they answered, attendance and outcomes, and what to do next. */
function SessionPanel({ eventId, b, s, onClose }: { eventId: string; b: SessionsBoard; s: SessionRow; onClose: () => void }) {
  const act = useSessionActions(eventId);
  const [mode, setMode] = useState<"" | "change" | "cancel" | "invite">("");
  const [reason, setReason] = useState("");
  const error = act.cancel.error ?? act.attend.error;
  return (
    <section className="surface mb-4" aria-label={s.title}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-[13px] text-slate">{s.format}</p>
          <h2 className="h2 mt-0.5">{s.title}</h2>
          <p className="mt-1 text-[13px] text-slate">
            {fmtStamp(s.start)} to {s.end.slice(11)} · {s.room} · run by {s.owner}
            {s.track ? ` · ${s.track.name}` : ""}
          </p>
        </div>
        <span className="flex items-center gap-2">
          <span className={`pill whitespace-nowrap ${PHASE_TONE[s.phase]}`}>{s.phase}</span>
          <button className="btn-quiet btn-sm" aria-label="Close the session" onClick={onClose}>
            Close
          </button>
        </span>
      </div>
      {s.cancelled && (
        <p className="border-b border-line bg-bad-50 px-5 py-2 text-[14px] text-bad">
          Cancelled {fmtStamp(s.cancelled.at)}: {s.cancelled.reason}
        </p>
      )}
      {error && (
        <p role="alert" className="mx-5 mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {error.message}
        </p>
      )}

      {s.can.change && !mode && (
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          <button className="btn-secondary btn-sm" onClick={() => setMode("invite")}>
            Invite people
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setMode("change")}>
            Move or change
          </button>
          <button
            className="btn-quiet btn-sm"
            onClick={() => {
              setMode("cancel");
              setReason("");
            }}
          >
            Cancel the session
          </button>
        </div>
      )}
      {mode === "change" && (
        <div className="border-b border-line px-5 py-4">
          <PlanForm eventId={eventId} b={b} day={s.start.slice(0, 10)} session={s} onDone={() => setMode("")} />
        </div>
      )}
      {mode === "cancel" && (
        <div className="space-y-2 border-b border-line px-5 py-4">
          <label className="block">
            <span className="label">Why it is cancelled, for everyone attending</span>
            <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" disabled={!reason.trim() || act.cancel.isPending} onClick={() => act.cancel.mutate({ sessionId: s.id, reason: reason.trim() }, { onSuccess: () => setMode("") })}>
              {act.cancel.isPending ? "Cancelling…" : "Cancel it"}
            </button>
            <button className="btn-quiet btn-sm" onClick={() => setMode("")}>
              Back
            </button>
          </div>
        </div>
      )}
      {mode === "invite" && <Invite eventId={eventId} s={s} onDone={() => setMode("")} />}

      {s.people.length === 0 ? (
        <p className="px-5 py-4 text-[14px] text-slate">No one invited yet.</p>
      ) : (
        <ul>
          <li className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.6fr)] gap-3 px-5 py-2 text-[13px] font-medium text-slate sm:grid" aria-hidden="true">
            <span>Participant</span>
            <span>Answer</span>
            <span>Attendance</span>
            <span>Outcome</span>
          </li>
          {s.people.map((p) => (
            <PersonRow key={p.id} eventId={eventId} s={s} p={p} />
          ))}
        </ul>
      )}

      <details className="border-t border-line px-5 py-3">
        <summary className="cursor-pointer text-[13px] text-slate">History, {s.history.length} {s.history.length === 1 ? "entry" : "entries"}</summary>
        <ul className="mt-2 space-y-1 text-[13px]">
          {[...s.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="text-slate">{fmtStamp(h.at)}</span> {h.who ? `${h.who}: ` : ""}
              {h.what}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** One person in a session: answer, a large attendance tick on the day, and their outcome once present. */
function PersonRow({ eventId, s, p }: { eventId: string; s: SessionRow; p: SessionPerson }) {
  const act = useSessionActions(eventId);
  const going = p.host || p.answer === "Accepted";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-t border-line px-5 py-3 text-[14px] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]">
      <div className="min-w-0">
        <span className="font-medium">{p.org}</span>
        <span className="block text-[13px] text-slate">{p.host ? "Host" : p.label}</span>
      </div>
      <div className="justify-self-end sm:justify-self-start">
        {p.host ? <span className="pill bg-ink text-white">Hosting</span> : p.answer ? <span className={`pill ${p.answer === "Accepted" ? "bg-ok-50 text-ok" : "bg-paper-200 text-slate"}`}>{p.answer === "Accepted" ? "Going" : "Declined"}</span> : <span className="text-[13px] text-slate">No answer yet</span>}
      </div>
      <div className="col-span-2 sm:col-span-1">
        {s.can.attend && (going || p.attended) ? (
          <label className={`flex min-h-11 items-center gap-3 rounded-md border px-3 text-[14px] sm:min-h-0 sm:border-0 sm:px-0 ${p.attended ? "border-ok bg-ok-50 sm:bg-transparent" : "border-line"}`}>
            <input type="checkbox" className="size-5 sm:size-4" checked={p.attended} disabled={act.attend.isPending} onChange={(e) => act.attend.mutate({ sessionId: s.id, appId: p.id, present: e.target.checked })} />
            {p.attended ? "Present" : "Tap when they arrive"}
          </label>
        ) : (
          <span className="text-[13px] text-slate">{p.attended ? "Present" : s.phase === "Held" && going ? "Absent" : "–"}</span>
        )}
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">{p.host ? <span className="text-[13px] text-slate">–</span> : <OutcomeCell eventId={eventId} s={s} p={p} />}</div>
    </li>
  );
}

function OutcomeCell({ eventId, s, p }: { eventId: string; s: SessionRow; p: SessionPerson }) {
  const act = useSessionActions(eventId);
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(p.outcome?.category ?? "");
  const [note, setNote] = useState(p.outcome?.note ?? "");
  const editable = s.can.outcome && p.attended;
  if (!editable || (p.outcome && !editing))
    return p.outcome ? (
      <div className="flex items-start justify-between gap-2 text-[13px]">
        <span>
          <span className="font-medium">{p.outcome.category}</span>
          {p.outcome.note && <span className="block text-slate">{p.outcome.note}</span>}
        </span>
        {editable && (
          <button className="btn-quiet btn-sm" onClick={() => setEditing(true)}>
            Change
          </button>
        )}
      </div>
    ) : (
      <span className="text-[13px] text-slate">{s.can.outcome && !p.attended && (p.answer === "Accepted" || p.host) ? "Mark them present first" : "–"}</span>
    );
  const needsNote = !!category && category !== "No fit" && !note.trim();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (category) act.outcome.mutate({ sessionId: s.id, appId: p.id, category, note: note.trim() }, { onSuccess: () => setEditing(false) });
      }}
    >
      <select className="input h-11 text-[14px] sm:h-9" value={category} aria-label={`Outcome for ${p.org}`} onChange={(e) => setCategory(e.target.value)}>
        <option value="">Choose an outcome</option>
        {OUTCOMES.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {category && category !== "No fit" && <input className="input h-11 text-[14px] sm:h-9" placeholder="What happens next, and who owns it" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Next step" />}
      {act.outcome.error && (
        <p role="alert" className="text-[13px] text-bad">
          {act.outcome.error.message}
        </p>
      )}
      <span className="flex gap-2">
        <button className="btn-primary btn-sm" disabled={!category || needsNote || act.outcome.isPending}>
          {act.outcome.isPending ? "Saving…" : "Save the outcome"}
        </button>
        {p.outcome && (
          <button type="button" className="btn-quiet btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </span>
    </form>
  );
}

/** Invite people: who may still come, those on the session's track first, each with why they'd be busy then. */
function Invite({ eventId, s, onDone }: { eventId: string; s: SessionRow; onDone: () => void }) {
  const act = useSessionActions(eventId);
  const q = useInvitable(eventId, s.id, true);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const list = (q.data ?? []).filter((x) => !filter.trim() || `${x.org} ${x.sector} ${x.label}`.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-[15px] font-medium">Invite people</h3>
        <input className="input h-10 w-full text-[14px] sm:w-64" placeholder="Find by name, sector or kind" aria-label="Find who to invite" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {q.isPending ? (
        <p className="mt-3 text-[14px] text-slate">Loading…</p>
      ) : q.isError ? (
        <p className="mt-3 text-[14px] text-bad">{q.error.message}</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-[14px] text-slate">{q.data.length ? "No one matches that." : "Everyone approved or verified is already invited."}</p>
      ) : (
        <ul className="mt-3 max-h-72 overflow-y-auto rounded-md border border-line">
          {list.map((x) => (
            <li key={x.id} className="border-b border-line last:border-0">
              <label className="flex items-start gap-3 px-3 py-2.5 text-[14px]">
                <input type="checkbox" className="mt-1" checked={picked.includes(x.id)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, x.id] : xs.filter((y) => y !== x.id)))} />
                <span className="min-w-0">
                  {x.org}
                  {x.onTrack && <span className="ml-2 pill bg-ok-50 text-ok">On its track</span>}
                  <span className="block text-[13px] text-slate">
                    {x.label}
                    {x.sector ? ` · ${x.sector}` : ""}
                    {x.busy ? ` · ${x.busy}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {act.invite.error && (
        <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {act.invite.error.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary btn-sm" disabled={!picked.length || act.invite.isPending} onClick={() => act.invite.mutate({ sessionId: s.id, appIds: picked }, { onSuccess: onDone })}>
          {act.invite.isPending ? "Inviting…" : picked.length ? `Invite ${picked.length}` : "Invite"}
        </button>
        <button className="btn-quiet btn-sm" onClick={onDone}>
          Cancel
        </button>
        <span className="text-[13px] text-slate">Each is emailed, and accepts or declines from their schedule.</span>
      </div>
    </div>
  );
}
