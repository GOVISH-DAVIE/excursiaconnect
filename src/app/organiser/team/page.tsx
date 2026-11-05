"use client";

import { useState } from "react";
import { Empty, PageHeader, Section, Stat, Tabs, Tone } from "@/components/ui";
import { useStore } from "@/lib/store";
import { CAPABILITIES, ROLES, ROLE_NOTES, can } from "@/lib/roles";
import type { Role, TeamMember } from "@/lib/types";

const tabs = ["Staff", "Roles", "Scanning rota"] as const;
const SLOTS = ["Morning", "Afternoon"] as const;
const SLOT_TIMES = { Morning: "07:30 to 13:00", Afternoon: "13:00 to 18:30" };

export default function OrganiserTeam() {
  const { state, dispatch } = useStore();
  const org = state.organisers[0];
  const [tab, setTab] = useState<(typeof tabs)[number]>("Staff");
  const team = state.team.filter((m) => m.organiserId === org.id);
  const events = state.events.filter((e) => e.organiserId === org.id);
  const liveEvent = events.find((e) => e.state === "Live") ?? events[0];
  const zones = state.zones.filter((z) => z.eventId === liveEvent.id);
  const scanners = team.filter((m) => can(state.grants, m.role, "access.scan"));
  const [invite, setInvite] = useState({ name: "", email: "", role: "Staff" as Role, responsibility: "", eventId: "" });

  const posts = [
    { id: "desk", label: "Accreditation desk" },
    ...zones.flatMap((z) => [{ id: `${z.id}:in`, label: `${z.name}, entrance` }, ...(z.id === "z_dining" ? [] : [{ id: `${z.id}:out`, label: `${z.name}, exit` }])]),
  ];
  const days = Array.from({ length: liveEvent.days }, (_, i) => i + 1);
  const shiftFor = (day: number, slot: (typeof SLOTS)[number], post: string) => state.shifts.find((s) => s.eventId === liveEvent.id && s.day === day && s.slot === slot && s.post === post);
  const filled = state.shifts.filter((s) => s.eventId === liveEvent.id && s.memberId).length;
  const slotsTotal = posts.length * days.length * SLOTS.length;

  function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.name || !invite.email) return;
    const member: TeamMember = { id: `u_${Date.now().toString(36)}`, organiserId: org.id, name: invite.name, email: invite.email, role: invite.role, responsibility: invite.responsibility || undefined, eventIds: invite.eventId ? [invite.eventId] : [], status: "Invited" };
    dispatch({ type: "inviteMember", member });
    setInvite({ name: "", email: "", role: "Staff", responsibility: "", eventId: "" });
  }

  return (
    <>
      <PageHeader title="Team and roles" kicker={`${team.length} people at ${org.name}. A role says what someone may do; a responsibility says what they look after; the rota says where they scan and when.`} />
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <Stat label="People" value={team.length} sub={`${team.filter((m) => m.status === "Invited").length} invited, not yet signed in`} />
        <Stat label="With revenue access" value={team.filter((m) => can(state.grants, m.role, "money.view")).length} sub="Owner and Finance by default" tone="warn" />
        <Stat label="Scanners" value={scanners.length} sub="can sign in to the staff app" />
        <Stat label="Rota filled" value={`${filled} of ${slotsTotal}`} sub={`${liveEvent.name.split(" ").slice(0, 3).join(" ")}, ${days.length} days`} tone={filled < slotsTotal / 2 ? "warn" : "ok"} />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "Staff" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Section title="Staff" flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Person</th>
                  <th className="th">Role</th>
                  <th className="th">Looks after</th>
                  <th className="th">Events</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} className="hover:bg-paper">
                    <td className="td">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-[13px] text-slate">{m.email}</div>
                    </td>
                    <td className="td">
                      {m.role === "Owner" ? (
                        <span className="font-medium">Owner</span>
                      ) : (
                        <select className="input h-9 w-auto min-w-36 text-[14px]" value={m.role} onChange={(e) => dispatch({ type: "setMemberRole", memberId: m.id, role: e.target.value as Role })}>
                          {ROLES.filter((r) => r !== "Owner").map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="td text-slate">{m.responsibility ?? (m.role === "Accreditation" ? "Scanning" : m.role === "Speaker" ? "Own session" : "–")}</td>
                    <td className="td text-slate">{m.eventIds.length === 0 ? "All events" : m.eventIds.map((id) => events.find((e) => e.id === id)?.brand.logoText ?? id).join(", ")}</td>
                    <td className="td">
                      <Tone tone={m.status === "Active" ? "ok" : "warn"}>{m.status}</Tone>
                      {m.lastActive && <div className="text-[13px] text-slate mt-1">{m.lastActive}</div>}
                    </td>
                    <td className="td text-right">
                      {m.role !== "Owner" && (
                        <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "removeMember", memberId: m.id })}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-3 text-[13px] text-slate">A role is a set of permissions (see Roles). Scope a person to one event, or leave it open for every event you run. Every edit a staff member makes is logged under their name.</p>
          </Section>
          <Section title="Invite someone">
            <form className="space-y-4" onSubmit={sendInvite}>
              <div>
                <label className="label" htmlFor="inv-name">Name</label>
                <input id="inv-name" className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} required />
              </div>
              <div>
                <label className="label" htmlFor="inv-email">Email</label>
                <input id="inv-email" type="email" className="input" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
              </div>
              <div>
                <label className="label" htmlFor="inv-role">Role</label>
                <select id="inv-role" className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                  {ROLES.filter((r) => r !== "Owner").map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[13px] text-slate">{ROLE_NOTES[invite.role]}</p>
              </div>
              <div>
                <label className="label" htmlFor="inv-resp">Looks after</label>
                <input id="inv-resp" className="input" placeholder="Delegates, Exhibition, Sponsors…" value={invite.responsibility} onChange={(e) => setInvite({ ...invite, responsibility: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="inv-event">Event</label>
                <select id="inv-event" className="input" value={invite.eventId} onChange={(e) => setInvite({ ...invite, eventId: e.target.value })}>
                  <option value="">All events</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary w-full" type="submit">
                Send invitation
              </button>
              <p className="text-[13px] text-slate">They get an email with a sign-in link; an accreditation account signs in on the scanner with a PIN.</p>
            </form>
          </Section>
        </div>
      )}

      {tab === "Roles" && (
        <Section title="What each role may do" flush action={<span className="text-[13px] text-slate">Tick to allow. Owner cannot be changed.</span>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Capability</th>
                  {ROLES.map((r) => (
                    <th key={r} className="th text-center">
                      {r}
                      <div className="text-[13px] font-normal text-slate whitespace-normal max-w-40 mt-0.5">{ROLE_NOTES[r]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((g) => (
                  <GroupRows key={g.group} group={g.group} items={g.items} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[13px] text-slate">Permissions apply the moment they are saved. A person who loses money access stops seeing revenue on every dashboard; a scanner who loses override cannot clear a deny. Changes are logged with who made them.</p>
        </Section>
      )}

      {tab === "Scanning rota" && (
        <Section title={`Scanning rota, ${liveEvent.name}`} flush action={<span className="text-[13px] text-slate">Morning {SLOT_TIMES.Morning}, afternoon {SLOT_TIMES.Afternoon}</span>}>
          {scanners.length === 0 ? (
            <div className="p-5">
              <Empty>No one can scan yet. Give someone the Accreditation role, or allow scanning for Staff.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Post</th>
                    {days.flatMap((d) =>
                      SLOTS.map((s) => (
                        <th key={`${d}${s}`} className="th">
                          Day {d}
                          <div className="text-[13px] font-normal text-slate">{s}</div>
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-paper">
                      <td className="td font-medium whitespace-nowrap">{p.label}</td>
                      {days.flatMap((d) =>
                        SLOTS.map((s) => {
                          const sh = shiftFor(d, s, p.id);
                          const busy = state.shifts.filter((x) => x.eventId === liveEvent.id && x.day === d && x.slot === s && x.post !== p.id && x.memberId).map((x) => x.memberId);
                          return (
                            <td key={`${d}${s}`} className="td">
                              <select className={`input h-9 text-[14px] min-w-36 ${sh?.memberId ? "" : "text-mute"}`} value={sh?.memberId ?? ""} onChange={(e) => dispatch({ type: "assignShift", eventId: liveEvent.id, day: d, slot: s, post: p.id, memberId: e.target.value || undefined })}>
                                <option value="">Unfilled</option>
                                {scanners.map((m) => (
                                  <option key={m.id} value={m.id} disabled={busy.includes(m.id)}>
                                    {m.name}
                                    {busy.includes(m.id) ? " (on another post)" : m.status === "Invited" ? " (invited)" : ""}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 text-[13px] text-slate">A person can hold one post per slot. When they sign in to the staff app, the scanner opens on the post they are rostered to, with that zone&apos;s entitlement list synced. Dining has no exit scanner, so no anti-passback there.</p>
        </Section>
      )}
    </>
  );
}

function GroupRows({ group, items }: { group: string; items: { id: Parameters<typeof can>[2]; label: string }[] }) {
  const { state, dispatch } = useStore();
  return (
    <>
      <tr>
        <td className="td bg-paper-200 text-[13px] font-medium text-slate" colSpan={ROLES.length + 1}>
          {group}
        </td>
      </tr>
      {items.map((c) => (
        <tr key={c.id} className="hover:bg-paper">
          <td className="td">{c.label}</td>
          {ROLES.map((r) => {
            const on = can(state.grants, r, c.id);
            return (
              <td key={r} className="td text-center">
                <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={!!on} disabled={r === "Owner"} aria-label={`${r}: ${c.label}`} onChange={(e) => dispatch({ type: "setGrant", role: r, cap: c.id, on: e.target.checked })} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
