"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/ui";
import { CATEGORIES, makeOrder, money, useStore } from "@/lib/store";
import type { Category, PaymentMethod } from "@/lib/types";

const steps = ["Ticket", "Your details", "Payment", "Done"];

export function Register({ slug }: { slug: string }) {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const search = useSearchParams();
  const event = state.events.find((e) => e.slug === slug)!;
  const tiers = state.tiers.filter((t) => t.eventId === event.id && t.visibility !== "hidden");
  const [step, setStep] = useState(0);
  const [tierId, setTierId] = useState(search.get("tier") ?? "");
  const [form, setForm] = useState({ name: "", email: "", phone: "+254", organisation: "", jobTitle: "", country: "Kenya", category: "General Delegate" as Category, dietary: "", promo: "" });
  const [method, setMethod] = useState<PaymentMethod>("mpesa");
  const [paying, setPaying] = useState<"idle" | "pushed" | "confirmed">("idle");
  const [newId, setNewId] = useState("");

  const tier = tiers.find((t) => t.id === tierId);
  const discount = form.promo.trim().toUpperCase() === "EARLY10" && tier ? Math.round(tier.price * 0.1) : 0;
  const total = tier ? tier.price - discount : 0;

  useEffect(() => {
    if (tier && step === 0 && search.get("tier")) setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="min-h-screen bg-paper">
      <header style={{ background: event.brand.primary }} className="text-white">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center justify-between">
          <Link href={`/e/${event.slug}`} className="font-semibold">
            ← {event.name}
          </Link>
          <span className="text-white/70 text-sm">Register</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        <ol className="flex items-center gap-2 text-[13px] font-semibold mb-6">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i <= step ? "text-ink" : "text-slate"}`}>
              <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-[11px] ${i < step ? "bg-ok text-white" : i === step ? "bg-coral text-white" : "bg-line-strong text-slate"}`}>{i < step ? "✓" : i + 1}</span>
              <span className={i === step ? "" : "hidden sm:inline"}>{s}</span>
              {i < steps.length - 1 && <span className="w-4 sm:w-6 h-px bg-line-strong" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-3">
            {tiers.map((t) => {
              const left = t.cap - t.sold;
              return (
                <button key={t.id} disabled={left <= 0} onClick={() => { setTierId(t.id); setStep(1); }} className={`w-full text-left surface p-4 hover:border-coral disabled:opacity-50 ${tierId === t.id ? "border-coral ring-2 ring-coral/20" : ""}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{t.name}</span>
                    <span className="font-semibold tabular-nums">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                  </div>
                  <p className="text-sm text-slate mt-1">{t.description}</p>
                  <p className="text-[12px] text-slate mt-1">
                    {left <= 0 ? "Sold out" : `${left} left`}
                    {t.approval === "organiser" && ", organiser approval required"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && tier && (
          <form
            className="surface p-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
          >
            <div className="flex items-center justify-between text-sm">
              <span>
                Ticket: <strong>{tier.name}</strong>
              </span>
              <button type="button" onClick={() => setStep(0)} className="text-coral font-semibold">
                Change
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Full name</label>
                <input required className="input" value={form.name} onChange={set("name")} placeholder="As it should appear on your badge" />
              </div>
              <div>
                <label className="label">Email</label>
                <input required type="email" className="input" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <label className="label">Phone (M-Pesa)</label>
                <input required className="input" value={form.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className="label">Organisation</label>
                <input required className="input" value={form.organisation} onChange={set("organisation")} />
              </div>
              <div>
                <label className="label">Job title</label>
                <input className="input" value={form.jobTitle} onChange={set("jobTitle")} />
              </div>
              <div>
                <label className="label">Country</label>
                <select className="input" value={form.country} onChange={set("country")}>
                  {["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "South Africa", "United Kingdom", "United States", "Other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">I am attending as</label>
                <select className="input" value={form.category} onChange={set("category")}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              {form.category === "Speaker" && (
                <div className="sm:col-span-2">
                  <label className="label">Short bio (speakers only)</label>
                  <input className="input" placeholder="Custom field shown for this category" />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label">Dietary or accessibility needs</label>
                <input className="input" value={form.dietary} onChange={set("dietary")} placeholder="Optional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="btn-primary">
                Continue to payment
              </button>
            </div>
          </form>
        )}

        {step === 2 && tier && (
          <div className="surface p-5 space-y-5">
            <div className="rounded-lg bg-paper p-4 text-sm space-y-1">
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
              <div className="flex justify-between font-semibold border-t border-line-strong pt-2">
                <span>Total</span>
                <span className="tabular-nums">{total === 0 ? "Free" : money(total, tier.currency)}</span>
              </div>
            </div>
            {tier.price > 0 && (
              <div className="flex gap-2">
                <input className="input" placeholder="Promo code (try EARLY10)" value={form.promo} onChange={set("promo")} />
              </div>
            )}
            {tier.approval === "organiser" ? (
              <p className="text-sm text-slate">This ticket needs organiser approval. Submit your details now; you will be asked to pay (if applicable) once approved.</p>
            ) : tier.price > 0 ? (
              <div>
                <label className="label">Pay with</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["mpesa", "M-Pesa", "STK push to your phone"],
                      ["card", "Card", "Visa / Mastercard via Paystack"],
                      ["bank", "Bank transfer", "Pro-forma invoice"],
                    ] as const
                  ).map(([m, label, sub]) => (
                    <button key={m} type="button" disabled={tier.currency === "USD" && m === "mpesa"} onClick={() => setMethod(m)} className={`rounded-lg border p-3 text-left disabled:opacity-40 ${method === m ? "border-coral ring-2 ring-coral/20" : "border-line-strong"}`}>
                      <div className="font-semibold text-sm">{label}</div>
                      <div className="text-[12px] text-slate">{sub}</div>
                    </button>
                  ))}
                </div>
                {method === "mpesa" && (
                  <div className="mt-4 rounded-lg border border-line p-4 text-sm">
                    {paying === "idle" && (
                      <p>
                        We will send an M-Pesa prompt to <strong>{form.phone}</strong>. Enter your PIN on the handset to confirm.
                      </p>
                    )}
                    {paying === "pushed" && (
                      <p className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-coral animate-pulse" /> STK push sent to {form.phone}. Waiting for your PIN…
                      </p>
                    )}
                    {paying === "confirmed" && <p className="text-ok font-semibold">Payment confirmed by Safaricom. Issuing your badge…</p>}
                  </div>
                )}
                {method === "card" && (
                  <div className="mt-4 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
                    <input className="input sm:col-span-2" placeholder="Card number (hosted by Paystack)" defaultValue="4084 0840 8408 4081" />
                    <input className="input" placeholder="MM/YY" defaultValue="12/28" />
                    <input className="input" placeholder="CVV" defaultValue="408" />
                    {paying === "pushed" && <p className="sm:col-span-2 text-sm text-slate">Authorising with your bank…</p>}
                    {paying === "confirmed" && <p className="sm:col-span-2 text-sm text-ok font-semibold">Approved. Issuing your badge…</p>}
                  </div>
                )}
                {method === "bank" && <p className="mt-4 text-sm text-slate">We will email a pro-forma invoice with bank details and a reference. Your badge is issued when the organiser marks it paid.</p>}
              </div>
            ) : null}
            <div className="flex justify-between pt-2">
              <button className="btn-ghost" onClick={() => setStep(1)} disabled={paying !== "idle"}>
                Back
              </button>
              <button className="btn-primary" onClick={pay} disabled={paying !== "idle"}>
                {tier.approval === "organiser" ? "Submit for approval" : tier.price === 0 ? "Confirm registration" : method === "bank" ? "Request invoice" : `Pay ${money(total, tier.currency)}`}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="surface p-8 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-ok-50 text-ok grid place-items-center text-2xl">✓</div>
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{tier?.approval === "organiser" ? "Submitted for approval" : method === "bank" && tier && tier.price > 0 ? "Invoice on its way" : "You're registered"}</h2>
            <p className="mt-2 text-slate">
              {tier?.approval === "organiser"
                ? "The organiser will review your request. You will get an email and SMS when it is approved."
                : method === "bank" && tier && tier.price > 0
                  ? "Check your email for the pro-forma invoice. Your badge is issued once payment is received."
                  : "Your badge, receipt and calendar invite have been sent by email and SMS."}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button className="btn-primary" onClick={() => router.push(`/badge/${newId}`)}>
                Open my badge
              </button>
              <Link href={`/e/${event.slug}`} className="btn-ghost">
                Back to event
              </Link>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[12px] text-slate inline-flex items-center gap-2 w-full justify-center">
          Powered by <Wordmark size="sm" />
        </p>
      </main>
    </div>
  );
}
