"use client";

import Link from "next/link";
import { Empty, KV, PageHeader, Section, Stat, Tone } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export function PayoutStatement({ payoutId }: { payoutId: string }) {
  const { state, hydrated } = useStore();
  const org = state.organisers[0];
  const p = payoutsFor(state, org.id).find((x) => x.id === payoutId);
  if (!p) return <Empty>{hydrated ? "Payout not found." : "Loading…"}</Empty>;
  const gateway = p.orders.reduce((a, o) => a + o.gatewayFee, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/organiser/finance", label: "Finance and payouts" }, { label: `Payout ${p.date}` }]}
        title={`Payout statement, ${p.date}`}
        badge={<Tone tone={p.status === "Paid" ? "ok" : "warn"}>{p.status}</Tone>}
        kicker={`${p.orders.length} orders settled to ${org.payoutAccount}.`}
        actions={<button className="btn-secondary">Download PDF</button>}
      />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Gross" value={money(p.gross)} />
        <Stat label="Commission" value={money(p.commission)} sub={`${org.commissionPct}%`} />
        <Stat label="Gateway fees" value={money(gateway)} sub="paid by Algotech, not deducted" />
        <Stat label="Net paid to you" value={money(p.net)} tone="ok" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Transfer">
          <KV rows={[["Reference", <span key="r" className="font-mono text-[13px]">{p.id.toUpperCase().replace("PO_", "EXC-PO-00")}</span>], ["To", org.payoutAccount], ["Date", p.date], ["Status", p.status], ["Period", "Orders paid in the week before"]]} />
        </Section>
        <Section title="Orders in this payout" flush className="lg:col-span-2">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Delegate</th>
                  <th className="th">Reference</th>
                  <th className="th-r">Gross</th>
                  <th className="th-r">Commission</th>
                  <th className="th-r">Net</th>
                </tr>
              </thead>
              <tbody>
                {p.orders.map((o) => {
                  const d = state.delegates.find((x) => x.id === o.delegateId);
                  return (
                    <tr key={o.id} className="hover:bg-paper">
                      <td className="td num text-slate">{o.at}</td>
                      <td className="td">
                        <Link href={`/organiser/events/${o.eventId}/delegates/${o.delegateId}`} className="font-medium hover:underline">
                          {d?.name}
                        </Link>
                      </td>
                      <td className="td font-mono text-[13px]">{o.reference}</td>
                      <td className="td-r">{o.gross.toLocaleString()}</td>
                      <td className="td-r text-slate">{o.commission.toLocaleString()}</td>
                      <td className="td-r font-medium">{o.net.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td className="td font-medium" colSpan={3}>
                    Total
                  </td>
                  <td className="td-r font-medium">{p.gross.toLocaleString()}</td>
                  <td className="td-r font-medium">{p.commission.toLocaleString()}</td>
                  <td className="td-r font-medium">{p.net.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            {p.orders.length === 0 && (
              <div className="p-5">
                <Empty>No orders in this period yet.</Empty>
              </div>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}
