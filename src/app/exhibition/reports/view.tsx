"use client";

import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { ageOf, area, boothNet, boothStatus, gross, invoiceOwed, invoicePaid, invoiceTotal, kes, owedBy, type Age } from "@/lib/expo/logic";
import { showDayOf, staffedOn } from "@/lib/expo/ops";
import type { BoothCategory, BoothStatus } from "@/lib/expo/types";
import { downloadCsv, row } from "@/lib/csv";
import { fmtStamp } from "@/lib/time";
import { ChartCard, HBars, StackedColumns } from "@/app/dealroom/reports/charts";
import { Refusal } from "@/app/dealroom/bits";
import { ScannerWork, useExpo, useStands } from "../bits";

const SALE: { key: string; of: BoothStatus[] }[] = [
  { key: "Sold", of: ["Booked", "Reserved"] },
  { key: "Held", of: ["Held"] },
  { key: "Available", of: ["Available"] },
];
const CATS: BoothCategory[] = ["Standard", "Corner", "Island", "Premium location"];
const AGES: Age[] = ["Not due", "1–14 days", "15+ days"];

export default function ReportsView() {
  return <Reports />;
}

/** REP-1 to REP-5: booth sales, revenue, what is owed and how old, occupancy and attendance by show day. */
function Reports() {
  const { state, expo, cfg, now, can } = useExpo();
  const stands = useStands();
  if (!cfg) return null;
  if (!can("expo.manage") && !can("money.view")) return <Refusal title="Reports are for the exhibition team and Finance"><ScannerWork /></Refusal>;
  const money = can("money.view");
  const halls = expo.halls.filter((h) => h.eventId === cfg.eventId);
  const booths = expo.booths.filter((b) => b.eventId === cfg.eventId);
  const st = (b: (typeof booths)[number]) => boothStatus(expo, b, cfg, now);
  const sold = (b: (typeof booths)[number]) => st(b) === "Booked" || st(b) === "Reserved";
  const invoices = expo.invoices.filter((i) => i.eventId === cfg.eventId && i.state === "Issued");
  const today = showDayOf(cfg, now);
  const daysSoFar = cfg.showDays.filter((d) => `${d.date} ${cfg.exhibitorOpen}` <= now).length;

  /* REP-1 booth sales */
  const byCat = CATS.map((c) => {
    const list = booths.filter((b) => b.category === c && !b.blocked);
    return { c, n: list.length, sold: list.filter(sold).length, m2: list.filter(sold).reduce((n, b) => n + area(b), 0), all: list.reduce((n, b) => n + area(b), 0) };
  }).filter((r) => r.n);

  /* REP-4 revenue: contracted is the stand fees of signed bookings; invoiced and paid include passes and orders */
  const revenueBy = (pick: (hallId: string, cat: BoothCategory) => boolean) => {
    const ks = stands.filter((s) => s.booths.some((b) => pick(b.hallId, b.category)));
    const ids = new Set(ks.map((s) => s.k.id));
    const inv = invoices.filter((i) => i.bookingId && ids.has(i.bookingId));
    return { contracted: gross(ks.reduce((n, s) => n + s.booths.reduce((m, b) => m + boothNet(cfg, b), 0), 0), cfg.vatPct), invoiced: inv.reduce((n, i) => n + invoiceTotal(i), 0), paid: inv.reduce((n, i) => n + Math.min(invoicePaid(expo, i), invoiceTotal(i)), 0) };
  };
  const total = revenueBy(() => true);
  const revRows = [...halls.map((h) => ({ label: h.name, ...revenueBy((hid) => hid === h.id) })), ...CATS.map((c) => ({ label: c, ...revenueBy((_, cat) => cat === c) }))];

  /* REP-5 outstanding */
  const owedByAge = AGES.map((a) => ({ a, n: invoices.filter((i) => invoiceOwed(expo, i) > 0 && ageOf(i, now) === a).reduce((m, i) => m + invoiceOwed(expo, i), 0) }));
  const debtors = expo.exhibitors
    .filter((e) => e.eventId === cfg.eventId)
    .map((e) => ({ e, owed: owedBy(expo, e.id), oldest: invoices.filter((i) => i.exhibitorId === e.id && invoiceOwed(expo, i) > 0).sort((a, b) => a.due.localeCompare(b.due))[0] }))
    .filter((r) => r.owed > 0)
    .sort((a, b) => b.owed - a.owed);

  /* REP-2 occupancy and REP-3 attendance by show day */
  const days = cfg.showDays.slice(0, Math.max(daysSoFar, 1)).map((d, i) => {
    const day = i + 1;
    const rows = stands.map((s) => staffedOn(state, s.e.id, day));
    return { day, date: d.date, staffed: rows.filter((r) => r.staffed).length, empty: rows.filter((r) => !r.staffed).length, companies: rows.filter((r) => r.ins.length).length, people: rows.reduce((n, r) => n + r.ins.length, 0) };
  });

  return (
    <>
      <PageHeader title="Reports" kicker={`As of ${fmtStamp(now)}${today ? `, show day ${today}` : ""}. Every bar opens the records behind it.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Booths by hall" sub={`Booths for sale; ${booths.filter((b) => b.blocked).length} more are kept off sale. Click a segment for those booths on the plan.`} table={{ href: "/exhibition/plan", label: "On the plan" }}>
          {/* three series at most: the kit has three hues, and a fourth would repeat one */}
          <StackedColumns
            series={SALE.map((g) => ({ key: g.key, label: g.key }))}
            columns={halls.map((h) => ({ label: h.name, segments: SALE.map((g) => ({ key: g.key, value: booths.filter((b) => b.hallId === h.id && g.of.includes(st(b))).length, href: `/exhibition/plan?hall=${h.id}&status=${g.of.join(",")}` })) }))}
          />
        </ChartCard>
        <ChartCard title="Floor sold by category" sub="Booked or reserved, in m². Click a bar for the booths.">
          <HBars rows={byCat.map((r) => ({ label: r.c, value: r.m2, shown: `${r.m2} of ${r.all} m², ${r.sold} of ${r.n} booths`, href: `/exhibition/plan?status=Booked,Reserved` }))} />
        </ChartCard>
      </div>
      <Table
        title="Booth sales"
        csv={() => downloadCsv("booth-sales.csv", [row(["Category", "Booths", "Sold", "m² sold", "m² for sale"]), ...byCat.map((r) => row([r.c, r.n, r.sold, r.m2, r.all]))])}
        head={["Category", "Booths sold", "m² sold"]}
        rows={byCat.map((r) => [r.c, `${r.sold} of ${r.n}`, `${r.m2} of ${r.all}`])}
      />

      {money && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Stand revenue" sub="With VAT. Contracted is the signed stand fees; invoiced and paid add passes and orders." table={{ href: "/exhibition/sales?tab=Invoices", label: "The invoices" }}>
              <HBars
                rows={[
                  { label: "Contracted", value: total.contracted, shown: kes(total.contracted), href: "/exhibition/sales?stage=Reserved,Booked" },
                  { label: "Invoiced", value: total.invoiced, shown: kes(total.invoiced), href: "/exhibition/sales?tab=Invoices" },
                  { label: "Paid", value: total.paid, shown: kes(total.paid), href: "/exhibition/sales?tab=Invoices&status=Paid,Part%20paid" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Owed, by age" sub="How long past due. Click a bar for those invoices." table={{ href: "/exhibition/sales?tab=Invoices&status=Issued,Part%20paid,Overdue", label: "As a table" }}>
              <HBars rows={owedByAge.map((r) => ({ label: r.a, value: r.n, shown: kes(r.n), href: `/exhibition/sales?tab=Invoices&status=Issued,Part%20paid,Overdue&age=${encodeURIComponent(r.a)}` }))} />
            </ChartCard>
          </div>
          <Table
            title="Revenue by hall and category"
            csv={() => downloadCsv("stand-revenue.csv", [row(["Hall or category", "Contracted", "Invoiced", "Paid"]), ...revRows.map((r) => row([r.label, r.contracted, r.invoiced, r.paid]))])}
            head={["Hall or category", "Contracted", "Invoiced", "Paid"]}
            rows={revRows.map((r) => [r.label, kes(r.contracted), kes(r.invoiced), kes(r.paid)])}
          />
          <Table
            title={`Owed by ${debtors.length} exhibitors`}
            csv={() => downloadCsv("outstanding.csv", [row(["Exhibitor", "Owed", "Oldest invoice", "Due", "Age"]), ...debtors.map((r) => row([r.e.name, r.owed, r.oldest?.number, r.oldest?.due, r.oldest ? ageOf(r.oldest, now) : ""]))])}
            head={["Exhibitor", "Owed", "Oldest due", "Age"]}
            rows={debtors.map((r) => [
              <Link key="l" className="hover:underline" href={`/exhibition/exhibitors/${r.e.id}`}>
                {r.e.name}
              </Link>,
              kes(r.owed),
              r.oldest ? `${r.oldest.number}, ${fmtStamp(r.oldest.due, false)}` : "",
              r.oldest ? ageOf(r.oldest, now) : "",
            ])}
          />
        </>
      )}

      <div id="attendance" className="mt-6 grid gap-4 lg:grid-cols-2 scroll-mt-6">
        <ChartCard title="Stands staffed, by show day" sub="From check-ins and the floor walk. Click a day for its plan.">
          <StackedColumns
            series={[
              { key: "staffed", label: "Staffed" },
              { key: "empty", label: "Not staffed" },
            ]}
            columns={days.map((d) => ({ label: `Day ${d.day}`, segments: [{ key: "staffed", value: d.staffed, href: `/exhibition/operations?day=${d.day}` }, { key: "empty", value: d.empty, href: `/exhibition/operations?day=${d.day}` }] }))}
          />
        </ChartCard>
        <ChartCard title="Stand people checked in, by show day" sub="Staff and sponsor passes of exhibiting companies; contractors are not counted.">
          <HBars rows={days.map((d) => ({ label: `Day ${d.day}, ${fmtStamp(d.date, false)}`, value: d.people, shown: `${d.people} people, ${d.companies} companies`, href: `/exhibition/operations?day=${d.day}` }))} />
        </ChartCard>
      </div>
      <Table
        title="Occupancy and attendance"
        csv={() => downloadCsv("exhibition-attendance.csv", [row(["Day", "Date", "Stands staffed", "Stands not staffed", "Companies present", "People checked in"]), ...days.map((d) => row([d.day, d.date, d.staffed, d.empty, d.companies, d.people]))])}
        head={["Day", "Stands staffed", "Companies present", "People in"]}
        rows={days.map((d) => [`Day ${d.day}, ${fmtStamp(d.date, false)}`, `${d.staffed} of ${d.staffed + d.empty}`, d.companies, d.people])}
      />
    </>
  );
}

function Table({ title, head, rows, csv }: { title: string; head: string[]; rows: React.ReactNode[][]; csv: () => void }) {
  return (
    <Section
      title={title}
      className="mt-4"
      action={
        <button className="text-[13px] underline underline-offset-4" onClick={csv}>
          Download CSV
        </button>
      }
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-slate">
              {head.map((h, i) => (
                <th key={h} className={`py-2 font-normal ${i === 0 ? "px-5" : "px-3 text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className={`py-2 ${j === 0 ? "px-5" : "px-3 text-right whitespace-nowrap"}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
