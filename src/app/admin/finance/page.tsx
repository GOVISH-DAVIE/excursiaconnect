"use client";

import Link from "next/link";
import { PageHeader, Section, Stat, Tone } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export default function AdminFinance() {
  const { state } = useStore();
  const paid = state.orders.filter((o) => o.status === "paid");
  const gross = paid.reduce((a, o) => a + o.gross, 0);
  const commission = paid.reduce((a, o) => a + o.commission, 0);
  const gateway = paid.reduce((a, o) => a + o.gatewayFee, 0);
  const exceptions = [
    { ref: "RKJ7Q2M1", issue: "M-Pesa callback received with no matching order, KES 12,000", age: "2 hours" },
    { ref: "PSK_8a1f30c2", issue: "Paystack settled KES 11,820 against a ledger line of 12,000. Fee variance.", age: "1 day" },
  ];

  return (
    <>
      <PageHeader title="Commission and payouts" kicker="The ledger must match gateway settlement to the shilling before Friday's payout run." actions={<button className="btn-primary">Run Friday payouts</button>} />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Gross processed" value={money(gross)} />
        <Stat label="Commission" value={money(commission)} tone="coral" />
        <Stat label="Gateway fees, borne by Algotech" value={money(gateway)} tone="warn" />
        <Stat label="Algotech net" value={money(commission - gateway)} tone="ok" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Reconciliation exceptions, ${exceptions.length}`} flush>
          <ul>
            {exceptions.map((e) => (
              <li key={e.ref} className="px-5 py-3 border-b border-line last:border-0 flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-mono text-[13px] text-slate">{e.ref}</div>
                  <div>{e.issue}</div>
                  <div className="text-[13px] text-slate mt-0.5">Open for {e.age}</div>
                </div>
                <button className="btn-secondary">Resolve</button>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Friday payout run" flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Organiser</th>
                <th className="th-r">Net due</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.organisers.map((o) => {
                const due = payoutsFor(state, o.id).find((p) => p.status === "Scheduled")?.net ?? 0;
                return (
                  <tr key={o.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`/admin/organisers/${o.id}`} className="font-medium hover:underline">
                        {o.name}
                      </Link>
                      <div className="text-[13px] text-slate">{o.payoutAccount}</div>
                    </td>
                    <td className="td-r font-medium">{money(due)}</td>
                    <td className="td">
                      <Tone tone={o.kycStatus === "Verified" ? "warn" : "bad"}>{o.kycStatus === "Verified" ? "Scheduled" : "Held, KYC pending"}</Tone>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
