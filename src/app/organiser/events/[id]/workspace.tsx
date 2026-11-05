"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Programme } from "@/components/programme";
import { Bars, Empty, EventPill, Meter, PageHeader, Section, Stat, StatusPill, Tabs } from "@/components/ui";
import { money, useStore } from "@/lib/store";
import type { Delegate } from "@/lib/types";

const tabs = ["Overview", "Delegates", "Tickets and form", "Programme", "Zones and rooms", "Finance"] as const;
type Tab = (typeof tabs)[number];

export function EventWorkspace({ id }: { id: string }) {
  const { state, dispatch } = useStore();
  const search = useSearchParams();
  const router = useRouter();
  const tab = (tabs.find((t) => t === search.get("tab")) ?? "Overview") as Tab;
  const setTab = (t: Tab) => router.replace(`/organiser/events/${id}${t === "Overview" ? "" : `?tab=${encodeURIComponent(t)}`}`);

  const event = state.events.find((e) => e.id === id);
  if (!event) return <Empty>Event not found.</Empty>;
  const base = `/organiser/events/${id}`;
  const tiers = state.tiers.filter((t) => t.eventId === id);
  const delegates = state.delegates.filter((d) => d.eventId === id);
  const orders = state.orders.filter((o) => o.eventId === id);
  const zones = state.zones.filter((z) => z.eventId === id);
  const sessions = state.sessions.filter((s) => s.eventId === id);

  const confirmed = delegates.filter((d) => d.status === "Confirmed" || d.status === "Checked in");
  const checkedIn = delegates.filter((d) => d.checkIns.length > 0);
  const paid = orders.filter((o) => o.status === "paid");
  const gross = paid.reduce((a, o) => a + o.gross, 0);
  const net = paid.reduce((a, o) => a + o.net, 0);
  const commission = paid.reduce((a, o) => a + o.commission, 0);
  const pending = delegates.filter((d) => d.status === "Pending");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/organiser", label: "Events" }, { label: event.name }]}
        title={event.name}
        badge={<EventPill state={event.state} />}
        kicker={`${event.venue}, ${event.city}. ${event.days} days, ${event.expectedAttendance} expected.`}
        actions={
          <>
            <Link href={`/e/${event.slug}`} className="btn-secondary" target="_blank">
              Public page
            </Link>
            {event.state === "Draft" && (
              <button className="btn-primary" onClick={() => dispatch({ type: "setEventState", eventId: id, state: "Submitted" })}>
                Submit for approval
              </button>
            )}
            {event.state === "Approved" && (
              <button className="btn-primary" onClick={() => dispatch({ type: "setEventState", eventId: id, state: "Live" })}>
                Open registration
              </button>
            )}
          </>
        }
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} counts={{ Delegates: pending.length }} />

      {tab === "Overview" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Confirmed delegates" value={confirmed.length} sub={`${Math.round((confirmed.length / event.expectedAttendance) * 100)}% of ${event.expectedAttendance} expected`} href={`${base}?tab=Delegates&status=Confirmed`} />
            <Stat label="Checked in, day 1" value={checkedIn.length} sub={confirmed.length ? `${Math.round((checkedIn.length / confirmed.length) * 100)}% of confirmed` : undefined} tone="ok" href={`${base}?tab=Delegates&status=Checked in`} />
            <Stat label="Gross collected" value={money(gross)} sub={`Net to you ${money(net)}`} href={`${base}?tab=Finance`} />
            <Stat label="Awaiting your approval" value={pending.length} tone={pending.length ? "warn" : undefined} sub="invite-only tiers" href={`${base}?tab=Delegates&status=Pending`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Registrations, last 12 days" className="lg:col-span-2">
              <Bars values={event.registrationsByDay.length ? event.registrationsByDay : [0]} height={120} labels={["12 days ago", "Today"]} />
            </Section>
            <Section title="Occupancy now" flush>
              <ul>
                {zones.map((z) => (
                  <li key={z.id}>
                    <Link href={`${base}/zones/${z.id}`} className="block px-5 py-3 border-b border-line last:border-0 hover:bg-paper">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{z.name}</span>
                        <span className={`num ${z.occupancy / z.capacity >= 0.9 ? "text-bad font-medium" : "text-slate"}`}>
                          {z.occupancy} / {z.capacity}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Meter value={z.occupancy} max={z.capacity} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Ticket tiers" flush>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Tier</th>
                    <th className="th-r">Sold</th>
                    <th className="th-r">Cap</th>
                    <th className="th-r">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.id} className="hover:bg-paper">
                      <td className="td">
                        <Link href={`${base}/tiers/${t.id}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="td-r">{t.sold}</td>
                      <td className="td-r text-slate">{t.cap}</td>
                      <td className="td-r">{money(orders.filter((o) => o.tierId === t.id && o.status === "paid").reduce((a, o) => a + o.gross, 0), t.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="Breakout fill" flush>
              <ul>
                {sessions
                  .filter((s) => s.kind === "breakout")
                  .map((s) => (
                    <li key={s.id}>
                      <Link href={`${base}/sessions/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-line last:border-0 hover:bg-paper text-sm">
                        <span className="flex-1 truncate font-medium">{s.title}</span>
                        <span className="w-24">
                          <Meter value={s.enrolled} max={s.capacity ?? 1} warnAt={0.8} badAt={1} />
                        </span>
                        <span className="w-14 text-right num text-slate">
                          {s.enrolled}/{s.capacity}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Section>
          </div>
        </div>
      )}

      {tab === "Delegates" && <DelegatesTab delegates={delegates} base={base} initialStatus={search.get("status") ?? "All"} tierName={(tid) => tiers.find((t) => t.id === tid)?.name ?? ""} />}

      {tab === "Tickets and form" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Ticket tiers" action={<button className="btn-secondary">Add tier</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Tier</th>
                  <th className="th-r">Price</th>
                  <th className="th-r">Sold / cap</th>
                  <th className="th">Rules</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`${base}/tiers/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.entitlements.map((e) => (
                          <span key={e} className="pill bg-paper-200 text-slate">
                            {zones.find((z) => z.id === e)?.name ?? e.replace("-", " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="td-r">{t.price === 0 ? "Free" : money(t.price, t.currency)}</td>
                    <td className="td-r">
                      {t.sold} / {t.cap}
                    </td>
                    <td className="td text-[13px] text-slate">
                      {t.visibility}, {t.approval === "auto" ? "auto-confirm on payment" : "organiser approval"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-3 text-[13px] text-slate">A price change on a live event goes back to Algotech for re-approval. Registration continues on the approved terms meanwhile.</p>
          </Section>
          <Section title="Registration form" action={<button className="btn-secondary">Add field</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Field</th>
                  <th className="th">Shown to</th>
                  <th className="th">Required</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Full name", "Everyone", "Yes"],
                  ["Email", "Everyone", "Yes"],
                  ["Phone", "Everyone", "Yes"],
                  ["Organisation", "Everyone", "Yes"],
                  ["Job title", "Everyone", "No"],
                  ["Country", "Everyone", "No"],
                  ["Category", "Everyone", "Yes"],
                  ["Short bio", "Speakers, Panelists", "Yes"],
                  ["Headshot (up to 5 MB)", "Speakers", "No"],
                  ["Dietary or accessibility needs", "Everyone", "No"],
                ].map(([f, who, req]) => (
                  <tr key={f}>
                    <td className="td font-medium">{f}</td>
                    <td className="td text-slate">{who}</td>
                    <td className="td text-slate">{req}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-4 flex items-center gap-3 text-sm border-t border-line">
              <span className="h-8 w-8 rounded" style={{ background: event.brand.primary }} />
              <div>
                <div className="font-medium">Brand colour {event.brand.primary}</div>
                <div className="text-[13px] text-slate">Used on the public page, emails, badges and the post-event report.</div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === "Programme" && (
        <Section title="Programme" action={<button className="btn-secondary">Add session</button>}>
          <Programme sessions={sessions} rooms={state.rooms} days={event.days} startDate={event.startDate} linkBase={`${base}/sessions`} />
        </Section>
      )}

      {tab === "Zones and rooms" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Zones" action={<button className="btn-secondary">Add zone</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Zone</th>
                  <th className="th-r">Capacity</th>
                  <th className="th-r">Inside now</th>
                  <th className="th">Open</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`${base}/zones/${z.id}`} className="font-medium hover:underline">
                        {z.name}
                      </Link>
                      <div className="text-[13px] text-slate">{tiers.filter((t) => t.entitlements.includes(z.id)).map((t) => t.name).join(", ") || "Manual grants only"}</div>
                    </td>
                    <td className="td-r">{z.capacity}</td>
                    <td className="td-r">{z.occupancy}</td>
                    <td className="td text-slate">{z.window ?? "All day"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Breakout rooms" flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Room</th>
                  <th className="th">Zone</th>
                  <th className="th-r">Seats</th>
                  <th className="th-r">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {state.rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.name}</td>
                    <td className="td text-slate">{zones.find((z) => z.id === r.zoneId)?.name}</td>
                    <td className="td-r">{r.capacity}</td>
                    <td className="td-r">{sessions.filter((s) => s.roomId === r.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {tab === "Finance" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Gross" value={money(gross)} />
            <Stat label="Commission to Algotech" value={money(commission)} sub={`${event.commissionPct}% fixed at approval`} />
            <Stat label="Your net" value={money(net)} tone="ok" />
            <Stat label="Next payout" value="Fri 6 Nov" sub={`to ${state.organisers[0].payoutAccount}`} href="/organiser/finance" />
          </div>
          <Section title="Ledger" action={<button className="btn-secondary">Export .xlsx</button>} flush>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Delegate</th>
                    <th className="th">Tier</th>
                    <th className="th">Method</th>
                    <th className="th">Reference</th>
                    <th className="th-r">Gross</th>
                    <th className="th-r">Commission</th>
                    <th className="th-r">Net</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 30).map((o) => {
                    const d = delegates.find((x) => x.id === o.delegateId);
                    return (
                      <tr key={o.id} className="hover:bg-paper">
                        <td className="td num text-slate">{o.at}</td>
                        <td className="td">
                          <Link href={`${base}/delegates/${o.delegateId}`} className="font-medium hover:underline">
                            {d?.name}
                          </Link>
                        </td>
                        <td className="td text-slate">{tiers.find((t) => t.id === o.tierId)?.name}</td>
                        <td className="td">{o.method === "mpesa" ? "M-Pesa" : o.method === "card" ? "Card" : "Bank"}</td>
                        <td className="td font-mono text-[13px]">{o.reference}</td>
                        <td className="td-r">{o.gross.toLocaleString()}</td>
                        <td className="td-r text-slate">{o.commission.toLocaleString()}</td>
                        <td className="td-r font-medium">{o.net.toLocaleString()}</td>
                        <td className="td">
                          <span className={`pill ${o.status === "paid" ? "bg-ok-50 text-ok" : o.status === "refunded" ? "bg-bad-50 text-bad" : "bg-warn-50 text-warn"}`}>{o.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[13px] text-slate">
              First 30 of {orders.length}. Gateway fees are paid by Algotech and never come out of your net.
            </p>
          </Section>
        </div>
      )}
    </>
  );
}

function DelegatesTab({ delegates, base, tierName, initialStatus }: { delegates: Delegate[]; base: string; tierName: (id: string) => string; initialStatus: string }) {
  const { dispatch } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [cat, setCat] = useState("All");

  const rows = useMemo(
    () => delegates.filter((d) => (status === "All" || d.status === status) && (cat === "All" || d.category === cat) && (q === "" || `${d.name} ${d.email} ${d.organisation} ${d.badgeCode}`.toLowerCase().includes(q.toLowerCase()))),
    [delegates, q, status, cat],
  );

  function exportCsv() {
    const header = "Name,Email,Phone,Organisation,Category,Tier,Status,Badge";
    const body = rows.map((d) => [d.name, d.email, d.phone, d.organisation, d.category, tierName(d.tierId), d.status, d.badgeCode].map((v) => `"${v}"`).join(","));
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "delegates.csv";
    a.click();
  }

  return (
    <Section
      title={`${rows.length} delegates`}
      flush
      action={
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn-secondary">Import CSV</button>
          <button className="btn-secondary">Send a message</button>
        </div>
      }
    >
      <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-line">
        <input className="input max-w-xs" placeholder="Search name, email, organisation or badge" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["All", "Pending", "Awaiting payment", "Confirmed", "Checked in", "Cancelled", "Refunded"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input max-w-[180px]" value={cat} onChange={(e) => setCat(e.target.value)}>
          {["All", "General Delegate", "Speaker", "Panelist", "Sponsor", "Exhibitor", "VIP"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th className="th">Delegate</th>
              <th className="th">Organisation</th>
              <th className="th">Category</th>
              <th className="th">Tier</th>
              <th className="th">Status</th>
              <th className="th">Day 1</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((d) => (
              <tr key={d.id} className="hover:bg-paper">
                <td className="td">
                  <Link href={`${base}/delegates/${d.id}`} className="font-medium hover:underline">
                    {d.name}
                  </Link>
                  <div className="text-[13px] text-slate">{d.email}</div>
                </td>
                <td className="td text-slate">{d.organisation}</td>
                <td className="td text-slate">{d.category}</td>
                <td className="td text-slate">{tierName(d.tierId)}</td>
                <td className="td">
                  <StatusPill status={d.status} />
                </td>
                <td className="td num text-slate">{d.checkIns.find((c) => c.day === 1)?.at ?? "–"}</td>
                <td className="td text-right whitespace-nowrap">
                  {d.status === "Pending" && (
                    <>
                      <button className="btn-quiet text-ok" onClick={() => dispatch({ type: "approveRegistration", delegateId: d.id, approve: true })}>
                        Approve
                      </button>
                      <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "approveRegistration", delegateId: d.id, approve: false })}>
                        Decline
                      </button>
                    </>
                  )}
                  {d.status === "Awaiting payment" && (
                    <button className="btn-quiet" onClick={() => dispatch({ type: "updateDelegate", delegateId: d.id, patch: { status: "Confirmed" } })}>
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-5">
            <Empty>No delegates match these filters.</Empty>
          </div>
        )}
      </div>
    </Section>
  );
}
