"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, KV, PageHeader, Section } from "@/components/ui";
import { ROLE_SHORT, fieldLabel, compact, consentGranted, drCan, introExpiresAt, matchStage, roleOf, staffName } from "@/lib/dealroom/logic";
import type { DrApplication, DrMatch } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { Pill, Refusal, typeLabel, useDr } from "../../bits";
import { StagePill } from "../../stage";
import { FitDetail, PairTimeline } from "../../pair";

export function MatchDetail({ id }: { id: string }) {
  const { dr, cfg, me, now, hydrated } = useDr();
  const m = dr.matches.find((x) => x.id === id);
  if (!m || !cfg) return <Empty>{hydrated ? "No such match." : "Loading…"}</Empty>;
  if (!drCan(me, "match") && !drCan(me, "schedule")) return <Refusal title="Matches are for the Deal Room team" />;
  const s = dr.apps.find((a) => a.id === m.seekerId)!;
  const p = dr.apps.find((a) => a.id === m.providerId)!;
  const meeting = dr.meetings.filter((x) => x.matchId === m.id).pop();
  const stage = matchStage(m, cfg, now);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/dealroom/matching", label: "Matching" }, { label: `${s.org.name} and ${p.org.name}` }]}
        title={`${s.org.name} · ${p.org.name}`}
        badge={<StagePill m={m} />}
        kicker={`${m.origin === "interest" ? `From the ${ROLE_SHORT[roleOf(p)].toLowerCase()}'s interest` : "From the match search"}. ${m.decision} by ${staffName(dr, m.by)}, ${fmtStamp(m.at)}.${m.note ? ` “${m.note}”` : ""}`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Party app={s} />
        <Party app={p} />
      </div>
      <Section title="Fit" className="mt-4">
        <div className="flex flex-wrap gap-1">
          {m.met.map((f) => (
            <span key={f} className="pill bg-ok-50 text-ok">
              ✓ {fieldLabel(f, p)}
            </span>
          ))}
          {m.missed.map((f) => (
            <span key={f} className="pill bg-bad-50 text-bad">
              ✗ {fieldLabel(f, p)}
              {f === "exclusions" && m.exclusionHit ? `: ${m.exclusionHit}` : ""}
            </span>
          ))}
        </div>
        {m.override && <p className="mt-2 text-[13px] text-slate">Re-proposed by {staffName(dr, m.override.by)}: {m.override.reason}</p>}
        {/* how each field was judged: what the seeker has against what the provider's mandate asks */}
        <div className="mt-4 border-t border-line pt-4">
          <FitDetail seeker={s} provider={p} />
        </div>
      </Section>
      {m.decision === "Approved" && <Brief m={m} />}
      {m.decision === "Approved" && <Introduction m={m} s={s} p={p} />}
      {meeting && (
        <Section title="Meeting" className="mt-4">
          <p className="text-[14px]">
            {fmtStamp(meeting.start)} to {meeting.end.slice(11)}, {meeting.status}.{" "}
            <Link className="link" href={`/dealroom/meetings?meeting=${meeting.id}`}>
              Open it on the schedule
            </Link>
          </p>
        </Section>
      )}
      {stage !== "Accepted" && !meeting && m.intro && <p className="mt-3 text-[13px] text-slate">A meeting can be scheduled only once both parties accept.</p>}
      <Section title="History" className="mt-4">
        <PairTimeline m={m} />
      </Section>
    </>
  );
}

function Party({ app }: { app: DrApplication }) {
  return (
    <Section title={typeLabel(app)} action={<Link className="link text-[13px]" href={`/dealroom/applications/${app.id}`}>{app.ref}</Link>}>
      <KV
        rows={
          app.type === "seeker"
            ? [["Organisation", app.org.name], ["Ask", app.ask ? `${compact(app.ask.amount, app.ask.currency)} ${app.ask.instrument.toLowerCase()}` : "–"], ["Sector, country", `${app.org.sector}, ${app.org.country}`], ["Decision-maker", `${app.decisionMaker.name}, ${app.decisionMaker.title}`]]
            : [["Organisation", app.org.name], [roleOf(app) === "capital" ? "Ticket" : "Contract size", app.mandate ? `${compact(app.mandate.ticketMin)} to ${compact(app.mandate.ticketMax)}` : "–"], ["Pathways", app.mandate?.instruments.join(", ") ?? "–"], ["Decision-maker", `${app.decisionMaker.name}, ${app.decisionMaker.title}`]]
        }
      />
    </Section>
  );
}

function Brief({ m }: { m: DrMatch }) {
  const { dr, can, dispatch } = useDr();
  const [text, setText] = useState(m.brief?.text ?? "");
  const [agenda, setAgenda] = useState((m.brief?.agenda ?? []).join("\n"));
  const [saved, setSaved] = useState(false);
  const editable = can("introduce") && !m.intro;
  return (
    <Section title="One-page brief" className="mt-4" action={m.brief && <span className="text-[12px] text-slate">Edited {fmtStamp(m.brief.editedAt)}</span>}>
      <textarea className="input min-h-44 text-[14px] leading-relaxed" disabled={!editable} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
      <label className="block mt-3">
        <span className="label">Agenda, one item per line</span>
        <textarea className="input min-h-20 text-[14px]" disabled={!editable} value={agenda} onChange={(e) => { setAgenda(e.target.value); setSaved(false); }} />
      </label>
      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-secondary btn-sm" onClick={() => { dispatch({ type: "dr/brief", matchId: m.id, text, agenda: agenda.split("\n") }); setSaved(true); }}>
            Save the brief
          </button>
          {saved && <span className="text-[13px] text-slate">Saved.</span>}
        </div>
      )}
      {m.intro && <p className="mt-2 text-[12px] text-slate">Sent with the introduction on {fmtStamp(m.intro.sentAt)}; no longer editable. {staffName(dr, m.intro.by)} sent it.</p>}
    </Section>
  );
}

function Introduction({ m, s, p }: { m: DrMatch; s: DrApplication; p: DrApplication }) {
  const { dr, cfg, now, can, dispatch } = useDr();
  const [items, setItems] = useState<string[]>(s.documents.filter((d) => d.kind === "Pitch deck").map((d) => d.id));
  if (!cfg) return null;
  const exp = introExpiresAt(m, cfg);
  const access = dr.access.filter((a) => a.seekerId === s.id && a.viewer === p.id);
  if (!m.intro) {
    return (
      <Section title="Send the introduction" className="mt-4">
        <p className="text-[14px] text-slate">Choose what {p.org.name} may see once both accept. The teaser and the full profile always go; each document needs the seeker&apos;s consent for {p.org.name}, given when the seeker accepts.</p>
        <ul className="mt-3 space-y-1.5">
          <li className="text-[14px]">✓ Teaser and full profile</li>
          {s.documents.map((d) => (
            <li key={d.id}>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={items.includes(d.id)} onChange={(e) => setItems(e.target.checked ? [...items, d.id] : items.filter((x) => x !== d.id))} />
                {d.kind} <span className="text-slate text-[12px]">{d.download ? "" : "(view only)"}</span>
              </label>
            </li>
          ))}
        </ul>
        {can("introduce") ? (
          <button className="btn-primary mt-3" disabled={!m.brief} onClick={() => dispatch({ type: "dr/introduce", matchId: m.id, items })}>
            Send the introduction to both
          </button>
        ) : (
          <p className="mt-3 text-[13px] text-slate">The lead or a reviewer sends it.</p>
        )}
        <p className="mt-2 text-[12px] text-slate">Both have {cfg.rules.introDays} days to accept. Neither is told anything private by email; the message links here.</p>
      </Section>
    );
  }
  const side = (x?: { response: string; reason?: string; at: string }) => (x ? <Pill tone={x.response === "Accepted" ? "ok" : "bad"}>{`${x.response} ${fmtStamp(x.at)}${x.reason ? `: ${x.reason}` : ""}`}</Pill> : <Pill tone="mute">Waiting</Pill>);
  return (
    <Section title="Introduction" className="mt-4" action={<span className="text-[12px] text-slate">Sent {fmtStamp(m.intro.sentAt)} · {matchStage(m, cfg, now) === "Introduced" ? `expires ${fmtStamp(exp!)}` : matchStage(m, cfg, now)}</span>}>
      <div className="grid gap-3 sm:grid-cols-2 text-[14px]">
        <div>
          <div className="text-[12px] text-slate">{s.org.name}</div>
          {side(m.intro.seeker)}
        </div>
        <div>
          <div className="text-[12px] text-slate">{p.org.name}</div>
          {side(m.intro.provider)}
        </div>
      </div>
      <table className="w-full mt-4">
        <thead>
          <tr>
            <th className="th">Item</th>
            <th className="th">Seeker consent</th>
            <th className="th">Opened by the provider</th>
          </tr>
        </thead>
        <tbody>
          {m.intro.items.map((it) => {
            const doc = s.documents.find((d) => d.id === it);
            const opened = access.filter((a) => a.item === it);
            return (
              <tr key={it}>
                <td className="td text-[13px]">{it === "teaser" ? "Teaser" : it === "profile" ? "Full profile" : doc?.kind ?? it}</td>
                <td className="td text-[13px]">{doc ? (consentGranted(dr, s.id, p.id, doc.id) ? <Pill tone="ok">Granted</Pill> : <Pill tone="mute">{m.intro?.seeker ? "Not granted" : "Asked at acceptance"}</Pill>) : <span className="text-slate">With the introduction</span>}</td>
                <td className="td text-[13px]">{opened.length ? opened.map((o) => `${o.action} ${fmtStamp(o.at)}`).join("; ") : <span className="text-slate">Not opened</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}
