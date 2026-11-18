"use client";

/**
 * The Deal Room directory (M3.1, FP-5 and FP-6): the approved teasers of Deal Room Ready businesses, for verified
 * investors and partners. Teasers only; an expression of interest goes to the Deal Room team as a suggestion, never
 * as an introduction, and the business's profile and documents open only with one.
 */
import Link from "next/link";
import { useState } from "react";
import type { DirectoryEntry } from "@excursia/contracts/matching";
import { useDirectory, useInterest } from "@/features/matching/hooks/use-teaser";
import { Panel, ParticipantPage, Skeleton, Teaser } from "../participant";

export function DirectoryPage({ slug }: { slug: string }) {
  return (
    <ParticipantPage
      slug={slug}
      page="directory"
      title="Directory"
      lede="Businesses the Deal Room team has approved, ready to meet. You see their teasers; the full profile opens with an introduction, and documents only once the business shares them."
      signIn="Sign in to browse the directory"
      wide
    >
      <Body slug={slug} />
    </ParticipantPage>
  );
}

const STATUS: Record<Exclude<DirectoryEntry["interest"], "none" | "introduced">, { label: string; tone: string }> = {
  sent: { label: "With the Deal Room team", tone: "bg-paper-200 text-ink" },
  preparing: { label: "Introduction being prepared", tone: "bg-ok-50 text-ok" },
  closed: { label: "Not taken forward", tone: "bg-paper-200 text-slate" },
};

type Filters = { sector: string; country: string; band: string; pathway: string };
const NONE: Filters = { sector: "", country: "", band: "", pathway: "" };

function Body({ slug }: { slug: string }) {
  const q = useDirectory(slug, true);
  const interest = useInterest(slug);
  const [f, setF] = useState<Filters>(NONE);
  const [showFilters, setShowFilters] = useState(false);
  if (q.isPending) return <Skeleton rows={5} />;
  if (q.isError)
    return (
      <Panel title="The directory didn't load">
        <p className="mb-4 text-[15px] text-slate">{q.error.message}</p>
        <button className="btn-secondary" onClick={() => q.refetch()}>
          Try again
        </button>
      </Panel>
    );
  const d = q.data;
  if (!d.me)
    return (
      <Panel title="The directory isn't open to you yet">
        <p className="max-w-[60ch] text-[15px] text-slate">{d.reason}</p>
        <Link href={`/e/${slug}/deal-room/apply`} className="btn-secondary mt-4">
          See your application
        </Link>
      </Panel>
    );
  const list = d.teasers.filter((t) => (!f.sector || t.sector === f.sector) && (!f.country || t.country === f.country) && (!f.band || t.askBand === f.band) && (!f.pathway || t.pathway === f.pathway));
  const active = Object.values(f).filter(Boolean).length;
  const select = (key: keyof Filters, label: string, any: string, options: string[]) => (
    <label className="block" key={key}>
      <span className="label">{label}</span>
      <select className="input" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  const filters = (
    <div className="space-y-3">
      {select("sector", "Sector", "Any sector", d.filters.sectors)}
      {select("country", "Country", "Any country", d.filters.countries)}
      {select("band", "Ask", "Any size", d.filters.bands)}
      {select("pathway", "Pathway", "Any pathway", d.filters.pathways)}
      {active > 0 && (
        <button className="btn-quiet btn-sm -ml-3" onClick={() => setF(NONE)}>
          Clear the filters
        </button>
      )}
    </div>
  );
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <aside className="min-w-0 lg:sticky lg:top-[calc(var(--ptop)+24px)]" aria-label="Filters">
        {/* a phone folds the filters away behind one button; a big screen keeps them in view */}
        <button className="btn-secondary w-full justify-between lg:hidden" aria-expanded={showFilters} aria-controls="directory-filters" onClick={() => setShowFilters(!showFilters)}>
          <span>Filters{active ? ` (${active})` : ""}</span>
          <span aria-hidden="true">{showFilters ? "Hide" : "Show"}</span>
        </button>
        <div id="directory-filters" className={`surface mt-3 p-5 lg:mt-0 lg:block ${showFilters ? "block" : "hidden"}`}>
          <p className="mb-3 text-[13px] text-slate">{d.me.org}</p>
          {filters}
        </div>
      </aside>
      <div className="min-w-0 space-y-4">
        <p className="text-[15px]" aria-live="polite">
          <b className="font-medium">{list.length}</b> {list.length === 1 ? "business" : "businesses"} ready to meet
          {active > 0 && <span className="text-slate"> of {d.teasers.length}</span>}
        </p>
        {interest.error && (
          <p role="alert" className="rounded-[var(--r-sm)] bg-bad-50 px-3 py-2 text-[14px] text-bad">
            {interest.error.message}
          </p>
        )}
        {list.length === 0 && (
          <Panel>
            <p className="text-[15px] text-slate">
              {d.teasers.length ? "No business matches these filters." : "No teaser is published yet. Businesses appear here once the Deal Room team approves them."}
            </p>
            {active > 0 && (
              <button className="btn-secondary btn-sm mt-3" onClick={() => setF(NONE)}>
                Clear the filters
              </button>
            )}
          </Panel>
        )}
        {list.map((t) => (
          <Teaser key={t.seekerId} t={t}>
            <div className="flex flex-wrap items-center gap-3">
              {t.interest === "none" ? (
                <button className="btn-secondary btn-sm" disabled={interest.isPending} onClick={() => interest.mutate(t.seekerId)}>
                  {interest.isPending && interest.variables === t.seekerId ? "Sending…" : "Express interest"}
                </button>
              ) : t.interest === "introduced" ? (
                <Link href={`/e/${slug}/deal-room/introductions`} className="link text-[14px]">
                  Introduced: see your introductions
                </Link>
              ) : (
                <span className={`pill ${STATUS[t.interest].tone}`}>{STATUS[t.interest].label}</span>
              )}
              {t.interest === "none" && <span className="text-[13px] text-slate">Asks the Deal Room team for an introduction</span>}
            </div>
          </Teaser>
        ))}
      </div>
    </div>
  );
}
