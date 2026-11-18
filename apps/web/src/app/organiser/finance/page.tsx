"use client";

import Link from "next/link";
import { PageHeader, Section, Stat, Tone } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export default function OrganiserFinance() {
  const { state } = useStore();
  const org = state.organisers[0];
  const payouts = payoutsFor(state, org.id);
  const paid = payouts.filter((p) => p.status === "Paid");
  const gross = payouts.reduce((a, p) => a + p.gross, 0);
  const commission = payouts.reduce((a, p) => a + p.commission, 0);
  const paidOut = paid.reduce((a, p) => a + p.net, 0);
  const pending = payouts.filter((p) => p.status === "Scheduled").reduce((a, p) => a + p.net, 0);
  const allOrders = payouts.flatMap((p) => p.orders);
  const byMethod = ["mpesa", "card", "bank"].map((m) => ({ m: m === "mpesa" ? "M-Pesa" : m === "card" ? "Card" : "Bank transfer", n: allOrders.filter((o) => o.method === m).length, v: allOrders.filter((o) => o.method === m).reduce((a, o) => a + o.gross, 0) }));

  return (
    <>
      <PageHeader title="Finance and payouts" kicker={`Weekly payouts to ${org.payoutAccount}. Commission ${org.commissionPct}% is deducted at the moment each delegate pays.`} actions={<button className="btn-secondary">Download statements</button>} />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Gross collected" value={money(gross)} />
        <Stat label="Commission to Algotech" value={money(commission)} />
        <Stat label="Paid out" value={money(paidOut)} tone="ok" sub={`${paid.length} payouts`} />
        <Stat label="Next payout" value={money(pending)} tone="coral" sub="Friday 6 Nov" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Payouts" flush className="lg:col-span-2">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Payout date</th>
                <th className="th-r">Orders</th>
                <th className="th-r">Gross</th>
                <th className="th-r">Commission</th>
                <th className="th-r">Net paid</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...payouts].reverse().filter((p) => p.orders.length > 0 || p.status === "Scheduled").map((p) => (
                <tr key={p.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`/organiser/finance/${p.id}`} className="font-medium hover:underline num">
                      {p.date}
                    </Link>
                  </td>
                  <td className="td-r">{p.orders.length}</td>
                  <td className="td-r">{p.gross.toLocaleString()}</td>
                  <td className="td-r text-slate">{p.commission.toLocaleString()}</td>
                  <td className="td-r font-medium">{money(p.net)}</td>
                  <td className="td">
                    <Tone tone={p.status === "Paid" ? "ok" : "warn"}>{p.status}</Tone>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-[13px] text-slate">Open a payout for the statement listing every order it settles.</p>
        </Section>
        <div className="space-y-4">
          <Section title="By payment method" flush>
            <table className="w-full">
              <tbody>
                {byMethod.map((r) => (
                  <tr key={r.m}>
                    <td className="td font-medium">{r.m}</td>
                    <td className="td-r text-slate">{r.n}</td>
                    <td className="td-r">{money(r.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Monthly invoice">
            <p className="text-sm text-slate">Algotech issues an eTIMS-compliant invoice for {money(commission)} at month end. Commission was deducted at source, so nothing is payable.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
