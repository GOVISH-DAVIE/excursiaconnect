"use client";

import { useState } from "react";
import { FloorPlan, PlanLegend } from "@/components/floor-plan";
import { useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import { activeBookingOf, allowance, area, bookingStage, boothNet, boothStatus, gross, holdExpiresAt, holdProblems, invoiceOwed, invoicePaid, invoiceStatus, invoiceTotal, kes, lineText, paidInFull, passesOver, scheduleOnSigning } from "@/lib/expo/logic";
import type { Booth, BoothStatus, Exhibitor } from "@/lib/expo/types";
import { fmtStamp } from "@/lib/time";
import { Card } from "./card";
import { OnSiteTab, PeopleTab, StandTab } from "./stand";

/*
  The exhibitor's own page (POR-1, BTH-3, SAL-1, SAL-3): where the application stands, the booth to choose
  and hold once approved, the contract to sign, the invoices to pay. It shows only this company's records.
*/

type Tab = "Status" | "Booth" | "Contract" | "Invoices" | "People" | "Stand" | "On site" | "Profile" | "Messages";

export function ExhibitorPortal({ id }: { id: string }) {
  const { state, hydrated } = useStore();
  const e = state.expo.exhibitors.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("Status");
  if (!e) return <div className="p-10 text-slate">{hydrated ? "No exhibitor here. Check the link in your email." : "Loading…"}</div>;
  const event = state.events.find((x) => x.id === e.eventId)!;
  const cfg = state.expo.configs[e.eventId];
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(event.name)).slice(0, 4).toUpperCase();
  const k = activeBookingOf(state.expo, e.id, cfg, state.expo.clock);
  const owed = state.expo.invoices.filter((i) => i.exhibitorId === e.id && invoiceOwed(state.expo, i) > 0).length;
  // the stand's people, services and logistics open once the contract is signed
  const tabs: Tab[] = ["Status", ...(e.status === "Approved" ? (["Booth"] as Tab[]) : []), ...(k ? (["Contract", "Invoices"] as Tab[]) : []), ...(k?.contract ? (["People", "Stand", "On site"] as Tab[]) : []), "Profile", "Messages"];

  return (
    <div className="min-h-screen bg-paper brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header style={{ background: accent, color: accentInk }}>
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="mark shrink-0" style={{ background: accentInk, color: accent, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {mark}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] opacity-80 truncate">{event.name}, exhibitor</div>
              <div className="font-medium truncate">{e.name}</div>
            </div>
          </div>
          <span className="pill whitespace-nowrap" style={{ background: accentInk, color: accent }}>
            {e.status}
          </span>
        </div>
        <nav className="mx-auto max-w-3xl px-3 flex gap-1 overflow-x-auto" aria-label="Sections">
          {tabs.map((t) => (
            <button key={t} onClick={(x) => { setTab(t); x.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" }); }} className={`px-3 py-2.5 text-[14px] whitespace-nowrap border-b-2 ${tab === t ? "border-current font-medium" : "border-transparent opacity-75"}`}>
              {t}
              {t === "Invoices" && owed > 0 && <span className="ml-1 opacity-70">{owed}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-6 space-y-4">
        {tab === "Status" && <Status e={e} go={setTab} />}
        {tab === "Booth" && <BoothTab e={e} go={setTab} />}
        {tab === "Contract" && <Contract e={e} go={setTab} />}
        {tab === "Invoices" && <Invoices e={e} />}
        {tab === "People" && <PeopleTab e={e} />}
        {tab === "Stand" && <StandTab e={e} toInvoices={() => setTab("Invoices")} />}
        {tab === "On site" && <OnSiteTab e={e} />}
        {tab === "Profile" && <Profile e={e} />}
        {tab === "Messages" && <Messages e={e} />}
      </main>
    </div>
  );
}

function Status({ e, go }: { e: Exhibitor; go: (t: Tab) => void }) {
  const { state } = useStore();
  const expo = state.expo;
  const cfg = expo.configs[e.eventId];
  const now = expo.clock;
  const k = activeBookingOf(expo, e.id, cfg, now);
  const stage = k && bookingStage(expo, k, cfg, now);
  const invs = expo.invoices.filter((i) => i.exhibitorId === e.id && i.state === "Issued");
  const next = invs.filter((i) => invoiceOwed(expo, i) > 0).sort((a, b) => a.due.localeCompare(b.due))[0];
  const steps: [string, boolean][] = [
    ["Applied", true],
    ["Approved", e.status === "Approved"],
    ["Booth held", !!k],
    ["Contract signed", !!k?.contract],
    ["First payment", stage === "Booked"],
    ["Paid in full", !!k?.contract && paidInFull(expo, e.id)],
  ];
  return (
    <>
      <Card>
        <div className="text-[13px] text-slate">Reference {e.ref}</div>
        <div className="mt-1 text-[22px] font-medium tracking-[-0.02em]">{stage ? `${stage === "Booked" ? "Booked" : stage === "Reserved" ? "Reserved, payment due" : "Booth held"}: ${k!.boothIds.map((id) => expo.booths.find((b) => b.id === id)?.code).join(", ")}` : e.status}</div>
        <ol className="dr-track mt-4 grid gap-2" style={{ "--n": steps.length } as React.CSSProperties}>
          {steps.map(([label, done]) => (
            <li key={label} className="flex items-center gap-2 text-[13px] sm:block sm:text-[12px]">
              <span className={`block h-1.5 w-6 shrink-0 rounded-full sm:w-auto ${done ? "bg-ok" : "bg-paper-200"}`} />
              <span className={`block sm:mt-1.5 ${done ? "text-ink" : "text-slate"}`}>{label}</span>
            </li>
          ))}
        </ol>
      </Card>
      {(e.status === "Applied" || e.status === "Under review") && <Card title="Your application is with the team">The exhibition team reviews applications within two working days. You will hear by email and SMS.</Card>}
      {(e.status === "Waitlisted" || e.status === "Declined") && <Card title={e.status === "Waitlisted" ? "You are on the waitlist" : "Not this time"}>{e.decisionNote}</Card>}
      {e.status === "Approved" && !k && (
        <Card title="Choose your booth">
          <p className="text-[14px]">You are approved. Pick an available booth on the plan; it is held for you for {cfg.holdHours} hours while you sign the contract.</p>
          <button className="btn-primary mt-3" onClick={() => go("Booth")}>
            Choose a booth
          </button>
        </Card>
      )}
      {stage === "Held" && (
        <Card title="Sign the contract">
          <p className="text-[14px]">Your booth is held until {fmtStamp(holdExpiresAt(k!, cfg))}. Sign before then or it goes back on sale.</p>
          <button className="btn-primary mt-3" onClick={() => go("Contract")}>
            Read and sign
          </button>
        </Card>
      )}
      {next && (
        <Card title={invoiceStatus(expo, next, now) === "Overdue" ? "A payment is overdue" : "Next payment"}>
          <p className="text-[14px]">
            {next.number}, {next.kind.toLowerCase()}: {kes(invoiceOwed(expo, next))} {invoiceStatus(expo, next, now) === "Overdue" ? "was due" : "due"} {fmtStamp(next.due, false)}.
            {!paidInFull(expo, e.id) && " Your staff can collect their passes once the stand is paid in full."}
          </p>
          <button className="btn-primary mt-3" onClick={() => go("Invoices")}>
            Pay now
          </button>
        </Card>
      )}
    </>
  );
}

function BoothTab({ e, go }: { e: Exhibitor; go: (t: Tab) => void }) {
  const { state, dispatch } = useStore();
  const expo = state.expo;
  const cfg = expo.configs[e.eventId];
  const now = expo.clock;
  const k = activeBookingOf(expo, e.id, cfg, now);
  const halls = expo.halls.filter((h) => h.eventId === e.eventId);
  const mineHall = k && expo.booths.find((b) => b.id === k.boothIds[0])?.hallId;
  const pref = expo.booths.find((b) => b.code === e.application.boothPref);
  const [hallId, setHallId] = useState(mineHall ?? e.application.hallId ?? pref?.hallId ?? halls[0].id);
  const [pick, setPick] = useState<string | null>(pref && boothStatus(expo, pref, cfg, now) === "Available" ? pref.id : null);
  const hall = halls.find((h) => h.id === hallId)!;
  // to an exhibitor a booth is free or taken; their own shows ringed
  const statusOf = (b: Booth): BoothStatus => {
    const s = boothStatus(expo, b, cfg, now);
    return s === "Held" || s === "Reserved" ? "Booked" : s;
  };
  const chosen = expo.booths.find((b) => b.id === pick);
  const why = chosen ? holdProblems(expo, cfg, e, [chosen.id], now) : [];
  return (
    <Card title={k ? "Your booth" : "Choose your booth"}>
      <div className="mb-3 flex flex-wrap gap-2">
        {halls.map((h) => (
          <button key={h.id} className={h.id === hall.id ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setHallId(h.id)}>
            {h.name}
          </button>
        ))}
      </div>
      <FloorPlan
        hall={hall}
        booths={expo.booths.filter((b) => b.hallId === hall.id)}
        statusOf={statusOf}
        ring={k?.boothIds ?? []}
        selected={k ? null : pick}
        onSelect={k ? undefined : (id) => setPick(id)}
        tip={(b) => (statusOf(b) === "Available" ? [`${b.code}, free`, `${b.w} × ${b.d} m, ${b.category.toLowerCase()}`, `${kes(boothNet(cfg, b))} + VAT`] : [`${b.code}, ${k?.boothIds.includes(b.id) ? "yours" : statusOf(b) === "Blocked" ? "not for sale" : "taken"}`])}
      />
      <div className="mt-3">
        <PlanLegend statuses={["Available", "Booked", "Blocked"]} extra={k ? [{ label: "Yours", fill: "#ffffff", stroke: "#ff664c" }] : undefined} />
      </div>
      {k ? (
        <p className="mt-3 text-[14px]">
          {k.boothIds.map((id) => expo.booths.find((b) => b.id === id)?.code).join(", ")} in {expo.halls.find((h) => h.id === mineHall)?.name}. To change booth, ask the exhibition team.
        </p>
      ) : chosen ? (
        <div className="mt-4 border-t border-line pt-3">
          <div className="font-medium">
            {chosen.code}, {chosen.w} × {chosen.d} m {chosen.type.toLowerCase()}, {chosen.category.toLowerCase()}
          </div>
          <div className="text-[14px] text-slate">
            {area(chosen)} m², {kes(boothNet(cfg, chosen))} + VAT, {kes(gross(boothNet(cfg, chosen), cfg.vatPct))} in all
          </div>
          {why.length > 0 && <p className="mt-2 text-[13px] text-bad">{why.join(". ")}.</p>}
          <button
            className="btn-primary mt-3"
            disabled={why.length > 0}
            onClick={() => {
              dispatch({ type: "expo/hold", id: `bk_${expo.bookings.length + 1}_${now.replace(/\D/g, "").slice(-8)}`, exhibitorId: e.id, boothIds: [chosen.id], as: "exhibitor" });
              go("Contract");
            }}
          >
            Hold {chosen.code} for {cfg.holdHours} hours
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[14px] text-slate">Tap a free booth to see its size and price.</p>
      )}
    </Card>
  );
}

function Contract({ e, go }: { e: Exhibitor; go: (t: Tab) => void }) {
  const { state, dispatch } = useStore();
  const expo = state.expo;
  const cfg = expo.configs[e.eventId];
  const now = expo.clock;
  const k = activeBookingOf(expo, e.id, cfg, now);
  const [f, setF] = useState({ name: e.contact.name, title: e.contact.title, agree: false });
  if (!k) return <Card>Hold a booth first.</Card>;
  const booths = expo.booths.filter((b) => k.boothIds.includes(b.id));
  const net = booths.reduce((n, b) => n + boothNet(cfg, b), 0);
  const plan = scheduleOnSigning(cfg, now.slice(0, 10));
  const over = passesOver(state, cfg, e.id, k.boothIds);
  if (k.contract)
    return (
      <Card title="Contract signed">
        <p className="text-[14px]">
          {k.contract.version}, signed by {k.contract.name}, {k.contract.title}, on {fmtStamp(k.contract.at)}
          {k.contract.paper ? ", recorded from a paper copy" : ""}.
        </p>
      </Card>
    );
  return (
    <Card title={`Participation contract ${cfg.contractVersion}`} aside={<span className="pill bg-warn-50 text-warn whitespace-nowrap">Held until {fmtStamp(holdExpiresAt(k, cfg))}</span>}>
      <ul className="text-[14px] space-y-1.5">
        <li>
          Booth {booths.map((b) => `${b.code} (${b.w} × ${b.d} m ${b.type.toLowerCase()})`).join(", ")} at the {state.events.find((x) => x.id === e.eventId)?.name}, 25 to 27 November 2026.
        </li>
        <li>{net ? `Stand fee ${kes(net)} + VAT at ${cfg.vatPct}%, ${kes(gross(net, cfg.vatPct))} in all.` : `No stand fee: ${booths[0].overrideNote ?? "included in your package"}.`}</li>
        {net > 0 && <li>{plan.full ? `The show is inside ${cfg.fullInvoiceDays} days, so signing now issues one invoice for the full fee, due at once.` : `A ${cfg.depositPct}% deposit due ${fmtStamp(plan.depositDue, false)} and the balance by ${fmtStamp(plan.balanceDue, false)}.`}</li>}
        <li>{cfg.cancellation}</li>
        <li>
          {allowance(cfg, booths)} exhibitor passes come with this stand; more at {kes(cfg.extraPass)} + VAT each.
          {over > 0 && ` You have registered ${over} more ${over === 1 ? "person" : "people"} than that, so ${over === 1 ? "an extra pass goes" : `${over} extra passes go`} on an invoice when you sign.`}
        </li>
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Full name</span>
          <input className="input" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />
        </label>
        <label className="block">
          <span className="label">Title</span>
          <input className="input" value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={f.agree} onChange={(x) => setF({ ...f, agree: x.target.checked })} />I sign for {e.name} and accept the contract
      </label>
      <button
        className="btn-primary mt-3"
        disabled={!f.agree || !f.name.trim() || !f.title.trim()}
        onClick={() => {
          dispatch({ type: "expo/sign", bookingId: k.id, name: f.name, title: f.title, as: "exhibitor" });
          if (net) go("Invoices");
        }}
      >
        Sign the contract
      </button>
    </Card>
  );
}

function Invoices({ e }: { e: Exhibitor }) {
  const { state, dispatch } = useStore();
  const expo = state.expo;
  const now = expo.clock;
  const organiser = state.organisers.find((o) => o.id === state.events.find((x) => x.id === e.eventId)?.organiserId);
  const [paying, setPaying] = useState<{ id: string; phone: string; sent: boolean } | null>(null);
  const list = expo.invoices.filter((i) => i.exhibitorId === e.id);
  if (!list.length) return <Card>No invoices yet. Signing the contract issues them.</Card>;
  return (
    <>
      {list.map((inv) => {
        const owed = invoiceOwed(expo, inv);
        const st = invoiceStatus(expo, inv, now);
        const mine = paying?.id === inv.id ? paying : null;
        return (
          <Card key={inv.id} title={`${inv.number}, ${inv.kind.toLowerCase()}`} aside={<span className={`pill whitespace-nowrap ${st === "Paid" ? "bg-ok-50 text-ok" : st === "Overdue" ? "bg-bad-50 text-bad" : st === "Void" ? "bg-paper-200 text-slate" : "bg-warn-50 text-warn"}`}>{st}</span>}>
            <div className="text-[14px]">{inv.lines.map(lineText).join("; ")}</div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[14px]">
              <span className="text-slate">
                {kes(invoiceTotal(inv))} with VAT · due {fmtStamp(inv.due, false)}
              </span>
              {invoicePaid(expo, inv) > 0 && <span className="text-slate">{kes(invoicePaid(expo, inv))} paid</span>}
            </div>
            {owed > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                {mine?.sent ? (
                  <p className="text-[14px]">A prompt for {kes(owed)} is on {mine.phone}. Enter your M-Pesa PIN to pay.</p>
                ) : mine ? (
                  <div className="flex flex-wrap gap-2">
                    <input className="input h-10 flex-1 min-w-44" type="tel" aria-label="M-Pesa number" value={mine.phone} onChange={(x) => setPaying({ ...mine, phone: x.target.value })} />
                    <button
                      className="btn-primary"
                      disabled={mine.phone.replace(/\D/g, "").length < 9}
                      onClick={() => {
                        setPaying({ ...mine, sent: true });
                        // the prototype stands in for the STK push and its callback
                        setTimeout(() => {
                          dispatch({ type: "expo/pay", invoiceId: inv.id, reference: `S${Date.now().toString(36).toUpperCase().slice(-9)}`, as: "exhibitor" });
                          setPaying(null);
                        }, 1800);
                      }}
                    >
                      Send the prompt
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary" onClick={() => setPaying({ id: inv.id, phone: e.contact.phone, sent: false })}>
                    Pay {kes(owed)} by M-Pesa
                  </button>
                )}
                <p className="mt-2 text-[13px] text-slate">
                  Or by bank transfer to {organiser?.name}, {organiser?.payoutAccount}, with {inv.number} as the reference.
                </p>
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function Profile({ e }: { e: Exhibitor }) {
  const { dispatch } = useStore();
  const [f, setF] = useState({ name: e.name, website: e.website ?? "", description: e.description, contact: e.contact });
  const [saved, setSaved] = useState(false);
  return (
    <Card title="Your company">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Company name</span>
          <input className="input" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />
        </label>
        <label className="block">
          <span className="label">Website</span>
          <input className="input" value={f.website} onChange={(x) => setF({ ...f, website: x.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">About, shown on the exhibitor list</span>
          <textarea className="input min-h-24" value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} />
        </label>
        <label className="block">
          <span className="label">Contact</span>
          <input className="input" value={f.contact.name} onChange={(x) => setF({ ...f, contact: { ...f.contact, name: x.target.value } })} />
        </label>
        <label className="block">
          <span className="label">Phone</span>
          <input className="input" type="tel" value={f.contact.phone} onChange={(x) => setF({ ...f, contact: { ...f.contact, phone: x.target.value } })} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={!f.name.trim()} onClick={() => { dispatch({ type: "expo/profile", exhibitorId: e.id, patch: { ...f, website: f.website || undefined }, as: "exhibitor" }); setSaved(true); }}>
          Save
        </button>
        {saved && <span className="text-[13px] text-slate">Saved.</span>}
      </div>
    </Card>
  );
}

function Messages({ e }: { e: Exhibitor }) {
  const { state } = useStore();
  const list = state.expo.outbox.filter((m) => m.to === e.id);
  return (
    <Card title="Emails and texts sent to you">
      {list.length === 0 ? (
        <p className="text-[14px] text-slate">None yet.</p>
      ) : (
        <ul>
          {list.map((m) => (
            <li key={m.id} className="py-2.5 border-b border-line last:border-0 text-[14px]">
              <div className="flex justify-between gap-3 text-[12px] text-slate">
                <span>{m.channel}</span>
                <span>{fmtStamp(m.at)}</span>
              </div>
              <div>{m.subject}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[13px] text-slate">Messages say what changed and link here; they never carry amounts or documents.</p>
    </Card>
  );
}
