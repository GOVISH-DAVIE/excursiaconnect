"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark, fmtDate } from "@/components/ui";
import { money, useStore } from "@/lib/store";
import { initials, numberWord, readableOn } from "@/lib/brand";
import { useToday } from "@/lib/use-today";
import { SOCIAL_KEYS, type Room, type Session, type Tier, type Zone } from "@/lib/types";

/*
  The public event site, third pass: the anatomy every conference site shares, in this order.
  A full-screen hero with the photograph behind (a dark ground with the organiser's colour until
  one is uploaded): the date and venue, the event's name, its line, the two actions and a ticket
  panel; a facts bar at its foot. Then about (the lead, the numbers, the photographs the organiser
  adds), the programme by day, the speakers on the dark band, tickets as pricing cards, the
  sponsors by tier, the venue with its plan, the questions, and the close. Every section takes
  the height of its content. The accent is the organiser's brand colour; the label on it is chosen
  for contrast. Nothing is shown that the system does not hold.
*/

const NAV = [
  ["about", "About"],
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

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

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
    return { name, title: s.title, when: `Day ${s.day}, ${s.start}, ${whereIs(s, rooms)}`, photo: p?.photo, who: [p?.jobTitle, p?.organisation].filter(Boolean).join(", "), delegateId: d?.id, bookable: !!d?.bookable && !!d?.slots?.length, links: p?.links };
  });
  // meetings and messages happen from a delegate's badge; the prototype has no sign-in, so the demo badge stands in
  const badge = `/badge/${state.currentDelegateId ?? "d_demo"}`;
  const banner = state.banners[event.id];
  const floorPlan = state.floorPlans[event.id];
  const gallery = state.galleries[event.id] ?? [];
  const shown = gallery.length >= 9 ? 9 : gallery.length >= 5 ? 5 : gallery.length;
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
  const breakouts = sessions.filter((s) => s.kind === "breakout").length;
  const exhibition = zones.some((z) => z.id === "z_exhib");

  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  // the mark the organiser set under Edit brand; the organiser's initials only until one exists
  const markText = (event.brand.logoText || initials(organiser?.name ?? event.name)).slice(0, 4).toUpperCase();
  const register = `/e/${event.slug}/register`;
  const action = "Get a ticket";
  const sameMonth = event.startDate.slice(0, 7) === event.endDate.slice(0, 7);
  const dateRange = sameMonth
    ? `${fmtDate(event.startDate, { day: "numeric" })} to ${fmtDate(event.endDate, { day: "numeric", month: "long", year: "numeric" })}`
    : `${fmtDate(event.startDate, { day: "numeric", month: "long" })} to ${fmtDate(event.endDate, { day: "numeric", month: "long", year: "numeric" })}`;
  const dateShort = dateRange.replace(/ \d{4}$/, "");
  const directions = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${event.venue} ${event.city}`)}`;
  const offSale = (t: Tier) => !!t.paused || (!!today && !!t.saleFrom && t.saleFrom > today);
  const leftLine = (t: Tier) => {
    const left = t.cap - t.sold;
    return t.paused ? "Sales paused" : !!today && !!t.saleFrom && t.saleFrom > today ? `On sale from ${fmtDate(t.saleFrom, { day: "numeric", month: "long" })}` : left <= 0 ? "Sold out, waitlist open" : `${left} of ${t.cap} places left`;
  };

  const mark = (
    <span className="mark" style={{ background: accent, color: accentInk, fontSize: markText.length > 2 ? 10 : 13 }} aria-hidden="true">
      {markText}
    </span>
  );
  const cta = live ? (
    <Link href={register} className="btn btn-primary btn-cta">
      {action}
    </Link>
  ) : (
    <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
      {event.state === "Suspended" ? "Registration paused" : event.state === "Closed" ? "This event has ended" : "Registration opens soon"}
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
            {(event.dealRoom?.enabled && !!state.dealRoom.configs[event.id]) && (
              <Link className="nav__link" href={`/e/${event.slug}/deal-room`}>
                Deal Room
              </Link>
            )}
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
              {(event.dealRoom?.enabled && !!state.dealRoom.configs[event.id]) && <Link href={`/e/${event.slug}/deal-room`}>Deal Room</Link>}
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
        {/* ---- hero: the photograph behind, the name, the date and venue, the ticket panel, the facts bar. */}
        <section className={`hero ${banner ? "hero--photo" : "hero--dark"}`} id="top" aria-labelledby="hero-h">
          <div className="hero__bg" aria-hidden="true">
            {banner && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt="" fetchPriority="high" />
            )}
          </div>
          <div className="wrap">
            <div className="hero-text grid hero__grid">
              <div className="hero__text span-7">
                <div className="hero__kicker">
                  <span>{dateRange}</span>
                  <span>
                    {event.venue}, {event.city}
                  </span>
                  {from && <span>Tickets from {from}</span>}
                </div>
                <h1 id="hero-h">{event.name}</h1>
                <p className="hero__lead">{event.tagline}</p>
                <div className="btn-row">
                  {cta}
                  <a className="btn btn-secondary" href="#programme">
                    See the programme
                  </a>
                </div>
              </div>
              {tiers.length > 0 && (
              <aside className="hero__panel span-4 begin-9" aria-label="Tickets">
                <div className="hero__panel-head">
                  <span className="t-label">Tickets</span>
                  <a className="link" href="#tickets">
                    What each includes
                  </a>
                </div>
                <ul className="rows rows--quick">
                  {tiers.map((t) => {
                    const left = t.cap - t.sold;
                    const off = offSale(t);
                    return (
                      <li key={t.id}>
                        <span className="rows__name">
                          {t.name}
                          <small>{t.paused ? "Sales paused" : off ? `On sale from ${t.saleFrom}` : left <= 0 ? "Sold out, waitlist open" : `${left} left`}</small>
                        </span>
                        <span className="rows__value">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                        {live && !off ? (
                          <Link href={`${register}?tier=${t.id}`} className="rows__act">
                            {left <= 0 ? "Waitlist" : "Choose"}
                          </Link>
                        ) : (
                          <span className="rows__act rows__act--off">–</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {live && (
                  <Link href={register} className="btn btn-primary btn-cta">
                    {action}
                  </Link>
                )}
              </aside>
              )}
            </div>
            <dl className="hero__facts">
              <div>
                <dt>When</dt>
                <dd>{dateRange}</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>
                  {event.venue}, {event.city}
                </dd>
              </div>
              <div>
                <dt>Doors</dt>
                <dd>{doors} each day</dd>
              </div>
              <div>
                <dt>Who</dt>
                <dd>
                  {confirmed} registered, {speakers.length} speakers
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ---- about: the lead, the numbers, the organiser's photographs. */}
        <section className="section" id="about" aria-labelledby="about-h">
          <div className="wrap">
            <div className="grid">
              <div className="span-7">
                <h2 id="about-h" className="t-label muted" style={{ marginBottom: "var(--s-5)" }}>
                  About the event
                </h2>
                <p className="about__lead">
                  {cap(numberWord(event.days))} days at {event.venue}: {numberWord(sessions.length)} sessions, {speakers.length} speakers
                  {breakouts ? `, ${numberWord(breakouts)} breakouts you enrol in from your badge` : ""}
                  {exhibition ? ", and an exhibition floor open all day" : ""}.
                </p>
                <p className="measure" style={{ marginTop: "var(--s-5)", fontSize: "var(--t-lead)", lineHeight: 1.5 }}>
                  {event.tagline} Organised by {organiser?.name}.
                </p>
              </div>
              <div className="span-4 begin-9 about__stats">
                <div className="stat">
                  <div className="stat__value">{event.days}</div>
                  <div className="stat__label">Days</div>
                  <div className="stat__sub">{dateShort}</div>
                </div>
                <div className="stat">
                  <div className="stat__value">{sessions.length}</div>
                  <div className="stat__label">Sessions</div>
                  <div className="stat__sub">{breakouts ? `${breakouts} breakouts` : "Plenaries"}</div>
                </div>
                <div className="stat">
                  <div className="stat__value">{speakers.length}</div>
                  <div className="stat__label">Speakers</div>
                  <div className="stat__sub">Plenaries and panels</div>
                </div>
                <div className="stat">
                  <div className="stat__value">{event.expectedAttendance.toLocaleString()}</div>
                  <div className="stat__label">Delegates expected</div>
                  <div className="stat__sub">{confirmed} registered so far</div>
                </div>
              </div>
            </div>
            {shown > 0 && (
              <ul className="gallery" aria-label="Photographs">
                {gallery.slice(0, shown).map((src, i) => (
                  <li key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading={i === 0 ? "eager" : "lazy"} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- programme: the days as ruled lists side by side. */}
        <section className="section" id="programme" aria-labelledby="programme-h">
          <div className="wrap">
            <div className="section-head section-head--row">
              <div>
                <h2 id="programme-h">Programme</h2>
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

        {/* ---- speakers: the dark band; a portrait where one is uploaded, the initials where not. */}
        <section className="section ground-inverse" id="speakers" aria-labelledby="speakers-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="speakers-h">Speakers</h2>
              <p>
                {cap(numberWord(speakers.length))} speakers across {numberWord(sessions.filter((s) => s.speakers.length).length)} sessions. Plenaries in the {mainHall?.name.toLowerCase() ?? "main hall"}, breakouts in {breakoutRooms.length ? `${numberWord(breakoutRooms.length)} rooms` : "the breakout wing"}.
              </p>
            </div>
            <div className="grid">
              {speakers.map((sp) => (
                <div key={sp.name} className="person person--photo span-3">
                  {sp.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="person__photo" src={sp.photo} alt="" loading="lazy" />
                  ) : (
                    <span className="person__avatar" aria-hidden="true">
                      {initials(sp.name)}
                    </span>
                  )}
                  <div className="person__text">
                    <h3>{sp.name}</h3>
                    {sp.who && <p className="person__who">{sp.who}</p>}
                    <p>{sp.title}</p>
                    <p className="person__when">{sp.when}</p>
                    <div className="person__actions">
                      {/* meetings and messages need the speaker on the delegate list; a speaker who is not there, or not taking meetings, gets no dead link */}
                      {sp.delegateId && sp.bookable && (
                        <a href={`${badge}?tab=People&q=${encodeURIComponent(sp.name)}`}>
                          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3" /></svg>
                          Book a meeting
                        </a>
                      )}
                      {sp.delegateId && (
                        <a href={`${badge}?tab=Messages&with=${sp.delegateId}`}>
                          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6l-3.5 3v-3A1.5 1.5 0 0 1 2 9.5z" /></svg>
                          Message
                        </a>
                      )}
                      {!sp.delegateId && <span className="person__note">Not taking meetings</span>}
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

        {/* ---- tickets: pricing cards, the lead tier marked, what each includes ticked. */}
        <section className="section" id="tickets" aria-labelledby="tickets-h">
          <div className="wrap">
            <div className="section-head section-head--row">
              <div>
                <h2 id="tickets-h">Tickets and prices</h2>
              </div>
              <div className="section-head__aside">Pay by M-Pesa, Visa or Mastercard, or ask for a bank invoice. Your badge arrives by email and SMS when payment confirms.</div>
            </div>
            <ul className="prices">
              {tiers.map((t) => {
                const left = t.cap - t.sold;
                const off = offSale(t);
                const isLead = t.id === lead?.id;
                return (
                  <li key={t.id} className={`price ${isLead ? "price--lead" : ""}`}>
                    <div className="price__head">
                      <h3>{t.name}</h3>
                      {isLead && <span className="price__tag">Full access</span>}
                    </div>
                    <div>
                      <span className="price__amount">{t.price === 0 ? "Free" : money(t.price, t.currency)}</span>
                      <span className="price__per">{t.price === 0 ? "" : "Per person. "}{t.approval === "organiser" ? "Organiser approval required." : t.description}</span>
                    </div>
                    <ul className="price__list">
                      {includes(t, zones, event.days)
                        .filter(([, v]) => v !== "None")
                        .map(([k, v]) => (
                          <li key={k}>
                            <b>{k}:</b> {v}
                          </li>
                        ))}
                    </ul>
                    <p className="price__left">{leftLine(t)}</p>
                    {live && !off ? (
                      <Link href={`${register}?tier=${t.id}`} className={`btn ${isLead ? "btn-primary" : "btn-secondary"}`}>
                        {left <= 0 ? "Join the waitlist" : "Choose this ticket"}
                      </Link>
                    ) : (
                      <span className="btn btn-secondary" aria-disabled="true" style={{ opacity: 0.6, pointerEvents: "none" }}>
                        {live ? "Not on sale" : "Opens soon"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---- sponsors and partners: real logos in their own colours, by tier; a name in type until a logo is uploaded. */}
        {sponsors.length > 0 && (
          <section className="section" id="sponsors" aria-labelledby="sponsors-h">
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

        {/* ---- venue: the facts on five columns, the zones and rooms as a still plan on six. */}
        <section className="section" id="venue" aria-labelledby="venue-h">
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <div className="section-head">
                  <h2 id="venue-h">The venue</h2>
                  <p>
                    {event.venue} in {event.city}, {dayDate(event.startDate, 1, { weekday: "long" })} {dateRange}.
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
                        Open in maps
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
        <section className="section" id="questions" aria-labelledby="questions-h">
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

      {/* ---- the close and the footer. */}
      <footer className="footer closing" id="contact" aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--type">
            <div className="section-head">
              <h2 id="close-h">
                {cap(numberWord(event.days))} days in {event.city}, {dateShort}
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
                {event.state === "Suspended" ? "Registration paused" : event.state === "Closed" ? "This event has ended" : "Registration opens soon"}
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
                      Open in maps
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
