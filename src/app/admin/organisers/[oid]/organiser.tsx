"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, EventPill, KV, PageHeader, Section, Stat, Tone, fmtDate } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export function OrganiserDetail({ organiserId }: { organiserId: string }) {
  const { state, dispatch, hydrated } = useStore();
  const o = state.organisers.find((x) => x.id === organiserId);
  // Only the edited values; unset fields fall back to the organiser's stored rate card.
  const [rates, setRates] = useState<{ licenceFee?: number; commissionPct?: number }>({});
  if (!o) return <Empty>{hydrated ? "Organiser not found." : "Loading…"}</Empty>;
  const events = state.events.filter((e) => e.organiserId === o.id);
  const payouts = payoutsFor(state, o.id);
  const gross = payouts.reduce((a, p) => a + p.gross, 0);
  const commission = payouts.reduce((a, p) => a + p.commission, 0);
  const kyc = [
    ["Registered business name", o.name, true],
    ["Registration number", o.registrationNo, true],
    ["KRA PIN", o.kraPin, true],
    ["Physical address", o.id === "org_epic" ? "Westlands, Nairobi" : "Nyali, Mombasa", true],
    ["Signatory ID scan", "2 files", o.kycStatus === "Verified"],
    ["Payout account", o.payoutAccount, o.kycStatus === "Verified"],
    ["Signed platform agreement", o.kycStatus === "Verified" ? "Signed 12 Oct 2026" : "Awaiting signature", o.kycStatus === "Verified"],
  ] as const;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/admin/organisers", label: "Organisers" }, { label: o.name }]}
        title={o.name}
        badge={<Tone tone={o.kycStatus === "Verified" ? "ok" : "warn"}>KYC {o.kycStatus}</Tone>}
        kicker={`${events.length} ${events.length === 1 ? "event" : "events"}. Pays out to ${o.payoutAccount}.`}
        actions={
          o.kycStatus !== "Verified" ? (
            <button className="btn-primary" onClick={() => dispatch({ type: "verifyKyc", organiserId: o.id })}>
              Mark KYC verified
            </button>
          ) : (
            <button className="btn-secondary">Request KYC refresh</button>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Gross processed" value={money(gross)} />
        <Stat label="Commission earned" value={money(commission)} tone="coral" />
        <Stat label="Licence per event" value={money(o.licenceFee)} />
        <Stat label="Commission rate" value={`${o.commissionPct}%`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="KYC pack" flush>
          <ul>
            {kyc.map(([k, v, ok]) => (
              <li key={k} className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-line last:border-0 text-sm">
                <div>
                  <div className="font-medium">{k}</div>
                  <div className="text-[13px] text-slate">{v}</div>
                </div>
                <Tone tone={ok ? "ok" : "warn"}>{ok ? "Verified" : "Pending"}</Tone>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Rate card" action={<button className="btn-secondary btn-sm" disabled={(rates.licenceFee ?? o.licenceFee) === o.licenceFee && (rates.commissionPct ?? o.commissionPct) === o.commissionPct} onClick={() => dispatch({ type: "setRateCard", organiserId: o.id, licenceFee: rates.licenceFee ?? o.licenceFee, commissionPct: rates.commissionPct ?? o.commissionPct })}>Save rate card</button>}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Licence per event (KES)</label>
              <input type="number" className="input" value={rates.licenceFee ?? o.licenceFee} onChange={(e) => setRates({ ...rates, licenceFee: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Commission %</label>
              <input type="number" className="input" value={rates.commissionPct ?? o.commissionPct} onChange={(e) => setRates({ ...rates, commissionPct: Number(e.target.value) })} />
            </div>
          </div>
          <KV rows={[["Extra attendees", "KES 15,000 per 100 above 500"], ["Multi-day uplift", "KES 20,000 per extra day"], ["Accreditation kit", "KES 8,000 per station per day"], ["On-site staff", "KES 6,000 per person per day"], ["SMS", "KES 1,200 per 1,000"]]} />
        </Section>
        <Section title="Payouts" flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th-r">Net</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...payouts].reverse().filter((p) => p.orders.length > 0 || p.status === "Scheduled").map((p) => (
                <tr key={p.id}>
                  <td className="td num">{p.date}</td>
                  <td className="td-r">{money(p.net)}</td>
                  <td className="td">
                    <Tone tone={p.status === "Paid" ? "ok" : o.kycStatus === "Verified" ? "warn" : "bad"}>{p.status === "Scheduled" && o.kycStatus !== "Verified" ? "Held, KYC" : p.status}</Tone>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Events" flush className="lg:col-span-3">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Event</th>
                <th className="th">Dates</th>
                <th className="th">Status</th>
                <th className="th-r">Commission</th>
                <th className="th-r">Licence</th>
                <th className="th-r">Staff</th>
                <th className="th-r">Gross</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href="/admin" className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="td text-slate whitespace-nowrap">{fmtDate(e.startDate)}</td>
                  <td className="td">
                    <EventPill state={e.state} />
                  </td>
                  <td className="td-r">{e.commissionPct}%</td>
                  <td className="td-r">{money(e.licenceFee)}</td>
                  <td className="td-r">
                    {e.staffCount} x {e.days}d
                  </td>
                  <td className="td-r">{money(state.orders.filter((x) => x.eventId === e.id && x.status === "paid").reduce((a, x) => a + x.gross, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
