"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/ui";
import { CATEGORIES, makeOrder, money, useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import type { Category, PaymentMethod } from "@/lib/types";

const steps = ["Ticket", "Your details", "Payment", "Done"];

export function Register({ slug }: { slug: string }) {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const search = useSearchParams();
  const event = state.events.find((e) => e.slug === slug)!;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const tiers = state.tiers.filter((t) => t.eventId === event.id && t.visibility !== "hidden");
  const chosen = search.get("tier") ?? "";
  const [tierId, setTierId] = useState(chosen);
  const [step, setStep] = useState(() => (chosen && tiers.some((t) => t.id === chosen) ? 1 : 0));
  const [form, setForm] = useState({ name: "", email: "", phone: "+254", organisation: "", jobTitle: "", country: "Kenya", category: "General Delegate" as Category, dietary: "", promo: "" });
  const [method, setMethod] = useState<PaymentMethod>("mpesa");
  const [paying, setPaying] = useState<"idle" | "pushed" | "confirmed">("idle");
  const [newId, setNewId] = useState("");

  const tier = tiers.find((t) => t.id === tierId);
  const discount = form.promo.trim().toUpperCase() === "EARLY10" && tier ? Math.round(tier.price * 0.1) : 0;
  const total = tier ? tier.price - discount : 0;
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  function finish() {
    if (!tier) return;
    const id = `d_${Date.now().toString(36)}`;
    const needsApproval = tier.approval === "organiser";
    const status = needsApproval ? "Pending" : tier.price === 0 || method !== "bank" ? "Confirmed" : "Awaiting payment";
    const order = tier.price > 0 && !needsApproval ? makeOrder(tier.price, tier.currency, event.commissionPct, method, id, tier.id, event.id, discount) : undefined;
    dispatch({
      type: "register",
      delegate: {
        id,
        eventId: event.id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        organisation: form.organisation,
        jobTitle: form.jobTitle,
        country: form.country,
        category: form.category,
        tierId: tier.id,
        status,
        accredited: false,
        checkIns: [],
        zoneLog: [],
        sessions: [],
        bookable: false,
        badgeCode: `EXC-${id.slice(2, 8).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`,
      },
      order,
    });
    setNewId(id);
    setStep(3);
  }

  function pay() {
    if (!tier) return;
    if (tier.price === 0 || tier.approval === "organiser" || method === "bank") return finish();
    setPaying("pushed");
    setTimeout(() => {
      setPaying("confirmed");
      setTimeout(finish, 700);
    }, 1800);
  }

  const payLabel = !tier ? "" : tier.approval === "organiser" ? "Submit for approval" : tier.price === 0 ? "Confirm registration" : method === "bank" ? "Request an invoice" : `Pay ${money(total, tier.currency)}`;

  return (
    <div className="min-h-screen bg-paper brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav nav--static">
        <div className="wrap nav__bar">
          <Link href={`/e/${event.slug}`} className="nav__logo">
            <span className="mark" style={{ background: accent, color: accentInk }} aria-hidden="true">
              {initials(organiser?.name ?? event.name)}
            </span>
            <span className="nav__name">{event.name}</span>
          </Link>
          <Link href={`/e/${event.slug}`} className="link">
            Back to the event
          </Link>
        </div>
      </header>

      <main className="wrap wrap--narrow py-10">
        <ol className="flex items-center gap-2 text-[14px] font-medium mb-8">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i <= step ? "text-ink" : "text-slate"}`}>
              <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-[13px] ${i < step ? "bg-ok text-white" : i === step ? "bg-ink text-white" : "bg-line-strong text-ink"}`}>{i < step ? "✓" : i + 1}</span>
              <span className={i === step ? "" : "hidden sm:inline"}>{s}</span>
              {i < steps.length - 1 && <span className="w-4 sm:w-6 h-px bg-line-strong" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div>
            <h1 className="h1 mb-6">Choose a ticket</h1>
            {tiers.map((t) => {
              const left = t.cap - t.sold;
              return (
                <button key={t.id} type="button" disabled={left <= 0} aria-pressed={tierId === t.id} onClick={() => { setTierId(t.id); setStep(1); }} className="choice">
                  <h3>{t.name}</h3>
                  <span className="choice__price">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                  <p>{t.description}</p>
                  <p className="tile__meta">
                    {left <= 0 ? "Sold out" : `${left} of ${t.cap} places left`}
                    {t.approval === "organiser" && ", organiser approval required"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && tier && (
          <form
            className="surface p-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <h1 className="h1">Your details</h1>
              <span className="text-[14px] text-slate">
                {tier.name},{" "}
                <button type="button" onClick={() => setStep(0)} className="link">
                  change
                </button>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" required className="input" value={form.name} onChange={set("name")} placeholder="As it should appear on your badge" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" required type="email" className="input" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <label className="label" htmlFor="phone">Phone (M-Pesa)</label>
                <input id="phone" required className="input" value={form.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className="label" htmlFor="org">Organisation</label>
                <input id="org" required className="input" value={form.organisation} onChange={set("organisation")} />
              </div>
              <div>
                <label className="label" htmlFor="job">Job title</label>
                <input id="job" className="input" value={form.jobTitle} onChange={set("jobTitle")} />
              </div>
              <div>
                <label className="label" htmlFor="country">Country</label>
                <select id="country" className="input" value={form.country} onChange={set("country")}>
                  {["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "South Africa", "United Kingdom", "United States", "Other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="category">I am attending as</label>
                <select id="category" className="input" value={form.category} onChange={set("category")}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              {form.category === "Speaker" && (
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="bio">Short bio (speakers only)</label>
                  <input id="bio" className="input" placeholder="Shown in the programme" />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label" htmlFor="dietary">Dietary or accessibility needs</label>
                <input id="dietary" className="input" value={form.dietary} onChange={set("dietary")} placeholder="Optional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="submit" className="btn btn-primary btn-cta">
                Continue to payment
              </button>
            </div>
          </form>
        )}

        {step === 2 && tier && (
          <div className="surface p-6 space-y-5">
            <h1 className="h1">Payment</h1>
            <div className="rounded-lg bg-paper-200 p-4 text-[15px] space-y-1">
              <div className="flex justify-between">
                <span>{tier.name}</span>
                <span className="tabular-nums">{tier.price === 0 ? "Free" : money(tier.price, tier.currency)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-ok">
                  <span>Promo EARLY10</span>
                  <span className="tabular-nums">− {money(discount, tier.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium border-t border-line-strong pt-2">
                <span>Total</span>
                <span className="tabular-nums">{total === 0 ? "Free" : money(total, tier.currency)}</span>
              </div>
            </div>
            {tier.price > 0 && (
              <div>
                <label className="label" htmlFor="promo">Promo code</label>
                <input id="promo" className="input" placeholder="Try EARLY10" value={form.promo} onChange={set("promo")} />
              </div>
            )}
            {tier.approval === "organiser" ? (
              <p className="text-slate">This ticket needs organiser approval. Submit your details now; you will be asked to pay, if anything is due, once approved.</p>
            ) : tier.price > 0 ? (
              <div>
                <div className="label">Pay with</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["mpesa", "M-Pesa", "Prompt to your phone"],
                      ["card", "Card", "Visa or Mastercard"],
                      ["bank", "Bank transfer", "Pro-forma invoice"],
                    ] as const
                  ).map(([m, label, sub]) => (
                    <button key={m} type="button" disabled={tier.currency === "USD" && m === "mpesa"} aria-pressed={method === m} onClick={() => setMethod(m)} className="tile tile--choice disabled:opacity-40" style={{ padding: "var(--s-4)" }}>
                      <span className="font-medium text-[15px]">{label}</span>
                      <span className="tile__meta">{sub}</span>
                    </button>
                  ))}
                </div>
                {method === "mpesa" && (
                  <div className="mt-4 rounded-lg border border-line p-4 text-[15px]">
                    {paying === "idle" && (
                      <p>
                        We will send an M-Pesa prompt to <strong className="font-medium">{form.phone}</strong>. Enter your PIN on the handset to confirm.
                      </p>
                    )}
                    {paying === "pushed" && (
                      <p className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: "var(--accent)" }} /> Prompt sent to {form.phone}. Waiting for your PIN…
                      </p>
                    )}
                    {paying === "confirmed" && <p className="text-ok font-medium">Payment confirmed by Safaricom. Issuing your badge…</p>}
                  </div>
                )}
                {method === "card" && (
                  <div className="mt-4 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
                    <input className="input sm:col-span-2" aria-label="Card number" placeholder="Card number (hosted by Paystack)" defaultValue="4084 0840 8408 4081" />
                    <input className="input" aria-label="Expiry" placeholder="MM/YY" defaultValue="12/28" />
                    <input className="input" aria-label="CVV" placeholder="CVV" defaultValue="408" />
                    {paying === "pushed" && <p className="sm:col-span-2 text-[15px] text-slate">Authorising with your bank…</p>}
                    {paying === "confirmed" && <p className="sm:col-span-2 text-[15px] text-ok font-medium">Approved. Issuing your badge…</p>}
                  </div>
                )}
                {method === "bank" && <p className="mt-4 text-[15px] text-slate">We will email a pro-forma invoice with bank details and a reference. Your badge is issued when the organiser marks it paid.</p>}
              </div>
            ) : null}
            <div className="flex justify-between pt-1">
              <button className="btn btn-secondary" onClick={() => setStep(1)} disabled={paying !== "idle"}>
                Back
              </button>
              <button className="btn btn-primary btn-cta" onClick={pay} disabled={paying !== "idle"}>
                {payLabel}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="surface p-8 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-ok-50 text-ok grid place-items-center text-2xl">✓</div>
            <h1 className="mt-4 text-[28px] font-medium tracking-[-0.02em]">{tier?.approval === "organiser" ? "Submitted for approval" : method === "bank" && tier && tier.price > 0 ? "Invoice on its way" : "You are registered"}</h1>
            <p className="mt-2 text-slate measure mx-auto">
              {tier?.approval === "organiser"
                ? "The organiser will review your request. You will get an email and SMS when it is approved."
                : method === "bank" && tier && tier.price > 0
                  ? "Check your email for the pro-forma invoice. Your badge is issued once payment is received."
                  : "Your badge, receipt and calendar invite have been sent by email and SMS."}
            </p>
            <div className="mt-6 flex justify-center gap-2 flex-wrap">
              <button className="btn btn-primary btn-cta" onClick={() => router.push(`/badge/${newId}`)}>
                Open my badge
              </button>
              <Link href={`/e/${event.slug}`} className="btn btn-secondary">
                Back to the event
              </Link>
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-[13px] text-slate inline-flex items-center gap-2 w-full justify-center">
          Powered by <Wordmark size="sm" />
        </p>
      </main>
    </div>
  );
}
