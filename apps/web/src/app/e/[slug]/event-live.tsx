"use client";

/**
 * A real event's public page, from the API (page.tsx decides): what the organiser published and Algotech approved,
 * on the event site's contract (the organiser's colour, one wrap, the dark hero, sections the height of their
 * content). Tickets, the programme, speakers and sponsors join as they move onto the API (Phase 2); until then
 * the page says registration opens soon, and shows the Deal Room once it takes applications.
 */
import Link from "next/link";
import { useState } from "react";
import type { PublicEvent } from "@excursia/contracts/public";
import { SOCIAL_KEYS } from "@excursia/domain/types";
import { Wordmark, fmtDate } from "@/components/ui";
import { initials, numberWord, readableOn } from "@/lib/brand";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const daysOf = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;

export function EventLive({ event }: { event: PublicEvent }) {
  const [open, setOpen] = useState(false);
  const dr = event.dealRoom;
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const markText = (event.brand.logoText || initials(event.organiser.name || event.name)).slice(0, 4).toUpperCase();
  const days = daysOf(event.startDate, event.endDate);
  const sameMonth = event.startDate.slice(0, 7) === event.endDate.slice(0, 7);
  const dateRange =
    event.startDate === event.endDate
      ? fmtDate(event.startDate, { day: "numeric", month: "long", year: "numeric" })
      : sameMonth
        ? `${fmtDate(event.startDate, { day: "numeric" })} to ${fmtDate(event.endDate, { day: "numeric", month: "long", year: "numeric" })}`
        : `${fmtDate(event.startDate, { day: "numeric", month: "long" })} to ${fmtDate(event.endDate, { day: "numeric", month: "long", year: "numeric" })}`;
  const directions = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${event.venue} ${event.city}`)}`;
  const deal = `/e/${event.slug}/deal-room`;
  const nav: [string, string][] = [["about", "About"], ...(dr ? ([["deal-room", "Deal Room"]] as [string, string][]) : []), ["venue", "Venue"]];
  const status = event.state === "Suspended" ? "Registration paused" : event.state === "Closed" ? "This event has ended" : event.kind === "dealroom" ? "Applications open soon" : "Registration opens soon";

  const mark = (
    <span className="mark" style={{ background: accent, color: accentInk, fontSize: markText.length > 2 ? 10 : 13 }} aria-hidden="true">
      {markText}
    </span>
  );
  const pill = (
    <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
      {status}
    </span>
  );

  return (
    <div className="site brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav nav--split">
        <div className="wrap nav__bar">
          <nav className="nav__links" aria-label="Main">
            {nav.map(([id, label]) => (
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
            {dr?.open ? (
              <Link href={`${deal}/apply`} className="btn btn-primary btn-cta">
                Apply to the Deal Room
              </Link>
            ) : (
              pill
            )}
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
              {nav.map(([id, label]) => (
                <a key={id} href={`#${id}`}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="hero hero--dark" id="top" aria-labelledby="hero-h">
          <div className="hero__bg" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-text grid hero__grid">
              <div className="hero__text span-7">
                <div className="hero__kicker">
                  <span>{dateRange}</span>
                  <span>{[event.venue, event.city].filter(Boolean).join(", ")}</span>
                  <span>{status}</span>
                </div>
                <h1 id="hero-h">{event.name}</h1>
                {event.tagline && <p className="hero__lead">{event.tagline}</p>}
                <div className="btn-row">
                  {/* the one thing to do today: apply to the Deal Room while it is open; tickets come with Phase 2 */}
                  {dr?.open ? (
                    <>
                      <Link href={`${deal}/apply`} className="btn btn-primary btn-cta">
                        Apply to the Deal Room
                      </Link>
                      <Link className="btn btn-secondary" href={deal}>
                        How the Deal Room works
                      </Link>
                    </>
                  ) : dr ? (
                    <Link className="btn btn-secondary" href={deal}>
                      The Deal Room
                    </Link>
                  ) : (
                    pill
                  )}
                </div>
              </div>
            </div>
            <dl className="hero__facts">
              <div>
                <dt>Dates</dt>
                <dd>{dateRange}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{event.venue || "To be announced"}</dd>
              </div>
              <div>
                <dt>Organiser</dt>
                <dd>{event.organiser.name}</dd>
              </div>
              {dr && (
                <div>
                  <dt>Deal Room</dt>
                  <dd>{dr.open ? `Applications close ${fmtDate(dr.rules.appClose, { day: "numeric", month: "short" })}` : "Applications closed"}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        <section className="section" id="about" aria-labelledby="about-h">
          <div className="wrap">
            <div className="grid">
              <div className="span-7">
                <h2 id="about-h" className="t-label muted" style={{ marginBottom: "var(--s-5)" }}>
                  About the event
                </h2>
                <p className="about__lead">
                  {cap(numberWord(days))} day{days === 1 ? "" : "s"} in {event.city}
                  {event.venue ? `, at ${event.venue}` : ""}.
                </p>
                <p className="measure" style={{ marginTop: "var(--s-5)", fontSize: "var(--t-lead)", lineHeight: 1.5 }}>
                  {event.tagline ? `${event.tagline} ` : ""}Organised by {event.organiser.name}. Tickets, the programme and the speakers are published here as they are confirmed.
                </p>
              </div>
            </div>
          </div>
        </section>

        {dr && (
          <section className="section ground-inverse" id="deal-room" aria-labelledby="dr-h">
            <div className="wrap">
              <div className="grid">
                <div className="span-6">
                  <div className="section-head">
                    <h2 id="dr-h">The Deal Room</h2>
                    <p>
                      Businesses with a clear ask meet the investors, buyers and partners who can act on it, by introduction, in prepared {dr.rules.meetingMin}-minute meetings at the summit. Both sides are checked
                      before anyone meets.
                    </p>
                  </div>
                  <div className="btn-row">
                    {dr.open ? (
                      <Link href={`${deal}/apply`} className="btn btn-primary btn-cta">
                        Apply by {fmtDate(dr.rules.appClose, { day: "numeric", month: "long" })}
                      </Link>
                    ) : (
                      <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                        Applications are closed
                      </span>
                    )}
                    <Link href={deal} className="btn btn-secondary">
                      How it works
                    </Link>
                  </div>
                </div>
                <div className="span-5 begin-8">
                  <ul className="rows rows--spec">
                    {dr.missions.map((m) => (
                      <li key={m.id}>
                        <span className="rows__name">{m.code}</span>
                        <span className="rows__value">{m.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="section" id="venue" aria-labelledby="venue-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="venue-h">The venue</h2>
              <p>
                {event.venue ? `${event.venue} in ${event.city}` : `In ${event.city}; the venue is announced soon`}, {dateRange}.
              </p>
            </div>
            {event.venue && (
              <a className="link" href={directions} target="_blank" rel="noreferrer">
                Open in maps
              </a>
            )}
          </div>
        </section>
      </main>

      <footer className="footer closing" id="contact" aria-label="Footer">
        <div className="wrap">
          <div className="closing__links">
            <div className="grid">
              <div className="span-6">
                <a className="nav__logo" href="#top">
                  {mark}
                  <span className="nav__name">{event.organiser.name}</span>
                </a>
                <p className="footer__lede" style={{ marginTop: "var(--s-5)" }}>
                  {event.name}
                </p>
                {(event.hashtag || SOCIAL_KEYS.some((k) => event.links[k.key])) && (
                  <ul className="footer__social">
                    {event.hashtag && <li>{event.hashtag}</li>}
                    {SOCIAL_KEYS.filter((k) => event.links[k.key]).map((k) => (
                      <li key={k.key}>
                        <a href={event.links[k.key]} target="_blank" rel="noreferrer">
                          {k.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="footer__legal">
              <span>
                © {event.startDate.slice(0, 4)} {event.organiser.name}
              </span>
              <span className="inline-flex items-center gap-2">
                Powered by <Wordmark size="sm" />
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
