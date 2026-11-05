"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Programme } from "@/components/programme";
import { StatusPill, Wordmark } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/use-today";

const tabs = ["Badge", "My day", "Programme", "People", "Messages"] as const;

export function Badge({ id }: { id: string }) {
  const { state, dispatch, hydrated } = useStore();
  // the public page links here: ?tab=People&q=<name> to book, ?tab=Messages&with=<delegate id> to chat
  const search = useSearchParams();
  const today = useToday();
  const [tab, setTab] = useState<(typeof tabs)[number]>(() => tabs.find((t) => t === search.get("tab")) ?? "Badge");
  const [chatWith, setChatWith] = useState<string | null>(() => search.get("with"));
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState(() => search.get("q") ?? "");
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ name: "", organisation: "", jobTitle: "", phone: "" });

  const me = state.delegates.find((d) => d.id === id);
  if (!me) return <div className="p-10 text-slate">{hydrated ? "Badge not found." : "Loading…"}</div>;
  const event = state.events.find((e) => e.id === me.eventId)!;
  const refundDeadline = new Date(event.startDate);
  refundDeadline.setDate(refundDeadline.getDate() - 7);
  const refundOpen = !today || today < refundDeadline.toISOString().slice(0, 10);
  const refundBy = refundDeadline.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const tier = state.tiers.find((t) => t.id === me.tierId)!;
  const sessions = state.sessions.filter((s) => s.eventId === event.id);
  const zones = state.zones.filter((z) => tier.entitlements.includes(z.id) || (me.category === "VIP" && z.id === "z_vip"));
  const people = state.delegates.filter((d) => d.id !== me.id && d.eventId === event.id && d.bookable && (d.status === "Confirmed" || d.status === "Checked in") && (query === "" || `${d.name} ${d.organisation}`.toLowerCase().includes(query.toLowerCase()))).slice(0, 12);
  const threads = [...new Set(state.messages.filter((m) => m.from === me.id || m.to === me.id).map((m) => (m.from === me.id ? m.to : m.from)))];
  const thread = chatWith ? state.messages.filter((m) => (m.from === me.id && m.to === chatWith) || (m.from === chatWith && m.to === me.id)) : [];
  const catColor: Record<string, string> = { Speaker: "#5B2A86", Panelist: "#5B2A86", Sponsor: "#0A7E8C", Exhibitor: "#0A7E8C", VIP: "#B8860B", "General Delegate": event.brand.primary };

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-md min-h-screen bg-white shadow-xl flex flex-col">
        <header style={{ background: event.brand.primary }} className="text-white px-5 pt-5 pb-4">
          <div className="text-[13px] text-white/70">{event.name}</div>
          <div className="mt-0.5 text-2xl font-medium tracking-tight">Hi {me.name.split(" ")[0]}</div>
        </header>
        <nav className="flex border-b border-line overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 ${tab === t ? "border-coral text-ink" : "border-transparent text-slate"}`}>
              {t}
            </button>
          ))}
        </nav>

        <div className="flex-1 p-5">
          {tab === "Badge" && (
            <div>
              <div className="rounded-2xl border border-line overflow-hidden">
                <div style={{ background: catColor[me.category] }} className="text-white px-5 py-3 flex items-center justify-between">
                  <span className="font-medium text-sm">{me.category}</span>
                  <span className="text-[13px] opacity-80">{tier.name}</span>
                </div>
                <div className="p-5 text-center">
                  <div className="text-2xl font-medium tracking-tight">{me.name}</div>
                  <div className="text-slate">{me.organisation}</div>
                  <div className="text-sm text-slate">{me.jobTitle}</div>
                  <div className="mt-5 inline-block rounded-xl border border-line p-3 bg-white">
                    <QRCodeSVG value={me.badgeCode} size={176} level="M" fgColor="#1c1c1e" />
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate">{me.badgeCode}</div>
                  <div className="mt-3">
                    <StatusPill status={me.status} />
                    {me.accredited && <span className="pill bg-ok-50 text-ok ml-2">Accredited</span>}
                  </div>
                </div>
                <div className="bg-paper px-5 py-3 text-[13px] text-slate">
                  <div className="font-medium text-ink mb-1">Where this badge gets you</div>
                  <div className="flex flex-wrap gap-1">
                    {zones.map((z) => (
                      <span key={z.id} className="pill bg-white border border-line-strong text-slate">
                        {z.name}
                      </span>
                    ))}
                    {tier.entitlements.includes("dinner") && <span className="pill bg-white border border-line-strong text-slate">Gala dinner</span>}
                    {tier.entitlements.includes("stream") && <span className="pill bg-white border border-line-strong text-slate">Live stream</span>}
                  </div>
                </div>
              </div>
              {me.checkIns.length > 0 && (
                <div className="mt-4 text-sm text-slate">
                  Checked in: {me.checkIns.map((c) => `Day ${c.day} at ${c.at}`).join(", ")}
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-secondary text-[13px]" onClick={() => window.print()}>
                  Print badge (PDF)
                </button>
                <button className="btn-secondary text-[13px]" onClick={() => dispatch({ type: "updateDelegate", delegateId: me.id, patch: { bookable: !me.bookable, slots: me.slots ?? [{ day: 1, time: "15:45", location: "Networking lounge" }, { day: 2, time: "10:30", location: "Networking lounge" }] } })}>
                  {me.bookable ? "Close my calendar" : "Open my calendar"}
                </button>
              </div>

              {/* DE-10: edit own profile until the organiser locks edits; DE-15: ask for a refund within policy */}
              <div className="mt-4 border-t border-line pt-4">
                {editing ? (
                  <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      dispatch({ type: "updateDelegate", delegateId: me.id, patch: profile });
                      setEditing(false);
                    }}
                  >
                    {(["name", "organisation", "jobTitle", "phone"] as const).map((k) => (
                      <div key={k}>
                        <label className="label" htmlFor={`p-${k}`}>{{ name: "Full name", organisation: "Organisation", jobTitle: "Job title", phone: "Phone" }[k]}</label>
                        <input id={`p-${k}`} className="input" value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
                      </div>
                    ))}
                    <div className="flex gap-2 justify-end">
                      <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary">Save</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
                    {event.profileLocked ? (
                      <span className="text-slate">Profile edits closed; badges print from these details. Ask the desk for a change.</span>
                    ) : (
                      <button className="link" onClick={() => { setProfile({ name: me.name, organisation: me.organisation, jobTitle: me.jobTitle, phone: me.phone }); setEditing(true); }}>
                        Edit my details
                      </button>
                    )}
                    {(me.status === "Confirmed" || me.status === "Checked in") && tier.price > 0 && (
                      refundOpen ? (
                        <button className="link" onClick={() => { if (confirm(`Refund ${tier.name} in full to the original payment method? Your badge is cancelled.`)) dispatch({ type: "requestRefund", delegateId: me.id }); }}>
                          Request a refund
                        </button>
                      ) : (
                        <span className="text-slate">Refunds closed since {refundBy}.</span>
                      )
                    )}
                    {me.status === "Refund requested" && <span className="text-warn">Refund requested; the organiser is reviewing it.</span>}
                    {me.status === "Waitlisted" && <span className="text-slate">You are on the waitlist for {tier.name}. We offer places in order, with 24 hours to pay.</span>}
                  </div>
                )}
              </div>
              {tier.entitlements.includes("stream") && (
                <div className="mt-4 rounded-xl bg-ink text-white p-4">
                  <div className="font-medium">Live stream</div>
                  <div className="aspect-video mt-2 rounded-lg bg-black/60 grid place-items-center text-white/60 text-sm">Embedded public stream (YouTube Live)</div>
                </div>
              )}
            </div>
          )}

          {tab === "My day" && (
            <div>
              <p className="text-sm text-slate mb-3">Only what you are enrolled in or entitled to.</p>
              <Programme sessions={sessions} rooms={state.rooms} days={event.days} startDate={event.startDate} enrolled={me.sessions} myDayOnly canEnrol={tier.entitlements.includes("breakouts")} onEnrol={(sid, on) => dispatch({ type: "enrol", delegateId: me.id, sessionId: sid, on })} />
            </div>
          )}

          {tab === "Programme" && (
            <div>
              {!tier.entitlements.includes("breakouts") && <p className="text-sm text-slate mb-3">Your ticket does not include breakout enrolment.</p>}
              <Programme sessions={sessions} rooms={state.rooms} days={event.days} startDate={event.startDate} enrolled={me.sessions} canEnrol={tier.entitlements.includes("breakouts")} onEnrol={(sid, on) => dispatch({ type: "enrol", delegateId: me.id, sessionId: sid, on })} />
            </div>
          )}

          {tab === "People" && (
            <div>
              <input className="input mb-3" placeholder="Search delegates who opened their calendar" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="space-y-3">
                {people.map((p) => (
                  <div key={p.id} className="surface p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-sm text-slate">
                          {p.jobTitle}, {p.organisation}
                        </div>
                        <span className="pill bg-paper-200 text-slate mt-1">{p.category}</span>
                      </div>
                      <button className="text-coral text-sm font-medium" onClick={() => { setChatWith(p.id); setTab("Messages"); }}>
                        Message
                      </button>
                    </div>
                    {p.slots && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.slots.map((s, i) => {
                          const mine = s.bookedBy === me.id;
                          const taken = !!s.bookedBy && !mine;
                          return (
                            <button key={i} disabled={taken} onClick={() => !mine && dispatch({ type: "book", hostId: p.id, slotIndex: i, byId: me.id })} className={`rounded-md px-2.5 py-1 text-[13px] font-medium border ${mine ? "bg-ok text-white border-ok" : taken ? "bg-paper text-slate border-line line-through" : "border-line-strong hover:border-coral"}`}>
                              Day {s.day}, {s.time}, {s.location}
                              {mine && " ✓ booked"}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {people.length === 0 && <p className="text-sm text-slate">No one matches.</p>}
              </div>
            </div>
          )}

          {tab === "Messages" && (
            <div className="flex flex-col h-full">
              {!chatWith ? (
                <div className="space-y-2">
                  {threads.length === 0 && <p className="text-sm text-slate">No conversations yet. Find someone under People.</p>}
                  {threads.map((pid) => {
                    const p = state.delegates.find((d) => d.id === pid);
                    const last = [...state.messages].reverse().find((m) => (m.from === pid && m.to === me.id) || (m.from === me.id && m.to === pid));
                    return (
                      <button key={pid} onClick={() => setChatWith(pid)} className="w-full text-left surface p-3 hover:border-coral">
                        <div className="font-medium">{p?.name}</div>
                        <div className="text-sm text-slate truncate">{last?.body}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setChatWith(null)} className="text-sm text-slate">
                      ← Back
                    </button>
                    <div className="font-medium">{state.delegates.find((d) => d.id === chatWith)?.name}</div>
                    <button className="text-[13px] text-bad">Report</button>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {thread.map((m) => (
                      <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.from === me.id ? "ml-auto bg-coral text-white" : "bg-paper-200"}`}>
                        {m.body}
                        <div className={`text-[13px] mt-0.5 ${m.from === me.id ? "text-white/70" : "text-slate"}`}>{m.at}</div>
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!draft.trim()) return;
                      dispatch({ type: "message", from: me.id, to: chatWith, body: draft.slice(0, 500) });
                      setDraft("");
                    }}
                  >
                    <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Brief message (500 chars)" maxLength={500} />
                    <button className="btn-primary">Send</button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t border-line text-[13px] text-slate inline-flex items-center gap-2">
          Powered by <Wordmark size="sm" />
        </footer>
      </div>
    </div>
  );
}
