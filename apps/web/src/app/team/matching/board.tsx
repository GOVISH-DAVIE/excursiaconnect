"use client";

/**
 * Matching (M3.1), for the lead, reviewers and coordinators: the participants open to matching (Deal Room Ready
 * seekers, verified investors, partners and challenges), each one's candidates on the other side with what the pair
 * meets and misses, and a person's decision on each pair. Nothing is matched on its own. The interest tab holds what
 * verified counterparties flagged in the directory: suggestions to decide, never introductions. The pairs tab lists
 * every pair with its stage, to send introductions and follow them.
 */
import Link from "next/link";
import { useState } from "react";
import type { Candidate, InterestRow, MatchingBoard, MatchStage, PoolEntry } from "@excursia/contracts/matching";
import { fmtStamp } from "@excursia/domain/time";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { useBoard, useCandidates, useDecide } from "@/features/matching/hooks/use-matching";
import { Failed, Loading } from "../bits";
import { FitDetail, FitPills, StagePill } from "./stage";

const TABS = ["Find matches", "Interest", "Pairs"] as const;

export function Board({ eventId, who, open }: { eventId: string; who: string; open: "pairs" | "interest" | null }) {
  const q = useBoard(eventId);
  const [tab, setTab] = useState<(typeof TABS)[number]>(open === "pairs" ? "Pairs" : open === "interest" ? "Interest" : "Find matches");
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const b = q.data;
  const waiting = b.matches.filter((m) => m.stage === "Approved" || m.stage === "Suggested").length;
  return (
    <>
      <PageHeader
        title="Matching"
        kicker={`${b.event.name}. Only Deal Room Ready seekers and verified investors, partners and challenges are searched. Every pair shows what it meets and misses; a person approves, defers or rejects it.`}
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Interest: b.interest.filter((i) => i.stage === "Suggested").length, Pairs: waiting }} />
      {tab === "Find matches" ? <Find eventId={eventId} board={b} who={who} /> : tab === "Interest" ? <Interest eventId={eventId} board={b} /> : <Pairs board={b} />}
    </>
  );
}

function Find({ eventId, board, who }: { eventId: string; board: MatchingBoard; who: string }) {
  const asked = board.pool.find((p) => p.id === who);
  const [side, setSide] = useState<PoolEntry["side"]>(asked?.side ?? "seeker");
  const [mission, setMission] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(asked?.id ?? "");
  const pool = board.pool.filter((p) => p.side === side && (!mission || p.mission === mission) && (!search.trim() || p.org.toLowerCase().includes(search.trim().toLowerCase())));
  const current = pool.find((p) => p.id === picked) ?? pool[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Section title="Who" flush>
        <div className="grid gap-2 px-5 pb-3">
          <div className="dr-toggle !mb-0" role="tablist">
            {(["seeker", "provider"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={side === s} onClick={() => { setSide(s); setPicked(""); }}>
                {s === "seeker" ? "Seekers" : "Investors and partners"}
              </button>
            ))}
          </div>
          <select className="input h-10 text-[14px]" aria-label="Mission" value={mission} onChange={(e) => { setMission(e.target.value); setPicked(""); }}>
            <option value="">All missions</option>
            {board.missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} {m.name}
              </option>
            ))}
          </select>
          <input className="input h-10 text-[14px]" placeholder="Find by name" aria-label="Find by name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <ul className="max-h-[560px] overflow-auto border-t border-line">
          {pool.map((p) => (
            <li key={p.id}>
              <button className={`w-full border-b border-line px-5 py-2.5 text-left text-[14px] hover:bg-paper ${current?.id === p.id ? "bg-paper font-medium" : ""}`} onClick={() => setPicked(p.id)}>
                {p.org}
                <span className="block text-[12px] font-normal text-slate">
                  {p.label}
                  {p.summary ? ` · ${p.summary}` : ""} · {p.approved} approved
                </span>
              </button>
            </li>
          ))}
          {pool.length === 0 && <li className="px-5 py-4 text-[14px] text-slate">No one here is open to matching yet.</li>}
        </ul>
      </Section>
      {current ? <CandidateList key={current.id} eventId={eventId} board={board} who={current} /> : <Empty>Pick a seeker or a counterparty.</Empty>}
    </div>
  );
}

function CandidateList({ eventId, board, who }: { eventId: string; board: MatchingBoard; who: PoolEntry }) {
  const q = useCandidates(eventId, who.id);
  return (
    <Section
      title={`Candidates for ${who.org}`}
      flush
      action={<span className="text-[12px] text-slate">Ordered by {board.ordering === "criteria" ? "criteria met, then readiness" : "readiness, then criteria met"}</span>}
    >
      {q.isPending ? (
        <p className="px-5 pb-4 text-[14px] text-slate">Loading…</p>
      ) : q.isError ? (
        <div className="px-5 pb-4">
          <Failed error={q.error} />
        </div>
      ) : q.data.candidates.length === 0 ? (
        <div className="px-5 pb-4">
          <Empty>No one on the other side is open to matching yet. Nothing is forced.</Empty>
        </div>
      ) : (
        <ul className="border-t border-line">
          {q.data.candidates.map((c) => (
            <CandidateRow key={c.other.id} eventId={eventId} c={c} lead={board.can.lead} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function CandidateRow({ eventId, c, lead }: { eventId: string; c: Candidate; lead: boolean }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const decided = c.match && !["Suggested", "Deferred"].includes(c.match.stage);
  const canDecide = !decided || !!c.blocked;
  const provider = c.providerId === c.other.id ? c.other.org : "The counterparty";
  return (
    <li className="border-b border-line px-5 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" className="group text-left text-[14px] font-medium" aria-expanded={show} onClick={() => setShow(!show)}>
            <span className="underline-offset-4 group-hover:underline">{c.other.org}</span>{" "}
            <span className="font-normal text-slate">
              · {c.other.label}, {c.other.country}
            </span>
            <span className="ml-2 text-[12px] font-normal text-slate group-hover:text-ink">{show ? "Hide the fit ▴" : "The fit ▾"}</span>
          </button>
          <FitPills fit={c.fit} exclusionHit={c.exclusionHit} />
          {c.readiness !== null && <span className="mt-1 inline-block text-[12px] text-slate">Readiness {c.readiness}</span>}
        </div>
        <div className="flex items-center gap-2">
          {c.match && (
            <Link href={`/team/matching/${c.match.id}`} aria-label={`Open the pair: ${c.match.stage}`}>
              <StagePill stage={c.match.stage} />
            </Link>
          )}
          {canDecide && (
            <button className="btn-secondary btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
              {c.match ? "Decide again" : "Decide"}
            </button>
          )}
        </div>
      </div>
      {show && (
        <div className="mt-3 rounded-md border border-line p-4">
          <FitDetail fit={c.fit} provider={provider} />
          {c.match?.note && <p className="mt-3 text-[13px] text-slate">The decision&apos;s note: {c.match.note}</p>}
        </div>
      )}
      {open && <Decide eventId={eventId} seekerId={c.seekerId} providerId={c.providerId} needsNote={c.needsNote} blocked={c.blocked} lead={lead} onDone={() => setOpen(false)} />}
    </li>
  );
}

/** A person's decision on one pair: approve, defer or reject, with the reason the rules ask for. */
function Decide({ eventId, seekerId, providerId, needsNote, blocked, lead, deferred, onDone }: { eventId: string; seekerId: string; providerId: string; needsNote: boolean; blocked: string | null; lead: boolean; deferred?: boolean; onDone?: () => void }) {
  const decide = useDecide(eventId);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const send = (decision: "Approved" | "Rejected" | "Deferred") =>
    decide.mutate(
      { seekerId, providerId, decision, note, override: blocked ? override : undefined },
      { onSuccess: () => { setNote(""); setOverride(""); onDone?.(); } },
    );
  return (
    <div className="mt-3 grid gap-2 rounded-md bg-paper p-3">
      {blocked && (
        <p className="text-[13px] text-bad">
          This pair was {blocked.toLowerCase()} before. {lead ? "Proposing it again needs your reason; it is logged as an exception." : "Only the lead can propose it again."}
        </p>
      )}
      {blocked && lead && <input className="input h-10 text-[14px]" placeholder="Why propose it again (logged)" value={override} onChange={(e) => setOverride(e.target.value)} />}
      <textarea
        className="input min-h-16 text-[14px]"
        placeholder={needsNote ? "Why they should still meet: needed, as the pair misses a must-have" : "Why: needed to defer or reject, optional to approve"}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {decide.error && (
        <p role="alert" className="text-[13px] text-bad">
          {decide.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={decide.isPending || (needsNote && !note.trim()) || (!!blocked && (!lead || !override.trim()))} onClick={() => send("Approved")}>
          Approve
        </button>
        {!deferred && (
          <button className="btn-secondary btn-sm" disabled={decide.isPending || !note.trim() || (!!blocked && !lead)} onClick={() => send("Deferred")}>
            Defer
          </button>
        )}
        <button className="btn-secondary btn-sm text-bad" disabled={decide.isPending || !note.trim() || (!!blocked && !lead)} onClick={() => send("Rejected")}>
          Reject
        </button>
      </div>
    </div>
  );
}

/** What verified counterparties flagged in the directory: each a suggestion for a person to decide (DR-10). */
function Interest({ eventId, board }: { eventId: string; board: MatchingBoard }) {
  if (!board.interest.length)
    return (
      <Empty>
        No expression of interest is waiting. A verified investor or partner can flag a business&apos;s teaser in the directory; it lands here as a suggestion, never as an introduction.
      </Empty>
    );
  return (
    <Section title="Expressions of interest" flush>
      <p className="px-5 pb-3 text-[13px] text-slate">Approving makes it a match with its brief drafted; the introduction is still yours to send.</p>
      <ul className="border-t border-line">
        {board.interest.map((i) => (
          <InterestItem key={i.matchId} eventId={eventId} i={i} lead={board.can.lead} />
        ))}
      </ul>
    </Section>
  );
}

function InterestItem({ eventId, i, lead }: { eventId: string; i: InterestRow; lead: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <li className="border-b border-line px-5 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-[14px]">
          <span className="font-medium">{i.provider.org}</span> <span className="text-slate">({i.provider.label})</span> is interested in <span className="font-medium">{i.seeker.org}</span>
          <span className="block text-[12px] text-slate">
            {i.seeker.summary || i.seeker.label} · flagged {fmtStamp(i.at)}
            {i.stage === "Deferred" && ` · deferred${i.note ? `: ${i.note}` : ""}`}
          </span>
          <FitPills fit={i.fit} exclusionHit={i.exclusionHit} />
          <button type="button" className="mt-1 block text-[12px] text-slate hover:text-ink" aria-expanded={show} onClick={() => setShow(!show)}>
            {show ? "Hide the fit ▴" : "The fit ▾"}
          </button>
        </div>
        <StagePill stage={i.stage} />
      </div>
      {show && (
        <div className="mt-3 rounded-md border border-line p-4">
          <FitDetail fit={i.fit} provider={i.provider.org} />
        </div>
      )}
      {i.blocked ? (
        <p className="mt-2 text-[13px] text-bad">{i.blocked}, so it can&apos;t be approved yet. Defer it, or reject it with the reason.</p>
      ) : null}
      <Decide eventId={eventId} seekerId={i.seeker.id} providerId={i.provider.id} needsNote={i.needsNote} blocked={null} lead={lead} deferred={i.stage === "Deferred"} />
    </li>
  );
}

const STAGES: MatchStage[] = ["Suggested", "Approved", "Introduced", "Accepted", "Declined", "Expired", "Deferred", "Rejected"];

function Pairs({ board }: { board: MatchingBoard }) {
  // the pairs waiting to be introduced first, when there are any
  const [stage, setStage] = useState<MatchStage | "">(() => (board.matches.some((m) => m.stage === "Approved") ? "Approved" : ""));
  const rows = board.matches.filter((m) => !stage || m.stage === stage);
  const count = (s: MatchStage) => board.matches.filter((m) => m.stage === s).length;
  return (
    <Section
      title="Pairs"
      flush
      action={
        <select className="input h-9 w-auto text-[13px]" aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as MatchStage | "")}>
          <option value="">Every stage ({board.matches.length})</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s === "Approved" ? "Approved, to introduce" : s} ({count(s)})
            </option>
          ))}
        </select>
      }
    >
      {rows.length === 0 ? (
        <p className="px-5 pb-4 text-[14px] text-slate">No pair at this stage.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-y border-line text-left text-[13px] text-slate">
                <th className="px-5 py-2 font-normal">Seeker</th>
                <th className="px-3 py-2 font-normal">Counterparty</th>
                <th className="px-3 py-2 font-normal">Stage</th>
                <th className="px-5 py-2 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-5 py-2.5">
                    <Link className="font-medium underline-offset-4 hover:underline" href={`/team/matching/${m.id}`}>
                      {m.seeker.org}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {m.provider.org}
                    <span className="block text-[12px] text-slate">{m.provider.label}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StagePill stage={m.stage} />
                    {m.origin === "interest" && <span className="block text-[12px] text-slate">From their interest</span>}
                  </td>
                  <td className="px-5 py-2.5 text-[13px] text-slate">
                    {m.stage === "Introduced" && m.expiresAt ? `Answer by ${fmtStamp(m.expiresAt)}` : m.sentAt ? `Introduced ${fmtStamp(m.sentAt)}` : `Decided ${fmtStamp(m.decidedAt)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
