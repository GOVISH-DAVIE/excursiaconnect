"use client";

/**
 * One pair (M3.1): both parties, how they fit, the decision, the brief (editable until the introduction goes), the
 * introduction with the documents proposed, each side's answer, the seeker's consent per document and every opening
 * by the counterparty, and the pair's history.
 */
import Link from "next/link";
import { useState } from "react";
import type { MatchView } from "@excursia/contracts/matching";
import { fmtStamp } from "@excursia/domain/time";
import { KV, PageHeader, Section, Tone } from "@/components/ui";
import { useMatch, useMatchActions } from "@/features/matching/hooks/use-matching";
import { Failed, Loading } from "../../bits";
import { FitDetail, StagePill } from "../stage";

export function Match({ eventId, matchId }: { eventId: string; matchId: string }) {
  const q = useMatch(eventId, matchId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const v = q.data;
  const m = v.match;
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/team/matching?tab=pairs", label: "Matching" }, { label: `${v.seeker.org} and ${v.provider.org}` }]}
        title={`${v.seeker.org} · ${v.provider.org}`}
        badge={<StagePill stage={m.stage} />}
        kicker={`${m.origin === "interest" ? `From ${v.provider.org}'s interest` : "From the match search"}. ${m.decision} by ${m.by}, ${fmtStamp(m.at)}.${m.note ? ` “${m.note}”` : ""}`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Party p={v.seeker} />
        <Party p={v.provider} />
      </div>
      <Section title="How they fit" className="mt-4">
        <FitDetail fit={v.fit} provider={v.provider.org} />
        {m.override && (
          <p className="mt-3 text-[13px] text-slate">
            Proposed again by {m.override.by}, {fmtStamp(m.override.at)}: {m.override.reason}
          </p>
        )}
        {(m.stage === "Suggested" || m.stage === "Deferred" || m.stage === "Rejected" || m.stage === "Declined" || m.stage === "Expired") && v.can.decide && (
          <p className="mt-3 text-[13px]">
            <Link className="underline underline-offset-4" href={`/team/matching?who=${v.seeker.id}`}>
              Decide this pair from {v.seeker.org}&apos;s candidates
            </Link>
          </p>
        )}
      </Section>
      {m.decision === "Approved" && <Brief key={m.brief?.editedAt ?? "none"} eventId={eventId} v={v} />}
      {m.decision === "Approved" && <Introduction eventId={eventId} v={v} />}
      <Section title="History" className="mt-4">
        <ol className="grid gap-2.5">
          {v.history.map((e, i) => (
            <li key={i} className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-3 text-[13px]">
              <span className={`mt-1.5 h-2 w-2 rounded-full ${e.kind === "consent" ? "bg-ok" : e.kind === "access" ? "bg-coral" : e.kind === "meeting" ? "bg-warn" : "bg-ink"}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block">{e.what}</span>
                <span className="block text-[12px] text-slate">
                  {fmtStamp(e.at)} · {e.who}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

function Party({ p }: { p: MatchView["seeker"] }) {
  return (
    <Section
      title={p.label}
      action={
        <Link className="text-[13px] underline underline-offset-4" href={`/team/applications/${p.id}`}>
          {p.ref ?? "The application"}
        </Link>
      }
    >
      <KV rows={[["Organisation", p.org], ...p.rows]} />
    </Section>
  );
}

function Brief({ eventId, v }: { eventId: string; v: MatchView }) {
  const act = useMatchActions(eventId, v.match.id);
  const b = v.match.brief;
  const [text, setText] = useState(b?.text ?? "");
  const [agenda, setAgenda] = useState((b?.agenda ?? []).join("\n"));
  const editable = v.can.introduce && !v.match.intro;
  const changed = text !== (b?.text ?? "") || agenda !== (b?.agenda ?? []).join("\n");
  return (
    <Section title="The brief both sides read" className="mt-4" action={b && <span className="text-[12px] text-slate">Edited {fmtStamp(b.editedAt)}</span>}>
      <label className="block">
        <span className="label">Brief</span>
        <textarea className="input min-h-44 text-[14px] leading-relaxed" disabled={!editable} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className="label">Agenda, one item per line</span>
        <textarea className="input min-h-20 text-[14px]" disabled={!editable} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
      </label>
      {act.brief.error && (
        <p role="alert" className="mt-2 text-[13px] text-bad">
          {act.brief.error.message}
        </p>
      )}
      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-secondary btn-sm" disabled={!changed || act.brief.isPending} onClick={() => act.brief.mutate({ text, agenda: agenda.split("\n").filter((x) => x.trim()) })}>
            Save the brief
          </button>
          {act.brief.isSuccess && !changed && <span className="text-[13px] text-slate">Saved.</span>}
        </div>
      )}
      {v.match.intro && <p className="mt-2 text-[12px] text-slate">Sent with the introduction on {fmtStamp(v.match.intro.sentAt)}; it no longer changes.</p>}
    </Section>
  );
}

const CONSENT = { "asked at acceptance": "Consent asked at acceptance", granted: "Shared", "not granted": "Not shared", withdrawn: "Withdrawn" } as const;

function Introduction({ eventId, v }: { eventId: string; v: MatchView }) {
  const act = useMatchActions(eventId, v.match.id);
  const intro = v.match.intro;
  const [items, setItems] = useState<string[]>(() => v.documents.filter((d) => d.kind === "Pitch deck").map((d) => d.id));
  if (!intro) {
    return (
      <Section title="Send the introduction" className="mt-4">
        <p className="text-[14px] text-slate">
          Choose what {v.provider.org} may open once both accept. The teaser and the full profile always go with it. Each document also needs {v.seeker.org}&apos;s consent, given when they accept.
        </p>
        <ul className="mt-3 grid gap-1.5">
          <li className="text-[14px]">✓ Teaser and full profile</li>
          {v.documents.map((d) => (
            <li key={d.id}>
              <label className="flex items-start gap-2.5 text-[14px]">
                <input type="checkbox" className="mt-1" checked={items.includes(d.id)} disabled={!v.can.introduce} onChange={(e) => setItems(e.target.checked ? [...items, d.id] : items.filter((x) => x !== d.id))} />
                <span className="min-w-0">
                  {d.kind}
                  <span className="block text-[12px] text-slate">
                    {d.name} · {d.shareable === "stamped" ? "opens as a copy stamped with their name" : "can't be stamped: downloaded as it is"}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {v.documents.length === 0 && <li className="text-[13px] text-slate">The seeker has uploaded no documents.</li>}
        </ul>
        {act.introduce.error && (
          <p role="alert" className="mt-2 text-[13px] text-bad">
            {act.introduce.error.message}
          </p>
        )}
        {v.can.introduce ? (
          <button className="btn-primary mt-3" disabled={!v.match.brief || act.introduce.isPending} onClick={() => act.introduce.mutate({ items })}>
            Send the introduction to both
          </button>
        ) : (
          <p className="mt-3 text-[13px] text-slate">The lead, a reviewer or a coordinator sends it.</p>
        )}
        <p className="mt-2 text-[12px] text-slate">Both have {v.introDays} days to answer. The emails name no one and link to the platform.</p>
      </Section>
    );
  }
  const answer = (x: NonNullable<typeof intro>["seeker"]) =>
    x ? (
      <Tone tone={x.response === "Accepted" ? "ok" : "bad"}>{`${x.response} ${fmtStamp(x.at)}${x.reason ? `: ${x.reason}` : ""}`}</Tone>
    ) : (
      <Tone tone="mute">Waiting</Tone>
    );
  return (
    <Section
      title="Introduction"
      className="mt-4"
      action={
        <span className="text-[12px] text-slate">
          Sent {fmtStamp(intro.sentAt)} by {intro.by} · {v.match.stage === "Introduced" ? `answer by ${fmtStamp(intro.expiresAt)}` : v.match.stage}
        </span>
      }
    >
      <div className="grid gap-3 text-[14px] sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[12px] text-slate">{v.seeker.org}</div>
          {answer(intro.seeker)}
        </div>
        <div>
          <div className="mb-1 text-[12px] text-slate">{v.provider.org}</div>
          {answer(intro.provider)}
        </div>
      </div>
      <ul className="mt-4 border-t border-line">
        {intro.items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 text-[14px] last:border-0">
            <span className="min-w-0">
              {it.label}
              <span className="block text-[12px] text-slate">
                {it.opened.length ? it.opened.map((o, n) => `${o.action === "download" ? (n ? "downloaded" : "Downloaded") : n ? "opened" : "Opened"} ${fmtStamp(o.at)}`).join("; ") : `Not opened by ${v.provider.org}`}
              </span>
            </span>
            {it.consent === "with the introduction" ? (
              <span className="text-[13px] text-slate">Goes with the introduction</span>
            ) : (
              <Tone tone={it.consent === "granted" ? "ok" : it.consent === "withdrawn" ? "bad" : "mute"}>{CONSENT[it.consent]}</Tone>
            )}
          </li>
        ))}
      </ul>
      {v.match.stage === "Accepted" && <p className="mt-3 text-[13px] text-slate">Both accepted: the pair is ready to schedule.</p>}
    </Section>
  );
}
