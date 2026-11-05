"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, KV, PageHeader, Section, StatusPill, Tone } from "@/components/ui";
import { money, useStore } from "@/lib/store";

export function DelegateRecord({ eventId, delegateId }: { eventId: string; delegateId: string }) {
  const { state, dispatch, hydrated } = useStore();
  const [editing, setEditing] = useState(false);
  const d = state.delegates.find((x) => x.id === delegateId);
  const event = state.events.find((e) => e.id === eventId);
  if (!d || !event) return <Empty>{hydrated ? "Delegate not found." : "Loading…"}</Empty>;
  const tier = state.tiers.find((t) => t.id === d.tierId)!;
  const order = state.orders.find((o) => o.delegateId === d.id);
  const zones = state.zones.filter((z) => z.eventId === eventId);
  const sessions = state.sessions.filter((s) => d.sessions.includes(s.id));
  const base = `/organiser/events/${eventId}`;
  const entitled = (zid: string) => tier.entitlements.includes(zid) || (d.grants ?? []).includes(zid) || (d.category === "VIP" && zid === "z_vip");
  const meetings = state.delegates.flatMap((h) => (h.slots ?? []).filter((s) => s.bookedBy === d.id).map((s) => ({ with: h.name, ...s }))).concat((d.slots ?? []).filter((s) => s.bookedBy).map((s) => ({ with: state.delegates.find((x) => x.id === s.bookedBy)?.name ?? "", ...s })));
  const [form, setForm] = useState({ name: d.name, organisation: d.organisation, jobTitle: d.jobTitle, phone: d.phone, category: d.category });

  const audit = [
    ...(d.status !== "Pending" ? [{ at: order?.at ?? "2026-10-02", who: "System", what: `Registered via public page, tier ${tier.name}` }] : []),
    ...(order ? [{ at: order.at, who: order.method === "bank" ? "Organiser staff" : "System", what: `Payment ${order.status} by ${order.method === "mpesa" ? "M-Pesa" : order.method}, ref ${order.reference}` }] : []),
    ...d.checkIns.map((c) => ({ at: `Day ${c.day} ${c.at}`, who: "Accreditation desk 1", what: "Accredited and checked in" })),
    ...d.zoneLog.slice(0, 5).map((l) => ({ at: l.at, who: "Door staff", what: `${zones.find((z) => z.id === l.zoneId)?.name} ${l.direction}: ${l.verdict}${l.reason ? `, ${l.reason}` : ""}` })),
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/organiser", label: "Events" }, { href: base, label: event.name }, { href: `${base}?tab=Delegates`, label: "Delegates" }, { label: d.name }]}
        title={d.name}
        badge={
          <>
            <StatusPill status={d.status} />
            {d.accredited && <Tone tone="ok">Accredited</Tone>}
          </>
        }
        kicker={`${d.jobTitle || d.category}, ${d.organisation}. ${tier.name} ticket, badge ${d.badgeCode}.`}
        actions={
          <>
            <Link href={`/badge/${d.id}`} target="_blank" className="btn-ghost">
              Open badge
            </Link>
            <button className="btn-ghost" onClick={() => dispatch({ type: "updateDelegate", delegateId: d.id, patch: { badgeCode: `EXC-RE-${Math.floor(1000 + Math.random() * 8999)}` } })}>
              Reissue badge
            </button>
            {d.status === "Pending" && (
              <button className="btn-primary" onClick={() => dispatch({ type: "approveRegistration", delegateId: d.id, approve: true })}>
                Approve registration
              </button>
            )}
            {d.status === "Awaiting payment" && (
              <button className="btn-primary" onClick={() => dispatch({ type: "updateDelegate", delegateId: d.id, patch: { status: "Confirmed" } })}>
                Mark bank transfer paid
              </button>
            )}
            {(d.status === "Confirmed" || d.status === "Checked in") && (
              <button className="btn-ghost text-bad" onClick={() => dispatch({ type: "refund", delegateId: d.id })}>
                Refund and cancel
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Profile"
          action={
            editing ? (
              <button
                className="btn-primary"
                onClick={() => {
                  dispatch({ type: "updateDelegate", delegateId: d.id, patch: form });
                  setEditing(false);
                }}
              >
                Save changes
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => setEditing(true)}>
                Edit
              </button>
            )
          }
        >
          {editing ? (
            <div className="space-y-3">
              {(["name", "organisation", "jobTitle", "phone"] as const).map((k) => (
                <div key={k}>
                  <label className="label">{{ name: "Full name", organisation: "Organisation", jobTitle: "Job title", phone: "Phone" }[k]}</label>
                  <input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}>
                  {["General Delegate", "Speaker", "Panelist", "Sponsor", "Exhibitor", "VIP"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <KV rows={[["Email", d.email], ["Phone", d.phone], ["Organisation", d.organisation], ["Job title", d.jobTitle || "–"], ["Country", d.country], ["Category", d.category], ["Ticket", tier.name], ["Badge code", <span key="b" className="font-mono text-[13px]">{d.badgeCode}</span>]]} />
          )}
        </Section>

        <Section title="Payment">
          {order ? (
            <>
              <KV
                rows={[
                  ["Date", order.at],
                  ["Method", order.method === "mpesa" ? "M-Pesa STK push" : order.method === "card" ? "Card (Paystack)" : "Bank transfer"],
                  ["Reference", <span key="r" className="font-mono text-[13px]">{order.reference}</span>],
                  ["Status", <Tone key="s" tone={order.status === "paid" ? "ok" : order.status === "refunded" ? "bad" : "warn"}>{order.status}</Tone>],
                ]}
              />
              <table className="w-full mt-4">
                <tbody>
                  {[
                    ["Gross paid", order.gross],
                    ["Promo discount", -order.discount],
                    [`Platform commission (${event.commissionPct}%)`, -order.commission],
                    ["Gateway fee (borne by Algotech)", 0],
                  ].map(([k, v]) => (
                    <tr key={String(k)}>
                      <td className="py-1 text-sm text-slate">{k}</td>
                      <td className="py-1 text-sm text-right num">{Number(v) === 0 ? "–" : Number(v).toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ink">
                    <td className="py-1.5 text-sm font-semibold">Organiser net</td>
                    <td className="py-1.5 text-sm text-right num font-semibold">{money(order.net, tier.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-sm text-slate">{tier.price === 0 ? "Complimentary ticket, nothing to collect." : d.status === "Pending" ? "Payment is requested once you approve the registration." : "No payment recorded yet."}</p>
          )}
        </Section>

        <Section title="Zone access" flush>
          <ul>
            {zones.map((z) => {
              const byTier = tier.entitlements.includes(z.id) || (d.category === "VIP" && z.id === "z_vip");
              const byGrant = (d.grants ?? []).includes(z.id);
              return (
                <li key={z.id} className="flex items-center justify-between px-5 py-2.5 border-b border-line last:border-0 text-sm">
                  <div>
                    <div className="font-medium">{z.name}</div>
                    <div className="text-[12px] text-slate">{byTier ? "From ticket" : byGrant ? "Manual grant" : "No access"}</div>
                  </div>
                  {byTier ? (
                    <Tone tone="ok">Allowed</Tone>
                  ) : (
                    <button className={`btn-quiet ${byGrant ? "text-bad" : "text-ok"}`} onClick={() => dispatch({ type: "grantZone", delegateId: d.id, zoneId: z.id, on: !byGrant })}>
                      {byGrant ? "Revoke" : "Grant"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="px-5 py-3 text-[12px] text-slate">Grants take effect on the next scan.</p>
        </Section>

        <Section title="Sessions" flush className="lg:col-span-2">
          {sessions.length === 0 ? (
            <div className="p-5">
              <Empty>{entitled("z_breakout") || tier.entitlements.includes("breakouts") ? "Not enrolled in any breakout yet." : "This ticket does not include breakouts."}</Empty>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Session</th>
                  <th className="th">When</th>
                  <th className="th">Room</th>
                  <th className="th">Attended</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`${base}/sessions/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                    </td>
                    <td className="td text-slate num">
                      Day {s.day}, {s.start}–{s.end}
                    </td>
                    <td className="td text-slate">{state.rooms.find((r) => r.id === s.roomId)?.name}</td>
                    <td className="td">{s.status === "ended" ? <Tone tone={d.checkIns.length ? "ok" : "mute"}>{d.checkIns.length ? "Scanned in" : "No scan"}</Tone> : <Tone tone="mute">Not yet</Tone>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Meetings" flush>
          {meetings.length === 0 ? (
            <div className="p-5">
              <Empty>No meetings booked.</Empty>
            </div>
          ) : (
            <ul>
              {meetings.map((m, i) => (
                <li key={i} className="px-5 py-2.5 border-b border-line last:border-0 text-sm">
                  <div className="font-medium">With {m.with}</div>
                  <div className="text-[13px] text-slate">
                    Day {m.day}, {m.time}, {m.location}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Activity" flush className="lg:col-span-3">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-40">When</th>
                <th className="th w-48">By</th>
                <th className="th">What</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td className="td num text-slate">{a.at}</td>
                  <td className="td text-slate">{a.who}</td>
                  <td className="td">{a.what}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td className="td text-slate" colSpan={3}>
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
