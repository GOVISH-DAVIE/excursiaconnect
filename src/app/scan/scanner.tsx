"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui";
import { roomVerdict, scanVerdict, sessionAtRoom, useStore } from "@/lib/store";
import { DR_ZONE, eventDay } from "@/lib/dealroom/logic";
import type { DrMeeting } from "@/lib/dealroom/types";
import { addMinutes, fmtStamp } from "@/lib/time";
import type { AppState, Delegate } from "@/lib/types";

type Post = { kind: "desk" } | { kind: "drdesk" } | { kind: "zone"; zoneId: string; direction: "in" | "out" } | { kind: "room"; roomId: string };
type Verdict = { verdict: "allow" | "deny" | "override"; reason?: string; delegate?: Delegate; meeting?: DrMeeting };

const findBadge = (state: AppState, code: string) => state.delegates.find((d) => d.badgeCode.toLowerCase() === code.trim().toLowerCase() || d.id === code.trim());

/** Who the badge is, for this event: the first two checks every Deal Room post makes. */
function drParticipant(state: AppState, code: string, eventId: string): Verdict & { appId?: string } {
  const d = findBadge(state, code);
  if (!d || d.cancelled || d.status === "Cancelled" || d.status === "Refunded") return { verdict: "deny", reason: "Invalid or cancelled badge", delegate: d };
  if (d.eventId !== eventId) return { verdict: "deny", reason: `Badge is for ${state.events.find((e) => e.id === d.eventId)?.name ?? "another event"}`, delegate: d };
  const app = state.dealRoom.apps.find((a) => a.delegateId === d.id);
  if (!app) return { verdict: "deny", reason: "Not a Deal Room participant: meetings here are by introduction only", delegate: d };
  return { verdict: "allow", delegate: d, appId: app.id };
}

/** A participant's Deal Room meetings on the clock's day, earliest first. */
function meetingsToday(state: AppState, appId: string) {
  const dr = state.dealRoom;
  const today = dr.clock.slice(0, 10);
  return dr.meetings
    .filter((m) => m.start.slice(0, 10) === today && ["Confirmed", "In progress", "Held"].includes(m.status))
    .filter((m) => dr.matches.some((x) => x.id === m.matchId && (x.seekerId === appId || x.providerId === appId)))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function describe(state: AppState, m: DrMeeting, appId: string) {
  const dr = state.dealRoom;
  const x = dr.matches.find((mm) => mm.id === m.matchId)!;
  const other = dr.apps.find((a) => a.id === (x.seekerId === appId ? x.providerId : x.seekerId));
  const room = state.rooms.find((r) => r.id === m.roomId)?.name ?? "online";
  const tables = dr.configs[m.eventId]?.rooms[m.roomId ?? ""]?.tables ?? 1;
  return `${m.start.slice(11)} with ${other?.org.name}, ${room}${m.table && tables > 1 ? ` table ${m.table}` : ""}`;
}

/** DO-7: the Deal Room desk checks a participant in against the day's meetings. */
function drDeskVerdict(state: AppState, code: string, eventId: string): Verdict {
  const who = drParticipant(state, code, eventId);
  if (who.verdict === "deny") return who;
  const today = meetingsToday(state, who.appId!);
  if (!today.length) return { verdict: "deny", reason: "No Deal Room meetings today. Check the participant's portal for their schedule.", delegate: who.delegate };
  const next = today.find((m) => m.status !== "Held" && m.end > state.dealRoom.clock);
  if (!next) return { verdict: "deny", reason: "All of today's meetings are over", delegate: who.delegate };
  const open = today.filter((m) => m.status !== "Held").length;
  return { verdict: "allow", reason: `Checked in for ${open} meeting${open === 1 ? "" : "s"} today. Next: ${describe(state, next, who.appId!)}`, delegate: who.delegate, meeting: next };
}

/** A Deal Room room's door: only a party to a meeting at this room, from 15 minutes before it until it ends. */
function drDoorVerdict(state: AppState, code: string, roomId: string, eventId: string): Verdict & { side?: "seeker" | "provider" } {
  const who = drParticipant(state, code, eventId);
  if (who.verdict === "deny") return who;
  const clock = state.dealRoom.clock;
  const today = meetingsToday(state, who.appId!).filter((m) => m.status !== "Held");
  const here = today.find((m) => m.roomId === roomId && clock >= addMinutes(m.start, -15) && clock < m.end);
  if (!here) {
    const next = today.find((m) => m.end > clock);
    return { verdict: "deny", reason: next ? `No meeting in this room now. Next: ${describe(state, next, who.appId!)}` : "No meeting in this room now", delegate: who.delegate };
  }
  const side = state.dealRoom.apps.find((a) => a.id === who.appId)!.type;
  return { verdict: "allow", reason: `Meeting ${describe(state, here, who.appId!)}`, delegate: who.delegate, meeting: here, side };
}

export function Scanner() {
  const { state, dispatch } = useStore();
  const params = useSearchParams();
  const live = state.events.filter((e) => e.state === "Live");
  const [eventId, setEventId] = useState(() => live.find((e) => e.id === params.get("event"))?.id ?? live[0]?.id);
  const event = live.find((e) => e.id === eventId) ?? live[0];
  const dr = state.dealRoom;
  const hasDr = !!dr.configs[event.id] && !!event.dealRoom?.enabled;
  const clock = dr.clock;
  // a Deal Room event runs on the demo clock; the others on the prototype's day one
  const DAY = hasDr ? Math.min(Math.max(eventDay(event.startDate, clock), 1), event.days) : 1;
  const zones = state.zones.filter((z) => z.eventId === event.id);
  const [post, setPost] = useState<Post>(() => (params.get("post") === "drdesk" ? { kind: "drdesk" } : { kind: "desk" }));
  const [code, setCode] = useState("");
  const [result, setResult] = useState<(Verdict & { at: string }) | null>(null);
  const [online, setOnline] = useState(true);
  const [override, setOverride] = useState(false);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [log, setLog] = useState<{ name: string; verdict: string; at: string }[]>([]);

  const zone = post.kind === "zone" ? zones.find((z) => z.id === post.zoneId) : null;
  const rooms = state.rooms.filter((r) => zones.some((z) => z.id === r.zoneId));
  const room = post.kind === "room" ? rooms.find((r) => r.id === post.roomId) : null;
  const drRoom = !!room && room.zoneId === DR_ZONE;
  const roomSession = post.kind === "room" && !drRoom ? sessionAtRoom(state, post.roomId, DAY) : undefined;
  const roomIn = roomSession ? state.delegates.filter((d) => (d.roomLog ?? []).some((l) => l.sessionId === roomSession.id && l.verdict !== "deny")).length : 0;
  const roomMeetings = drRoom ? dr.meetings.filter((m) => m.roomId === room!.id && m.start.slice(0, 10) === clock.slice(0, 10) && ["Confirmed", "In progress", "Held"].includes(m.status)) : [];
  const tierOf = (d: Delegate) => state.tiers.find((t) => t.id === d.tierId)?.name;
  const now = () => (hasDr ? fmtStamp(clock) : new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

  function scan(input: string) {
    const c = input.trim();
    if (!c) return;
    if (post.kind === "drdesk") {
      const v = drDeskVerdict(state, c, event.id);
      if (v.verdict === "allow" && v.delegate) {
        if (!v.delegate.accredited) dispatch({ type: "accredit", delegateId: v.delegate.id, day: DAY });
        dispatch({ type: "dr/arrive", delegateId: v.delegate.id });
      }
      return done(v);
    }
    if (post.kind === "desk") {
      const d = findBadge(state, c);
      if (!d || d.cancelled || d.status === "Cancelled" || d.status === "Refunded") return done({ verdict: "deny", reason: "Invalid or cancelled badge", delegate: d });
      if (d.eventId !== event.id) return done({ verdict: "deny", reason: `Badge is for ${state.events.find((e) => e.id === d.eventId)?.name ?? "another event"}`, delegate: d });
      if (d.status === "Pending" || d.status === "Awaiting payment") return done({ verdict: "deny", reason: "Registration not paid", delegate: d });
      dispatch({ type: "accredit", delegateId: d.id, day: DAY });
      return done({ verdict: "allow", reason: d.accredited ? "Already accredited" : "Accredited, badge printed", delegate: d });
    }
    if (post.kind === "room" && drRoom) {
      const v = drDoorVerdict(state, c, post.roomId, event.id);
      if (v.verdict === "allow" && v.delegate && v.meeting && v.side) {
        const other = v.side === "seeker" ? "provider" : "seeker";
        if (!v.meeting.arrivals[v.side]) dispatch({ type: "dr/arrive", delegateId: v.delegate.id });
        if (v.meeting.status === "Confirmed" && v.meeting.arrivals[other]) {
          dispatch({ type: "dr/startMeeting", meetingId: v.meeting.id });
          v.reason += ". Both here: meeting in progress";
        } else if (v.meeting.status === "In progress") v.reason += ". Already in progress";
        else v.reason += ". Waiting for the other party";
      }
      return done(v);
    }
    if (post.kind === "room") {
      const v = roomVerdict(state, c, post.roomId, DAY);
      if (v.delegate && v.session) dispatch({ type: "roomScan", delegateId: v.delegate.id, roomId: post.roomId, sessionId: v.session.id, day: DAY, verdict: v.verdict, reason: v.reason });
      return done(v);
    }
    const v = scanVerdict(state, c, post.zoneId, post.direction);
    if (v.delegate) dispatch({ type: "scan", delegateId: v.delegate.id, zoneId: post.zoneId, direction: post.direction, verdict: v.verdict, reason: v.reason, day: DAY });
    done(v);
  }

  function done(v: Verdict) {
    const r = { ...v, at: now() };
    setResult(r);
    setLog((l) => [{ name: v.delegate?.name ?? "Unknown", verdict: v.verdict, at: r.at }, ...l].slice(0, 8));
    setCode("");
    setOverride(false);
    setPin("");
    setReason("");
  }

  function doOverride() {
    if (!result?.delegate || post.kind === "desk" || post.kind === "drdesk" || drRoom || pin.length < 4 || !reason) return;
    if (post.kind === "room") {
      if (!roomSession) return;
      dispatch({ type: "roomScan", delegateId: result.delegate.id, roomId: post.roomId, sessionId: roomSession.id, day: DAY, verdict: "override", reason });
    } else {
      dispatch({ type: "scan", delegateId: result.delegate.id, zoneId: post.zoneId, direction: post.direction, verdict: "override", reason, day: DAY });
    }
    done({ verdict: "override", reason: `Override: ${reason}`, delegate: result.delegate });
  }

  const samples = hasDr ? drSamples(state, post, event.id) : [
    ["EXC-DEMO-4821", "Amina, Full"],
    ["EXC-VIP-1001", "Hassan, VIP"],
    ["EXC-CANC-0007", "Cancelled"],
    [state.delegates.find((d) => d.status === "Awaiting payment")?.badgeCode ?? "", "Unpaid"],
  ];
  const changeEvent = (id: string) => {
    setEventId(id);
    setPost({ kind: "desk" });
    setResult(null);
    setLog([]);
  };

  return (
    <div className="min-h-screen bg-paper-200 flex items-start justify-center p-0 sm:p-6">
      <div className="w-full max-w-sm min-h-screen sm:min-h-[760px] bg-ink text-white sm:rounded-[2rem] sm:border-8 sm:border-ink-700 flex flex-col overflow-hidden">
        <header className="px-5 pt-5 pb-3 flex items-center justify-between">
          <Logo variant="icon" className="h-7" />
          <select aria-label="Event" className="mx-3 min-w-0 flex-1 truncate rounded-md bg-white/10 px-2 py-1 text-[13px] text-white/80" value={event.id} onChange={(e) => changeEvent(e.target.value)}>
            {live.map((e) => (
              <option key={e.id} value={e.id} className="text-ink">
                {e.name}
              </option>
            ))}
          </select>
          <button onClick={() => setOnline(!online)} className={`pill ${online ? "bg-ok text-white" : "bg-warn text-white"}`}>
            {online ? "Online" : "Offline, 3 queued"}
          </button>
        </header>

        <div className="px-5">
          <label className="text-[13px] text-white/60">My post</label>
          <select
            className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2.5 text-sm"
            value={post.kind === "desk" || post.kind === "drdesk" ? post.kind : post.kind === "room" ? `room:${post.roomId}` : `${post.zoneId}:${post.direction}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "desk") setPost({ kind: "desk" });
              else if (v === "drdesk") setPost({ kind: "drdesk" });
              else if (v.startsWith("room:")) setPost({ kind: "room", roomId: v.slice(5) });
              else {
                const [zoneId, direction] = v.split(":");
                setPost({ kind: "zone", zoneId, direction: direction as "in" | "out" });
              }
              setResult(null);
            }}
          >
            <option value="desk">Accreditation desk</option>
            {hasDr && <option value="drdesk">Deal Room desk</option>}
            {zones.flatMap((z) => [
              <option key={z.id + "in"} value={`${z.id}:in`}>
                {z.name}, entrance
              </option>,
              <option key={z.id + "out"} value={`${z.id}:out`}>
                {z.name}, exit
              </option>,
            ])}
            {rooms.map((r) => (
              <option key={r.id} value={`room:${r.id}`}>
                {r.name}, door{r.zoneId === DR_ZONE ? " (Deal Room)" : ""}
              </option>
            ))}
          </select>
          {hasDr && <div className="mt-2 text-[13px] text-white/60">Summit day {DAY}, {fmtStamp(clock)} on the Deal Room clock</div>}
          {post.kind === "drdesk" && <div className="mt-1 text-[13px] text-white/60">Checks the participant in for every meeting they have today; the live board shows who is here.</div>}
          {drRoom && (
            <div className="mt-1 flex items-center justify-between gap-3 text-[13px] text-white/60">
              <span>{roomMeetings.length ? `${roomMeetings.length} meetings here today` : "No meetings here today"}</span>
              <span className="tabular-nums font-medium text-white">{roomMeetings.filter((m) => m.status === "In progress").length} in progress</span>
            </div>
          )}
          {room && !drRoom && (
            <div className="mt-2 text-[13px] text-white/60">
              {roomSession ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {roomSession.status === "live" ? "Live now: " : roomSession.status === "ended" ? "Ended: " : "Next: "}
                    {roomSession.title}
                    {roomSession.walkIns ? ", walk-ins allowed" : ", enrolled only"}
                  </span>
                  <span className={`tabular-nums font-medium ${roomIn / room.capacity >= 0.9 ? "text-coral" : "text-white"}`}>
                    {roomIn} / {room.capacity} in
                  </span>
                </div>
              ) : (
                "No session in this room today"
              )}
            </div>
          )}
          {zone && (
            <div className="mt-2 flex items-center justify-between text-[13px] text-white/60">
              <span>Occupancy</span>
              <span className={`tabular-nums font-medium ${zone.occupancy / zone.capacity >= 0.9 ? "text-coral" : "text-white"}`}>
                {zone.occupancy} / {zone.capacity}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 mx-5 aspect-[4/3] rounded-2xl bg-black/50 border border-white/10 relative grid place-items-center">
          <div className="absolute inset-6 border-2 border-coral/70 rounded-xl" />
          <div className="text-center text-white/50 text-[13px] px-10">Camera viewfinder. In the prototype, type or tap a badge code below.</div>
        </div>

        <form
          className="px-5 mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            scan(code);
          }}
        >
          <input className="flex-1 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-mono placeholder:text-white/30" placeholder="EXC-XXXX-0000" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary">Scan</button>
        </form>
        <div className="px-5 mt-2 flex flex-wrap gap-1">
          {samples.filter(([c]) => c).map(([c, l]) => (
            <button key={c + l} onClick={() => scan(c)} className="rounded-md bg-white/10 px-2 py-1 text-[13px] text-white/80 hover:bg-white/20">
              {l}
            </button>
          ))}
        </div>

        <div className="px-5 mt-4 flex-1">
          {result ? (
            <div className={`rounded-2xl p-5 ${result.verdict === "deny" ? "bg-bad" : result.verdict === "override" ? "bg-warn" : "bg-ok"}`}>
              <div className="text-[44px] leading-none font-medium tracking-[-0.03em]">{result.verdict === "deny" ? "DENY" : result.verdict === "override" ? "OVERRIDE" : "ALLOW"}</div>
              {result.reason && <div className="text-sm text-white/90">{result.reason}</div>}
              {result.delegate && (
                <div className="mt-3 border-t border-white/30 pt-3">
                  <div className="text-lg font-medium">{result.delegate.name}</div>
                  <div className="text-sm text-white/90">
                    {result.delegate.organisation}, {result.delegate.category}
                  </div>
                  <div className="text-[13px] text-white/70 mt-1">
                    {tierOf(result.delegate)}, {result.delegate.badgeCode}, {result.at}
                  </div>
                </div>
              )}
              {result.verdict === "deny" && result.delegate && post.kind !== "desk" && post.kind !== "drdesk" && !drRoom && !override && (
                <button onClick={() => setOverride(true)} className="mt-3 w-full rounded-lg bg-white/20 py-2 text-sm font-medium">
                  Override with PIN
                </button>
              )}
              {override && (
                <div className="mt-3 space-y-2">
                  <input className="w-full rounded-lg bg-white/90 text-ink px-3 py-2 text-sm" placeholder="Staff PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                  <select className="w-full rounded-lg bg-white/90 text-ink px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Reason…</option>
                    <option>Organiser instruction</option>
                    <option>Exit scan missed</option>
                    <option>Manual grant pending sync</option>
                  </select>
                  <button onClick={doOverride} className="w-full rounded-lg bg-ink py-2 text-sm font-medium">
                    Confirm override
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 p-5 text-center text-sm text-white/50">Scan a badge to get a verdict in under a second.</div>
          )}

          {log.length > 0 && (
            <ul className="mt-4 space-y-1 text-[13px] text-white/60">
              {log.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{l.name}</span>
                  <span className={l.verdict === "deny" ? "text-coral" : l.verdict === "override" ? "text-warn" : "text-ok"}>{l.verdict}</span>
                  <span className="font-mono">{l.at}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="px-5 py-3 text-[13px] text-white/40">
          {post.kind === "drdesk" || drRoom
            ? "Checks in order: valid badge → this event → a Deal Room participant → a meeting today (desk) or here, from 15 minutes before (door)."
            : "Checks in order: valid badge → entitled here, now → anti-passback → zone capacity. Offline: cached list, capacity check skipped."}
        </footer>
      </div>
    </div>
  );
}

/** Badges that show each Deal Room verdict at the clock's time, picked from the live data. */
function drSamples(state: AppState, post: Post, eventId: string): string[][] {
  const dr = state.dealRoom;
  const clock = dr.clock;
  const today = clock.slice(0, 10);
  const badge = (appId?: string) => state.delegates.find((d) => d.id === dr.apps.find((a) => a.id === appId)?.delegateId)?.badgeCode ?? "";
  const party = (m: DrMeeting | undefined, side: "seeker" | "provider") => {
    const x = m && dr.matches.find((mm) => mm.id === m.matchId);
    return x ? (side === "seeker" ? x.seekerId : x.providerId) : undefined;
  };
  const todays = dr.meetings.filter((m) => m.eventId === eventId && m.start.slice(0, 10) === today && ["Confirmed", "In progress"].includes(m.status)).sort((a, b) => a.start.localeCompare(b.start));
  const other = ["EXC-DEMO-4821", "Other event"];
  if (post.kind === "room" && state.rooms.find((r) => r.id === post.roomId)?.zoneId === DR_ZONE) {
    const here = todays.find((m) => m.roomId === post.roomId && clock >= addMinutes(m.start, -15) && clock < m.end && m.status === "Confirmed") ?? todays.find((m) => m.roomId === post.roomId && clock >= addMinutes(m.start, -15) && clock < m.end);
    const elsewhere = todays.find((m) => m.roomId !== post.roomId && m.start > clock);
    return [
      [badge(party(here, "seeker")), "Seeker, meeting here"],
      [badge(party(here, "provider")), "Investor, same meeting"],
      [badge(party(elsewhere, "seeker")), "Meeting elsewhere"],
      other,
    ];
  }
  const due = todays.find((m) => m.status === "Confirmed" && m.start > clock && !m.arrivals.seeker);
  const busy = new Set(dr.meetings.filter((m) => m.start.slice(0, 10) === today).flatMap((m) => [party(m, "seeker"), party(m, "provider")]));
  const idle = dr.apps.find((a) => a.eventId === eventId && a.delegateId && !busy.has(a.id));
  return [
    [badge(party(due, "seeker")), "Seeker, meeting soon"],
    [badge(party(due, "provider")), "Investor, same meeting"],
    [badge(idle?.id), "No meeting today"],
    other,
  ];
}
