"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark, fmtDate } from "@/components/ui";
import { useStore } from "@/lib/store";
import { initials, numberWord, readableOn } from "@/lib/brand";
import type { PublicDealRoom } from "@excursia/contracts/public";
import type { Instrument, ProviderKind, Stage } from "@excursia/domain/dealroom/types";
import { PATHWAYS, feeLabel, isChallenge } from "@excursia/domain/dealroom/logic";

/*
  The public Deal Room page (PRD Module req. 9, CS-1). Built on the event site's contract: the
  organiser's colour as the accent, one wrap, the dark hero, sections the height of their content.
  Everything on it comes from the Deal Room configuration; it is live only when the event is.
*/

const INSTRUMENTS: Instrument[] = PATHWAYS;
const STAGES: Stage[] = ["Bankable project", "Early revenue", "Growth", "Expansion"];

/** The prototype's Deal Room page: the demo's data, from this browser's store, through the same view. */
export function DealRoomPublic({ slug }: { slug: string }) {
  const { state } = useStore();
  const event = state.events.find((e) => e.slug === slug);
  const cfg = event ? state.dealRoom.configs[event.id] : undefined;
  if (!event || !event.dealRoom?.enabled) return <div className="p-10">This event has no Deal Room.</div>;
  if (!cfg) return <div className="p-10">The Deal Room for {event.name} opens once its team has set it up.</div>;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const r = cfg.rules;
  const today = state.dealRoom.clock.slice(0, 10);
  const dr: PublicDealRoom = {
    open: event.state === "Live" && today >= r.appOpen && today <= r.appClose,
    missions: cfg.missions,
    tracks: cfg.tracks,
    eligibility: cfg.rubric.eligibility,
    seekerFee: cfg.seekerFee,
    providerKinds: cfg.providerKinds,
    sectors: cfg.sectors,
    countries: cfg.countries,
    rules: { appOpen: r.appOpen, appClose: r.appClose, meetingMin: r.meetingMin, bufferMin: r.bufferMin, seekerCap: r.seekerCap, profileDays: r.profileDays, introDays: r.introDays, conversionEnd: r.conversionEnd },
    // verified challenges are published: their title and owner, so businesses that could solve one apply for it
    challenges: state.dealRoom.apps
      .filter((a) => a.eventId === event.id && isChallenge(a) && a.verification?.state === "Verified")
      .map((a) => ({ id: a.id, title: a.challenge!.title, owner: a.providerKind === "Corporate buyer" ? "A corporate buyer" : a.org.name, route: a.challenge!.route, budget: a.challenge!.budget ?? "" })),
  };
  return <DealRoomView slug={slug} event={{ ...event, live: event.state === "Live" }} organiser={organiser?.name ?? ""} dr={dr} />;
}

type ViewEvent = { name: string; city: string; startDate: string; endDate: string; brand: { primary: string; logoText: string }; live: boolean };

/**
 * The Deal Room's public page, from its data: the prototype's store for the demo, the API for a real event
 * (page.tsx decides which).
 */
export function DealRoomView({ slug, event, organiser, dr }: { slug: string; event: ViewEvent; organiser: string; dr: PublicDealRoom }) {
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(organiser || event.name)).slice(0, 4).toUpperCase();
  const live = event.live;
  const cfg = dr;
  const r = dr.rules;
  const open = dr.open;
  const apply = (type: "seeker" | "provider" | "challenge") => `/e/${slug}/deal-room/apply?type=${type}`;
  const challenges = dr.challenges;
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
                Apply
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="hero hero--dark" id="top" aria-labelledby="dr-h">
          <div className="hero__bg" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-text grid hero__grid">
              <div className="hero__text span-7">
                <div className="hero__kicker">
                  <span>Deal Room</span>
                  <span>{dates}</span>
                  <span>{event.city}</span>
                </div>
                <h1 id="dr-h">Meet the right counterparty, by introduction</h1>
                <p className="hero__lead">
                  The {event.name} Deal Room qualifies businesses, projects and institutions with a clear ask, and the investors, buyers and partners who can act on it. Pairs that both say yes meet at the summit in a prepared {r.meetingMin}-minute meeting: for investment, procurement, partnership or market access.
                </p>
                <div className="btn-row">
                  {open ? (
                    <>
                      <Link href={apply("seeker")} className="btn btn-primary btn-cta">
                        Apply to raise capital
                      </Link>
                      <Link href={apply("provider")} className="btn btn-secondary">
                        Apply as an investor, buyer or partner
                      </Link>
                      <Link href="#challenges" className="link self-center">
                        Bring a challenge
                      </Link>
                    </>
                  ) : (
                    <span className="pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                      {live ? "Applications are closed" : "Applications open when the summit goes live"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <dl className="hero__facts">
              <div>
                <dt>Applications</dt>
                <dd>
                  {fmtDate(r.appOpen, { day: "numeric", month: "short" })} to {fmtDate(r.appClose, { day: "numeric", month: "short" })}
                </dd>
              </div>
              <div>
                <dt>Missions</dt>
                <dd>
                  {numberWord(cfg.missions.length)[0].toUpperCase() + numberWord(cfg.missions.length).slice(1)} missions, {numberWord(cfg.tracks.length)} tracks
                </dd>
              </div>
              <div>
                <dt>Meetings</dt>
                <dd>
                  {r.meetingMin} minutes, in a booked room
                </dd>
              </div>
              <div>
                <dt>Your documents</dt>
                <dd>Shared only with your consent</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="section" id="who" aria-labelledby="who-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="who-h">Who the Deal Room is for</h2>
              <p>Both sides are checked before anyone meets. A business is scored against written criteria; an investor, buyer or partner is verified.</p>
            </div>
            <div className="grid">
              <div className="span-6">
                <h3 className="t-day">Businesses raising capital</h3>
                <ul className="rows">
                  {cfg.eligibility.map((c) => (
                    <li key={c.id}>
                      <span className="rows__name">{c.text}</span>
                    </li>
                  ))}
                  <li>
                    <span className="rows__name">A named decision-maker who can attend</span>
                  </li>
                  {cfg.seekerFee.amount > 0 && (
                    <li>
                      <span className="rows__name">
                        Once approved, a {feeLabel(cfg.seekerFee)} participation fee by M-Pesa or card; matching and your badge follow payment
                      </span>
                    </li>
                  )}
                </ul>
              </div>
              <div className="span-6">
                <h3 className="t-day">Investors, buyers and partners</h3>
                <ul className="rows">
                  <li>
                    <span className="rows__name">{cfg.providerKinds.join(", ")}</span>
                  </li>
                  <li>
                    <span className="rows__name">A written mandate: sectors, countries, stages, ticket or contract range, transaction pathways, exclusions</span>
                  </li>
                  <li>
                    <span className="rows__name">Know-your-customer documents and a sanctions screening</span>
                  </li>
                  <li>
                    <span className="rows__name">One non-disclosure agreement covering every opportunity in the Deal Room</span>
                  </li>
                  <li>
                    <span className="rows__name">A named decision-maker for meetings</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="challenges" aria-labelledby="ch-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="ch-h">Bring a challenge</h2>
              <p>
                Public institutions and corporate buyers bring a problem, not a tender: the users who have it, the outcome they need, the budget and the route to a contract. Once verified, the team
                matches it with businesses that can solve it, and the meetings happen in the Deal Room.
              </p>
            </div>
            <div className="grid">
              <div className="span-6">
                <h3 className="t-day">What you describe</h3>
                <ul className="rows">
                  {["The problem and who has it", "What success looks like, measurably", "Constraints: data, systems, regulation", "Budget range, timeline and procurement route", "Who decides, and the steps to a contract"].map((x) => (
                    <li key={x}>
                      <span className="rows__name">{x}</span>
                    </li>
                  ))}
                </ul>
                {open && (
                  <Link href={apply("challenge")} className="btn btn-secondary mt-4">
                    Submit a challenge
                  </Link>
                )}
              </div>
              <div className="span-6">
                <h3 className="t-day">Open challenges{challenges.length ? `, ${challenges.length}` : ""}</h3>
                {challenges.length ? (
                  <ul className="rows">
                    {challenges.map((a) => (
                      <li key={a.id}>
                        <span className="rows__name">
                          {a.title}
                          <span className="block text-[13px] text-slate">
                            {a.owner} · {a.route}
                            {a.budget ? ` · ${a.budget}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate">None published yet.</p>
                )}
                {open && challenges.length > 0 && (
                  <p className="mt-3 text-[14px] text-slate">
                    Can your business solve one?{" "}
                    <Link className="link" href={apply("seeker")}>
                      Apply to the Deal Room
                    </Link>{" "}
                    and name it in your use of funds.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <EligibilityCheck slug={slug} sectors={cfg.sectors} countries={cfg.countries.slice(0, 9)} kinds={cfg.providerKinds as ProviderKind[]} open={open} />

        <section className="section" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="how-h">How it works</h2>
            </div>
            <ol className="dr-steps">
              {[
                ["Apply and get a decision", `A reviewer scores your application against the criteria and may ask for more information. You get a reference number and see your status at any time.`],
                ["Complete your profile", `Approved businesses write a short teaser and finish their profile within ${r.profileDays} working days. Providers sign the NDA once and are verified.`],
                ["Accept an introduction", `The Deal Room team proposes a match and a one-page brief. Nothing is shared until both of you accept, within ${r.introDays} days.`],
                ["Meet at the summit", `Operations books a ${r.meetingMin}-minute slot and a room; you confirm it and get a calendar invite. Your badge checks you in at the Deal Room desk.`],
              ].map(([t, d], i) => (
                <li key={t}>
                  <span className="dr-steps__n">{i + 1}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="missions" aria-labelledby="missions-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="missions-h">The missions and strategic tracks</h2>
              <p>Every application belongs to one mission and one of its tracks.</p>
            </div>
            <ul className="rows rows--spec">
              {cfg.missions.map((m) => (
                <li key={m.id}>
                  <span className="rows__name">{m.code}</span>
                  <span className="rows__value">
                    <b className="font-medium">{m.name}</b>. {m.description}
                    <span className="block mt-1" style={{ color: "var(--muted)" }}>
                      Tracks:{" "}
                      {cfg.tracks
                        .filter((t) => t.missionId === m.id)
                        .map((t) => t.name)
                        .join("; ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section" id="questions" aria-labelledby="q-h">
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <div className="section-head">
                  <h2 id="q-h">Questions</h2>
                </div>
              </div>
              <div className="span-6 begin-7 faq">
                <div className="faq__item">
                  <h3>Who sees my documents?</h3>
                  <p>Verified providers see only a short teaser, which you can keep anonymous. Your full profile goes to a provider once the Deal Room team introduces you, and each document only if you tick it for that provider. You can see who opened what, and withdraw consent at any time.</p>
                </div>
                <div className="faq__item">
                  <h3>Can I ask for a meeting with a particular investor?</h3>
                  <p>You can express interest in a teaser from the directory; the team assesses it and turns it into an introduction or declines it. Meetings are booked only between pairs who both accepted.</p>
                </div>
                <div className="faq__item">
                  <h3>How many meetings can I have?</h3>
                  <p>Businesses up to {r.seekerCap} across the summit; providers set their own daily cap at onboarding. Meetings are {r.meetingMin} minutes with {r.bufferMin} minutes between them.</p>
                </div>
                {cfg.seekerFee.amount > 0 && (
                  <div className="faq__item">
                    <h3>Is there a fee?</h3>
                    <p>Applying is free. A business that is approved pays a {feeLabel(cfg.seekerFee)} participation fee, by M-Pesa or card, from the link sent with the decision. Investors and other providers pay nothing.</p>
                  </div>
                )}
                <div className="faq__item">
                  <h3>What happens after the summit?</h3>
                  <p>Every meeting with a next step becomes an opportunity with an owner on the Deal Room team, who follows it up monthly until {fmtDate(r.conversionEnd, { day: "numeric", month: "long", year: "numeric" })}.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer closing" aria-label="Footer">
        <div className="wrap">
          <div className="footer__legal">
            <span>
              {event.name} Deal Room, run by {organiser}
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

/** CS-1: a short self-check before the form, with each criterion explained. Nothing is saved. */
function EligibilityCheck({ slug, sectors, countries, kinds, open }: { slug: string; sectors: string[]; countries: string[]; kinds: ProviderKind[]; open: boolean }) {
  const [type, setType] = useState<"seeker" | "provider">("seeker");
  const [a, setA] = useState({ sector: "", country: "", stage: "", instrument: "", registered: "", kind: "", mandate: "" });
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLSelectElement>) => setA({ ...a, [k]: e.target.value });
  const seekerRows = [
    { q: "Sector in scope for a mission", ok: !a.sector ? undefined : sectors.includes(a.sector), why: "The Deal Room classifies every opportunity in the 19-sector taxonomy; others are out of scope." },
    { q: "Active in the mission geography", ok: !a.country ? undefined : a.country !== "Elsewhere", why: "The Deal Room covers businesses operating in Africa." },
    { q: "Post-revenue, or a bankable project", ok: !a.stage ? undefined : a.stage !== "Idea", why: "Investors meet businesses with customers, or projects with contracts and studies." },
    { q: "Asking for a named transaction pathway", ok: !a.instrument ? undefined : a.instrument !== "Not sure", why: "You will be matched on the pathway you ask for: equity, debt, a contract, a pilot, a partnership or market access." },
    { q: "Legally registered", ok: !a.registered ? undefined : a.registered === "Yes", why: "A registration certificate is required with the application." },
  ];
  const providerRows = [
    { q: "A recognised type of finance provider", ok: !a.kind ? undefined : a.kind !== "Other", why: "Angel, venture and private-equity investors, funds, DFIs, banks, corporate buyers, distributors, public institutions and ecosystem partners." },
    { q: "A written mandate", ok: !a.mandate ? undefined : a.mandate === "Yes", why: "You will describe sectors, countries, stages, ticket or contract range, transaction pathways and exclusions." },
  ];
  const rows = type === "seeker" ? seekerRows : providerRows;
  const answered = rows.every((r) => r.ok !== undefined);
  const pass = answered && rows.every((r) => r.ok);

  return (
    <section className="section" id="apply" aria-labelledby="check-h">
      <div className="wrap">
        <div className="grid">
          <div className="span-5">
            <div className="section-head">
              <h2 id="check-h">Check if you are eligible</h2>
              <p>A minute of questions before the form. Nothing here is saved or sent.</p>
            </div>
            <div className="dr-toggle" role="tablist">
              <button role="tab" aria-selected={type === "seeker"} onClick={() => setType("seeker")}>
                I am raising capital
              </button>
              <button role="tab" aria-selected={type === "provider"} onClick={() => setType("provider")}>
                I provide finance
              </button>
            </div>
            <div className="dr-form">
              {type === "seeker" ? (
                <>
                  <label>
                    Sector
                    <select className="input" value={a.sector} onChange={set("sector")}>
                      <option value="">Choose</option>
                      {sectors.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Where you operate
                    <select className="input" value={a.country} onChange={set("country")}>
                      <option value="">Choose</option>
                      {countries.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                      <option>Elsewhere</option>
                    </select>
                  </label>
                  <label>
                    Stage
                    <select className="input" value={a.stage} onChange={set("stage")}>
                      <option value="">Choose</option>
                      {STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                      <option value="Idea">An idea, no revenue or project yet</option>
                    </select>
                  </label>
                  <label>
                    What you seek
                    <select className="input" value={a.instrument} onChange={set("instrument")}>
                      <option value="">Choose</option>
                      {INSTRUMENTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                      <option>Not sure</option>
                    </select>
                  </label>
                  <label>
                    Legally registered
                    <select className="input" value={a.registered} onChange={set("registered")}>
                      <option value="">Choose</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Type
                    <select className="input" value={a.kind} onChange={set("kind")}>
                      <option value="">Choose</option>
                      {kinds.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                      <option>Other</option>
                    </select>
                  </label>
                  <label>
                    A written investment or sourcing mandate
                    <select className="input" value={a.mandate} onChange={set("mandate")}>
                      <option value="">Choose</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
          <div className="span-6 begin-7">
            <ul className="rows dr-check">
              {rows.map((r) => (
                <li key={r.q} data-ok={r.ok === undefined ? "na" : r.ok ? "yes" : "no"}>
                  <span className="rows__name">{r.q}</span>
                  <span className="rows__value">{r.ok === undefined ? "–" : r.ok ? "Meets it" : "Does not"}</span>
                  <p>{r.why}</p>
                </li>
              ))}
            </ul>
            <div className="dr-verdict">
              {!answered ? (
                <p>Answer the questions to see where you stand.</p>
              ) : pass ? (
                <>
                  <p>
                    <b>You look eligible.</b> The application takes about 20 minutes; you can save it and continue on another device.
                  </p>
                  {open && (
                    <Link className="btn btn-primary btn-cta" href={`/e/${slug}/deal-room/apply?type=${type}${a.sector ? `&sector=${encodeURIComponent(a.sector)}` : ""}${a.country && a.country !== "Elsewhere" ? `&country=${encodeURIComponent(a.country)}` : ""}${a.instrument && a.instrument !== "Not sure" ? `&instrument=${encodeURIComponent(a.instrument)}` : ""}`}>
                      Start the application
                    </Link>
                  )}
                </>
              ) : (
                <p>
                  <b>Not this time.</b> The criteria marked &ldquo;Does not&rdquo; are required. You can still apply; a reviewer decides on the full application.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
