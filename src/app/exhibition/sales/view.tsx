"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section, Stat, Tabs } from "@/components/ui";
import { ageOf, bookingStage, holdExpiresAt, invoiceOwed, invoiceStatus, invoiceTotal, kes, suggestMatch, type Age, type BookingStage, type InvoiceStatus } from "@/lib/expo/logic";
import { downloadCsv, row } from "@/lib/csv";
import { fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { InvoiceRow } from "../exhibitors/[xid]/record";
import { InvoicePill, StagePill, useExpo, ScannerWork } from "../bits";

const allTabs = ["Bookings", "Invoices", "Reconciliation"] as const;
type Tab = (typeof allTabs)[number];
const STAGES: BookingStage[] = ["Held", "Reserved", "Booked", "Expired", "Cancelled"];
const INV: InvoiceStatus[] = ["Issued", "Part paid", "Overdue", "Paid", "Void"];
const AGES: Age[] = ["Not due", "1–14 days", "15+ days"];

export default function SalesView() {
  // a link to this page with other filters starts the view afresh
  const q = useSearchParams();
  return <Sales key={q.toString()} />;
}

/** SAL-1 to SAL-8: every booking and invoice, payments recorded, the bank statement reconciled. */
function Sales() {
  const { expo, cfg, now, can } = useExpo();
  const q = useSearchParams();
  const money = can("money.view");
  const tabs = allTabs.filter((t) => t === "Bookings" || money);
  const asked = allTabs.find((t) => t === q.get("tab")) ?? (q.get("status") ? "Invoices" : undefined);
  // derived on every render: the acting member (and so the tabs allowed) is only known once the saved state loads
  const [picked, setTab] = useState<Tab | null>(null);
  const tab: Tab = picked && tabs.includes(picked) ? picked : asked && tabs.includes(asked) ? asked : "Bookings";
  if (!cfg) return null;
  if (!can("expo.manage") && !money) return <Refusal title="Sales are for the exhibition team and Finance"><ScannerWork /></Refusal>;
  const invoices = expo.invoices.filter((i) => i.eventId === cfg.eventId);
  const issued = invoices.filter((i) => i.state === "Issued");
  const owed = issued.reduce((n, i) => n + invoiceOwed(expo, i), 0);
  return (
    <>
      <PageHeader title="Sales and payments" kicker="Stand fees are your own receivables: invoiced here, paid by M-Pesa or bank transfer, reconciled against your statement. No commission is taken on them." />
      {money && (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Invoiced, with VAT" value={kes(issued.reduce((n, i) => n + invoiceTotal(i), 0))} href="/exhibition/sales?tab=Invoices" />
          <Stat label="Owed" value={kes(owed)} href="/exhibition/sales?tab=Invoices&status=Issued,Part%20paid,Overdue" />
          <Stat label="Overdue" value={kes(issued.filter((i) => invoiceStatus(expo, i, now) === "Overdue").reduce((n, i) => n + invoiceOwed(expo, i), 0))} tone="bad" href="/exhibition/sales?tab=Invoices&status=Overdue" />
          <Stat label="Bank lines to reconcile" value={expo.bankLines.filter((l) => l.eventId === cfg.eventId && !l.matched).length} tone="warn" href="/exhibition/sales?tab=Reconciliation" />
        </div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "Bookings" && <Bookings />}
      {tab === "Invoices" && <InvoiceList />}
      {tab === "Reconciliation" && <Reconciliation />}
    </>
  );
}

function Bookings() {
  const { expo, cfg, now } = useExpo();
  const q = useSearchParams();
  const [stages, setStages] = useState<BookingStage[]>((q.get("stage") ?? "").split(",").filter((s): s is BookingStage => STAGES.includes(s as BookingStage)));
  const all = expo.bookings.filter((k) => k.eventId === cfg!.eventId);
  const list = all.filter((k) => !stages.length || stages.includes(bookingStage(expo, k, cfg!, now))).sort((a, b) => b.heldAt.localeCompare(a.heldAt));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const on = stages.includes(s);
          return (
            <button key={s} aria-pressed={on} className={`pill ${on ? "bg-ink text-white" : "bg-paper-200 text-slate hover:text-ink"}`} onClick={() => setStages(on ? stages.filter((x) => x !== s) : [...stages, s])}>
              {s} {all.filter((k) => bookingStage(expo, k, cfg!, now) === s).length}
            </button>
          );
        })}
      </div>
      <Section title={`${list.length} booking${list.length === 1 ? "" : "s"}`} flush>
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No booking matches.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Exhibitor</th>
                  <th className="th">Booth</th>
                  <th className="th">Stage</th>
                  <th className="th">Since</th>
                </tr>
              </thead>
              <tbody>
                {list.map((k) => {
                  const e = expo.exhibitors.find((x) => x.id === k.exhibitorId)!;
                  const st = bookingStage(expo, k, cfg!, now);
                  return (
                    <tr key={k.id} className="hover:bg-paper">
                      <td className="td">
                        <Link className="font-medium hover:underline" href={`/exhibition/exhibitors/${e.id}`}>
                          {e.name}
                        </Link>
                      </td>
                      <td className="td">{k.boothIds.map((id) => expo.booths.find((b) => b.id === id)?.code).join(", ")}</td>
                      <td className="td">
                        <StagePill k={k} />
                        {st === "Held" && <div className="mt-1 text-[12px] text-slate">until {fmtStamp(holdExpiresAt(k, cfg!))}</div>}
                      </td>
                      <td className="td text-[13px] text-slate">{fmtStamp(k.cancelled?.at ?? k.contract?.at ?? k.heldAt, false)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function InvoiceList() {
  const { expo, cfg, now } = useExpo();
  const q = useSearchParams();
  const [status, setStatus] = useState<InvoiceStatus[]>((q.get("status") ?? "").split(",").filter((s): s is InvoiceStatus => INV.includes(s as InvoiceStatus)));
  const [age, setAge] = useState<Age | "">((AGES.find((a) => a === q.get("age")) ?? "") as Age | "");
  const all = expo.invoices.filter((i) => i.eventId === cfg!.eventId);
  const list = all
    .filter((i) => !status.length || status.includes(invoiceStatus(expo, i, now)))
    .filter((i) => !age || (invoiceOwed(expo, i) > 0 && ageOf(i, now) === age))
    .sort((a, b) => a.due.localeCompare(b.due));
  const name = (id: string) => expo.exhibitors.find((e) => e.id === id)?.name ?? id;
  const csv = () =>
    downloadCsv(`stand-invoices-${now.slice(0, 10)}`, [
      row(["Invoice", "Exhibitor", "Kind", "Issued", "Due", "Total", "Owed", "Status"]),
      ...list.map((i) => row([i.number, name(i.exhibitorId), i.kind, i.issuedAt.slice(0, 10), i.due, invoiceTotal(i), invoiceOwed(expo, i), invoiceStatus(expo, i, now)])),
    ]);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {INV.map((s) => {
          const on = status.includes(s);
          return (
            <button key={s} aria-pressed={on} className={`pill ${on ? "bg-ink text-white" : "bg-paper-200 text-slate hover:text-ink"}`} onClick={() => setStatus(on ? status.filter((x) => x !== s) : [...status, s])}>
              {s} {all.filter((i) => invoiceStatus(expo, i, now) === s).length}
            </button>
          );
        })}
        <select className="input h-9 w-auto text-[13px]" aria-label="Age" value={age} onChange={(e) => setAge(e.target.value as Age | "")}>
          <option value="">Any age</option>
          {AGES.map((a) => (
            <option key={a} value={a}>
              {a === "Not due" ? "Owed, not yet due" : `Overdue ${a}`}
            </option>
          ))}
        </select>
      </div>
      <Section
        title={`${list.length} invoice${list.length === 1 ? "" : "s"}`}
        action={
          <button className="btn-secondary btn-sm" onClick={csv}>
            Download CSV
          </button>
        }
        flush
      >
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No invoice matches.</Empty>
          </div>
        ) : (
          <ul>
            {list.map((inv) => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                who={
                  <Link className="font-medium hover:underline" href={`/exhibition/exhibitors/${inv.exhibitorId}`}>
                    {name(inv.exhibitorId)}
                  </Link>
                }
              />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** SAL-5: each line on the statement matched to the invoice it pays, or left open with a note. */
function Reconciliation() {
  const { expo, cfg, can, dispatch } = useExpo();
  const lines = expo.bankLines.filter((l) => l.eventId === cfg!.eventId).sort((a, b) => Number(!!a.matched) - Number(!!b.matched) || b.date.localeCompare(a.date));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const open = expo.invoices.filter((i) => i.eventId === cfg!.eventId && invoiceOwed(expo, i) > 0);
  const name = (id: string) => expo.exhibitors.find((e) => e.id === id)?.name ?? id;
  return (
    <Section title={`Bank statement, ${lines.filter((l) => !l.matched).length} of ${lines.length} lines open`} flush>
      <ul>
        {lines.map((l) => {
          const hint = !l.matched ? suggestMatch(expo, l) : undefined;
          const choice = picked[l.id] ?? hint?.id ?? "";
          const inv = expo.invoices.find((i) => i.id === choice);
          const tooMuch = inv && l.amount > invoiceOwed(expo, inv);
          const matchedInv = l.matched && expo.invoices.find((i) => i.id === l.matched!.invoiceId);
          return (
            <li key={l.id} className="px-5 py-3 border-b border-line last:border-0 text-[14px]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium">{l.payer}</span> · <span className="text-slate">{l.reference}</span>
                  <div className="text-[12px] text-slate">{fmtStamp(l.date, false)}</div>
                </div>
                <div className="num text-right">{kes(l.amount)}</div>
              </div>
              {matchedInv ? (
                <p className="mt-1 text-[13px] text-ok">
                  Matched to {matchedInv.number}, {name(matchedInv.exhibitorId)} <InvoicePill inv={matchedInv} />
                </p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {can("money.markPaid") && (
                    <div className="flex flex-wrap gap-2">
                      <select className="input h-9 flex-1 min-w-56 text-[13px]" aria-label="Invoice" value={choice} onChange={(e) => setPicked({ ...picked, [l.id]: e.target.value })}>
                        <option value="">Match to an invoice…</option>
                        {open.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.number}, {name(i.exhibitorId)}, {kes(invoiceOwed(expo, i))} owed{i.id === hint?.id ? " (suggested)" : ""}
                          </option>
                        ))}
                      </select>
                      <button className="btn-primary btn-sm" disabled={!inv || !!tooMuch} onClick={() => dispatch({ type: "expo/match", bankLineId: l.id, invoiceId: choice })}>
                        Match
                      </button>
                    </div>
                  )}
                  {hint && !picked[l.id] && <p className="text-[12px] text-slate">Suggested from the {l.reference.toLowerCase().includes(hint.number.toLowerCase()) ? "reference" : "amount"}.</p>}
                  {tooMuch && <p className="text-[12px] text-bad">{kes(l.amount)} is more than the {kes(invoiceOwed(expo, inv!))} owed on {inv!.number}. Record what settles it on the invoice and note the rest here.</p>}
                  {l.note ? (
                    <p className="text-[13px] text-slate">Note: {l.note}</p>
                  ) : (
                    can("money.markPaid") && (
                      <div className="flex flex-wrap gap-2">
                        <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Why it stays open, for example: payer unknown, refund the overpayment" value={notes[l.id] ?? ""} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                        <button className="btn-secondary btn-sm" disabled={!(notes[l.id] ?? "").trim()} onClick={() => dispatch({ type: "expo/noteLine", bankLineId: l.id, note: notes[l.id] })}>
                          Note it
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
