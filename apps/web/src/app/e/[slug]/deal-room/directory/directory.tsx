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
import { Panel, ParticipantPage, Teaser } from "../participant";

export function DirectoryPage({ slug }: { slug: string }) {
  return (
    <ParticipantPage slug={slug} page="directory" title="Deal Room directory" signIn="Sign in to browse the directory">
      <Body slug={slug} />
    </ParticipantPage>
  );
}

const STATUS: Record<Exclude<DirectoryEntry["interest"], "none" | "introduced">, string> = {
  sent: "With the Deal Room team",
  preparing: "The team is preparing an introduction",
  closed: "Not taken forward",
};

function Body({ slug }: { slug: string }) {
  const q = useDirectory(slug, true);
  const interest = useInterest(slug);
  const [f, setF] = useState({ sector: "", country: "", band: "", pathway: "" });
  if (q.isPending) return <Panel>Loading…</Panel>;
  if (q.isError) return <Panel>{q.error.message}</Panel>;
  const d = q.data;
  if (!d.me) return <Panel title="The directory isn't open to you">{<p className="text-[14px] text-slate">{d.reason}</p>}</Panel>;
  const list = d.teasers.filter((t) => (!f.sector || t.sector === f.sector) && (!f.country || t.country === f.country) && (!f.band || t.askBand === f.band) && (!f.pathway || t.pathway === f.pathway));
  const select = (key: keyof typeof f, label: string, any: string, options: string[]) => (
    <select className="input h-10 text-[14px]" aria-label={label} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
      <option value="">{any}</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
  return (
    <>
      <p className="-mt-3 text-[14px] text-slate">
        {d.me.org} · {d.event.name} Deal Room
      </p>
      <Panel title={`${list.length} ${list.length === 1 ? "business" : "businesses"} ready to meet`}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {select("sector", "Sector", "Any sector", d.filters.sectors)}
          {select("country", "Country", "Any country", d.filters.countries)}
          {select("band", "Ask", "Any ask", d.filters.bands)}
          {select("pathway", "Pathway", "Any pathway", d.filters.pathways)}
        </div>
        <p className="mt-3 text-[12px] text-slate">
          Teasers only. Expressing interest asks the Deal Room team for an introduction. The full profile opens with the introduction, and documents only once the business shares them with you.
        </p>
      </Panel>
      {interest.error && (
        <p role="alert" className="rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {interest.error.message}
        </p>
      )}
      {list.length === 0 && <Panel>{d.teasers.length ? "No business matches these filters." : "No teaser is published yet. Businesses appear here once the Deal Room team approves them."}</Panel>}
      {list.map((t) => (
        <Teaser key={t.seekerId} t={t}>
          {t.interest === "none" ? (
            <button className="btn-secondary btn-sm" disabled={interest.isPending} onClick={() => interest.mutate(t.seekerId)}>
              {interest.isPending && interest.variables === t.seekerId ? "Sending…" : "Express interest"}
            </button>
          ) : t.interest === "introduced" ? (
            <Link href={`/e/${slug}/deal-room/introductions`} className="link text-[14px]">
              Introduced: see My introductions
            </Link>
          ) : (
            <span className={`pill ${t.interest === "closed" ? "bg-paper-200 text-slate" : "bg-ok-50 text-ok"}`}>{STATUS[t.interest]}</span>
          )}
        </Teaser>
      ))}
    </>
  );
}
