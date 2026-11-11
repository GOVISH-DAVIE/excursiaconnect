"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import { CAPITAL_KINDS, CHALLENGE_KINDS, CHALLENGE_ROUTES, OWNER_KINDS, PARTNER_KINDS, PATHWAYS, PATHWAY_COPY, ROLE_LABEL, SEEKER_DOCS, formGaps, roleOf, type DrRole } from "@/lib/dealroom/logic";
import type { ChallengeRoute, Currency, DrApplication, DrChallenge, Instrument, OwnerKind, ProviderKind, Stage } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { DocLine, UploadDoc } from "@/app/dealroom/bits";

const INSTRUMENTS: Instrument[] = PATHWAYS;
const STAGES: Stage[] = ["Bankable project", "Early revenue", "Growth", "Expansion"];
const REVENUE = ["Pre-revenue, contracted offtake", "Under USD 250k", "USD 250k to 1m", "USD 1m to 5m", "USD 5m to 20m", "Over USD 20m"];

/** The four registration pathways; capital, partner and challenge are all stored as the provider side. */
type Mode = DrRole;
const MODES: Mode[] = ["seeker", "capital", "partner", "challenge"];
const TITLE: Record<Mode, string> = {
  seeker: "Register as a capital seeker",
  capital: "Register as a capital provider",
  partner: "Register as a commercial or strategic partner",
  challenge: "Submit an institutional challenge",
};
const WHO_FOR: Record<Mode, string> = {
  seeker: "For startups, scale-ups, established enterprises and project sponsors seeking investment or financing to establish, expand or scale.",
  capital: "For angel investors, venture capital and private equity firms, banks, development finance institutions, institutional investors and funds.",
  partner: "For corporates, enterprises, procurement teams, distributors, technology providers and regional operators seeking suppliers, solutions, distribution, market entry and partnerships.",
  challenge: "For ministries, public agencies, county governments, regulators and corporate institutions with a defined institutional, operational, infrastructure or service-delivery priority.",
};
/** ?type= from the public page; the old "provider" link lands on the capital provider pathway. */
const modeFrom = (t: string | null): Mode => (t === "provider" ? "capital" : MODES.includes(t as Mode) ? (t as Mode) : "seeker");

/* ---------- the form in steps: each pathway's sections, then a review of what is still missing ---------- */
type StepKey = "org" | "ask" | "challenge" | "mandate" | "people" | "docs" | "review";
const STEPS: Record<Mode, StepKey[]> = {
  seeker: ["org", "ask", "people", "docs", "review"],
  capital: ["org", "mandate", "people", "review"],
  partner: ["org", "mandate", "people", "review"],
  challenge: ["org", "challenge", "mandate", "people", "review"],
};
const stepLabel = (k: StepKey, mode: Mode) =>
  ({
    org: "Organisation",
    ask: "Your ask",
    challenge: "The challenge",
    mandate: mode === "challenge" ? "Who could solve it" : mode === "partner" ? "What you are looking for" : "Your mandate",
    people: "Decision-maker and mission",
    docs: "Documents",
    review: "Review and submit",
  })[k];
/** Which step each item named by formGaps is filled in on; anything unknown is listed on the review. */
const GAP_STEP: Record<string, StepKey> = {
  "Legal name": "org", "Registration number": "org", Country: "org", Sector: "org", Website: "org", Organisation: "org", "Organisation type": "org", Headquarters: "org",
  "Amount sought": "ask", "Transaction pathway": "ask", "Use of funds": "ask", Stage: "ask", "Revenue band": "ask", Customers: "ask",
  Sectors: "mandate", Countries: "mandate", Stages: "mandate", "Ticket or contract range": "mandate", "Transaction pathways": "mandate", Exclusions: "mandate", "Decision timeline": "mandate",
  "Challenge title": "challenge", "The problem": "challenge", "Who has it": "challenge", "What success looks like": "challenge", "Procurement route": "challenge", "How the decision is made": "challenge", Constraints: "challenge", "Budget range": "challenge", Timeline: "challenge",
  "Decision-maker": "people", Mission: "people", "How you heard of the Deal Room": "people",
};
const stepOf = (gap: string): StepKey => GAP_STEP[gap] ?? (SEEKER_DOCS.some((d) => d.kind === gap) ? "docs" : "review");
const BLANK_CHALLENGE: DrChallenge = { title: "", problem: "", users: "", constraints: "", outcome: "", budget: "", route: "", timeline: "", decisionProcess: "" };

function blank(eventId: string, mode: Mode, email: string, phone: string, now: string): DrApplication {
  const type = mode === "seeker" ? "seeker" : "provider";
  return {
    id: `dr_${type === "seeker" ? "cs" : "fp"}_${now.replace(/\D/g, "").slice(-6)}${Math.floor(Math.random() * 1e5).toString(36)}`,
    eventId,
    type,
    mission: "",
    source: "",
    owner: "st_lead",
    org: { name: "", regNo: "", country: "", sector: "" },
    contact: { name: "", email, phone },
    decisionMaker: { name: "", title: "", email: "", phone: "" },
    ask: type === "seeker" ? { amount: 0, currency: "USD", instrument: "Equity", useOfFunds: "", stage: "Growth" } : undefined,
    traction: type === "seeker" ? { revenueBand: "", customers: "", metrics: "" } : undefined,
    mandate: type === "provider" ? { sectors: [], countries: [], stages: [], ticketMin: 0, ticketMax: 0, currency: "USD", instruments: mode === "challenge" ? ["Procurement and contracts", "Pilots and deployment"] : [], exclusions: [], timeline: "" } : undefined,
    challenge: mode === "challenge" ? { ...BLANK_CHALLENGE } : undefined,
    documents: [],
    status: "Draft",
    statusAt: now,
    decisions: [],
    recommendations: [],
    assessments: [],
    readiness: "Not ready",
    rfis: [],
    history: [{ at: now, by: "applicant", what: "Started an application" }],
  };
}

export function Apply({ slug }: { slug: string }) {
  const { state, dispatch, hydrated } = useStore();
  const search = useSearchParams();
  const router = useRouter();
  const event = state.events.find((e) => e.slug === slug);
  const dr = state.dealRoom;
  const cfg = event ? dr.configs[event.id] : undefined;
  const resumeId = search.get("resume");
  const inviteToken = search.get("invite");
  const linked = dr.apps.find((a) => (resumeId && a.id === resumeId) || (inviteToken && a.invite?.token === inviteToken));
  const [pickedMode, setMode] = useState<Mode>(modeFrom(search.get("type")));
  // a link from a pathway lands on sign-in; the bare apply page asks which pathway first, as registration asks for a ticket
  const [chosen, setChosen] = useState(() => !!search.get("type"));
  const [typed, setWho] = useState<string | null>(null);
  // a resume or invitation link fills these in once the saved state has loaded, so they are derived, not initial state
  const mode: Mode = linked ? roleOf(linked) : pickedMode;
  const choosing = !linked && !chosen;
  const type = mode === "seeker" ? "seeker" : "provider";
  const who = typed ?? (linked ? linked.contact.email || linked.contact.phone : "");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [app, setApp] = useState<DrApplication | null>(null);
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const first = useRef(true);

  // autosave: the server copy (here, the store) follows the form, so a draft resumes anywhere (PRD Applications req. 5)
  useEffect(() => {
    if (!app) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => dispatch({ type: "dr/saveDraft", app }), 500);
    return () => clearTimeout(t);
  }, [app, dispatch]);

  if (!event || !cfg) return <div className="p-10">This event has no Deal Room.</div>;
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(event.name)).slice(0, 4).toUpperCase();
  const today = dr.clock.slice(0, 10);
  const closed = event.state !== "Live" || today < cfg.rules.appOpen || today > cfg.rules.appClose;
  const saved = app ? dr.apps.find((a) => a.id === app.id) : undefined;
  const submitted = saved && !["Lead", "Invited", "Draft"].includes(saved.status);

  const signIn = () => {
    const email = who.includes("@") ? who.trim() : "";
    const phone = email ? "" : who.trim();
    const existing =
      linked ?? dr.apps.find((a) => a.eventId === event.id && a.type === type && !!a.challenge === (mode === "challenge") && ["Lead", "Invited", "Draft"].includes(a.status) && (a.contact.email.toLowerCase() === email.toLowerCase() || (!!phone && a.contact.phone === phone)));
    if (existing) {
      first.current = false;
      // a provider draft saved before its kind was picked keeps the pathway it was started on
      const was: Mode = existing.type === "provider" && !existing.challenge && !existing.providerKind ? (mode === "partner" ? "partner" : "capital") : roleOf(existing);
      setMode(was);
      // a lead or an early draft may not have the ask or traction yet: start them blank so every field can be filled
      const fill = blank(event.id, was, email, phone, dr.clock);
      const resumed = { ...existing, ask: existing.ask ?? fill.ask, traction: existing.traction ?? fill.traction, mandate: existing.mandate ?? fill.mandate, contact: { ...existing.contact, email: existing.contact.email || email, phone: existing.contact.phone || phone } };
      setApp(resumed);
      // a draft picks up where it stands: the first step with something missing, the steps before it ticked
      const ks = STEPS[was];
      const miss = formGaps(resumed, cfg).missing;
      const firstGap = ks.findIndex((k) => k !== "review" && miss.some((g) => stepOf(g) === k));
      setStep(firstGap < 0 ? ks.length - 1 : firstGap);
      setReached(ks.length - 1);
      return;
    }
    const a = blank(event.id, mode, email, phone, dr.clock);
    if (a.type === "seeker") {
      const sector = search.get("sector");
      const country = search.get("country");
      const instrument = search.get("instrument") as Instrument | null;
      if (sector) a.org.sector = sector;
      if (country) a.org.country = country;
      if (instrument && a.ask) a.ask.instrument = instrument;
    } else {
      // the eligibility check passes the kind it was given, when it belongs to this pathway
      const kind = search.get("kind") as ProviderKind | null;
      if (kind && kindsFor(mode).includes(kind)) a.providerKind = kind;
    }
    first.current = false;
    setApp(a);
    dispatch({ type: "dr/saveDraft", app: a });
  };

  const gaps = app ? formGaps(app, cfg) : { missing: [], advisory: [] };
  const steps = STEPS[mode];
  const at = Math.min(step, steps.length - 1);
  const cur = steps[at];
  const missingIn = (k: StepKey) => gaps.missing.filter((g) => stepOf(g) === k);
  const go = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
    window.scrollTo({ top: 0 });
  };
  const submit = () => {
    if (!app) return;
    setTried(true);
    dispatch({ type: "dr/saveDraft", app });
    if (formGaps(app, cfg).missing.length) return;
    dispatch({ type: "dr/submit", appId: app.id });
    router.push(`/dr/${app.id}`);
  };
  const up = (patch: Partial<DrApplication>) => setApp((a) => (a ? { ...a, ...patch } : a));
  // one person may register on more than one pathway; each is its own application, and they should know of the others
  const others = app
    ? dr.apps.filter((a) => a.id !== app.id && a.eventId === event.id && !!a.ref && ((!!app.contact.email && a.contact.email.toLowerCase() === app.contact.email.toLowerCase()) || (!!app.contact.phone && a.contact.phone === app.contact.phone)))
    : [];
  // the organisation types offered on each provider-side pathway
  function kindsFor(m: Mode): ProviderKind[] {
    if (m === "challenge") return CHALLENGE_KINDS;
    return cfg!.providerKinds.filter((k) => (m === "partner" ? PARTNER_KINDS : CAPITAL_KINDS).includes(k));
  }
  const kindOptions = app && app.providerKind && !kindsFor(mode).includes(app.providerKind) ? [...kindsFor(mode), app.providerKind] : kindsFor(mode);

  return (
    <div className="min-h-screen bg-paper brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav nav--static">
        <div className="wrap nav__bar">
          <Link href={`/e/${slug}/deal-room`} className="nav__logo">
            <span className="mark" style={{ background: accent, color: accentInk, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {mark}
            </span>
            <span className="nav__name">{event.name} Deal Room</span>
          </Link>
          <Link href={`/e/${slug}/deal-room`} className="link">
            About the Deal Room
          </Link>
        </div>
      </header>

      <main className="wrap wrap--narrow py-10 space-y-5">
        <div>
          <h1 className="h1">{choosing ? `Register for the ${event.name} Deal Room` : TITLE[mode]}</h1>
          <p className="mt-2 text-[15px] max-w-[60ch]">{choosing ? "Select the registration pathway that best reflects your role and the purpose of your participation in the Deal Room." : WHO_FOR[mode]}</p>
          <p className="mt-1 text-slate text-[15px]">
            {closed ? "Applications are closed." : `Open until ${fmtStamp(cfg.rules.appClose, false)}. Your answers save as you type.`}
            {linked?.status === "Invited" && " You were invited by the Deal Room team; your details are filled in."}
          </p>
          {!choosing && !linked && !app && !closed && hydrated && (
            <button type="button" className="link mt-3 text-[14px]" onClick={() => { setChosen(false); router.replace(`/e/${slug}/deal-room/apply`, { scroll: false }); }}>
              Choose another pathway
            </button>
          )}
        </div>

        {!hydrated ? null : closed ? (
          <Card>Applications open on {fmtStamp(cfg.rules.appOpen, false)} and close on {fmtStamp(cfg.rules.appClose, false)}.</Card>
        ) : submitted ? (
          <Card>
            This application was submitted as {saved!.ref}.{" "}
            <Link className="link" href={`/dr/${saved!.id}`}>
              See its status
            </Link>
          </Card>
        ) : choosing ? (
          <section className="surface p-6" aria-label="Registration pathways">
            {MODES.map((m) => (
              <button key={m} type="button" className="choice" aria-label={PATHWAY_COPY[m].title} onClick={() => { setMode(m); setChosen(true); router.replace(`/e/${slug}/deal-room/apply?type=${m}`, { scroll: false }); window.scrollTo({ top: 0 }); }}>
                <span className="choice__title">{ROLE_LABEL[m]}</span>
                <span className="choice__act btn btn-secondary btn-sm" aria-hidden="true">
                  {m === "challenge" ? "Submit" : "Register"} <span aria-hidden="true">→</span>
                </span>
                <span className="choice__text">{WHO_FOR[m]}</span>
              </button>
            ))}
          </section>
        ) : !app ? (
          <Card title="Sign in with a one-time code">
            <p className="-mt-1 mb-5 text-[14px] text-slate">No password. If you started an application before, the same email or phone brings it back.</p>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!codeSent) {
                  if (who.trim()) setCodeSent(true);
                } else if (code === "482913") signIn();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                <F label="Email or phone">
                  <input className="input" autoComplete="email" value={who} onChange={(e) => { setWho(e.target.value); setCodeSent(false); setCode(""); }} placeholder="you@company.com or +254…" />
                </F>
                {codeSent ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setCode("")}>
                    Send again
                  </button>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={!who.trim()}>
                    Send a code
                  </button>
                )}
              </div>
              {codeSent && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                  <F label={`Code sent to ${who}`} help={code.length === 6 && code !== "482913" ? undefined : "Prototype: the code is 482913."}>
                    <input className="input tracking-[0.3em] tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  </F>
                  <button type="submit" className="btn btn-primary" disabled={code !== "482913"}>
                    Continue
                  </button>
                </div>
              )}
              {codeSent && code.length === 6 && code !== "482913" && (
                <p role="alert" className="text-[13px] text-bad">
                  That code does not match. Check the message, or send another.
                </p>
              )}
            </form>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate">
              <span>{saved?.draftSavedAt ? `Draft saved ${fmtStamp(saved.draftSavedAt)}` : "Not saved yet"}</span>
              <span>
                Continue on another device:{" "}
                <Link className="link" href={`/e/${slug}/deal-room/apply?resume=${app.id}`}>
                  /deal-room/apply?resume={app.id}
                </Link>
              </span>
            </div>

            {others.length > 0 && (
              <p className="rounded-md bg-paper-200 px-4 py-3 text-[14px]">
                {others.map((o, i) => (
                  <span key={o.id}>
                    {i === 0 ? "This email or phone also has " : " and "}a {ROLE_LABEL[roleOf(o)].toLowerCase()} application, {o.ref} (
                    <Link className="link" href={`/dr/${o.id}`}>
                      its status
                    </Link>
                    )
                  </span>
                ))}
                . This one is separate.
              </p>
            )}

            <nav aria-label="Application steps">
              <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[14px]">
                {steps.map((k, i) => {
                  const done = k !== "review" && i <= reached && i !== at && missingIn(k).length === 0;
                  return (
                    <li key={k} className="flex items-center gap-1.5 sm:gap-2">
                      <button type="button" onClick={() => go(i)} aria-current={i === at ? "step" : undefined} aria-label={`Step ${i + 1}: ${stepLabel(k, mode)}${done ? ", complete" : ""}`} className={`flex items-center gap-2 ${i === at ? "text-ink font-medium" : "text-slate hover:text-ink"}`}>
                        <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-[13px] ${i === at ? "bg-ink text-white" : done ? "bg-ok text-white" : "bg-line-strong text-ink"}`}>{done ? "✓" : i + 1}</span>
                        <span className={i === at ? "hidden sm:inline" : "sr-only lg:not-sr-only"}>{stepLabel(k, mode)}</span>
                      </button>
                      {i < steps.length - 1 && <span className="w-3 sm:w-5 h-px bg-line-strong" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-[14px] sm:hidden">
                <span className="text-slate">
                  Step {at + 1} of {steps.length}:
                </span>{" "}
                <span className="font-medium">{stepLabel(cur, mode)}</span>
              </p>
            </nav>

            {cur === "org" && (
              <>
                <Card title="Your organisation">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Legal name">
                      <input className="input" value={app.org.name} onChange={(e) => up({ org: { ...app.org, name: e.target.value } })} />
                    </F>
                    {type === "seeker" ? (
                      <>
                        <F label="Registration number">
                          <input className="input" value={app.org.regNo} onChange={(e) => up({ org: { ...app.org, regNo: e.target.value } })} />
                        </F>
                        <F label="Kind of organisation">
                          <select className="input" value={app.ownerKind ?? ""} onChange={(e) => up({ ownerKind: (e.target.value || undefined) as OwnerKind | undefined })}>
                            <option value="">Choose</option>
                            {OWNER_KINDS.map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </F>
                      </>
                    ) : (
                      <F label={mode === "capital" ? "Type of investor" : "Type of organisation"}>
                        <select className="input" value={app.providerKind ?? ""} onChange={(e) => up({ providerKind: (e.target.value || undefined) as ProviderKind | undefined })}>
                          <option value="">Choose</option>
                          {kindOptions.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </F>
                    )}
                    <F label={type === "seeker" ? "Country" : "Headquarters"}>
                      <select className="input" value={app.org.country} onChange={(e) => up({ org: { ...app.org, country: e.target.value } })}>
                        <option value="">Choose</option>
                        {cfg.countries.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </F>
                    {type === "seeker" && (
                      <F label="Sector">
                        <select className="input" value={app.org.sector} onChange={(e) => up({ org: { ...app.org, sector: e.target.value } })}>
                          <option value="">Choose</option>
                          {cfg.sectors.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </F>
                    )}
                    <F label="Website" help={cfg.fields["org.website"] === "advisory" ? "Optional" : undefined}>
                      <input className="input" type="url" placeholder="https://" value={app.org.website ?? ""} onChange={(e) => up({ org: { ...app.org, website: e.target.value } })} />
                    </F>
                    <F label="Your name">
                      <input className="input" value={app.contact.name} onChange={(e) => up({ contact: { ...app.contact, name: e.target.value } })} />
                    </F>
                    <F label={app.contact.email ? "Your phone" : "Your email"}>
                      {app.contact.email ? (
                        <input className="input" type="tel" value={app.contact.phone} onChange={(e) => up({ contact: { ...app.contact, phone: e.target.value } })} />
                      ) : (
                        <input className="input" type="email" value={app.contact.email} onChange={(e) => up({ contact: { ...app.contact, email: e.target.value } })} />
                      )}
                    </F>
                  </div>
                </Card>
              </>
            )}

            {cur === "ask" && (
              <>
                {type === "seeker" && app.ask && app.traction && (
                  <Card title="What you are raising">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <F label="Amount">
                        <div className="flex gap-2">
                          <select className="input w-24" aria-label="Currency" value={app.ask.currency} onChange={(e) => up({ ask: { ...app.ask!, currency: e.target.value as Currency } })}>
                            <option>USD</option>
                            <option>KES</option>
                          </select>
                          <input className="input" type="number" min={0} value={app.ask.amount || ""} onChange={(e) => up({ ask: { ...app.ask!, amount: Number(e.target.value) } })} />
                        </div>
                      </F>
                      <F label="Transaction pathway">
                        <select className="input" value={app.ask.instrument} onChange={(e) => up({ ask: { ...app.ask!, instrument: e.target.value as Instrument } })}>
                          {INSTRUMENTS.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </F>
                      <F label="Stage">
                        <select className="input" value={app.ask.stage} onChange={(e) => up({ ask: { ...app.ask!, stage: e.target.value as Stage } })}>
                          {STAGES.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </F>
                      <F label="Revenue last year">
                        <select className="input" value={app.traction.revenueBand} onChange={(e) => up({ traction: { ...app.traction!, revenueBand: e.target.value } })}>
                          <option value="">Choose</option>
                          {REVENUE.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </F>
                      <F label="Use of funds" span>
                        <textarea className="input min-h-20" value={app.ask.useOfFunds} onChange={(e) => up({ ask: { ...app.ask!, useOfFunds: e.target.value } })} />
                      </F>
                      <F label="Customers" help="Optional, for example 1,200 retail customers">
                        <input className="input" value={app.traction.customers} onChange={(e) => up({ traction: { ...app.traction!, customers: e.target.value } })} />
                      </F>
                      <F label="Key metrics" help="Optional">
                        <input className="input" value={app.traction.metrics} onChange={(e) => up({ traction: { ...app.traction!, metrics: e.target.value } })} />
                      </F>
                    </div>
                  </Card>
                )}
              </>
            )}

            {cur === "challenge" && app.challenge && <ChallengeFields c={app.challenge} onChange={(challenge) => up({ challenge })} />}

            {cur === "mandate" && app.mandate && <MandateFields app={app} partner={mode === "partner"} sectors={cfg.sectors} countries={cfg.countries} onChange={(mandate) => up({ mandate })} />}

            {cur === "people" && (
              <>
                <Card title="The decision-maker">
                  <p className="-mt-1 mb-3 text-[13px] text-slate">The person who can commit {type === "seeker" ? "the company" : "your organisation"} and who will attend the meetings.</p>
                  <label className="flex items-center gap-2 text-[14px] mb-3">
                    <input type="checkbox" checked={!!app.contact.name && app.decisionMaker.name === app.contact.name} onChange={(e) => up({ decisionMaker: e.target.checked ? { ...app.contact, title: app.decisionMaker.title } : { name: "", title: "", email: "", phone: "" } })} />
                    That is me
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Name">
                      <input className="input" value={app.decisionMaker.name} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, name: e.target.value } })} />
                    </F>
                    <F label="Title">
                      <input className="input" value={app.decisionMaker.title} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, title: e.target.value } })} />
                    </F>
                    <F label="Email">
                      <input className="input" type="email" value={app.decisionMaker.email} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, email: e.target.value } })} />
                    </F>
                    <F label="Phone">
                      <input className="input" type="tel" value={app.decisionMaker.phone} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, phone: e.target.value } })} />
                    </F>
                  </div>
                </Card>

                <Card title="Mission and how you heard of us">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Mission">
                      <select className="input" value={app.mission} onChange={(e) => up({ mission: e.target.value, track: undefined })}>
                        <option value="">Choose</option>
                        {cfg.missions.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.code} {m.name}
                          </option>
                        ))}
                      </select>
                    </F>
                    {type === "seeker" && (
                      <F label="Strategic track">
                        <select className="input" value={app.track ?? ""} disabled={!app.mission} onChange={(e) => up({ track: e.target.value || undefined })}>
                          <option value="">{app.mission ? "Choose" : "Choose a mission first"}</option>
                          {cfg.tracks
                            .filter((t) => t.missionId === app.mission)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.code} {t.name}
                              </option>
                            ))}
                        </select>
                      </F>
                    )}
                    <F label="How you heard of the Deal Room">
                      <select className="input" value={app.source} onChange={(e) => up({ source: e.target.value })}>
                        <option value="">Choose</option>
                        {cfg.sources.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </F>
                  </div>
                </Card>
              </>
            )}

            {cur === "docs" && (
              <>
                {type === "seeker" && (
                  <Card title="Documents">
                    <p className="-mt-1 mb-2 text-[13px] text-slate">Up to 25 MB each. Nothing is shared with an investor or partner until you consent, per document and per counterparty.</p>
                    {SEEKER_DOCS.map((d) => {
                      const have = app.documents.filter((x) => x.kind === d.kind);
                      return (
                        <div key={d.kind} className="py-2 border-b border-line last:border-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[14px] font-medium">
                              {d.kind}
                              {cfg.fields[d.key] !== "required" && <span className="ml-1 font-normal text-slate">optional</span>}
                            </span>
                            <UploadDoc kind={d.kind} at={dr.clock} label={have.length ? "Add another" : "Upload"} onDone={(doc) => up({ documents: [...app.documents, doc] })} />
                          </div>
                          {have.map((h) => (
                            <DocLine key={h.id} doc={h}>
                              <button className="btn-quiet text-bad" onClick={() => up({ documents: app.documents.filter((x) => x.id !== h.id) })}>
                                Remove
                              </button>
                            </DocLine>
                          ))}
                        </div>
                      );
                    })}
                  </Card>
                )}
              </>
            )}

            {cur === "review" ? (
              <Card title="Review and submit">
                <ul className="divide-y divide-line">
                  {steps
                    .filter((k) => k !== "review")
                    .map((k) => {
                      const miss = missingIn(k);
                      return (
                        <li key={k} className="flex items-start justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <div className="text-[15px] font-medium">{stepLabel(k, mode)}</div>
                            <div className={`text-[13px] ${miss.length ? "text-bad" : "text-slate"}`}>{miss.length ? `Missing: ${miss.join(", ")}` : "Complete"}</div>
                          </div>
                          <button type="button" className="link shrink-0 text-[14px]" onClick={() => go(steps.indexOf(k))}>
                            {miss.length ? "Complete it" : "Edit"}
                          </button>
                        </li>
                      );
                    })}
                </ul>
                {missingIn("review").length > 0 && <p className="mt-2 text-[13px] text-bad">Also missing: {missingIn("review").join(", ")}.</p>}
                {tried && gaps.missing.length > 0 && (
                  <div role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
                    Still needed before you can submit: {gaps.missing.join(", ")}.
                  </div>
                )}
                {gaps.advisory.length > 0 && <p className="mt-3 text-[13px] text-slate">Worth adding, not required: {gaps.advisory.join(", ")}.</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[13px] text-slate">
                    {mode === "challenge" ? "After you submit, you upload registration documents and sign the NDA from your status page. Once verified, the team matches your challenge with businesses that can solve it." : type === "provider" ? "After you submit, you upload KYC documents and sign the NDA from your status page." : "You get a reference number and a status page at once."}
                  </span>
                  <button className="btn btn-primary btn-cta" onClick={submit}>
                    {mode === "challenge" ? "Submit the challenge" : "Submit the application"}
                  </button>
                </div>
              </Card>
            ) : (
              missingIn(cur).length > 0 && reached > at && <p className="text-[13px] text-slate">Still to fill in on this step: {missingIn(cur).join(", ")}.</p>
            )}

            <div className="flex items-center justify-between gap-3">
              {at > 0 ? (
                <button type="button" className="btn btn-secondary" onClick={() => go(at - 1)}>
                  Back
                </button>
              ) : (
                <span />
              )}
              {cur !== "review" && (
                <button type="button" className="btn btn-primary" onClick={() => go(at + 1)}>
                  {steps[at + 1] === "review" ? "Review" : "Next"}
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="surface p-5">
      {title && <h2 className="h2 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

function F({ label, help, span, children }: { label: string; help?: string; span?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${span ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[12px] text-slate">{help}</span>}
    </label>
  );
}

/** A labelled group for controls that are not a single input, so tapping its label does not toggle the first option. */
function G({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[12px] text-slate">{help}</span>}
    </div>
  );
}

/**
 * Several choices from a list. Short lists stay as chips everywhere; a long one (sectors, countries, pathways)
 * is chips from 640 wide and, on a phone, one field that opens a sheet of checkboxes with the picks shown underneath.
 */
function MultiSelect<T extends string>({ label, all, value, onChange }: { label: string; all: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  const long = all.length > 6;
  const toggle = (x: T) => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x]);
  return (
    <G label={label}>
      <div className={long ? "hidden sm:block" : ""}>
        <Chips all={all} value={value} onChange={onChange} />
      </div>
      {long && <PhonePicker label={label} all={all} value={value} onToggle={toggle} onChange={onChange} />}
    </G>
  );
}

function PhonePicker<T extends string>({ label, all, value, onToggle, onChange }: { label: string; all: readonly T[]; value: T[]; onToggle: (x: T) => void; onChange: (v: T[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // the page behind stays put while the sheet is open, and Escape closes it
  useEffect(() => {
    if (!open) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const shown = q.trim() ? all.filter((x) => x.toLowerCase().includes(q.trim().toLowerCase())) : all;
  const summary = !value.length ? "Choose" : value.length <= 2 ? value.join(", ") : `${value.length} selected`;
  return (
    <div className="sm:hidden">
      <button type="button" className="input flex items-center justify-between gap-2 text-left" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className={`truncate ${value.length ? "text-ink" : "text-mute"}`}>{summary}</span>
        <span aria-hidden="true" className="text-slate">
          ▾
        </span>
      </button>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((x) => (
            <button type="button" key={x} className="pill bg-ink text-white" aria-label={`Remove ${x}`} onClick={() => onToggle(x)}>
              {x} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end">
            <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" onClick={() => setOpen(false)} />
            <div role="dialog" aria-modal="true" aria-label={label} className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-[16px] font-medium">{label}</span>
                <span className="text-[13px] text-slate">{value.length} selected</span>
              </div>
              {all.length > 10 && (
                <div className="px-4 pt-3">
                  <input className="input" type="search" placeholder={`Search ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              )}
              <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
                {shown.map((x) => (
                  <li key={x}>
                    <label className="flex min-h-12 items-center gap-3 border-b border-line px-2 py-2 text-[15px] last:border-0">
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--action)]" checked={value.includes(x)} onChange={() => onToggle(x)} />
                      <span>{x}</span>
                    </label>
                  </li>
                ))}
                {!shown.length && <li className="px-2 py-4 text-[14px] text-slate">Nothing matches.</li>}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <button type="button" className="btn-quiet" disabled={!value.length} onClick={() => onChange([])}>
                  Clear
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Chips<T extends string>({ all, value, onChange }: { all: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((x) => (
        <button type="button" key={x} aria-pressed={value.includes(x)} className={`pill ${value.includes(x) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`} onClick={() => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x])}>
          {x}
        </button>
      ))}
    </div>
  );
}

/** The problem a public institution or corporate buyer brings, in the paper's challenge-intake terms. */
export function ChallengeFields({ c, onChange }: { c: DrChallenge; onChange: (c: DrChallenge) => void }) {
  const set = (k: keyof DrChallenge) => (e: { target: { value: string } }) => onChange({ ...c, [k]: e.target.value });
  return (
    <Card title="Your challenge">
      <p className="-mt-1 mb-3 text-[13px] text-slate">Describe the problem, not a solution. Businesses see the title and problem once you are verified; the rest is shared with those you agree to meet.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Challenge title" span>
          <input className="input" value={c.title} placeholder="Faster, cheaper identity checks at county service centres" onChange={set("title")} />
        </F>
        <F label="The problem" span>
          <textarea className="input min-h-20" value={c.problem} onChange={set("problem")} />
        </F>
        <F label="Who has it" help="The users or citizens affected, and how many">
          <input className="input" value={c.users} onChange={set("users")} />
        </F>
        <F label="What success looks like" help="A measurable outcome">
          <input className="input" value={c.outcome} onChange={set("outcome")} />
        </F>
        <F label="Constraints" help="Optional: data rules, systems to integrate, languages, regulation" span>
          <input className="input" value={c.constraints} onChange={set("constraints")} />
        </F>
        <F label="Procurement route">
          <select className="input" value={c.route} onChange={(e) => onChange({ ...c, route: e.target.value as ChallengeRoute | "" })}>
            <option value="">Choose</option>
            {CHALLENGE_ROUTES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </F>
        <F label="Budget range" help="Optional, for example USD 200k to 500k">
          <input className="input" value={c.budget} onChange={set("budget")} />
        </F>
        <F label="Timeline" help="Optional, for example pilot from June 2027">
          <input className="input" value={c.timeline} onChange={set("timeline")} />
        </F>
        <F label="How the decision is made" help="Who signs off, and the steps to a contract">
          <input className="input" value={c.decisionProcess} onChange={set("decisionProcess")} />
        </F>
      </div>
    </Card>
  );
}

export function MandateFields({ app, partner: asPartner, sectors, countries, onChange }: { app: DrApplication; partner?: boolean; sectors: string[]; countries: string[]; onChange: (m: NonNullable<DrApplication["mandate"]>) => void }) {
  const m = app.mandate!;
  const ch = !!app.challenge;
  // a partner buys, distributes or partners: its range is a contract size, not a ticket
  const partner = !ch && (asPartner ?? roleOf(app) === "partner");
  // typed as free text and split on leaving the field, so a comma can be typed
  const [excl, setExcl] = useState(m.exclusions.join(", "));
  return (
    <Card title={ch ? "Who could solve it" : partner ? "What you are looking for" : "Your mandate"}>
      {partner && <p className="-mt-1 mb-3 text-[13px] text-slate">Matching uses these: the sectors, countries and stages of the businesses you want to work with, the pathways you offer and the contract size.</p>}
      {ch && <p className="-mt-1 mb-3 text-[13px] text-slate">Matching uses these: the sectors, countries and stages of the businesses you want to meet, the pathways open to them and the contract size.</p>}
      <div className="grid gap-4">
        <MultiSelect label="Sectors" all={sectors} value={m.sectors} onChange={(sectors) => onChange({ ...m, sectors })} />
        <MultiSelect label="Countries" all={countries} value={m.countries} onChange={(countries) => onChange({ ...m, countries })} />
        <MultiSelect label="Stages" all={STAGES} value={m.stages} onChange={(stages) => onChange({ ...m, stages })} />
        <MultiSelect label="Transaction pathways" all={INSTRUMENTS} value={m.instruments} onChange={(instruments) => onChange({ ...m, instruments })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Currency">
            <select className="input" value={m.currency} onChange={(e) => onChange({ ...m, currency: e.target.value as Currency })}>
              <option>USD</option>
              <option>KES</option>
            </select>
          </F>
          <F label={ch ? "Smallest contract or pilot" : partner ? "Smallest contract" : "Smallest ticket"}>
            <input className="input" type="number" min={0} value={m.ticketMin || ""} onChange={(e) => onChange({ ...m, ticketMin: Number(e.target.value) })} />
          </F>
          <F label={ch || partner ? "Largest contract" : "Largest ticket"}>
            <input className="input" type="number" min={0} value={m.ticketMax || ""} onChange={(e) => onChange({ ...m, ticketMax: Number(e.target.value) })} />
          </F>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Exclusions" help="Comma-separated, for example coal, tobacco. Optional but checked in matching.">
            <input className="input" value={excl} onChange={(e) => setExcl(e.target.value)} onBlur={() => onChange({ ...m, exclusions: excl.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </F>
          {!ch && (
            <F label="Typical decision timeline" help="Optional">
              <input className="input" value={m.timeline} placeholder="2 to 3 months" onChange={(e) => onChange({ ...m, timeline: e.target.value })} />
            </F>
          )}
        </div>
      </div>
    </Card>
  );
}
