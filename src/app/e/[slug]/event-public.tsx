"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark, fmtDate } from "@/components/ui";
import { money, useStore } from "@/lib/store";
import { initials, numberWord, readableOn } from "@/lib/brand";
import { useToday } from "@/lib/use-today";
import { SOCIAL_KEYS, type Room, type Session, type Tier, type Zone } from "@/lib/types";

/*
  The public event site. Kind: an event people buy tickets to (flat colour, type and the hover
  layer; no effects). Dealt: hero split, nav-split, footer-columns, close-type, rhythm dark-band
  (the speakers), buttons pill, radius soft, Rethink Sans. No photographs exist for this event, so
  every section shows what the system holds: the programme, the speakers, the tiers, the zones.
  The accent is the organiser's brand colour; the label on it is chosen for contrast.
*/

const NAV = [
  ["programme", "Programme"],
  ["speakers", "Speakers"],
  ["tickets", "Tickets"],
  ["venue", "Venue"],
] as const;

function dayDate(startDate: string, day: number, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString("en-GB", opts);
}

function whereIs(s: Session, rooms: Room[]) {
  const room = rooms.find((r) => r.id === s.roomId);
  if (room) return room.name;
  if (s.kind === "plenary") return "Main hall";
  const t = s.title.toLowerCase();
  if (t.includes("lunch") || t.includes("dinner")) return "Dining";
  if (t.includes("exhibition")) return "Exhibition";
  return "Foyer";
}

function meta(s: Session, rooms: Room[]) {
  return [whereIs(s, rooms), s.speakers.join(", ")].filter(Boolean).join(" · ");
}

function includes(t: Tier, zones: Zone[], days: number): [string, string][] {
  const e = t.entitlements;
  const stream = e.includes("stream");
  const dayLine = e.includes("all-days") ? `All ${numberWord(days)} days` : e.includes("day-1") ? "Day 1 only" : stream ? `Online, all ${numberWord(days)} days` : "By invitation";
  const access = zones.filter((z) => e.includes(z.id)).map((z) => z.name).join(", ") || (stream ? "Live stream of the plenaries" : "Venue-wide");
  const breakouts = e.includes("breakouts") ? "Enrol from your badge" : stream ? "Selected, on the stream" : "Plenaries only";
  const extras = [e.includes("dinner") && "Gala dinner", e.includes("z_vip") && "VIP lounge"].filter(Boolean).join(", ") || "None";
  return [
    ["Days", dayLine],
    ["Access", access],
    ["Breakouts", breakouts],
    ["Extras", extras],
  ];
}

export function EventPublic({ slug }: { slug: string }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const today = useToday();
  const event = state.events.find((e) => e.slug === slug);
  if (!event) return <div className="p-10">Event not found.</div>;

  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const tiers = state.tiers.filter((t) => t.eventId === event.id && t.visibility === "public");
  const sessions = state.sessions.filter((s) => s.eventId === event.id);
  const zones = state.zones.filter((z) => z.eventId === event.id);
  const rooms = state.rooms.filter((r) => zones.some((z) => z.id === r.zoneId));
  const live = event.state === "Live";
  const confirmed = state.delegates.filter((d) => d.eventId === event.id && (d.status === "Confirmed" || d.status === "Checked in")).length;
  const days = Array.from({ length: event.days }, (_, i) => i + 1);

  const speakers = [...new Set(sessions.flatMap((s) => s.speakers))].map((name) => {
    const s = sessions.find((x) => x.speakers.includes(name))!;
    const p = state.speakerProfiles.find((x) => x.eventId === event.id && x.name === name);
    const d = state.delegates.find((x) => x.eventId === event.id && x.name === name && x.status !== "Cancelled");
    return { name, title: s.title, when: `Day ${s.day}, ${s.start}, ${whereIs(s, rooms)}`, photo: p?.photo, who: [p?.jobTitle, p?.organisation].filter(Boolean).join(", "), delegateId: d?.id, links: p?.links };
  });
  // meetings and messages happen from a delegate's badge; the prototype has no sign-in, so the demo badge stands in
  const badge = `/badge/${state.currentDelegateId ?? "d_demo"}`;
  const hasPhotos = speakers.some((sp) => sp.photo);
  const banner = state.banners[event.id];
  const floorPlan = state.floorPlans[event.id];
  const sponsors = state.sponsors.filter((s) => s.eventId === event.id);
  const tiers_ = ["Headline", "Gold", "Silver", "Partner"] as const;

  const lead = tiers.find((t) => t.id === "t_full") ?? tiers[0];
  const kesPrices = tiers.filter((t) => t.price > 0 && t.currency === "KES").map((t) => t.price);
  const from = kesPrices.length ? money(Math.min(...kesPrices)) : null;
  const refundBy = new Date(event.startDate);
  refundBy.setDate(refundBy.getDate() - 7);
  const doors = sessions.filter((s) => s.day === 1).map((s) => s.start).sort()[0] ?? "08:00";
  const dining = zones.find((z) => z.id === "z_dining");
  const breakoutRooms = rooms.filter((r) => zones.find((z) => z.id === r.zoneId)?.id === "z_breakout");
  const mainHall = zones.find((z) => z.id === "z_main");

  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const register = `/e/${event.slug}/register`;
  const action = "Get a ticket";
  const dateSpan = `${fmtDate(event.startDate, { day: "numeric" })} to ${fmtDate(event.endDate, { day: "numeric", month: "long", year: "numeric" })}`;
  const directions = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${event.venue} ${event.city}`)}`;

  // the live fact: a block in the programme window's flow (never over a row); a float only over the banner photograph
  const fact = lead ? (
    <div className="ly-float">
      <div className="ly-float__row">
        <span className="ly-live">{live ? "Selling now" : "Not on sale yet"}</span>
        <span>{lead.name}</span>
      </div>
      <div className="ly-float__title">
        {Math.max(0, lead.cap - lead.sold)} of {lead.cap} places left
      </div>
    </div>
  ) : null;
  const mark = (
    <span className="mark" style={{ background: accent, color: accentInk }} aria-hidden="true">
      {initials(organiser?.name ?? event.name)}
    </span>
  );
  const cta = live ? (
    <Link href={register} className="btn btn-primary btn-cta">
      {action}
    </Link>
  ) : (
    <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
      Registration opens soon
    </span>
  );

  return (
    <div className="site brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav nav--split">
        <div className="wrap nav__bar">
          <nav className="nav__links" aria-label="Main">
            {NAV.map(([id, label]) => (
              <a key={id} className="nav__link" href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <a className="nav__logo" href="#top">
            {mark}
            <span className="nav__name">{event.name}</span>
          </a>
          <div className="nav__actions">
            {cta}
            <button type="button" className="nav__toggle" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                {open ? <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> : <path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <div className="nav__sheet" onClick={() => setOpen(false)}>
            <div className="wrap">
              {NAV.map(([id, label]) => (
                <a key={id} href={`#${id}`}>
                  {label}
                </a>
              ))}
              {live && (
                <Link href={register} className="btn btn-primary btn-cta">
                  {action}
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ---- hero: split. The words on five columns, the Day 1 programme as the live window on six. */}
        <section className="hero" id="top" aria-labelledby="hero-h">
          <div className="wrap">
            <div className="hero-text grid hero__grid">
              <div className="hero__text span-5">
                <h1 id="hero-h">Brand and PR conference in {event.city}</h1>
                <p className="hero__lead">
                  {numberWord(event.days)[0].toUpperCase() + numberWord(event.days).slice(1)} days of plenaries, breakouts and an exhibition at {event.venue}, {dateSpan}.{from ? ` Tickets from ${from}.` : ""}
                </p>
                <div className="btn-row">
                  {cta}
                  <a className="btn btn-secondary" href="#programme">
                    See the programme
                  </a>
                </div>
                <dl className="hero-facts">
                  <div>
                    <dt>Doors</dt>
                    <dd>{doors} each day</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{event.venue}, {event.city}</dd>
                  </div>
                  <div>
                    <dt>Who</dt>
                    <dd>
                      {confirmed} registered, {speakers.length} speakers
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="hero__media span-6 begin-7" aria-label={banner ? event.venue : `Day 1 programme, ${dayDate(event.startDate, 1)}`}>
                {banner ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={banner} alt="" fetchPriority="high" />
                    {fact}
                  </>
                ) : (
                <div className="window">
                  <div className="window__head">
                    <span className="t-label">Programme, day 1</span>
                    <span className="t-label muted">{dayDate(event.startDate, 1)}</span>
                  </div>
                  {fact}
                  <ul className="rows rows--programme">
                    {sessions
                      .filter((s) => s.day === 1)
                      .map((s) => (
                        <li key={s.id}>
                          <span className="rows__time">{s.start}</span>
                          <span className="rows__name">{s.title}</span>
                          <span className="rows__meta">{meta(s, rooms)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---- programme: the three days as three ruled lists, one screen (two on a phone). */}
        <section className="section" id="programme" aria-labelledby="programme-h" style={{ "--h": 1, "--hm": 2 } as React.CSSProperties}>
          <div className="wrap">
            <div className="section-head section-head--row">
              <div>
                <h2 id="programme-h">
                  {numberWord(event.days)[0].toUpperCase() + numberWord(event.days).slice(1)} days, {numberWord(sessions.length)} sessions
                </h2>
              </div>
              <div className="section-head__aside hidden sm:block">Plenaries are open to everyone. Breakouts take enrolment from your badge page once you have registered.</div>
            </div>
            <div className="grid">
              {days.map((day) => (
                <div key={day} className="span-4">
                  <h3 className="t-day">
                    Day {day}, {dayDate(event.startDate, day)}
                  </h3>
                  <ul className="rows rows--programme">
                    {sessions
                      .filter((s) => s.day === day)
                      .map((s) => (
                        <li key={s.id}>
                          <span className="rows__time">{s.start}</span>
                          <span className="rows__name">{s.title}</span>
                          <span className="rows__meta">{meta(s, rooms)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- speakers: the dark band. Names and sessions from the programme; no portraits exist. */}
        <section className="section ground-inverse" id="speakers" aria-labelledby="speakers-h" style={{ "--h": hasPhotos ? 2 : 1, "--hm": 2 } as React.CSSProperties}>
          <div className="wrap">
            <div className="section-head">
              <h2 id="speakers-h">
                {numberWord(speakers.length)[0].toUpperCase() + numberWord(speakers.length).slice(1)} speakers
              </h2>
              <p>
                Plenaries in the {mainHall?.name.toLowerCase() ?? "main hall"}, breakouts in {breakoutRooms.length ? `${numberWord(breakoutRooms.length)} rooms` : "the breakout wing"}.
              </p>
            </div>
            <div className="grid">
              {speakers.map((sp) => (
                <div key={sp.name} className={`person span-3 ${sp.photo ? "person--photo" : ""}`}>
                  {sp.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="person__photo" src={sp.photo} alt="" loading="lazy" />
                  )}
                  <div className="person__text">
                    <h3>{sp.name}</h3>
                    {sp.who && <p className="person__who">{sp.who}</p>}
                    <p>{sp.title}</p>
                    <p className="person__when">{sp.when}</p>
                    <div className="person__actions">
                      <a href={`${badge}?tab=People&q=${encodeURIComponent(sp.name)}`}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3" /></svg>
                        Book a meeting
                      </a>
                      <a href={sp.delegateId ? `${badge}?tab=Messages&with=${sp.delegateId}` : `${badge}?tab=People&q=${encodeURIComponent(sp.name)}`}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6l-3.5 3v-3A1.5 1.5 0 0 1 2 9.5z" /></svg>
                        Message
                      </a>
                      {SOCIAL_KEYS.filter((k) => sp.links?.[k.key]).map((k) => (
                        <a key={k.key} href={sp.links![k.key]} target="_blank" rel="noreferrer">
                          {k.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- sponsors and partners: real logos in their own colours, by tier; a name in type until a logo is uploaded. */}
        {sponsors.length > 0 && (
          <section className="section" id="sponsors" aria-labelledby="sponsors-h" style={{ "--h": 1, "--hm": 1 } as React.CSSProperties}>
            <div className="wrap">
              <div className="section-head">
                <h2 id="sponsors-h">Sponsors and partners</h2>
              </div>
              <ul className="rows rows--sponsors">
                {tiers_
                  .filter((t) => sponsors.some((s) => s.tier === t))
                  .map((t) => (
                    <li key={t} className={`sponsors--${t.toLowerCase()}`}>
                      <span className="rows__name">{t}</span>
                      <div className="logos">
                        {sponsors
                          .filter((s) => s.tier === t)
                          .map((s) => {
                            const inner = s.logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.logo} alt={s.name} loading="lazy" />
                            ) : (
                              <span className="logos__name">{s.name}</span>
                            );
                            return s.url ? (
                              <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="logos__item">
                                {inner}
                              </a>
                            ) : (
                              <span key={s.id} className="logos__item">
                                {inner}
                              </span>
                            );
                          })}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---- tickets: the range, one tile per public tier, the secondary button on each. */}
        <section className="section" id="tickets" aria-labelledby="tickets-h" style={{ "--h": 1, "--hm": 2 } as React.CSSProperties}>
          <div className="wrap">
            <div className="section-head section-head--row">
              <div>
                <h2 id="tickets-h">Tickets and prices</h2>
              </div>
              <div className="section-head__aside">Pay by M-Pesa, Visa or Mastercard, or ask for a bank invoice. Your badge arrives by email and SMS when payment confirms.</div>
            </div>
            <ul className="rows rows--tickets">
              {tiers.map((t) => {
                const left = t.cap - t.sold;
                const inc = includes(t, zones, event.days)
                  .map(([, v]) => v)
                  .filter((v) => v !== "None")
                  .join(" · ");
                return (
                  <li key={t.id}>
                    <div className="ticket__what">
                      <h3>{t.name}</h3>
                      <p>{inc}</p>
                    </div>
                    <div className="ticket__price">
                      <span className="t-stat">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                      <span className="ticket__left">{t.paused ? "Sales paused" : !!today && !!t.saleFrom && t.saleFrom > today ? `On sale from ${fmtDate(t.saleFrom, { day: "numeric", month: "long" })}` : left <= 0 ? "Sold out, waitlist open" : `${left} of ${t.cap} places left`}</span>
                    </div>
                    {live && !t.paused && !(!!today && !!t.saleFrom && t.saleFrom > today) ? (
                      <Link href={`${register}?tier=${t.id}`} className="link">
                        {left <= 0 ? "Join the waitlist" : "Choose this ticket"}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---- venue: the facts on five columns, the zones and rooms as a still plan on six. */}
        <section className="section" id="venue" aria-labelledby="venue-h" style={{ "--h": 1, "--hm": 2 } as React.CSSProperties}>
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <div className="section-head">
                  <h2 id="venue-h">The venue</h2>
                  <p>
                    {event.venue} in {event.city}, {dayDate(event.startDate, 1, { weekday: "long" })} {dateSpan}.
                  </p>
                </div>
                <ul className="rows rows--spec">
                  <li>
                    <span className="rows__name">Doors</span>
                    <span className="rows__value">From {doors}, accreditation desk in the foyer</span>
                  </li>
                  {mainHall && (
                    <li>
                      <span className="rows__name">Plenaries</span>
                      <span className="rows__value">
                        {mainHall.name}, {mainHall.capacity} seats
                      </span>
                    </li>
                  )}
                  {breakoutRooms.length > 0 && (
                    <li>
                      <span className="rows__name">Breakouts</span>
                      <span className="rows__value">{breakoutRooms.map((r) => r.name).join(", ")}</span>
                    </li>
                  )}
                  {dining && (
                    <li>
                      <span className="rows__name">Lunch</span>
                      <span className="rows__value">
                        {dining.window ? `${dining.window.replace("–", " to ")} in the ${dining.name.toLowerCase()} hall` : `In the ${dining.name.toLowerCase()} hall`}
                      </span>
                    </li>
                  )}
                  <li>
                    <span className="rows__name">Directions</span>
                    <span className="rows__value">
                      <a className="link" href={directions} target="_blank" rel="noreferrer">
                        Get directions
                      </a>
                    </span>
                  </li>
                </ul>
              </div>
              <div className="span-6 begin-7">
                {floorPlan ? (
                  <figure className="plan plan--image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={floorPlan} alt={`Floor plan of ${event.venue}`} loading="lazy" />
                  </figure>
                ) : (
                  /* no plan uploaded yet: the zones drawn to scale by capacity, the rooms inside their wing */
                  <figure className="plan" role="img" aria-label={`Zones at ${event.venue}: ${zones.map((z) => `${z.name}, ${z.capacity}`).join("; ")}`}>
                    {zones
                      .filter((z) => z.id !== "z_breakout")
                      .map((z, i) => {
                        const place = [
                          { gridColumn: "1 / span 8", gridRow: "1 / span 3" },
                          { gridColumn: "9 / span 4", gridRow: "1 / span 3" },
                          { gridColumn: "1 / span 5", gridRow: "4 / span 2" },
                          { gridColumn: "6 / span 2", gridRow: "4 / span 2" },
                        ][i] ?? { gridColumn: "span 3", gridRow: "span 1" };
                        return (
                          <div key={z.id} className="plan__zone" style={place}>
                            <b>{z.name}</b>
                            <small>
                              {z.capacity}
                              {z.window ? ` · ${z.window}` : ""}
                            </small>
                          </div>
                        );
                      })}
                    {breakoutRooms.length > 0 && (
                      <div className="plan__wing" style={{ gridColumn: "8 / span 5", gridRow: "4 / span 2" }}>
                        <div className="plan__wing-head">
                          <b>Breakout wing</b>
                          <small>{zones.find((z) => z.id === "z_breakout")?.capacity}</small>
                        </div>
                        {breakoutRooms.map((r) => (
                          <div key={r.id} className="plan__zone plan__room">
                            <b>{r.name.replace(/\s*\(.*\)/, "")}</b>
                            <small>{r.capacity} seats</small>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="plan__zone plan__zone--desk" style={{ gridColumn: "1 / span 12", gridRow: "6" }}>
                      <b>Foyer, accreditation desk</b>
                      <small>Doors {doors}</small>
                    </div>
                  </figure>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---- questions: every answer open. */}
        <section className="section" id="questions" aria-labelledby="questions-h" style={{ "--h": 1, "--hm": 2 } as React.CSSProperties}>
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <div className="section-head">
                  <h2 id="questions-h">Questions</h2>
                  <p>Anything else, email the organiser.</p>
                </div>
                <a className="link" href="mailto:hello@epicpr.example">
                  Email the organiser
                </a>
              </div>
              <div className="span-6 begin-7 faq">
                <div className="faq__item">
                  <h3>How do I pay?</h3>
                  <p>By M-Pesa prompt to your phone, by Visa or Mastercard, or by bank transfer against a pro-forma invoice. A bank transfer is confirmed when the organiser marks it paid.</p>
                </div>
                <div className="faq__item">
                  <h3>When do I get my badge?</h3>
                  <p>The moment payment confirms, by email and SMS. It is a QR code on your phone; the desk prints a card if you need one.</p>
                </div>
                <div className="faq__item">
                  <h3>Which sessions can I attend?</h3>
                  <p>Every plenary. Breakouts have limited seats, so you enrol from your badge page; the programme shows the seats left in each room.</p>
                </div>
                <div className="faq__item">
                  <h3>Can I get a refund?</h3>
                  <p>Yes, in full until {fmtDate(refundBy.toISOString().slice(0, 10), { day: "numeric", month: "long" })}, seven days before the event. After that, none.</p>
                </div>
                <div className="faq__item">
                  <h3>Can I join online?</h3>
                  <p>{tiers.some((t) => t.entitlements.includes("stream")) ? `Yes. The virtual ticket streams the plenaries and selected breakouts live, for ${money(tiers.find((t) => t.entitlements.includes("stream"))!.price, tiers.find((t) => t.entitlements.includes("stream"))!.currency)}.` : "Not for this event."}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---- the close and the footer, one screen. */}
      <footer className="footer closing" id="contact" aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--type">
            <div className="section-head">
              <h2 id="close-h">
                {numberWord(event.days)[0].toUpperCase() + numberWord(event.days).slice(1)} days in {event.city}, {dateSpan.replace(/ \d{4}$/, "")}
              </h2>
              <p className="t-small muted" style={{ fontSize: "var(--t-small)" }}>
                {from ? `Tickets from ${from}. ` : ""}Your badge arrives by email and SMS when payment confirms.
              </p>
            </div>
            {live ? (
              <Link href={register} className="btn btn-primary btn-cta btn--xl">
                {action}
              </Link>
            ) : (
              <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                Registration opens soon
              </span>
            )}
          </div>
          <div className="closing__links">
            <div className="grid">
              <div className="span-4">
                <a className="nav__logo" href="#top">
                  {mark}
                  <span className="nav__name">{organiser?.name}</span>
                </a>
                <p className="footer__lede" style={{ marginTop: "var(--s-5)" }}>
                  {event.name}
                </p>
                {(event.hashtag || SOCIAL_KEYS.some((k) => event.links?.[k.key])) && (
                  <ul className="footer__social">
                    {event.hashtag && <li>{event.hashtag}</li>}
                    {SOCIAL_KEYS.filter((k) => event.links?.[k.key]).map((k) => (
                      <li key={k.key}>
                        <a href={event.links![k.key]} target="_blank" rel="noreferrer">
                          {k.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="footer__col span-2">
                <h4>Programme</h4>
                <ul>
                  {days.map((d) => (
                    <li key={d}>
                      <a href="#programme">Day {d}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="footer__col span-2">
                <h4>Speakers</h4>
                <ul>
                  <li>
                    <a href="#speakers">All speakers</a>
                  </li>
                </ul>
              </div>
              <div className="footer__col span-2">
                <h4>Tickets</h4>
                <ul>
                  {tiers.map((t) => (
                    <li key={t.id}>
                      <a href="#tickets">{t.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="footer__col span-2">
                <h4>Venue</h4>
                <ul>
                  <li>
                    <a href="#venue">{event.venue}</a>
                  </li>
                  <li>
                    <a href={directions} target="_blank" rel="noreferrer">
                      Get directions
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="footer__legal">
              <span>
                © {new Date(event.startDate).getFullYear()} {organiser?.name}
              </span>
              <span className="inline-flex items-center gap-2">
                Powered by <Wordmark size="sm" />
              </span>
            </div>
          </div>
        </div>
      </footer>

      {live && (
        <nav className="actionbar" aria-label="Register">
          <Link href={register} className="btn btn-primary btn-cta">
            {action}
          </Link>
        </nav>
      )}
    </div>
  );
}
