"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/ui";
import { CATEGORIES, makeOrder, money, useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import { useToday } from "@/lib/use-today";
import type { Category, PaymentMethod } from "@/lib/types";

const steps = ["Ticket", "Your details", "Payment", "Done"];

export function Register({ slug }: { slug: string }) {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const search = useSearchParams();
  const event = state.events.find((e) => e.slug === slug)!;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const chosen = search.get("tier") ?? "";
  // public tiers, plus a hidden or invite-only one when its link was followed
  const tiers = state.tiers.filter((t) => t.eventId === event.id && (t.visibility === "public" || t.id === chosen));
  const [tierId, setTierId] = useState(chosen);
  const [step, setStep] = useState(() => (chosen && tiers.some((t) => t.id === chosen) ? 1 : 0));
  const [form, setForm] = useState({ name: "", email: "", phone: "+254", organisation: "", jobTitle: "", country: "Kenya", category: "General Delegate" as Category, dietary: "", promo: "" });
  const [method, setMethod] = useState<PaymentMethod>("mpesa");
  const [paying, setPaying] = useState<"idle" | "pushed" | "confirmed">("idle");
  const [newId, setNewId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const today = useToday();
  const customFields = state.formFields.filter((f) => f.eventId === event.id && (f.showTo === "Everyone" || f.showTo.includes(form.category)));
  // DE-2: up to nine colleagues in the same order, each with their own ticket and badge
  const [extras, setExtras] = useState<{ name: string; email: string; tierId: string }[]>([]);

  const tier = tiers.find((t) => t.id === tierId);
  const soldOut = !!tier && tier.cap - tier.sold <= 0;
  const discount = form.promo.trim().toUpperCase() === "EARLY10" && tier ? Math.round(tier.price * 0.1) : 0;
  const extrasTotal = extras.reduce((a, x) => a + (tiers.find((t) => t.id === x.tierId)?.price ?? 0), 0);
  const total = tier ? tier.price - discount + extrasTotal : 0;
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const markText = (event.brand.logoText || initials(organiser?.name ?? event.name)).slice(0, 4).toUpperCase();

  const set =(k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  function finish() {
    if (!tier) return;
    const stamp = Date.now().toString(36);
    const needsApproval = tier.approval === "organiser";
    const statusFor = (t: typeof tier): "Waitlisted" | "Pending" | "Confirmed" | "Awaiting payment" => (t.cap - t.sold <= 0 ? "Waitlisted" : t.approval === "organiser" ? "Pending" : t.price === 0 || method !== "bank" ? "Confirmed" : "Awaiting payment");
    const people = [
      { id: `d_${stamp}`, name: form.name, email: form.email, phone: form.phone, organisation: form.organisation, jobTitle: form.jobTitle, category: form.category, tier, disc: discount },
      ...extras.filter((x) => x.name && x.email).map((x, i) => ({ id: `d_${stamp}${i + 1}`, name: x.name, email: x.email, phone: "", organisation: form.organisation, jobTitle: "", category: "General Delegate" as Category, tier: tiers.find((t) => t.id === x.tierId) ?? tier, disc: 0 })),
    ];
    // the payer first, so their badge opens on Done; colleagues each get their own badge and claim link (DE-16)
    for (const p of [...people].reverse()) {
      const status = statusFor(p.tier);
      const order = p.tier.price > 0 && status !== "Pending" && status !== "Waitlisted" ? makeOrder(p.tier.price, p.tier.currency, event.commissionPct, method, p.id, p.tier.id, event.id, p.disc) : undefined;
      dispatch({
        type: "register",
        delegate: {
          id: p.id,
          eventId: event.id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          organisation: p.organisation,
          jobTitle: p.jobTitle,
          country: form.country,
          category: p.category,
          tierId: p.tier.id,
          status,
          accredited: false,
          checkIns: [],
          zoneLog: [],
          sessions: [],
          bookable: false,
          badgeCode: `EXC-${p.id.slice(2, 8).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`,
          answers: p.id === `d_${stamp}` ? answers : undefined,
        },
        order,
      });
    }
    void needsApproval;
    setNewId(`d_${stamp}`);
    setStep(3);
  }

  function pay() {
    if (!tier) return;
    if (soldOut || tier.price === 0 || tier.approval === "organiser" || method === "bank") return finish();
    setPaying("pushed");
    setTimeout(() => {
      setPaying("confirmed");
      setTimeout(finish, 700);
    }, 1800);
  }

  const payLabel = !tier ? "" : soldOut ? "Join the waitlist" : tier.approval === "organiser" ? "Submit for approval" : total === 0 ? "Confirm registration" : method === "bank" ? "Request an invoice" : `Pay ${money(total, tier.currency)}`;

  return (
    <div className="min-h-screen bg-paper brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav nav--static">
        <div className="wrap nav__bar">
          <Link href={`/e/${event.slug}`} className="nav__logo">
            <span className="mark" style={{ background: accent, color: accentInk, fontSize: markText.length > 2 ? 10 : 13 }} aria-hidden="true">
              {markText}
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
            <h1 className="h1 mb-2">Choose a ticket</h1>
            <p className="text-muted mb-6">Pick one to go on to your details. You can add colleagues to the same order on the next step.</p>
            {tiers.map((t) => {
              const left = t.cap - t.sold;
              const closed = !!t.paused || (!!today && !!t.saleFrom && t.saleFrom > today);
              const act = closed ? "Not on sale" : left <= 0 ? "Join the waitlist" : "Choose";
              return (
                <button key={t.id} type="button" disabled={closed} aria-pressed={tierId === t.id} aria-label={`${act}: ${t.name}`} onClick={() => { setTierId(t.id); setStep(1); }} className="choice">
                  <h3>{t.name}</h3>
                  <span className="choice__price">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                  <span className="choice__act btn btn-secondary btn-sm" aria-hidden="true">{act}{!closed && <span aria-hidden="true"> →</span>}</span>
                  <p>{t.description}</p>
                  <p className="tile__meta">
                    {t.paused ? "Sales paused" : !!today && !!t.saleFrom && t.saleFrom > today ? `On sale from ${t.saleFrom}` : left <= 0 ? "Sold out, join the waitlist: places are offered in order with 24 hours to pay" : `${left} of ${t.cap} places left`}
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
              // M-Pesa settles in shillings only: a dollar ticket pays by card unless the buyer picks the bank
              if (tier.currency === "USD" && method === "mpesa") setMethod("card");
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
                <label className="label" htmlFor="phone">{tier.currency === "KES" && tier.price > 0 ? "Phone (M-Pesa)" : "Phone"}</label>
                <input id="phone" required type="tel" inputMode="tel" pattern="\+?[0-9 ]{9,15}" title="Digits only, with the country code: +254 7XX XXX XXX" className="input" value={form.phone} onChange={set("phone")} />
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
              {customFields.map((f) => (
                <div key={f.id} className={f.type === "text" ? "" : "sm:col-span-2"}>
                  <label className="label" htmlFor={f.id}>{f.label}{f.required ? "" : " (optional)"}</label>
                  {f.type === "select" ? (
                    <select id={f.id} className="input" required={f.required} value={answers[f.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}>
                      <option value="">Choose</option>
                      {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea id={f.id} className="input" rows={3} required={f.required} value={answers[f.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
                  ) : f.type === "file" ? (
                    <input id={f.id} type="file" className="input py-2.5" required={f.required} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.files?.[0]?.name ?? "" })} />
                  ) : (
                    <input id={f.id} className="input" required={f.required} value={answers[f.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
                  )}
                  {f.help && <p className="mt-1 text-[13px] text-slate">{f.help}</p>}
                </div>
              ))}
            </div>
            {!soldOut && tier.approval !== "organiser" && (
              <div className="border-t border-line pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Colleagues in the same order</div>
                    <div className="text-[13px] text-slate">Up to ten people in all. Each gets their own ticket and badge by email.</div>
                  </div>
                  {extras.length < 9 && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setExtras([...extras, { name: "", email: "", tierId: tier.id }])}>
                      Add a colleague
                    </button>
                  )}
                </div>
                {extras.map((x, i) => (
                  <div key={i} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_180px_auto] items-center">
                    <input className="input" required placeholder="Full name" aria-label="Colleague name" value={x.name} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                    <input className="input" required type="email" placeholder="Email" aria-label="Colleague email" value={x.email} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} />
                    <select className="input" aria-label="Colleague ticket" value={x.tierId} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, tierId: e.target.value } : y)))}>
                      {tiers.filter((t) => t.approval !== "organiser" && t.cap - t.sold > 0).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}, {t.price === 0 ? "free" : money(t.price, t.currency)}</option>
                      ))}
                    </select>
                    <button type="button" className="btn-quiet text-bad" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="submit" className="btn btn-primary btn-cta">
                {soldOut ? "Continue" : "Continue to payment"}
              </button>
            </div>
          </form>
        )}

        {step === 2 && tier && (
          <div className="surface p-6 space-y-5">
            <h1 className="h1">Payment</h1>
            <div className="rounded-lg bg-paper-200 p-4 text-[15px] space-y-1">
              <div className="flex justify-between">
                <span>{tier.name}{soldOut ? ", waitlist" : ""}</span>
                <span className="tabular-nums">{soldOut ? "Nothing now" : tier.price === 0 ? "Free" : money(tier.price, tier.currency)}</span>
              </div>
              {extras.filter((x) => x.name).map((x, i) => {
                const t = tiers.find((y) => y.id === x.tierId) ?? tier;
                return (
                  <div key={i} className="flex justify-between text-slate">
                    <span>{x.name}, {t.name}</span>
                    <span className="tabular-nums">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                  </div>
                );
              })}
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
            {soldOut ? (
              <p className="text-slate">{tier.name} is sold out. Join the waitlist and we offer places in order, by email and SMS, with 24 hours to pay; nothing is charged now.</p>
            ) : tier.approval === "organiser" ? (
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
                    <button key={m} type="button" disabled={tier.currency === "USD" && m === "mpesa"} aria-pressed={method === m} aria-label={`Pay with ${label}`} onClick={() => setMethod(m)} className="tile tile--choice disabled:opacity-40" style={{ padding: "var(--s-4)" }}>
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
              <button className="btn btn-primary btn-cta" onClick={pay} disabled={paying !== "idle" || (tier.currency === "USD" && method === "mpesa")}>
                {payLabel}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="surface p-8 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-ok-50 text-ok grid place-items-center text-2xl">✓</div>
            <h1 className="mt-4 text-[28px] font-medium tracking-[-0.02em]">{soldOut ? "You are on the waitlist" : tier?.approval === "organiser" ? "Submitted for approval" : method === "bank" && tier && tier.price > 0 ? "Invoice on its way" : extras.length ? `${extras.filter((x) => x.name).length + 1} of you are registered` : "You are registered"}</h1>
            <p className="mt-2 text-slate measure mx-auto">
              {soldOut
                ? "You will get an email and SMS the moment a place is released, with 24 hours to pay before it goes to the next person."
                : tier?.approval === "organiser"
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
