"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { MATCH_LABEL, blockedPair, candidates, compact, drCan, matchStage, matchable, missionName, staffName, type MatchStage } from "@/lib/dealroom/logic";
import type { DrApplication } from "@/lib/dealroom/types";
import { downloadCsv, row } from "@/lib/csv";
import { fmtStamp } from "@/lib/time";
import { Pill, Refusal, typeLabel, useDr } from "../bits";
import { stageTone } from "../stage";

const tabs = ["Find matches", "Suggestions", "By mission"] as const;

/** DR-7, DR-10, DL-7: the system proposes and explains; a reviewer decides; nothing is ever matched on its own. */
export default function Matching() {
  const { dr, cfg, me } = useDr();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Find matches");
  if (!cfg) return null;
  if (!drCan(me, "match")) return <Refusal title="Matching is for the lead and reviewers">Operations schedules the matches once both parties accept.</Refusal>;
  const suggestions = dr.matches.filter((m) => m.decision === "Suggested").length;
  return (
    <>
      <PageHeader title="Matching" kicker="Only Deal Room Ready seekers and verified providers are searched. Every pair shows what it meets and misses; a person approves, rejects or defers it." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} counts={{ Suggestions: suggestions }} />
      {tab === "Find matches" && <Find />}
      {tab === "Suggestions" && <Suggestions />}
      {tab === "By mission" && <ByMission />}
    </>
  );
}

function Find() {
  const { dr, cfg, now } = useDr();
  const [side, setSide] = useState<"seeker" | "provider">("seeker");
  const [mission, setMission] = useState("All");
  const [pickedId, setPickedId] = useState<string>("");
  const pool = dr.apps.filter((a) => a.eventId === cfg!.eventId && a.type === side && matchable(a) && (mission === "All" || a.mission === mission));
  const picked = dr.apps.find((a) => a.id === pickedId) ?? pool[0];
  const list = picked && cfg ? candidates(dr, cfg, picked) : [];
  if (!cfg) return null;
  const count = (a: DrApplication) => dr.matches.filter((m) => (m.seekerId === a.id || m.providerId === a.id) && m.decision === "Approved").length;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Section title="Who" flush>
        <div className="px-5 pb-3 grid gap-2">
          <div className="dr-toggle !mb-0" role="tablist">
            <button role="tab" aria-selected={side === "seeker"} onClick={() => { setSide("seeker"); setPickedId(""); }}>
              Seekers
            </button>
            <button role="tab" aria-selected={side === "provider"} onClick={() => { setSide("provider"); setPickedId(""); }}>
              Providers
            </button>
          </div>
          <select className="input h-9 text-[13px]" value={mission} onChange={(e) => { setMission(e.target.value); setPickedId(""); }}>
            <option value="All">All missions</option>
            {cfg.missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} {m.name}
              </option>
            ))}
          </select>
        </div>
        <ul className="max-h-[560px] overflow-auto">
          {pool.map((a) => (
            <li key={a.id}>
              <button className={`w-full text-left px-5 py-2.5 border-b border-line text-[13px] hover:bg-paper ${picked?.id === a.id ? "bg-paper font-medium" : ""}`} onClick={() => setPickedId(a.id)}>
                {a.org.name}
                <span className="block text-[12px] text-slate font-normal">
                  {typeLabel(a)} · {a.type === "seeker" ? `${a.org.sector}, ${a.ask ? compact(a.ask.amount, a.ask.currency) : ""}` : a.mandate ? `${compact(a.mandate.ticketMin)} to ${compact(a.mandate.ticketMax)}` : ""} · {count(a)} approved
                </span>
              </button>
            </li>
          ))}
          {pool.length === 0 && <li className="px-5 py-4 text-[13px] text-slate">No one is matchable here yet.</li>}
        </ul>
      </Section>
      {picked ? (
        <Section
          title={`Candidates for ${picked.org.name}`}
          flush
          action={<span className="text-[12px] text-slate">Ordered by {cfg.ordering === "criteria" ? "criteria met, then readiness" : "readiness, then criteria met"} (set by the lead)</span>}
        >
          {list.length === 0 ? (
            <div className="p-5">
              <Empty>No suitable match: nobody on the other side is ready and verified. The system does not force one.</Empty>
            </div>
          ) : (
            <ul>
              {list.map((c) => (
                <CandidateRow key={c.other.id} c={c} now={now} />
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <Empty>Pick a seeker or a provider.</Empty>
      )}
    </div>
  );
}

function CandidateRow({ c, now }: { c: ReturnType<typeof candidates>[number]; now: string }) {
  const { dr, cfg, me, dispatch } = useDr();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const blocked = blockedPair(dr, c.seeker.id, c.provider.id, cfg!);
  const needsNote = c.mandatoryMiss.length > 0 || !!c.exclusionHit;
  const existing = c.existing;
  const stage = existing ? matchStage(existing, cfg!, now) : undefined;
  const decide = (decision: "Approved" | "Rejected" | "Deferred") => {
    dispatch({ type: "dr/matchDecide", seekerId: c.seeker.id, providerId: c.provider.id, decision, note, override: blocked ? override : undefined });
    setOpen(false);
    setNote("");
  };
  return (
    <li className="px-5 py-3 border-b border-line last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[14px]">
            {c.other.org.name} <span className="font-normal text-slate">· {typeLabel(c.other)}, {c.other.org.country}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {c.met.map((f) => (
              <span key={f} className="pill bg-ok-50 text-ok">
                ✓ {MATCH_LABEL[f]}
              </span>
            ))}
            {c.missed.map((f) => (
              <span key={f} className={`pill ${c.mandatoryMiss.includes(f) ? "bg-bad-50 text-bad" : "bg-paper-200 text-slate"}`}>
                ✗ {MATCH_LABEL[f]}
                {f === "exclusions" && c.exclusionHit ? `: ${c.exclusionHit}` : ""}
              </span>
            ))}
            <span className="pill bg-paper-200 text-slate">Readiness {c.readiness || "–"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {existing && (
            <Link href={`/dealroom/matches/${existing.id}`} className="inline-flex">
              <Pill tone={stageTone[stage!]}>{stage}</Pill>
            </Link>
          )}
          {(!existing || existing.decision !== "Approved" || blocked) && (
            <button className="btn-secondary btn-sm" onClick={() => setOpen(!open)}>
              {existing ? "Decide again" : "Decide"}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 rounded-md bg-paper p-3 grid gap-2">
          {blocked && (
            <p className="text-[13px] text-bad">
              This pair was {blocked.toLowerCase()} before. {me?.role === "Lead" ? "Re-proposing it needs your reason, logged as an exception." : "Only the lead can re-propose it."}
            </p>
          )}
          {blocked && me?.role === "Lead" && <input className="input h-9 text-[13px]" placeholder="Why re-propose (logged)" value={override} onChange={(e) => setOverride(e.target.value)} />}
          <input className="input h-9 text-[13px]" placeholder={needsNote ? "Note: needed to approve a pair that misses a mandatory field" : "Note: the match rationale (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" disabled={(needsNote && !note.trim()) || (!!blocked && (me?.role !== "Lead" || !override.trim()))} onClick={() => decide("Approved")}>
              Approve
            </button>
            <button className="btn-secondary btn-sm" disabled={!!blocked && me?.role !== "Lead"} onClick={() => decide("Deferred")}>
              Defer
            </button>
            <button className="btn-secondary btn-sm text-bad" disabled={!!blocked && me?.role !== "Lead"} onClick={() => decide("Rejected")}>
              Reject
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Suggestions() {
  const { dr, cfg, dispatch } = useDr();
  const list = dr.matches.filter((m) => m.decision === "Suggested");
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!cfg) return null;
  return (
    <Section title="Expressions of interest from the directory" flush>
      {list.length === 0 ? (
        <div className="p-5">
          <Empty>None waiting. A verified provider can express interest in a teaser; it lands here as a suggestion, never as a direct introduction.</Empty>
        </div>
      ) : (
        <ul>
          {list.map((m) => {
            const s = dr.apps.find((a) => a.id === m.seekerId)!;
            const p = dr.apps.find((a) => a.id === m.providerId)!;
            return (
              <li key={m.id} className="px-5 py-3 border-b border-line last:border-0 grid gap-2 sm:grid-cols-[1fr_auto] items-center">
                <div className="text-[14px]">
                  <b className="font-medium">{p.org.name}</b> is interested in <b className="font-medium">{s.org.name}</b>
                  <div className="text-[12px] text-slate">
                    {fmtStamp(m.at)} · meets {m.met.map((f) => MATCH_LABEL[f].toLowerCase()).join(", ") || "nothing yet scored"}
                  </div>
                  <input className="input h-8 text-[13px] mt-2" placeholder="Note" value={notes[m.id] ?? ""} onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm" onClick={() => dispatch({ type: "dr/matchDecide", seekerId: s.id, providerId: p.id, decision: "Approved", note: notes[m.id] || "Provider's interest from the directory" })}>
                    Turn into a match
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/matchDecide", seekerId: s.id, providerId: p.id, decision: "Rejected", note: notes[m.id] || "Declined after review" })}>
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const STAGES: MatchStage[] = ["Suggested", "Approved", "Introduced", "Accepted", "Declined", "Expired", "Rejected", "Deferred"];

function ByMission() {
  const { dr, cfg, now } = useDr();
  const [mission, setMission] = useState(cfg?.missions[0].id ?? "");
  if (!cfg) return null;
  const list = dr.matches
    .filter((m) => dr.apps.find((a) => a.id === m.seekerId)?.mission === mission)
    .map((m) => ({ m, s: dr.apps.find((a) => a.id === m.seekerId)!, p: dr.apps.find((a) => a.id === m.providerId)!, st: matchStage(m, cfg, now) }))
    .sort((a, b) => STAGES.indexOf(a.st) - STAGES.indexOf(b.st) || b.m.met.length - a.m.met.length);
  const counts = STAGES.map((st) => [st, list.filter((x) => x.st === st).length] as const);
  const exportCsv = () =>
    downloadCsv(`deal-room-matches-${cfg.missions.find((m) => m.id === mission)?.code}`, [
      row(["Seeker", "Provider", "Stage", "Meets", "Misses", "Note", "Decided by", "Brief"]),
      ...list.map((x) => row([x.s.org.name, x.p.org.name, x.st, x.m.met.join(" "), x.m.missed.join(" "), x.m.note, staffName(dr, x.m.by), x.m.brief?.text ?? ""])),
    ]);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input h-9 w-auto" value={mission} onChange={(e) => setMission(e.target.value)}>
          {cfg.missions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} {missionName(cfg, m.id)}
            </option>
          ))}
        </select>
        <button className="btn-secondary btn-sm" onClick={exportCsv}>
          Download with briefs (CSV)
        </button>
        <Link className="btn-secondary btn-sm" href={`/print/deal-room?kind=matches&mission=${mission}`} target="_blank">
          Print the briefs
        </Link>
      </div>
      <div className="mb-4 grid grid-cols-4 sm:grid-cols-8 gap-2">
        {counts.map(([st, n]) => (
          <div key={st} className="surface p-3 text-center">
            <div className="t-stat">{n}</div>
            <div className="text-[12px] text-slate">{st}</div>
          </div>
        ))}
      </div>
      <Section title={`${list.length} pairs, in priority order`} flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Seeker</th>
              <th className="th">Provider</th>
              <th className="th">Fit</th>
              <th className="th">Stage</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ m, s, p, st }) => (
              <tr key={m.id} className="hover:bg-paper">
                <td className="td text-[13px]">{s.org.name}</td>
                <td className="td text-[13px]">{p.org.name}</td>
                <td className="td text-[13px] text-slate">
                  {m.met.length} of {m.met.length + m.missed.length}
                </td>
                <td className="td">
                  <Link href={`/dealroom/matches/${m.id}`}>
                    <Pill tone={stageTone[st]}>{st}</Pill>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
