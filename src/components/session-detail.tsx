"use client";

import Link from "next/link";
import { Empty, KV, Meter, PageHeader, Section, Stat, Tone } from "@/components/ui";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { SessionEditor } from "@/app/organiser/events/[id]/editors";

export function SessionDetail({ sessionId, mode }: { sessionId: string; mode: "organiser" | "facilitator" }) {
  const { state, dispatch, hydrated } = useStore();
  const [editing, setEditing] = useState(false);
  const s = state.sessions.find((x) => x.id === sessionId);
  if (!s) return <Empty>{hydrated ? "Session not found." : "Loading…"}</Empty>;
  const event = state.events.find((e) => e.id === s.eventId)!;
  const room = state.rooms.find((r) => r.id === s.roomId);
  const zone = room ? state.zones.find((z) => z.id === room.zoneId) : undefined;
  const base = `/organiser/events/${event.id}`;
  const roster = state.delegates.filter((d) => d.sessions.includes(s.id));
  const scannedIn = roster.filter((d) => d.checkIns.length > 0);
  const fill = s.capacity ? Math.round((s.enrolled / s.capacity) * 100) : 0;
  const isBreakout = s.kind === "breakout";

  const controls = (
    <>
      {s.status === "scheduled" && (
        <button className="btn-primary" onClick={() => dispatch({ type: "updateSession", sessionId: s.id, patch: { status: "live" } })}>
          Start session
        </button>
      )}
      {s.status === "live" && (
        <button className="btn-secondary" onClick={() => dispatch({ type: "updateSession", sessionId: s.id, patch: { status: "ended", attended: Math.max(s.attended, scannedIn.length) } })}>
          End session
        </button>
      )}
      {s.status === "ended" && <Tone tone="mute">Ended</Tone>}
    </>
  );

  return (
    <>
      {editing && <SessionEditor eventId={s.eventId} session={s} onClose={() => setEditing(false)} />}
      <PageHeader
        crumbs={mode === "organiser" ? [{ href: "/organiser", label: "Events" }, { href: base, label: event.name }, { href: `${base}?tab=Programme`, label: "Programme" }, { label: s.title }] : undefined}
        title={s.title}
        badge={s.status === "live" ? <Tone tone="ok">Live now</Tone> : undefined}
        kicker={`Day ${s.day}, ${s.start} to ${s.end}${room ? `, ${room.name}` : ""}${s.track ? `. ${s.track} track` : ""}. ${s.speakers.join(", ")}`}
        actions={
          <>
            {mode === "organiser" && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit session</button>}
            {mode === "facilitator" && (
              <button className="btn-secondary" onClick={() => dispatch({ type: "updateSession", sessionId: s.id, patch: { slidesUploaded: true } })}>
                {s.slidesUploaded ? "Slides uploaded" : "Upload slides"}
              </button>
            )}
            {isBreakout && controls}
          </>
        }
      />

      {isBreakout ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4 mb-4">
            <Stat label="Enrolled" value={s.enrolled} sub={`of ${s.capacity} seats, ${fill}% full`} tone={fill >= 100 ? "bad" : undefined} />
            <Stat label={s.status === "ended" ? "Attended" : "Scanned in so far"} value={s.status === "ended" ? s.attended : scannedIn.length} sub={s.enrolled ? `${Math.round(((s.status === "ended" ? s.attended : scannedIn.length) / s.enrolled) * 100)}% of enrolled` : undefined} tone="ok" />
            <Stat label="Rating" value={s.rating ? s.rating.toFixed(1) : "–"} sub={s.rating ? `${s.comments?.length ?? 0} comments` : "Opens when the session ends"} />
            <Stat label="Walk-ins" value={s.walkIns ? "Allowed" : "Enrolled only"} sub={<button className="text-coral font-medium" onClick={() => dispatch({ type: "updateSession", sessionId: s.id, patch: { walkIns: !s.walkIns } })}>{s.walkIns ? "Restrict to enrolled" : "Allow walk-ins"}</button>} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title={`Roster, ${roster.length}`} flush className="lg:col-span-2">
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="th">Delegate</th>
                      <th className="th">Organisation</th>
                      <th className="th">Category</th>
                      <th className="th">Door scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((d) => (
                      <tr key={d.id} className="hover:bg-paper">
                        <td className="td">
                          {mode === "organiser" ? (
                            <Link href={`${base}/delegates/${d.id}`} className="font-medium hover:underline">
                              {d.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{d.name}</span>
                          )}
                        </td>
                        <td className="td text-slate">{d.organisation}</td>
                        <td className="td text-slate">{d.category}</td>
                        <td className="td">{d.checkIns.length ? <Tone tone="ok">In</Tone> : <Tone tone="mute">Not yet</Tone>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {roster.length === 0 && (
                  <div className="p-5">
                    <Empty>No one has enrolled yet.</Empty>
                  </div>
                )}
              </div>
            </Section>
            <div className="space-y-4">
              <Section title="Room">
                <KV rows={[["Room", room?.name ?? "–"], ["Zone", zone?.name ?? "–"], ["Seats", String(room?.capacity ?? "–")], ["Session cap", String(s.capacity ?? "–")], ["Door rule", s.walkIns ? "Enrolled plus walk-ins" : "Enrolled delegates only"]]} />
                <div className="mt-3">
                  <Meter value={s.enrolled} max={s.capacity ?? 1} warnAt={0.8} badAt={1} />
                </div>
              </Section>
              <Section title="Feedback" flush>
                {s.comments?.length ? (
                  <ul>
                    {s.comments.map((c, i) => (
                      <li key={i} className="px-5 py-3 border-b border-line last:border-0 text-sm">“{c}”</li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-sm text-slate">Feedback opens to enrolled delegates when the session ends.</p>
                )}
              </Section>
            </div>
          </div>
        </>
      ) : (
        <Section title="Details">
          <KV rows={[["Type", s.kind === "plenary" ? "Plenary, all delegates" : s.kind === "social" ? "Social item" : "Break"], ["Where", s.kind === "plenary" ? "Main hall" : "Venue-wide"], ["Speakers", s.speakers.join(", ") || "–"]]} />
          <p className="mt-3 text-sm text-slate">Plenaries and social items have no roster; attendance is the zone count at the time.</p>
        </Section>
      )}
    </>
  );
}
