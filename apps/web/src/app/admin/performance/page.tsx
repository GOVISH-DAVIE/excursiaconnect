"use client";

import Link from "next/link";
import { useState } from "react";
import { Bars, EventPill, PageHeader, Section, Stat, Tone, fmtDate } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";
import type { EventRecord, Organiser } from "@excursia/domain/types";

/* PA-5: one dashboard of every event by state, with KYC status, gross processed and commission
   earned, then the same figures per organiser. Every number links to the page that explains it. */

const sorts = ["Gross", "Confirmed", "Fill", "Commission"] as const;
type Sort = (typeof sorts)[number];

export default function AdminPerformance() {
  const { state } = useStore();
  const [sort, setSort] = useState<Sort>("Gross");

  const perf = (e: EventRecord) => {
    const ds = state.delegates.filter((d) => d.eventId === e.id);
    const paid = state.orders.filter((o) => o.eventId === e.id && o.status === "paid");
    const confirmed = ds.filter((d) => d.status === "Confirmed" || d.status === "Checked in").length;
    const checkedIn = ds.filter((d) => d.checkIns.length > 0).length;
    const refunded = ds.filter((d) => d.status === "Refunded").length;
    const gross = paid.reduce((a, o) => a + o.gross, 0);
    const commission = paid.reduce((a, o) => a + o.commission, 0);
    const gateway = paid.reduce((a, o) => a + o.gatewayFee, 0);
    return { event: e, organiser: state.organisers.find((o) => o.id === e.organiserId)!, confirmed, checkedIn, refunded, gross, commission, gateway, fill: e.expectedAttendance ? confirmed / e.expectedAttendance : 0, orders: paid.length };
  };
  const rows = state.events.map(perf).sort((a, b) => (sort === "Gross" ? b.gross - a.gross : sort === "Confirmed" ? b.confirmed - a.confirmed : sort === "Fill" ? b.fill - a.fill : b.commission - a.commission));

  const byOrganiser = state.organisers.map((o: Organiser) => {
    const evs = rows.filter((r) => r.event.organiserId === o.id);
    const scheduled = payoutsFor(state, o.id).find((p) => p.status === "Scheduled")?.net ?? 0;
    return {
      o,
      events: evs.length,
      live: evs.filter((r) => r.event.state === "Live").length,
      confirmed: evs.reduce((a, r) => a + r.confirmed, 0),
      gross: evs.reduce((a, r) => a + r.gross, 0),
      commission: evs.reduce((a, r) => a + r.commission, 0),
      fill: evs.length ? evs.reduce((a, r) => a + r.fill, 0) / evs.length : 0,
      scheduled,
    };
  });

  const total = rows.reduce((a, r) => ({ gross: a.gross + r.gross, commission: a.commission + r.commission, confirmed: a.confirmed + r.confirmed, gateway: a.gateway + r.gateway }), { gross: 0, commission: 0, confirmed: 0, gateway: 0 });
  const live = rows.filter((r) => r.event.state === "Live").length;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <PageHeader title="Performance" kicker="Every event on the platform, by state, with what it has sold and what Algotech has earned. Nightly reconciliation ties the ledger to the gateway." actions={<button className="btn-secondary">Export workbook</button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <Stat label="Events" value={rows.length} sub={`${live} live, ${rows.length - live} in the pipeline`} />
        <Stat label="Confirmed delegates" value={total.confirmed} sub="across every event" />
        <Stat label="Gross processed" value={money(total.gross)} sub={`${rows.reduce((a, r) => a + r.orders, 0)} paid orders`} href="/admin/finance" />
        <Stat label="Commission earned" value={money(total.commission)} sub={`${money(total.gateway)} gateway fees borne`} tone="coral" href="/admin/finance" />
        <Stat label="Algotech net" value={money(total.commission - total.gateway)} tone="ok" href="/admin/finance" />
      </div>

      <Section
        title="All events"
        flush
        className="mb-5"
        action={
          <div className="flex items-center gap-1 text-[13px]">
            <span className="text-slate mr-1">Sort by</span>
            {sorts.map((s) => (
              <button key={s} onClick={() => setSort(s)} className={`rounded-full px-2.5 h-6 font-medium ${sort === s ? "bg-ink text-white" : "text-slate hover:text-ink"}`}>
                {s}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Event</th>
                <th className="th">State</th>
                <th className="th">Registrations</th>
                <th className="th-r">Confirmed</th>
                <th className="th-r">Fill</th>
                <th className="th-r">Checked in</th>
                <th className="th-r">Gross</th>
                <th className="th-r">Commission</th>
                <th className="th-r">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.event.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href="/admin" className="font-medium hover:underline">
                      {r.event.name}
                    </Link>
                    <div className="text-[13px] text-slate">
                      <Link href={`/admin/organisers/${r.organiser.id}`} className="hover:underline">
                        {r.organiser.name}
                      </Link>
                      , {fmtDate(r.event.startDate, { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </td>
                  <td className="td">
                    <EventPill state={r.event.state} />
                  </td>
                  <td className="td w-36">{r.event.registrationsByDay.length ? <Bars values={r.event.registrationsByDay} height={28} /> : <span className="text-[13px] text-slate">Not open</span>}</td>
                  <td className="td-r">{r.confirmed || "–"}</td>
                  <td className="td-r">
                    {r.confirmed ? (
                      <span className={r.fill >= 0.6 ? "text-ok" : r.fill >= 0.3 ? "" : "text-warn"}>
                        {pct(r.fill)}
                      </span>
                    ) : (
                      "–"
                    )}
                    <div className="text-[13px] text-slate">of {r.event.expectedAttendance}</div>
                  </td>
                  <td className="td-r">{r.checkedIn || "–"}</td>
                  <td className="td-r">{r.gross ? money(r.gross) : "–"}</td>
                  <td className="td-r">{r.commission ? money(r.commission) : "–"}</td>
                  <td className="td-r text-slate">{r.event.commissionPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[13px] text-slate">Fill is confirmed delegates against the attendance the organiser expected at approval. Commission is booked at the moment each delegate pays, at the rate fixed for the event.</p>
      </Section>

      <Section title="By organiser" flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Organiser</th>
              <th className="th">KYC</th>
              <th className="th-r">Events</th>
              <th className="th-r">Confirmed</th>
              <th className="th-r">Average fill</th>
              <th className="th-r">Gross</th>
              <th className="th-r">Commission</th>
              <th className="th-r">Next payout</th>
            </tr>
          </thead>
          <tbody>
            {byOrganiser.map((r) => (
              <tr key={r.o.id} className="hover:bg-paper">
                <td className="td">
                  <Link href={`/admin/organisers/${r.o.id}`} className="font-medium hover:underline">
                    {r.o.name}
                  </Link>
                  <div className="text-[13px] text-slate">
                    {r.o.commissionPct}% commission, licence {money(r.o.licenceFee)} per event
                  </div>
                </td>
                <td className="td">
                  <Tone tone={r.o.kycStatus === "Verified" ? "ok" : "warn"}>{r.o.kycStatus}</Tone>
                </td>
                <td className="td-r">
                  {r.events}
                  {r.live ? <span className="text-[13px] text-slate"> ({r.live} live)</span> : null}
                </td>
                <td className="td-r">{r.confirmed || "–"}</td>
                <td className="td-r">{r.confirmed ? pct(r.fill) : "–"}</td>
                <td className="td-r">{r.gross ? money(r.gross) : "–"}</td>
                <td className="td-r">{r.commission ? money(r.commission) : "–"}</td>
                <td className="td-r">
                  {r.scheduled ? money(r.scheduled) : "–"}
                  {r.scheduled && r.o.kycStatus !== "Verified" ? <div className="text-[13px] text-warn">Held, KYC</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
