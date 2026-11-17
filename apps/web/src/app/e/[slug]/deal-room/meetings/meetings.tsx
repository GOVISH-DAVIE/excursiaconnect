"use client";

/**
 * A Deal Room participant's meetings (backend-plan.md, M3.2). The emails about a meeting link here: one proposed to
 * confirm by its date, a move the other side asks for, and the reminders before it. The participant confirms, asks
 * to move a meeting to a time when both sides and a table are free, answers the other side's request, and takes a
 * confirmed meeting into its calendar.
 */
import Link from "next/link";
import { useState } from "react";
import type { MyMeeting, MyMeetings } from "@excursia/contracts/meetings";
import { fmtStamp } from "@excursia/domain/time";
import { useSession } from "@/features/auth/hooks/use-session";
import { useMoveTimes, useMyMeetingActions, useMyMeetings } from "@/features/meetings/hooks/use-my-meetings";
import { Panel, ParticipantPage } from "../participant";

export function MyMeetingsPage({ slug }: { slug: string }) {
  return (
    <ParticipantPage slug={slug} page="meetings" title="My meetings" signIn="Sign in to see your meetings">
      <Body slug={slug} />
    </ParticipantPage>
  );
}

function Body({ slug }: { slug: string }) {
  const session = useSession();
  const q = useMyMeetings(slug, true);
  if (q.isPending) return <Panel>Loading…</Panel>;
  if (q.isError) return <Panel>{q.error.message}</Panel>;
  const d = q.data;
  if (!d.meetings.length)
    return (
      <Panel title="No meetings yet">
        <p className="text-[14px] text-slate">
          The Deal Room team proposes a meeting once you and the other party both accept an introduction, and we email you to confirm it. Signed in as {session.data?.user.email}.{" "}
          <Link href={`/e/${slug}/deal-room/introductions`} className="link">
            See your introductions
          </Link>
        </p>
      </Panel>
    );
  return (
    <>
      <p className="-mt-3 text-[14px] text-slate">{d.event.name} Deal Room</p>
      {d.meetings.map((m) => (
        <Meeting key={`${m.id}:${m.side}`} slug={slug} m={m} d={d} />
      ))}
    </>
  );
}

function status(m: MyMeeting): { tone: string; label: string } {
  if (m.lapsed) return { tone: "bg-paper-200 text-slate", label: "Lapsed" };
  if (m.status === "Change requested" && m.change) return { tone: "bg-warn-50 text-warn", label: m.change.agreed ? "Move agreed" : m.change.byMe ? "You asked to move it" : "Asks to move it" };
  if (m.status === "Proposed") return { tone: "bg-warn-50 text-warn", label: m.mine.confirmed ? "Waiting for them" : "Please confirm" };
  if (m.status === "Confirmed") return { tone: "bg-ok-50 text-ok", label: "Confirmed" };
  if (m.status === "Held") return { tone: "bg-ink text-white", label: "Held" };
  if (m.status === "In progress") return { tone: "bg-ok text-white", label: "Under way" };
  return { tone: "bg-paper-200 text-slate", label: m.status };
}

function Meeting({ slug, m, d }: { slug: string; m: MyMeeting; d: MyMeetings }) {
  const act = useMyMeetingActions(slug, m.id);
  const [asking, setAsking] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState("");
  const s = status(m);
  const error = act.confirm.error ?? act.answer.error ?? act.calendar.error;
  const ch = m.change;
  return (
    <Panel title={`${fmtStamp(m.start)} to ${m.end.slice(11)}`} aside={<span className={`pill whitespace-nowrap ${s.tone}`}>{s.label}</span>}>
      <p className="text-[15px]">
        With <b className="font-medium">{m.other.org}</b>
        {m.other.person ? ` (${m.other.person})` : ""}, {m.online ? "online" : m.where}.
      </p>
      <p className="mt-0.5 text-[13px] text-slate">{m.other.label}</p>
      {m.online && m.link && m.status === "Confirmed" && (
        <p className="mt-1 text-[14px]">
          <a className="link break-all" href={m.link} target="_blank" rel="noreferrer">
            {m.link}
          </a>
        </p>
      )}

      {m.lapsed && <p className="mt-3 text-[14px] text-slate">Nobody confirmed it in time, so the slot was released. The Deal Room team will propose another and email you.</p>}
      {!m.lapsed && m.status === "Proposed" && (
        <p className="mt-3 text-[14px] text-slate">
          {m.mine.confirmed
            ? `You confirmed on ${fmtStamp(m.mine.confirmed)}. It is booked once ${m.other.org} confirms too${m.confirmBy ? `, by ${fmtStamp(m.confirmBy)}` : ""}.`
            : `Please confirm by ${fmtStamp(m.confirmBy!)}. If it isn't confirmed by both of you by then, the slot is released.`}
          {!m.mine.confirmed && m.theirs.confirmed && ` ${m.other.org} has confirmed.`}
        </p>
      )}

      {/* a move: who asked, the time proposed, and where it stands */}
      {ch && !m.lapsed && m.status === "Change requested" && (
        <div className="mt-3 rounded-md bg-paper p-3 text-[14px]">
          {ch.start ? (
            <p>
              {ch.byMe ? "You asked" : `${m.other.org} asks`} to move it to <b className="font-medium">{fmtStamp(ch.start)}</b>: {ch.reason}
            </p>
          ) : (
            <p>
              {ch.byMe ? "You asked" : `${m.other.org} asked`} to move it: {ch.reason}
            </p>
          )}
          <p className="mt-1 text-[13px] text-slate">
            {!ch.start
              ? "The Deal Room team will propose another slot; until then this one stands."
              : ch.agreed
                ? "Both of you agreed. The Deal Room team will confirm the new time; until then this slot stands."
                : ch.byMe
                  ? `Waiting for ${m.other.org} to agree. Then the Deal Room team confirms it; until then this slot stands.`
                  : "If you agree, the Deal Room team confirms the new time. If you decline, the meeting stays where it is."}
          </p>
          {m.can.answer && !declining && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" disabled={act.answer.isPending} onClick={() => act.answer.mutate({ agree: true })}>
                Agree to {fmtStamp(ch.start!)}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDeclining(true);
                  setWhy("");
                }}
              >
                Decline
              </button>
            </div>
          )}
          {m.can.answer && declining && (
            <div className="mt-3 space-y-2">
              <input className="input" placeholder="Why, for them (optional)" maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary btn-sm" disabled={act.answer.isPending} onClick={() => act.answer.mutate({ agree: false, reason: why.trim() || undefined }, { onSuccess: () => setDeclining(false) })}>
                  Decline the move
                </button>
                <button className="btn btn-quiet btn-sm" onClick={() => setDeclining(false)}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {error.message}
        </p>
      )}

      {(m.can.confirm || m.can.move || m.can.calendar) && !asking && (
        <div className="mt-4 flex flex-wrap gap-2">
          {m.can.confirm && (
            <button className="btn btn-primary btn-sm" disabled={act.confirm.isPending} onClick={() => act.confirm.mutate()}>
              {act.confirm.isPending ? "Confirming…" : "Confirm this time"}
            </button>
          )}
          {m.can.calendar && (
            <button className="btn btn-secondary btn-sm" disabled={act.calendar.isPending} onClick={() => act.calendar.mutate(m.start)}>
              Add to calendar
            </button>
          )}
          {m.can.move && (
            <button className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}>
              Ask to move it
            </button>
          )}
        </div>
      )}
      {asking && <AskMove slug={slug} m={m} d={d} onDone={() => setAsking(false)} />}
      {m.status === "Confirmed" && !m.online && <p className="mt-3 text-[12px] text-slate">We remind you a day before and half an hour before. Check in with your badge at the Deal Room desk.</p>}
    </Panel>
  );
}

/** Suggest a new time: only times when both sides and a table are free are offered. */
function AskMove({ slug, m, d, onDone }: { slug: string; m: MyMeeting; d: MyMeetings; onDone: () => void }) {
  const act = useMyMeetingActions(slug, m.id);
  const today = d.event.now.slice(0, 10);
  const days = d.event.days.filter((x) => x >= today);
  const [day, setDay] = useState(days.includes(m.start.slice(0, 10)) ? m.start.slice(0, 10) : (days[0] ?? ""));
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const t = useMoveTimes(slug, m.id, day);
  const times = t.data?.times ?? [];
  return (
    <form
      className="mt-4 space-y-3 rounded-md bg-paper p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (day && time && reason.trim()) act.ask.mutate({ start: `${day} ${time}`, reason: reason.trim() }, { onSuccess: onDone });
      }}
    >
      <p className="text-[13px] text-slate">Suggest a new time. {m.other.org} agrees or declines first, then the Deal Room team confirms it. Only times when you are both free and a table is open are listed.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Day</span>
          <select
            className="input"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setTime("");
            }}
          >
            {days.map((x) => (
              <option key={x} value={x}>
                {fmtStamp(`${x} 00:00`, false)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Time</span>
          <select className="input" value={time} disabled={!times.length} onChange={(e) => setTime(e.target.value)}>
            <option value="">{t.isPending ? "Looking…" : times.length ? "Choose" : "No free time that day"}</option>
            {times.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Why, for {m.other.org}</span>
        <input className="input" placeholder="For example, our CEO lands at noon" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {act.ask.error && (
        <p role="alert" className="rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {act.ask.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={act.ask.isPending || !day || !time || !reason.trim()}>
          {act.ask.isPending ? "Sending…" : "Send the request"}
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
