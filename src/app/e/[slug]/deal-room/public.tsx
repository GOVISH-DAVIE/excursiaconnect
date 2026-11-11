"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark, fmtDate } from "@/components/ui";
import { useStore } from "@/lib/store";
import { initials, numberWord, readableOn } from "@/lib/brand";
import type { Instrument, ProviderKind, Stage } from "@/lib/dealroom/types";
import { CAPITAL_KINDS, PATHWAYS, PARTNER_KINDS, feeLabel, isChallenge, isPartnerKind } from "@/lib/dealroom/logic";

/*
  The public Deal Room page (PRD Module req. 9, CS-1). Built on the event site's contract: the
  organiser's colour as the accent, one wrap, the dark hero, sections the height of their content.
  Everything on it comes from the Deal Room configuration; it is live only when the event is.
  The wording follows the organiser's brief: who should participate, the activities, and the four
  registration pathways (capital seeker, capital provider, commercial or strategic partner, institutional challenge).
*/

const INSTRUMENTS: Instrument[] = PATHWAYS;
const STAGES: Stage[] = ["Bankable project", "Early revenue", "Growth", "Expansion"];

type Pathway = "seeker" | "capital" | "partner" | "challenge";

const GROUPS: { title: string; text: string }[] = [
  {
    title: "Opportunity owners",
    text: "Startups, scale-ups, established enterprises, technology providers and project sponsors seeking capital, customers, commercial opportunities, strategic partnerships or market access.",
  },
  {
    title: "Investors and capital providers",
    text: "Angel investors, venture capital firms, private equity funds, banks, development finance institutions and other capital providers seeking qualified investment opportunities.",
  },
  {
    title: "Commercial counterparties",
    text: "Corporates, procurement teams, distributors, channel partners and regional operators seeking suppliers, technology solutions and commercial partnerships.",
  },
  {
    title: "Public and ecosystem institutions",
    text: "Government ministries, agencies, regulators, trade and investment agencies, accelerators and ecosystem partners with institutional priorities, defined challenges or partnership interests.",
  },
];

const ACTIVITIES = [
  "Curated business-to-business meetings",
  "Startup and enterprise pitch presentations",
  "Investment opportunity and project presentations",
  "Investor, VC, PE and DFI engagement sessions",
  "Corporate procurement and supplier discovery",
  "Government challenge and solution sessions",
  "Technology demonstrations and pilot discussions",
  "Market-entry and cross-border partnership engagements",
];

const PATHWAY_CARDS: { type: Pathway; title: string; text: string; cta: string }[] = [
  {
    type: "seeker",
    title: "Register as a capital seeker",
    text: "For startups, scale-ups, established enterprises and project sponsors seeking investment or financing to establish, expand or scale their businesses and projects. This includes equity investment, venture capital, growth capital, debt financing, project finance and blended finance opportunities.",
    cta: "Register an opportunity",
  },
  {
    type: "capital",
    title: "Register as a capital provider",
    text: "For angel investors, venture capital and private equity firms, banks, development finance institutions, institutional investors and funds seeking to identify and engage with qualified businesses, investment propositions and projects aligned with their investment mandates.",
    cta: "Register as an investor or capital provider",
  },
  {
    type: "partner",
    title: "Register as a commercial or strategic partner",
    text: "For corporates, enterprises, procurement teams, distributors, technology providers and regional operators seeking commercial relationships, qualified suppliers, innovative solutions, distribution networks, market-entry opportunities and strategic partnerships.",
    cta: "Register as a commercial or strategic partner",
  },
  {
    type: "challenge",
    title: "Submit an institutional challenge",
    text: "For government ministries, public agencies, county governments, regulators and corporate institutions seeking innovative solutions, technical capabilities, investment or implementation partners to address defined institutional, operational, infrastructure and service-delivery priorities.",
    cta: "Submit an institutional challenge",
  },
];

/** "15–18 February 2027", or "28 February – 3 March 2027" when the event spans two months. */
function dateRange(start: string, end: string) {
  const full = { day: "numeric", month: "long", year: "numeric" } as const;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${fmtDate(start, { day: "numeric" })}–${fmtDate(end, full)}`;
  return `${fmtDate(start, { day: "numeric", month: "long" })} – ${fmtDate(end, full)}`;
}

export function DealRoomPublic({ slug }: { slug: string }) {
  const { state } = useStore();
  const event = state.events.find((e) => e.slug === slug);
  const cfg = event ? state.dealRoom.configs[event.id] : undefined;
  if (!event || !event.dealRoom?.enabled) return <div className="p-10">This event has no Deal Room.</div>;
  if (!cfg) return <div className="p-10">The Deal Room for {event.name} opens once its team has set it up.</div>;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(organiser?.name ?? event.name)).slice(0, 4).toUpperCase();
  const live = event.state === "Live";
  const r = cfg.rules;
  const open = live && state.dealRoom.clock.slice(0, 10) >= r.appOpen && state.dealRoom.clock.slice(0, 10) <= r.appClose;
  const apply = (type: Pathway) => `/e/${slug}/deal-room/apply?type=${type}`;
  // verified challenges are published: their title and owner, so businesses that could solve one apply for it
  const challenges = state.dealRoom.apps.filter((a) => a.eventId === event.id && isChallenge(a) && a.verification?.state === "Verified");
  const dates = dateRange(event.startDate, event.endDate);
  const capitalKinds = cfg.providerKinds.filter((k) => CAPITAL_KINDS.includes(k));
  const partnerKinds = cfg.providerKinds.filter((k) => PARTNER_KINDS.includes(k));

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
              <Link href="#register" className="btn btn-primary btn-cta">
                Register
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
                  <span>The Deal Room</span>
                  <span>{dates}</span>
                  <span>{event.city}</span>
                </div>
                <h1 id="dr-h">A curated platform for business, investment and strategic partnerships</h1>
                <p className="hero__lead">
                  The {event.name} Deal Room provides a platform for businesses, investors, public institutions, corporate organisations and ecosystem partners to engage around business opportunities, investment
                  propositions, commercial requirements and strategic interests.
                </p>
                <p className="hero__lead">The platform facilitates opportunity sourcing, participant qualification, counterparty matching and structured business engagements across key sectors.</p>
                <div className="btn-row">
                  {open ? (
                    <>
                      <Link href={apply("seeker")} className="btn btn-primary btn-cta">
                        Register an opportunity
                      </Link>
                      <Link href={apply("capital")} className="btn btn-secondary">
                        Register as an investor or capital provider
                      </Link>
                      <Link href="#register" className="link self-center">
                        All registration pathways
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
              <h2 id="who-h">Who should participate?</h2>
            </div>
            <div className="grid">
              {GROUPS.map((g) => (
                <div className="span-6" key={g.title}>
                  <h3 className="t-day">{g.title}</h3>
                  <p className="max-w-[60ch]">{g.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="activities" aria-labelledby="act-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="act-h">Deal Room activities</h2>
              <p>The programme will feature a range of structured business engagement formats, including:</p>
            </div>
            <div className="grid">
              {[ACTIVITIES.slice(0, 4), ACTIVITIES.slice(4)].map((half, i) => (
                <div className="span-6" key={i}>
                  <ul className="rows">
                    {half.map((x) => (
                      <li key={x}>
                        <span className="rows__name">{x}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="register" aria-labelledby="reg-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="reg-h">Participate in the {event.name} Deal Room</h2>
              <p>Applications are invited from businesses, investors, institutions and commercial partners interested in participating in the Deal Room.</p>
              <p>Participation is subject to application, qualification and programme selection.</p>
            </div>
            <h3 className="t-day">Registration pathways</h3>
            <p className="mb-6 max-w-[60ch]">Select the registration pathway that best reflects your role and the purpose of your participation in the Deal Room.</p>
            <ol className="dr-steps dr-steps--paths">
              {PATHWAY_CARDS.map((p, i) => (
                <li key={p.type}>
                  <span className="dr-steps__n">{i + 1}</span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                  {open && (
                    <Link href={apply(p.type)} className="btn btn-secondary">
                      {p.cta}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            {!open && <p className="mt-6 text-slate">{live ? "Applications are closed." : "Registration opens when the summit goes live."}</p>}
          </div>
        </section>

        <section className="section" id="qualify" aria-labelledby="qualify-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="qualify-h">How participants are qualified</h2>
              <p>Both sides are checked before anyone meets. An opportunity is scored against written criteria; an investor, partner or institution is verified.</p>
            </div>
            <div className="grid">
              <div className="span-6">
                <h3 className="t-day">Opportunity owners</h3>
                <ul className="rows">
                  {cfg.rubric.eligibility.map((c) => (
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
                <h3 className="t-day">Investors, partners and institutions</h3>
                <ul className="rows">
                  {capitalKinds.length > 0 && (
                    <li>
                      <span className="rows__name">Capital providers: {capitalKinds.join(", ")}</span>
                    </li>
                  )}
                  {partnerKinds.length > 0 && (
                    <li>
                      <span className="rows__name">Commercial and strategic partners: {partnerKinds.join(", ")}</span>
                    </li>
                  )}
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
              <h2 id="ch-h">Submit an institutional challenge</h2>
              <p>
                For government ministries, public agencies, county governments, regulators and corporate institutions seeking innovative solutions, technical capabilities, investment or implementation partners
                to address defined institutional, operational, infrastructure and service-delivery priorities. Once verified, the Deal Room team matches the challenge with businesses that can solve it, and
                the meetings happen in the Deal Room.
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
                          {a.challenge!.title}
                          <span className="block text-[13px] text-slate">
                            {a.providerKind === "Corporate buyer" ? "A corporate buyer" : a.org.name} · {a.challenge!.route}
                            {a.challenge!.budget ? ` · ${a.challenge!.budget}` : ""}
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
                      Register an opportunity
                    </Link>{" "}
                    and name it in your use of funds.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <EligibilityCheck slug={slug} sectors={cfg.sectors} countries={cfg.countries.slice(0, 9)} kinds={cfg.providerKinds} open={open} />

        <section className="section" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="how-h">How it works</h2>
            </div>
            <ol className="dr-steps">
              {[
                ["Apply and get a decision", `A reviewer scores your application against the criteria and may ask for more information. You get a reference number and see your status at any time.`],
                ["Complete your profile", `Approved businesses write a short teaser and finish their profile within ${r.profileDays} working days. Investors and partners sign the NDA once and are verified.`],
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
                  <p>
                    Verified investors and partners see only a short teaser, which you can keep anonymous. Your full profile goes to one once the Deal Room team introduces you, and each document only if you
                    tick it for them. You can see who opened what, and withdraw consent at any time.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>Can I ask for a meeting with a particular investor or partner?</h3>
                  <p>You can express interest in a teaser from the directory; the team assesses it and turns it into an introduction or declines it. Meetings are booked only between pairs who both accepted.</p>
                </div>
                <div className="faq__item">
                  <h3>How many meetings can I have?</h3>
                  <p>
                    Businesses up to {r.seekerCap} across the summit; investors and partners set their own daily cap at onboarding. Meetings are {r.meetingMin} minutes with {r.bufferMin} minutes between them.
                  </p>
                </div>
                {cfg.seekerFee.amount > 0 && (
                  <div className="faq__item">
                    <h3>Is there a fee?</h3>
                    <p>
                      Applying is free. A business that is approved pays a {feeLabel(cfg.seekerFee)} participation fee, by M-Pesa or card, from the link sent with the decision. Investors, partners and
                      institutions pay nothing.
                    </p>
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
              {event.name} Deal Room, run by {organiser?.name} · {dates} · {event.city}
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
    { q: "Post-revenue, or a bankable project", ok: !a.stage ? undefined : a.stage !== "Idea", why: "Investors and partners meet businesses with customers, or projects with contracts and studies." },
    { q: "Asking for a named transaction pathway", ok: !a.instrument ? undefined : a.instrument !== "Not sure", why: "You will be matched on the pathway you ask for: equity, debt, a contract, a pilot, a partnership or market access." },
    { q: "Legally registered", ok: !a.registered ? undefined : a.registered === "Yes", why: "A registration certificate is required with the application." },
  ];
  const providerRows = [
    {
      q: "A recognised type of investor, partner or institution",
      ok: !a.kind ? undefined : a.kind !== "Other",
      why: "Angel, venture and private-equity investors, funds, DFIs and banks; corporate buyers, distributors, technology partners, regional operators, public institutions and ecosystem partners.",
    },
    { q: "A written mandate", ok: !a.mandate ? undefined : a.mandate === "Yes", why: "You will describe sectors, countries, stages, ticket or contract range, transaction pathways and exclusions." },
  ];
  const rows = type === "seeker" ? seekerRows : providerRows;
  const answered = rows.every((r) => r.ok !== undefined);
  const pass = answered && rows.every((r) => r.ok);
  // a commercial kind goes to the partner pathway, every other kind to the capital provider pathway
  const pathway = type === "seeker" ? "seeker" : isPartnerKind(a.kind as ProviderKind) ? "partner" : "capital";

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
                I have an opportunity
              </button>
              <button role="tab" aria-selected={type === "provider"} onClick={() => setType("provider")}>
                I am an investor or partner
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
                    A written investment, sourcing or partnership mandate
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
                    <Link className="btn btn-primary btn-cta" href={`/e/${slug}/deal-room/apply?type=${pathway}${a.sector ? `&sector=${encodeURIComponent(a.sector)}` : ""}${a.country && a.country !== "Elsewhere" ? `&country=${encodeURIComponent(a.country)}` : ""}${a.instrument && a.instrument !== "Not sure" ? `&instrument=${encodeURIComponent(a.instrument)}` : ""}${type === "provider" && a.kind && a.kind !== "Other" ? `&kind=${encodeURIComponent(a.kind)}` : ""}`}>
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
