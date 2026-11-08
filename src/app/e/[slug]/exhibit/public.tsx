"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark, fmtDate } from "@/components/ui";
import { FloorPlan, PlanLegend } from "@/components/floor-plan";
import { useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import { activeBookingOf, activeBookingOfBooth, area, boothNet, boothStatus, gross, kes, scheduleOnSigning } from "@/lib/expo/logic";
import type { Booth, BoothStatus } from "@/lib/expo/types";

/*
  EXH-1, EXH-2, BTH-1: the public exhibit page on the event site's contract. The plan shows what is free and
  what it costs; booked stands carry their company's name. Applying records a booth preference: a booth is
  held only once the company is approved, so a hold never expires while an application waits for review.
*/

export function ExhibitPublic({ slug }: { slug: string }) {
  const { state } = useStore();
  const event = state.events.find((e) => e.slug === slug);
  const cfg = event ? state.expo.configs[event.id] : undefined;
  const [hallId, setHallId] = useState<string | null>(null);
  if (!event) return <div className="p-10">No such event.</div>;
  if (!cfg) return <div className="p-10">{event.name} has no exhibition on sale.</div>;
  const expo = state.expo;
  const now = expo.clock;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(organiser?.name ?? event.name)).slice(0, 4).toUpperCase();
  const halls = expo.halls.filter((h) => h.eventId === event.id);
  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const booths = expo.booths.filter((b) => b.eventId === event.id);
  // the public sees three states: free, taken (held, reserved or booked), and not for sale
  const statusOf = (b: Booth): BoothStatus => {
    const s = boothStatus(expo, b, cfg, now);
    return s === "Held" || s === "Reserved" ? "Booked" : s;
  };
  const free = booths.filter((b) => statusOf(b) === "Available");
  const open = event.state === "Live" && now.slice(0, 10) <= cfg.showDays[cfg.showDays.length - 1].date;
  const from = Math.min(...booths.filter((b) => b.priceOverride === undefined).map((b) => boothNet(cfg, b)));
  const exhibitorOf = (b: Booth) => {
    const k = activeBookingOfBooth(expo, b.id, cfg, now);
    return k && expo.exhibitors.find((e) => e.id === k.exhibitorId);
  };
  // the companies that have signed for a stand, with their stand codes
  const booked = expo.exhibitors
    .filter((e) => e.eventId === event.id)
    .map((e) => ({ e, k: activeBookingOf(expo, e.id, cfg, now) }))
    .filter((x) => x.k?.contract)
    .sort((a, b) => a.e.name.localeCompare(b.e.name));
  const dates = `${fmtDate(event.startDate, { day: "numeric" })} to ${fmtDate(event.endDate, { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="site brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav">
        <div className="wrap nav__bar">
          <Link className="nav__logo" href={`/e/${slug}`}>
            <span className="mark" style={{ background: accent, color: accentInk, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {mark}
            </span>
            <span className="nav__name">{event.name}</span>
          </Link>
          <div className="nav__actions">
            <Link href={`/e/${slug}`} className="link hidden sm:inline">
              The summit
            </Link>
            {open && (
              <Link href="#apply" className="btn btn-primary btn-cta">
                Apply to exhibit
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="hero hero--dark" id="top" aria-labelledby="ex-h">
          <div className="hero__bg" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-text grid hero__grid">
              <div className="hero__text span-7">
                <div className="hero__kicker">
                  <span>Exhibition</span>
                  <span>{dates}</span>
                  <span>{event.venue}</span>
                </div>
                <h1 id="ex-h">Exhibit to the brand and communications teams of East Africa</h1>
                <p className="hero__lead">
                  {booths.filter((b) => !b.blocked).length} stands in {halls.length === 2 ? "two halls" : `${halls.length} halls`} at {event.venue}, beside three days of plenaries and the networking floor. Choose your space on the plan below and apply; once approved, you hold your booth and sign online.
                </p>
                <div className="btn-row">
                  {open ? (
                    <Link href="#apply" className="btn btn-primary btn-cta">
                      Apply to exhibit
                    </Link>
                  ) : (
                    <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                      Applications are closed
                    </span>
                  )}
                  <Link href="#plan" className="btn btn-secondary">
                    See the floor plan
                  </Link>
                </div>
              </div>
            </div>
            <dl className="hero__facts">
              <div>
                <dt>Stands free</dt>
                <dd>
                  {free.length} of {booths.filter((b) => !b.blocked).length}
                </dd>
              </div>
              <div>
                <dt>From</dt>
                <dd>{kes(from)} + VAT</dd>
              </div>
              <div>
                <dt>Exhibitors</dt>
                <dd>{booked.length} companies</dd>
              </div>
              <div>
                <dt>Passes</dt>
                <dd>Two per 9 m², included</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="section" id="plan" aria-labelledby="plan-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="plan-h">The floor plan</h2>
              <p>Live availability. Hover or tap a stand for its size and price; booked stands show who has them.</p>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {halls.map((h) => (
                <button key={h.id} className={h.id === hall.id ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setHallId(h.id)}>
                  {h.name}, {booths.filter((b) => b.hallId === h.id && statusOf(b) === "Available").length} free
                </button>
              ))}
            </div>
            <FloorPlan
              hall={hall}
              booths={booths.filter((b) => b.hallId === hall.id)}
              statusOf={statusOf}
              labelOf={(b) => exhibitorOf(b)?.name}
              tip={(b) =>
                statusOf(b) === "Available"
                  ? [`${b.code}, free`, `${b.w} × ${b.d} m ${b.type.toLowerCase()}, ${b.category.toLowerCase()}`, `${kes(boothNet(cfg, b))} + VAT, ${kes(gross(boothNet(cfg, b), cfg.vatPct))}`]
                  : statusOf(b) === "Blocked"
                    ? [`${b.code}, not for sale`]
                    : [`${b.code}, taken`, exhibitorOf(b)?.name ?? ""]
              }
            />
            <div className="mt-3">
              <PlanLegend statuses={["Available", "Booked", "Blocked"]} />
            </div>
          </div>
        </section>

        <section className="section" id="stands" aria-labelledby="stands-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="stands-h">What a stand includes</h2>
              <p>Prices are per square metre before VAT at {cfg.vatPct}%. Corner, island and premium positions cost more because more people walk past them.</p>
            </div>
            <div className="grid">
              <div className="span-6">
                <h3 className="t-day">Shell scheme, {kes(cfg.rates["Shell scheme"])} per m²</h3>
                <ul className="rows">
                  {["Walls on the closed sides, carpet and a fascia board with your name", "A table, two chairs and a 13 A socket", "Lighting and daily cleaning", "Two exhibitor passes per 9 m²"].map((t) => (
                    <li key={t}>
                      <span className="rows__name">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="span-6">
                <h3 className="t-day">Space only, {kes(cfg.rates["Space only"])} per m²</h3>
                <ul className="rows">
                  {["The floor space marked out, for your own stand build", "Power, water and internet ordered separately", "Build-up from 23 November, your contractor registered for a pass", "Two exhibitor passes per 9 m²"].map((t) => (
                    <li key={t}>
                      <span className="rows__name">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <ul className="rows rows--spec mt-6">
              {(["Standard", "Corner", "Island", "Premium location"] as const).map((c) => (
                <li key={c}>
                  <span className="rows__name">{c}</span>
                  <span className="rows__value">{cfg.factors[c] === 1 ? "The listed rate" : `The rate plus ${Math.round((cfg.factors[c] - 1) * 100)}%`}</span>
                </li>
              ))}
              <li>
                <span className="rows__name">Paying</span>
                <span className="rows__value">
                  {scheduleOnSigning(cfg, now.slice(0, 10)).full
                    ? `The show is inside ${cfg.fullInvoiceDays} days, so a stand booked now is paid in full when the contract is signed.`
                    : `${cfg.depositPct}% deposit within ${cfg.depositDays} days of signing, the balance by ${fmtDate(cfg.balanceDue, { day: "numeric", month: "long" })}; inside ${cfg.fullInvoiceDays} days of the show, in full at once.`}{" "}
                  M-Pesa or bank transfer.
                </span>
              </li>
              <li>
                <span className="rows__name">Cancelling</span>
                <span className="rows__value">{cfg.cancellation}</span>
              </li>
            </ul>
          </div>
        </section>

        {booked.length > 0 && (
          <section className="section" id="exhibitors" aria-labelledby="exh-h">
            <div className="wrap">
              <div className="section-head">
                <h2 id="exh-h">Exhibiting this year</h2>
              </div>
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {booked.map(({ e, k }) => (
                  <li key={e.id} className="text-[15px]">
                    <b className="font-medium">{e.name}</b>
                    <span className="block text-[13px]" style={{ color: "var(--muted)" }}>
                      {e.sector}, stand {k!.boothIds.map((id) => booths.find((b) => b.id === id)?.code).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {open && <Apply eventId={event.id} free={free} hallNames={Object.fromEntries(halls.map((h) => [h.id, h.name]))} />}
      </main>

      <footer className="footer closing" aria-label="Footer">
        <div className="wrap">
          <div className="footer__legal">
            <span>
              {event.name} exhibition, run by {organiser?.name}
            </span>
            <span className="inline-flex items-center gap-2">
              Powered by <Wordmark size="sm" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const SECTORS = ["Media", "Digital agency", "Creative agency", "PR agency", "Print and signage", "Events and AV", "Research", "Martech", "Technology", "Consumer brand", "Financial services", "Promotional products", "Other"];
const SIZES = ["3 × 3 m", "3 × 6 m", "6 × 6 m", "Larger"];

/** EXH-2: the application; the booth asked for is a preference, held only after approval. */
function Apply({ eventId, free, hallNames }: { eventId: string; free: Booth[]; hallNames: Record<string, string> }) {
  const { state, dispatch } = useStore();
  const [f, setF] = useState({ name: "", sector: "", website: "", description: "", contact: "", title: "", email: "", phone: "", products: "", size: SIZES[0], hallId: "", boothPref: "", avoid: "" });
  const [tried, setTried] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const missing = [
    !f.name.trim() && "company name",
    !f.sector && "sector",
    !f.contact.trim() && "your name",
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && "a valid email",
    f.phone.replace(/\D/g, "").length < 9 && "a phone number",
    !f.products.trim() && "what you will show",
  ].filter(Boolean) as string[];
  const sent = sentId ? state.expo.exhibitors.find((e) => e.id === sentId) : undefined;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    setTried(true);
    if (missing.length) return;
    const id = `ex_app${Date.now().toString(36)}`;
    dispatch({
      type: "expo/apply",
      exhibitor: { id, eventId, name: f.name.trim(), sector: f.sector, country: "Kenya", website: f.website.trim() || undefined, description: f.description.trim() || `${f.name.trim()}: ${f.products.trim()}`, contact: { name: f.contact.trim(), title: f.title.trim(), email: f.email.trim(), phone: f.phone.trim() }, application: { products: f.products.trim(), size: f.size, hallId: f.hallId || undefined, boothPref: f.boothPref || undefined, avoid: f.avoid.trim() || undefined, at: state.expo.clock } },
    });
    setSentId(id);
  };
  return (
    <section className="section" id="apply" aria-labelledby="apply-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="apply-h">Apply to exhibit</h2>
          <p>The exhibition team reviews every application, usually within two working days. Once approved, you choose or confirm your booth in your exhibitor portal and sign there.</p>
        </div>
        {sent ? (
          <div className="surface p-6 max-w-2xl">
            <h3 className="t-day">Application received, reference {sent.ref}</h3>
            <p className="mt-2">We have emailed and texted {sent.contact.email}. Your exhibitor portal shows where it stands and, once approved, the booths you can hold.</p>
            <Link href={`/exhibitor/${sent.id}`} className="btn btn-primary mt-4 inline-flex">
              Open my exhibitor portal
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
            <label className="block">
              <span className="label">Company name</span>
              <input className="input" value={f.name} onChange={set("name")} />
            </label>
            <label className="block">
              <span className="label">Sector</span>
              <select className="input" value={f.sector} onChange={set("sector")}>
                <option value="">Choose</option>
                {SECTORS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">What you will show</span>
              <input className="input" placeholder="Products, services, launches" value={f.products} onChange={set("products")} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">About the company (optional)</span>
              <textarea className="input min-h-20" value={f.description} onChange={set("description")} />
            </label>
            <label className="block">
              <span className="label">Website (optional)</span>
              <input className="input" type="url" value={f.website} onChange={set("website")} />
            </label>
            <span />
            <label className="block">
              <span className="label">Your name</span>
              <input className="input" value={f.contact} onChange={set("contact")} />
            </label>
            <label className="block">
              <span className="label">Your title</span>
              <input className="input" value={f.title} onChange={set("title")} />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input className="input" type="email" value={f.email} onChange={set("email")} />
            </label>
            <label className="block">
              <span className="label">Phone</span>
              <input className="input" type="tel" value={f.phone} onChange={set("phone")} />
            </label>
            <label className="block">
              <span className="label">Size wanted</span>
              <select className="input" value={f.size} onChange={set("size")}>
                {SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Hall (optional)</span>
              <select className="input" value={f.hallId} onChange={(e) => setF({ ...f, hallId: e.target.value, boothPref: "" })}>
                <option value="">Either</option>
                {Object.entries(hallNames).map(([id, n]) => (
                  <option key={id} value={id}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Booth you would like (optional)</span>
              <select className="input" value={f.boothPref} onChange={set("boothPref")}>
                <option value="">No preference</option>
                {free
                  .filter((b) => !f.hallId || b.hallId === f.hallId)
                  .map((b) => (
                    <option key={b.id} value={b.code}>
                      {b.code}, {b.w} × {b.d} m {b.category.toLowerCase()}, {area(b)} m²
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Not next to (optional)</span>
              <input className="input" placeholder="A competitor, for example" value={f.avoid} onChange={set("avoid")} />
            </label>
            <div className="sm:col-span-2">
              {tried && missing.length > 0 && <p className="mb-3 text-[14px]" style={{ color: "var(--color-bad)" }}>Still needed: {missing.join(", ")}.</p>}
              <button className="btn btn-primary btn-cta" onClick={submit}>
                Send the application
              </button>
              <p className="mt-2 text-[13px]" style={{ color: "var(--muted)" }}>
                The booth you ask for is a preference: it is held for you only once you are approved, for {state.expo.configs[eventId].holdHours} hours while you sign.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
