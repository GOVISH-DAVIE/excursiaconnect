"use client";

import { useState } from "react";
import { Section } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DR_ZONE, drCan, lapsed, moveSpot, sideName, slotProblems, slotTimes } from "@/lib/dealroom/logic";
import type { DrMeeting } from "@/lib/dealroom/types";
import { addMinutes, fmtStamp } from "@/lib/time";
import { Pill, useDr } from "../bits";

type Slot = { day: string; time: string; roomId: string; table: number; link: string; online: boolean; flagged: boolean };

/** One slot picker with the live check: clashes block, caps need a reason (DO-2, DO-5). */
export function SlotPicker({ matchId, ignore, initial, onBook, label }: { matchId: string; ignore?: string; initial?: Partial<Slot>; onBook: (req: { roomId?: string; table?: number; link?: string; start: string; flagged: boolean }, override?: string) => void; label: string }) {
  const { state } = useStore();
  const { cfg, event, can } = useDr();
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10));
  const rooms = state.rooms.filter((r) => r.zoneId === DR_ZONE && cfg!.rooms[r.id]);
  // open on the earliest slot that breaks no rule, so the picker starts from something bookable
  const [s, setS] = useState<Slot>(() => {
    const base = { link: "", online: false, flagged: initial?.flagged ?? false };
    if (initial?.day && initial.time && initial.roomId) return { day: initial.day, time: initial.time, roomId: initial.roomId, table: initial.table ?? 1, ...base };
    for (const day of days.filter((d) => d >= state.dealRoom.clock.slice(0, 10)))
      for (const time of slotTimes(cfg!))
        for (const r of rooms)
          for (let table = 1; table <= (cfg!.rooms[r.id]?.tables ?? 1); table++) {
            const p = slotProblems(state, { matchId, ignore, roomId: r.id, table, start: `${day} ${time}`, flagged: base.flagged });
            if (!p.clashes.length && !p.caps.length) return { day, time, roomId: r.id, table, ...base };
          }
    return { day: days[days.length - 1], time: slotTimes(cfg!)[0], roomId: rooms[0]?.id, table: 1, ...base };
  });
  const [override, setOverride] = useState("");
  const req = { matchId, ignore, roomId: s.online ? undefined : s.roomId, table: s.online ? undefined : s.table, link: s.online ? s.link || undefined : undefined, start: `${s.day} ${s.time}`, flagged: s.flagged };
  const { clashes, caps } = slotProblems(state, req);
  const tables = cfg!.rooms[s.roomId]?.tables ?? 1;
  const blocked = clashes.length > 0 || (caps.length > 0 && !override.trim());
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <select className="input h-9 text-[13px]" aria-label="Day" value={s.day} onChange={(e) => setS({ ...s, day: e.target.value })}>
          {days.map((d) => (
            <option key={d} value={d}>
              {fmtStamp(d, false)}
            </option>
          ))}
        </select>
        <select className="input h-9 text-[13px]" aria-label="Time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })}>
          {slotTimes(cfg!).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {s.online ? (
          <input className="input h-9 text-[13px] sm:col-span-2" placeholder="Teams, Zoom or Meet link" value={s.link} onChange={(e) => setS({ ...s, link: e.target.value })} />
        ) : (
          <>
            <select className="input h-9 text-[13px]" aria-label="Room" value={s.roomId} onChange={(e) => setS({ ...s, roomId: e.target.value, table: 1 })}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select className="input h-9 text-[13px]" aria-label="Table" value={s.table} onChange={(e) => setS({ ...s, table: Number(e.target.value) })} disabled={tables === 1}>
              {Array.from({ length: tables }, (_, i) => (
                <option key={i} value={i + 1}>
                  Table {i + 1}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" checked={s.online} onChange={(e) => setS({ ...s, online: e.target.checked })} />
          Online
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-[13px]">
        <input type="checkbox" checked={s.flagged} onChange={(e) => setS({ ...s, flagged: e.target.checked })} />
        Flagged meeting, {cfg!.rules.flaggedMin} minutes
      </label>
      {clashes.length > 0 && (
        <ul className="text-[13px] text-bad">
          {clashes.map((c) => (
            <li key={c}>✗ {c}</li>
          ))}
        </ul>
      )}
      {caps.length > 0 && (
        <div className="text-[13px] text-warn">
          {caps.map((c) => (
            <div key={c}>! {c}</div>
          ))}
          {can("overrideCap") && <input className="input h-8 mt-1 text-[13px]" placeholder="Reason to override the cap (logged)" value={override} onChange={(e) => setOverride(e.target.value)} />}
        </div>
      )}
      {!clashes.length && !caps.length && <div className="text-[13px] text-ok">✓ Free: room, table and both people</div>}
      <div>
        <button className="btn-primary btn-sm" disabled={blocked} onClick={() => onBook({ roomId: req.roomId, table: req.table, link: req.link, start: req.start, flagged: s.flagged }, caps.length ? override : undefined)}>
          {label}
        </button>
      </div>
    </div>
  );
}

const statusTone: Record<string, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral" | "ink"> = { Proposed: "warn", Confirmed: "ok", "Change requested": "coral", "In progress": "okSolid", Held: "ink", "No-show": "bad", Cancelled: "mute", Rescheduled: "mute" };
export const MeetingPill = ({ m }: { m: DrMeeting }) => {
  const { cfg, now } = useDr();
  return lapsed(m, cfg!, now) ? <Pill tone="mute">Lapsed</Pill> : <Pill tone={statusTone[m.status]}>{m.status}</Pill>;
};

export function MeetingPanel({ m, onClose }: { m: DrMeeting; onClose: () => void }) {
  const { state } = useStore();
  const { dr, dispatch, me } = useDr();
  const [mode, setMode] = useState<"view" | "move" | "cancel" | "decline">("view");
  const [reason, setReason] = useState("");
  const mm = dr.matches.find((x) => x.id === m.matchId)!;
  const s = dr.apps.find((a) => a.id === mm.seekerId)!;
  const p = dr.apps.find((a) => a.id === mm.providerId)!;
  const room = state.rooms.find((r) => r.id === m.roomId);
  const editable = !["Held", "No-show", "Cancelled", "In progress"].includes(m.status);
  return (
    <Section title={`${s.org.name} · ${p.org.name}`} className="mt-4" action={<button className="btn-quiet" onClick={onClose}>Close</button>}>
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <MeetingPill m={m} />
        <span>
          {fmtStamp(m.start)} to {m.end.slice(11)}, {m.link ? `online (${m.link})` : `${room?.name}${m.table ? `, table ${m.table}` : ""}`}
          {m.flagged ? ", flagged" : ""}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-slate">
        Seeker {m.confirm.seeker ? `confirmed ${fmtStamp(m.confirm.seeker)}` : "has not confirmed"}; counterparty {m.confirm.provider ? `confirmed ${fmtStamp(m.confirm.provider)}` : "has not confirmed"}.
        {m.change && !m.change.start && ` The ${sideName(m.change.by)} asked to move: “${m.change.reason}”.`}
        {m.override && ` Cap overridden: ${m.override.reason}.`}
      </p>
      {m.status === "Change requested" && m.change?.start && <MoveRequest m={m} asker={m.change.by === "seeker" ? s.org.name : p.org.name} other={m.change.by === "seeker" ? p.org.name : s.org.name} canAct={drCan(me, "schedule")} onDecline={() => setMode("decline")} />}
      {mode === "decline" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Why it cannot move, sent to both" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary btn-sm" disabled={!reason.trim()} onClick={() => { dispatch({ type: "dr/declineChange", meetingId: m.id, reason }); setMode("view"); setReason(""); }}>
            Decline the move
          </button>
          <button className="btn-quiet" onClick={() => setMode("view")}>
            Back
          </button>
        </div>
      )}
      {editable && mode === "view" && (
        <div className="mt-3 flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setMode("move")}>
            Move
          </button>
          <button className="btn-secondary btn-sm text-bad" onClick={() => setMode("cancel")}>
            Cancel the meeting
          </button>
        </div>
      )}
      {mode === "move" && (
        <div className="mt-3 rounded-md bg-paper p-3">
          <p className="mb-2 text-[13px] text-slate">The same time in another room keeps both confirmations; a new time needs both to confirm again.</p>
          <SlotPicker matchId={m.matchId} ignore={m.id} label="Move here" initial={{ day: m.start.slice(0, 10), time: m.start.slice(11), roomId: m.roomId, table: m.table, flagged: m.flagged }} onBook={(r, override) => { dispatch({ type: "dr/reschedule", meetingId: m.id, req: { ...r, matchId: m.matchId }, override }); setMode("view"); }} />
        </div>
      )}
      {mode === "cancel" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Reason, sent to both" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary btn-sm" disabled={!reason.trim()} onClick={() => { dispatch({ type: "dr/cancelMeeting", meetingId: m.id, reason }); setMode("view"); }}>
            Cancel it
          </button>
          <button className="btn-quiet" onClick={() => setMode("view")}>
            Keep
          </button>
        </div>
      )}
      <ul className="mt-3 border-t border-line pt-2">
        {m.history.map((h, i) => (
          <li key={i} className="text-[12px] text-slate">
            {fmtStamp(h.at)} · {h.what}
          </li>
        ))}
      </ul>
    </Section>
  );
}


/** A participant's proposed move: the team accepts it only once the other side has agreed, and only if the time is still free. */
function MoveRequest({ m, asker, other, canAct, onDecline }: { m: DrMeeting; asker: string; other: string; canAct: boolean; onDecline: () => void }) {
  const { state } = useStore();
  const { dispatch } = useDr();
  const ch = m.change!;
  const spot = ch.agreed ? moveSpot(state, m, ch.start!) : undefined;
  const room = state.rooms.find((r) => r.id === spot?.roomId);
  return (
    <div className="mt-3 rounded-md bg-paper p-3 text-[14px]">
      <p>
        {asker} asks to move it to <b className="font-medium">{fmtStamp(ch.start!)}</b>: “{ch.reason}”
      </p>
      <p className="mt-1 text-[13px] text-slate">
        {!ch.agreed
          ? `Waiting for ${other} to agree. You can accept once they do; until then the meeting keeps its slot.`
          : spot
            ? `${other} agreed ${fmtStamp(ch.agreed)}. Free at that time: ${spot.link ? "online" : `${room?.name}${spot.table ? `, table ${spot.table}` : ""}`}. Accepting books it as confirmed by both.`
            : `${other} agreed, but that time is no longer free. Pick another slot with Move, or decline.`}
      </p>
      {canAct && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary btn-sm" disabled={!spot} title={!ch.agreed ? `${other} has not agreed yet` : undefined} onClick={() => dispatch({ type: "dr/acceptChange", meetingId: m.id })}>
            Accept the move
          </button>
          <button className="btn-secondary btn-sm" onClick={onDecline}>
            Decline the move
          </button>
        </div>
      )}
    </div>
  );
}
