"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { activeBookingOf, allowance, bookingStage, boothNet, boothStatus, extraPassesBought, holdExpiresAt, holdProblems, invoiceOwed, invoicePaid, invoiceTotal, kes, lineText, memberName, passesOver, scheduleOnSigning, staffOf } from "@/lib/expo/logic";
import type { Booking, Exhibitor, Invoice } from "@/lib/expo/types";
import { fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { ExStatusPill, Field, InvoicePill, StagePill, useExpo, ScannerWork } from "../../bits";

/** EXH-3 to EXH-6, BTH-2, SAL-1 to SAL-7 for one company: the decision, its booth, its money and its people. */
export function ExhibitorRecord({ id }: { id: string }) {
  const { expo, cfg, now, can, hydrated } = useExpo();
  const e = expo.exhibitors.find((x) => x.id === id);
  if (!e || !cfg) return <Empty>{hydrated ? "No such exhibitor." : "Loading…"}</Empty>;
  if (!can("expo.manage") && !can("expo.floor") && !can("money.view")) return <Refusal title="Exhibitors are for the exhibition team"><ScannerWork /></Refusal>;
  const k = activeBookingOf(expo, e.id, cfg, now);
  const past = expo.bookings.filter((b) => b.exhibitorId === e.id && b.id !== k?.id);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/exhibition/exhibitors", label: "Exhibitors" }, { label: e.name }]}
        title={e.name}
        badge={<ExStatusPill status={e.status} />}
        kicker={`${e.ref} · ${e.sector} · ${e.country}. Applied ${fmtStamp(e.application.at)}.`}
        actions={
          <Link className="btn-secondary" href={`/exhibitor/${e.id}`}>
            Their portal
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {k ? <BookingCard k={k} e={e} /> : <NoBooking e={e} />}
          {can("money.view") && <Invoices e={e} />}
          <Staff e={e} />
          {past.length > 0 && (
            <Section title="Earlier bookings" flush>
              <ul>
                {past.map((b) => (
                  <li key={b.id} className="px-5 py-2.5 border-b border-line last:border-0 flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <span>
                      {b.boothIds.map((x) => expo.booths.find((y) => y.id === x)?.code).join(", ")}, from {fmtStamp(b.heldAt, false)}
                      {b.cancelled && <span className="block text-[12px] text-slate">Cancelled {fmtStamp(b.cancelled.at, false)}: {b.cancelled.reason}</span>}
                    </span>
                    <StagePill k={b} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <Decision e={e} />
          <Profile e={e} />
          <History e={e} />
        </div>
      </div>
    </>
  );
}

function Decision({ e }: { e: Exhibitor }) {
  const { can, dispatch } = useExpo();
  const [noteText, setNote] = useState("");
  const edit = can("expo.manage");
  return (
    <Section title="Application">
      <dl className="grid gap-1.5 text-[14px]">
        <div>
          <dt className="text-slate text-[13px]">Products and services</dt>
          <dd>{e.application.products}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate">Size wanted</dt>
          <dd>{e.application.size}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate">Booth asked for</dt>
          <dd>{e.application.boothPref ?? "Any"}</dd>
        </div>
        {e.application.avoid && (
          <div>
            <dt className="text-slate text-[13px]">Not next to</dt>
            <dd>{e.application.avoid}</dd>
          </div>
        )}
      </dl>
      {e.decisionNote && <p className="mt-3 rounded-md bg-paper px-3 py-2 text-[13px]">{e.decisionNote}</p>}
      {edit && e.status !== "Approved" && (
        <div className="mt-4 border-t border-line pt-3 grid gap-2">
          {e.status === "Applied" && (
            <button className="btn-secondary btn-sm justify-self-start" onClick={() => dispatch({ type: "expo/review", exhibitorId: e.id })}>
              Start the review
            </button>
          )}
          <input className="input h-9 text-[13px]" placeholder="Reason, needed to waitlist or decline" value={noteText} onChange={(x) => setNote(x.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" onClick={() => dispatch({ type: "expo/decide", exhibitorId: e.id, decision: "Approved", note: noteText })}>
              Approve
            </button>
            {e.status !== "Waitlisted" && (
              <button className="btn-secondary btn-sm" disabled={!noteText.trim()} onClick={() => dispatch({ type: "expo/decide", exhibitorId: e.id, decision: "Waitlisted", note: noteText })}>
                Waitlist
              </button>
            )}
            {e.status !== "Declined" && (
              <button className="btn-secondary btn-sm text-bad" disabled={!noteText.trim()} onClick={() => dispatch({ type: "expo/decide", exhibitorId: e.id, decision: "Declined", note: noteText })}>
                Decline
              </button>
            )}
          </div>
          <p className="text-[12px] text-slate">Approving opens booth choice in their portal and approves the staff waiting under the company.</p>
        </div>
      )}
    </Section>
  );
}

function NoBooking({ e }: { e: Exhibitor }) {
  const { expo, cfg, now, can, dispatch } = useExpo();
  const [booth, setBooth] = useState(expo.booths.find((b) => b.code === e.application.boothPref && boothStatus(expo, b, cfg!, now) === "Available")?.id ?? "");
  const free = expo.booths.filter((b) => b.eventId === e.eventId && boothStatus(expo, b, cfg!, now) === "Available");
  const why = booth ? holdProblems(expo, cfg!, e, [booth], now) : [];
  return (
    <Section title="Booth">
      {e.status !== "Approved" ? (
        <p className="text-[14px] text-slate">A booth can be held once the company is approved.</p>
      ) : (
        <>
          <p className="text-[14px]">No booth yet. They can choose one in their portal, or you can allocate it here.</p>
          {can("expo.manage") && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Field label="Available booth">
                  <select className="input" value={booth} onChange={(x) => setBooth(x.target.value)}>
                    <option value="">Choose…</option>
                    {free.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code}, {b.w} × {b.d} m {b.category.toLowerCase()}, {kes(boothNet(cfg!, b))} + VAT
                        {b.code === e.application.boothPref ? " (asked for)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className="btn-primary" disabled={!booth || why.length > 0} onClick={() => dispatch({ type: "expo/hold", id: `bk_${expo.bookings.length + 1}_${now.replace(/\D/g, "").slice(-8)}`, exhibitorId: e.id, boothIds: [booth] })}>
                Allocate and hold
              </button>
            </div>
          )}
          {why.length > 0 && <p className="mt-2 text-[13px] text-bad">{why.join(". ")}.</p>}
        </>
      )}
    </Section>
  );
}

function BookingCard({ k, e }: { k: Booking; e: Exhibitor }) {
  const { state, expo, cfg, now, can, dispatch } = useExpo();
  const [paper, setPaper] = useState({ name: e.contact.name, title: e.contact.title });
  const [reason, setReason] = useState("");
  const stage = bookingStage(expo, k, cfg!, now);
  const booths = expo.booths.filter((b) => k.boothIds.includes(b.id));
  const over = passesOver(state, cfg!, k.exhibitorId, k.boothIds);
  return (
    <Section title={`Booth ${booths.map((b) => b.code).join(", ")}`} action={<StagePill k={k} />}>
      <ul className="text-[14px]">
        {booths.map((b) => (
          <li key={b.id} className="flex flex-wrap justify-between gap-2 py-1">
            <Link className="hover:underline" href={`/exhibition/plan?hall=${b.hallId}&booth=${b.code}`}>
              {b.code}, {expo.halls.find((h) => h.id === b.hallId)?.name}: {b.w} × {b.d} m {b.type.toLowerCase()}, {b.category.toLowerCase()}
            </Link>
            <span className="text-slate">{boothNet(cfg!, b) ? `${kes(boothNet(cfg!, b))} + VAT` : b.overrideNote}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-slate">
        {k.heldBy === "exhibitor" ? "Chosen in the portal" : `Allocated by ${memberName(state, k.heldBy)}`} on {fmtStamp(k.heldAt)}.{" "}
        {stage === "Held" ? `Held until ${fmtStamp(holdExpiresAt(k, cfg!))}.` : k.contract ? `Contract ${k.contract.version} signed by ${k.contract.name}, ${k.contract.title}, ${fmtStamp(k.contract.at)}${k.contract.paper ? " (paper copy)" : ""}.` : ""}
      </p>
      {stage === "Held" && (can("money.markPaid") || can("expo.manage")) && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[13px] font-medium">Record a signed paper contract</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="input h-9 flex-1 min-w-40 text-[13px]" aria-label="Signed by" value={paper.name} onChange={(x) => setPaper({ ...paper, name: x.target.value })} />
            <input className="input h-9 flex-1 min-w-40 text-[13px]" aria-label="Title" value={paper.title} onChange={(x) => setPaper({ ...paper, title: x.target.value })} />
            <button className="btn-secondary btn-sm" disabled={!paper.name.trim() || !paper.title.trim()} onClick={() => dispatch({ type: "expo/sign", bookingId: k.id, name: paper.name, title: paper.title, paper: true })}>
              Record it
            </button>
          </div>
          <p className="mt-1 text-[12px] text-slate">
            Signing issues the invoices: {scheduleOnSigning(cfg!, now.slice(0, 10)).full ? `one for the full fee, due at once, as the show is inside ${cfg!.fullInvoiceDays} days` : `a ${cfg!.depositPct}% deposit and the balance`}
            {over ? `, and one for ${over} extra exhibitor ${over === 1 ? "pass" : "passes"}` : ""}.
          </p>
        </div>
      )}
      {(can("money.refund") || can("expo.manage")) && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap gap-2">
            <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Reason to cancel" value={reason} onChange={(x) => setReason(x.target.value)} />
            <button className="btn-secondary btn-sm text-bad" disabled={!reason.trim()} onClick={() => dispatch({ type: "expo/cancel", bookingId: k.id, reason })}>
              Cancel the booking
            </button>
          </div>
          <p className="mt-1 text-[12px] text-slate">{cfg!.cancellation} Unpaid invoices are voided; payments stay on record. The booth goes back on sale.</p>
        </div>
      )}
    </Section>
  );
}

function Invoices({ e }: { e: Exhibitor }) {
  const { expo } = useExpo();
  const list = expo.invoices.filter((i) => i.exhibitorId === e.id);
  return (
    <Section title={`Invoices, ${list.length}`} flush>
      {list.length === 0 ? (
        <div className="px-5 pb-5">
          <Empty>None yet. Signing the contract issues them.</Empty>
        </div>
      ) : (
        <ul>
          {list.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} />
          ))}
        </ul>
      )}
    </Section>
  );
}

export function InvoiceRow({ inv, who }: { inv: Invoice; who?: ReactNode }) {
  const { expo, now, can, dispatch } = useExpo();
  const [open, setOpen] = useState<"" | "pay" | "void">("");
  const owed = invoiceOwed(expo, inv);
  const [f, setF] = useState({ method: "Bank" as "Bank" | "M-Pesa", reference: "", amount: owed, date: now.slice(0, 10) });
  const [reason, setReason] = useState("");
  const pays = expo.payments.filter((p) => p.invoiceId === inv.id);
  return (
    <li className="px-5 py-3 border-b border-line last:border-0 text-[14px]">
      {who && <div className="mb-1 text-[13px]">{who}</div>}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{inv.number}</span> · {inv.kind}
          <div className="text-[12px] text-slate">{inv.lines.map(lineText).join("; ")}</div>
        </div>
        <div className="text-right">
          <InvoicePill inv={inv} />
          <div className="num mt-1">{kes(invoiceTotal(inv))}</div>
          <div className="text-[12px] text-slate">
            Due {fmtStamp(inv.due, false)}
            {inv.state === "Issued" && invoicePaid(expo, inv) > 0 && owed > 0 ? `, ${kes(owed)} left` : ""}
          </div>
        </div>
      </div>
      {pays.map((p) => (
        <div key={p.id} className="mt-1 text-[12px] text-slate">
          {kes(p.amount)} by {p.method}, {p.reference}, {fmtStamp(p.at)}
        </div>
      ))}
      {inv.voidReason && <div className="mt-1 text-[12px] text-slate">Voided: {inv.voidReason}</div>}
      {owed > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {can("money.markPaid") && (
            <button className="btn-secondary btn-sm" onClick={() => setOpen(open === "pay" ? "" : "pay")}>
              Record a payment
            </button>
          )}
          {can("money.view") && (
            <button className="btn-quiet" onClick={() => dispatch({ type: "expo/remind", invoiceId: inv.id })}>
              Send a reminder
            </button>
          )}
          {can("money.refund") && pays.length === 0 && (
            <button className="btn-quiet text-bad" onClick={() => setOpen(open === "void" ? "" : "void")}>
              Void
            </button>
          )}
        </div>
      )}
      {open === "pay" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[110px_1fr_140px_150px_auto]">
          <select className="input h-9 text-[13px]" aria-label="Method" value={f.method} onChange={(x) => setF({ ...f, method: x.target.value as "Bank" | "M-Pesa" })}>
            <option>Bank</option>
            <option>M-Pesa</option>
          </select>
          <input className="input h-9 text-[13px]" placeholder="Reference" value={f.reference} onChange={(x) => setF({ ...f, reference: x.target.value })} />
          <input className="input h-9 text-[13px]" type="number" aria-label="Amount" value={f.amount} max={owed} onChange={(x) => setF({ ...f, amount: Number(x.target.value) })} />
          <input className="input h-9 text-[13px]" type="date" aria-label="Received on" max={now.slice(0, 10)} value={f.date} onChange={(x) => setF({ ...f, date: x.target.value })} />
          <button className="btn-primary btn-sm" disabled={!f.reference.trim() || f.amount <= 0 || f.amount > owed || f.date > now.slice(0, 10)} onClick={() => { dispatch({ type: "expo/recordPayment", invoiceId: inv.id, method: f.method, reference: f.reference, amount: f.amount, date: f.date }); setOpen(""); }}>
            Record
          </button>
          {f.amount > owed && <p className="sm:col-span-5 text-[12px] text-bad">More than the {kes(owed)} owed. Record what settles this invoice; keep the rest on the bank line.</p>}
        </div>
      )}
      {open === "void" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Why it is voided" value={reason} onChange={(x) => setReason(x.target.value)} />
          <button className="btn-secondary btn-sm text-bad" disabled={!reason.trim()} onClick={() => { dispatch({ type: "expo/void", invoiceId: inv.id, reason }); setOpen(""); }}>
            Void {inv.number}
          </button>
        </div>
      )}
    </li>
  );
}

function Staff({ e }: { e: Exhibitor }) {
  const { state, expo, cfg, now } = useExpo();
  const people = state.delegates.filter((d) => d.exhibitorId === e.id);
  const k = activeBookingOf(expo, e.id, cfg!, now);
  const cap = k ? allowance(cfg!, expo.booths.filter((b) => k.boothIds.includes(b.id))) + extraPassesBought(expo, e.id) : 0;
  const over = k ? passesOver(state, cfg!, e.id, k.boothIds) : 0;
  return (
    <Section
      title={`People, ${people.filter((d) => !d.cancelled).length}`}
      action={
        k ? (
          <span className={`text-[13px] ${over && k.contract ? "text-bad" : "text-slate"}`}>
            {staffOf(state, e.id).length} of {cap} exhibitor passes used{over ? `; ${over} extra ${over === 1 ? "pass" : "passes"} ${k.contract ? "not yet invoiced" : "invoiced on signing"}` : ""}
          </span>
        ) : undefined
      }
      flush
    >
      {people.length === 0 ? (
        <div className="px-5 pb-5">
          <Empty>Nobody registered yet. The company adds its staff in the portal once booked.</Empty>
        </div>
      ) : (
        <ul>
          {people.map((d) => (
            <li key={d.id} className="px-5 py-2.5 border-b border-line last:border-0 flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <Link className="hover:underline" href={`/organiser/events/${e.eventId}/delegates/${d.id}`}>
                {d.name}
                <span className="block text-[12px] text-slate">
                  {d.tierId === "t_exhibitor" ? "Exhibitor pass" : "Sponsor pass"} · {d.badgeCode}
                </span>
              </Link>
              <span className={`pill ${d.status === "Checked in" ? "bg-ok-50 text-ok" : d.status === "Pending" ? "bg-warn-50 text-warn" : d.status === "Cancelled" ? "bg-paper-200 text-slate" : "bg-paper-200 text-ink"}`}>{d.status}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Profile({ e }: { e: Exhibitor }) {
  const { can, dispatch } = useExpo();
  const [f, setF] = useState({ name: e.name, sector: e.sector, website: e.website ?? "", description: e.description, contact: e.contact });
  const [saved, setSaved] = useState(false);
  if (!can("expo.manage"))
    return (
      <Section title="Profile">
        <p className="text-[14px]">{e.description}</p>
        <p className="mt-2 text-[13px] text-slate">
          {e.contact.name}, {e.contact.title} · {e.contact.email} · {e.contact.phone}
        </p>
      </Section>
    );
  return (
    <Section title="Profile">
      <div className="grid gap-2">
        <Field label="Company name">
          <input className="input" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />
        </Field>
        <Field label="Sector">
          <input className="input" value={f.sector} onChange={(x) => setF({ ...f, sector: x.target.value })} />
        </Field>
        <Field label="Website">
          <input className="input" value={f.website} onChange={(x) => setF({ ...f, website: x.target.value })} />
        </Field>
        <Field label="About, shown on the exhibitor list">
          <textarea className="input min-h-20" value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} />
        </Field>
        <Field label="Contact">
          <input className="input" value={f.contact.name} onChange={(x) => setF({ ...f, contact: { ...f.contact, name: x.target.value } })} />
        </Field>
        <Field label="Contact email">
          <input className="input" type="email" value={f.contact.email} onChange={(x) => setF({ ...f, contact: { ...f.contact, email: x.target.value } })} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-secondary btn-sm" disabled={!f.name.trim()} onClick={() => { dispatch({ type: "expo/profile", exhibitorId: e.id, patch: { ...f, website: f.website || undefined } }); setSaved(true); }}>
          Save the profile
        </button>
        {saved && <span className="text-[13px] text-slate">Saved.</span>}
      </div>
    </Section>
  );
}

function History({ e }: { e: Exhibitor }) {
  const { state, expo } = useExpo();
  // newest first; entries from the same minute keep the order they happened in, reversed
  const rows = [...e.history, ...expo.bookings.filter((b) => b.exhibitorId === e.id).flatMap((b) => b.history)].reverse().sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Section title="History" flush>
      <ul className="max-h-96 overflow-auto">
        {rows.map((h, i) => (
          <li key={i} className="px-5 py-2 border-b border-line last:border-0 text-[13px]">
            <div className="text-slate">
              {fmtStamp(h.at)} · {memberName(state, h.by)}
            </div>
            <div>{h.what}</div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
