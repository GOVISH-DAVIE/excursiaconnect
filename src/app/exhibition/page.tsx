"use client";

import Link from "next/link";
import { PageHeader, Section, Stat } from "@/components/ui";
import { activeBookingOf, area, bookingStage, boothStatus, holdExpiresAt, invoiceOwed, invoiceStatus, invoiceTotal, kes } from "@/lib/expo/logic";
import type { BoothStatus } from "@/lib/expo/types";
import { addMinutes, fmtStamp } from "@/lib/time";
import { ChartCard, HBars } from "@/app/dealroom/reports/charts";
import { Refusal } from "@/app/dealroom/bits";
import { deliveryStatus, issueStatus } from "@/lib/expo/onsite";
import { showDayOf, staffedOn } from "@/lib/expo/ops";
import { ScannerWork, useExpo, useStands } from "./bits";

/** The exhibition at a glance: what is sold, what is owed, what needs someone today. Every number opens its records. */
export default function ExhibitionOverview() {
  const { state, expo, cfg, now, can, event } = useExpo();
  const stands = useStands();
  if (!cfg) return null;
  // the desk and the doors are worked from the scanner; every number here opens records they cannot see
  if (!can("expo.manage") && !can("expo.floor") && !can("money.view"))
    return (
      <>
        <PageHeader title="Exhibition" kicker={`${event.name}, ${event.venue}.`} />
        <Refusal title="The exhibition is run by the exhibition team and Finance">
          <ScannerWork />
        </Refusal>
      </>
    );
  const booths = expo.booths.filter((b) => b.eventId === cfg.eventId);
  const st = (s: BoothStatus) => booths.filter((b) => boothStatus(expo, b, cfg, now) === s);
  const forSale = booths.filter((b) => !b.blocked);
  const soldM2 = st("Booked").reduce((n, b) => n + area(b), 0) + st("Reserved").reduce((n, b) => n + area(b), 0);
  const allM2 = forSale.reduce((n, b) => n + area(b), 0);
  const exhibitors = expo.exhibitors.filter((e) => e.eventId === cfg.eventId);
  const invoices = expo.invoices.filter((i) => i.eventId === cfg.eventId && i.state === "Issued");
  const invoiced = invoices.reduce((n, i) => n + invoiceTotal(i), 0);
  const owed = invoices.reduce((n, i) => n + invoiceOwed(expo, i), 0);
  const overdue = invoices.filter((i) => invoiceStatus(expo, i, now) === "Overdue");
  const money = can("money.view");

  // on a show day, once the stand people's doors have opened, a stand nobody has checked in to needs a call
  const day = showDayOf(cfg, now);
  const floorOpen = day > 0 && now.slice(11) >= cfg.exhibitorOpen && now.slice(11) <= cfg.showDays[day - 1].close;
  const attention = [
    // deciding applications and allocating booths is the exhibition team's; Finance sees the money that follows
    ...(can("expo.manage")
      ? [
          { label: "Applications to review", n: exhibitors.filter((e) => e.status === "Applied" || e.status === "Under review").length, href: "/exhibition/exhibitors?status=Applied,Under%20review" },
          { label: "Approved with no booth yet", n: exhibitors.filter((e) => e.status === "Approved" && !activeBookingOf(expo, e.id, cfg, now)).length, href: "/exhibition/exhibitors?status=Approved&booth=none" },
        ]
      : []),
    { label: "Holds ending within 24 hours", n: expo.bookings.filter((k) => bookingStage(expo, k, cfg, now) === "Held" && holdExpiresAt(k, cfg) < addMinutes(now, 1440)).length, href: "/exhibition/sales?stage=Held" },
    { label: "Reserved, first payment not in", n: expo.bookings.filter((k) => bookingStage(expo, k, cfg, now) === "Reserved").length, href: "/exhibition/sales?stage=Reserved" },
    ...(can("expo.manage") || can("expo.floor")
      ? [
          { label: "Branding to approve", n: expo.branding.filter((b) => b.eventId === cfg.eventId && !b.decision).length, href: "/exhibition/services?tab=Branding&state=Waiting%20for%20approval" },
          { label: "Orders to deliver", n: expo.orders.filter((o) => o.eventId === cfg.eventId && o.state === "Ordered").length, href: "/exhibition/services?tab=Orders" },
          { label: "Requirements not yet seen", n: expo.requirements.filter((r) => r.eventId === cfg.eventId && !r.ack).length, href: "/exhibition/services?tab=Requirements" },
          ...(floorOpen ? [{ label: `Stands nobody has checked in to, day ${day}`, n: stands.filter((x) => !staffedOn(state, x.e.id, day).staffed).length, href: `/exhibition/operations?day=${day}` }] : []),
          { label: "Issues past their service time", n: expo.issues.filter((i) => i.eventId === cfg.eventId && issueStatus(cfg, i, now) === "Overdue").length, href: "/exhibition/operations" },
          { label: "Deliveries missed", n: expo.deliveries.filter((d) => d.eventId === cfg.eventId && deliveryStatus(cfg, d, now) === "Missed").length, href: "/exhibition/logistics?tab=Deliveries" },
        ]
      : []),
    ...(money
      ? [
          { label: "Invoices overdue", n: overdue.length, href: "/exhibition/sales?tab=Invoices&status=Overdue" },
          { label: "Bank lines to reconcile", n: expo.bankLines.filter((l) => l.eventId === cfg.eventId && !l.matched && !l.note).length, href: "/exhibition/sales?tab=Reconciliation" },
        ]
      : []),
  ].filter((a) => a.n > 0);

  return (
    <>
      <PageHeader title="Exhibition" kicker={`${event.name}, ${event.venue}, 25 to 27 November 2026. Figures as of ${fmtStamp(now)}.`} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Booths booked, of ${forSale.length} for sale`} value={st("Booked").length} sub={`${st("Reserved").length} reserved, ${st("Held").length} held`} href="/exhibition/plan?status=Booked" />
        <Stat label="Floor sold" value={`${Math.round((soldM2 / allM2) * 100)}%`} sub={`${soldM2} of ${allM2} m²`} href="/exhibition/plan" />
        <Stat label="Exhibitors approved" value={exhibitors.filter((e) => e.status === "Approved").length} sub={`${exhibitors.filter((e) => e.status === "Applied" || e.status === "Under review").length} to review`} href="/exhibition/exhibitors?status=Approved" />
        {money ? <Stat label="Owed to you" value={kes(owed)} sub={`of ${kes(invoiced)} invoiced`} tone={overdue.length ? "bad" : undefined} href="/exhibition/sales?tab=Invoices&status=Overdue" /> : <Stat label="Available booths" value={st("Available").length} href="/exhibition/plan?status=Available" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Booths by status" sub="Click a bar for those booths on the plan." table={{ href: "/exhibition/plan", label: "On the plan" }}>
          <HBars rows={(["Booked", "Reserved", "Held", "Available", "Blocked"] as BoothStatus[]).map((s) => ({ label: s === "Blocked" ? "Not for sale" : s, value: st(s).length, href: `/exhibition/plan?status=${s}` }))} />
        </ChartCard>
        {money ? (
          <ChartCard title="Stand fees" sub="Including VAT. Click a bar for the invoices." table={{ href: "/exhibition/sales?tab=Invoices", label: "As a table" }}>
            <HBars
              rows={[
                { label: "Invoiced", value: invoiced, shown: kes(invoiced), href: "/exhibition/sales?tab=Invoices" },
                { label: "Paid", value: invoiced - owed, shown: kes(invoiced - owed), href: "/exhibition/sales?tab=Invoices&status=Paid" },
                { label: "Owed, not yet due", value: owed - overdue.reduce((n, i) => n + invoiceOwed(expo, i), 0), shown: kes(owed - overdue.reduce((n, i) => n + invoiceOwed(expo, i), 0)), href: "/exhibition/sales?tab=Invoices&status=Issued" },
                { label: "Overdue", value: overdue.reduce((n, i) => n + invoiceOwed(expo, i), 0), shown: kes(overdue.reduce((n, i) => n + invoiceOwed(expo, i), 0)), href: "/exhibition/sales?tab=Invoices&status=Overdue" },
              ]}
            />
          </ChartCard>
        ) : (
          <ChartCard title="Exhibitors by status" sub="Click a bar for the list.">
            <HBars rows={(["Applied", "Under review", "Approved", "Waitlisted", "Declined"] as const).map((s) => ({ label: s, value: exhibitors.filter((e) => e.status === s).length, href: `/exhibition/exhibitors?status=${encodeURIComponent(s)}` }))} />
          </ChartCard>
        )}
        <Section title="Needs attention" flush>
          {attention.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate">Nothing waiting.</p>
          ) : (
            <ul>
              {attention.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line last:border-0 hover:bg-paper text-sm">
                    <span>{a.label}</span>
                    <span className="pill bg-warn-50 text-warn">{a.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="By hall" flush className="self-start">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Hall</th>
                <th className="th-r">Booked</th>
                <th className="th-r">Reserved or held</th>
                <th className="th-r">Available</th>
                <th className="th-r">m² sold</th>
              </tr>
            </thead>
            <tbody>
              {expo.halls
                .filter((h) => h.eventId === cfg.eventId)
                .map((h) => {
                  const mine = (s: BoothStatus[]) => booths.filter((b) => b.hallId === h.id && s.includes(boothStatus(expo, b, cfg, now)));
                  const sold = mine(["Booked", "Reserved"]).reduce((n, b) => n + area(b), 0);
                  const of = booths.filter((b) => b.hallId === h.id && !b.blocked).reduce((n, b) => n + area(b), 0);
                  return (
                    <tr key={h.id} className="hover:bg-paper">
                      <td className="td">
                        <Link className="font-medium hover:underline" href={`/exhibition/plan?hall=${h.id}`}>
                          {h.name}
                        </Link>
                        <div className="text-[12px] text-slate">
                          {h.width} × {h.depth} m
                        </div>
                      </td>
                      <td className="td-r">
                        <Link className="hover:underline" href={`/exhibition/plan?hall=${h.id}&status=Booked`}>
                          {mine(["Booked"]).length}
                        </Link>
                      </td>
                      <td className="td-r">
                        <Link className="hover:underline" href={`/exhibition/plan?hall=${h.id}&status=Reserved,Held`}>
                          {mine(["Reserved", "Held"]).length}
                        </Link>
                      </td>
                      <td className="td-r">
                        <Link className="hover:underline" href={`/exhibition/plan?hall=${h.id}&status=Available`}>
                          {mine(["Available"]).length}
                        </Link>
                      </td>
                      <td className="td-r">
                        {sold} of {of}
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
