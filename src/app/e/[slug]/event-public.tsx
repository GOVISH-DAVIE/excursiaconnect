"use client";

import Link from "next/link";
import { Programme } from "@/components/programme";
import { Wordmark, fmtDate } from "@/components/ui";
import { money, useStore } from "@/lib/store";

export function EventPublic({ slug }: { slug: string }) {
  const { state } = useStore();
  const event = state.events.find((e) => e.slug === slug);
  if (!event) return <div className="p-10">Event not found.</div>;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const tiers = state.tiers.filter((t) => t.eventId === event.id && t.visibility === "public");
  const sessions = state.sessions.filter((s) => s.eventId === event.id);
  const live = event.state === "Live";
  const confirmed = state.delegates.filter((d) => d.eventId === event.id && (d.status === "Confirmed" || d.status === "Checked in")).length;
  const speakers = [...new Set(sessions.flatMap((s) => s.speakers))];

  return (
    <div className="min-h-screen bg-white">
      <header style={{ background: event.brand.primary }} className="text-white">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded bg-white/20 grid place-items-center font-extrabold text-sm">{event.brand.logoText.slice(0, 2)}</div>
            <span className="font-semibold">{organiser?.name}</span>
          </div>
          {live ? (
            <Link href={`/e/${event.slug}/register`} className="btn bg-white text-ink hover:bg-white/90">
              Register
            </Link>
          ) : (
            <span className="pill bg-white/20 text-white">Registration opens soon</span>
          )}
        </div>
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-12 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h1 className="text-[44px] md:text-[64px] font-extrabold tracking-[-0.03em] leading-[0.98] max-w-3xl">{event.name}</h1>
            <p className="mt-5 text-lg md:text-xl text-white/80 max-w-xl leading-relaxed">{event.tagline}</p>
          </div>
          <dl className="grid grid-cols-3 md:grid-cols-1 gap-4 text-sm md:text-right md:border-l md:border-white/20 md:pl-6">
            <div>
              <dt className="text-white/60">When</dt>
              <dd className="font-semibold">
                {fmtDate(event.startDate, { day: "numeric", month: "short" })} to {fmtDate(event.endDate, { day: "numeric", month: "short" })}
              </dd>
            </div>
            <div>
              <dt className="text-white/60">Where</dt>
              <dd className="font-semibold">
                {event.venue}, {event.city}
              </dd>
            </div>
            <div>
              <dt className="text-white/60">Who</dt>
              <dd className="font-semibold num">
                {confirmed} registered, {speakers.length} speakers
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">Programme</h2>
          <Programme sessions={sessions} rooms={state.rooms} days={event.days} startDate={event.startDate} />
        </div>
        <aside className="lg:sticky lg:top-6 self-start">
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">Tickets</h2>
          <div className="divide-y divide-line border-y border-line">
            {tiers.map((t) => {
              const left = t.cap - t.sold;
              return (
                <div key={t.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-bold">{t.name}</div>
                    <div className="font-extrabold num text-lg">{t.price === 0 ? "Free" : money(t.price, t.currency)}</div>
                  </div>
                  <p className="text-sm text-slate mt-1 leading-relaxed">{t.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-[13px] num ${left <= 10 ? "text-coral font-semibold" : "text-slate"}`}>{left <= 0 ? "Sold out, waitlist open" : `${left} places left`}</span>
                    {live && (
                      <Link href={`/e/${event.slug}/register?tier=${t.id}`} className="text-sm font-bold hover:underline" style={{ color: event.brand.primary }}>
                        {left <= 0 ? "Join waitlist" : "Choose"}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[13px] text-slate leading-relaxed">Pay by M-Pesa, Visa or Mastercard, or ask for a bank invoice. Your badge arrives by email and SMS the moment payment confirms.</p>
        </aside>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between text-[13px] text-slate">
          <span>{organiser?.name}</span>
          <span className="inline-flex items-center gap-2">
            Powered by <Wordmark size="sm" />
          </span>
        </div>
      </footer>
    </div>
  );
}
