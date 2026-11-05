"use client";

import Link from "next/link";
import { Empty, KV, Meter, PageHeader, Section, Stat, StatusPill } from "@/components/ui";
import { money, useStore } from "@/lib/store";

export function TierDetail({ eventId, tierId }: { eventId: string; tierId: string }) {
  const { state, hydrated } = useStore();
  const t = state.tiers.find((x) => x.id === tierId);
  const event = state.events.find((e) => e.id === eventId);
  if (!t || !event) return <Empty>{hydrated ? "Tier not found." : "Loading…"}</Empty>;
  const base = `/organiser/events/${eventId}`;
  const buyers = state.delegates.filter((d) => d.tierId === t.id);
  const orders = state.orders.filter((o) => o.tierId === t.id && o.status === "paid");
  const gross = orders.reduce((a, o) => a + o.gross, 0);
  const left = t.cap - t.sold;
  const byMethod = ["mpesa", "card", "bank"].map((m) => [m === "mpesa" ? "M-Pesa" : m === "card" ? "Card" : "Bank", orders.filter((o) => o.method === m).length] as const);

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/organiser", label: "Events" }, { href: base, label: event.name }, { href: `${base}?tab=Tickets and form`, label: "Tickets" }, { label: t.name }]}
        title={t.name}
        kicker={t.description}
        actions={
          <>
            <button className="btn-ghost">Edit tier</button>
            <button className="btn-ghost">Pause sales</button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Price" value={t.price === 0 ? "Free" : money(t.price, t.currency)} sub={t.approval === "auto" ? "Auto-confirm on payment" : "Organiser approval first"} />
        <Stat label="Sold" value={t.sold} sub={`${left} of ${t.cap} left`} tone={left <= 10 ? "warn" : undefined} />
        <Stat label="Revenue" value={money(gross, t.currency)} sub={`${orders.length} paid orders`} />
        <Stat label="Pending" value={buyers.filter((d) => d.status === "Pending" || d.status === "Awaiting payment").length} sub="approval or payment" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Rules">
          <KV rows={[["Visibility", t.visibility], ["Approval", t.approval === "auto" ? "Automatic" : "Organiser"], ["Currency", t.currency], ["Refund policy", "Full until 7 days before, then none"], ["Includes", t.entitlements.map((e) => state.zones.find((z) => z.id === e)?.name ?? e.replace("-", " ")).join(", ")]]} />
          <div className="mt-4">
            <div className="flex justify-between text-[13px] text-slate mb-1">
              <span>Sold</span>
              <span className="num">
                {t.sold} / {t.cap}
              </span>
            </div>
            <Meter value={t.sold} max={t.cap} warnAt={0.85} badAt={1} />
          </div>
          <KV rows={byMethod.map(([m, n]) => [m, String(n)])} />
        </Section>
        <Section title={`Delegates on this tier, ${buyers.length}`} flush className="lg:col-span-2">
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="th">Delegate</th>
                  <th className="th">Organisation</th>
                  <th className="th">Status</th>
                  <th className="th-r">Paid</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((d) => {
                  const o = orders.find((x) => x.delegateId === d.id);
                  return (
                    <tr key={d.id} className="hover:bg-paper">
                      <td className="td">
                        <Link href={`${base}/delegates/${d.id}`} className="font-medium hover:underline">
                          {d.name}
                        </Link>
                      </td>
                      <td className="td text-slate">{d.organisation}</td>
                      <td className="td">
                        <StatusPill status={d.status} />
                      </td>
                      <td className="td-r">{o ? o.gross.toLocaleString() : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
