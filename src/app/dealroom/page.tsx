"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Meter, PageHeader, Section, Stat } from "@/components/ui";
import { FLAGS, bothAccepted, compact, conversionValues, funnel, matchStage, medianDays, missionName, occupies, oppOpen, oppOverdue, qualified, readyToSchedule, reviewedThisMonth, roleOf, sessionOpenOutcomes, type FlagKey } from "@/lib/dealroom/logic";
import { fmtStamp } from "@/lib/time";
import { canOpen, useDr } from "./bits";

/** DL-8: one funnel from lead to qualified, against Bouer's targets, every number a link to its records. */
export default function DealRoomDashboard() {
  const { dr, cfg, now, me, can, event } = useDr();
  if (!cfg) return null;
  const f = funnel(dr, cfg.eventId);
  const apps = dr.apps.filter((a) => a.eventId === cfg.eventId);
  const q = (k: string) => `/dealroom/applications?flag=${k}`;
  // a number opens its records only for a role allowed past that door; otherwise it stays a plain number
  const seesApps = can("review") || can("assign");
  const opens = (href: string) => canOpen(dr, me, href);

  const targets = [
    { label: "Qualified counterparties", value: f.qualified, target: 150, due: "2027-01-03", href: q("qualified"), sub: `${f.qualifiedSeekers} seekers approved, ${f.verifiedCapital} investors and ${f.verifiedPartners} partners verified` },
    { label: "Deal Room Ready, both sides", value: dr.matches.filter(bothAccepted).length, target: 60, due: "2027-01-23", href: "/dealroom/matching?tab=By%20mission&mission=All&stage=Accepted", sub: `${f.ready} seekers ready; pairs counted once both accept` },
    { label: "Booked meetings", value: dr.meetings.filter((m) => occupies(m, cfg, now) || m.status === "Held").length, target: 200, due: "2027-02-18", href: "/dealroom/meetings", sub: `${dr.meetings.filter((m) => m.status === "Held").length} held so far, summit week 15 to 18 February` },
  ];

  const opps = dr.opportunities.filter((o) => o.eventId === cfg.eventId);
  const value = (k: "committed" | "received") =>
    Object.entries(conversionValues(dr, opps))
      .filter(([, v]) => v[k] > 0)
      .map(([cur, v]) => compact(v[k], cur))
      .join(" · ") || "none yet";
  const owns = me?.role === "Lead" || me?.role === "Reviewer";
  const mineOpen = opps.filter((o) => oppOpen(o) && (me?.role === "Lead" || o.owner === me?.id));
  const matches = dr.matches.filter((m) => m.eventId === cfg.eventId);
  const meetings = dr.meetings.filter((m) => m.eventId === cfg.eventId);
  // intake, review, introductions and scheduling are summit work; after its last day only outcomes owed and the
  // opportunities remain, and once archived nothing can be acted on at all
  const summitOver = now.slice(0, 10) > event.endDate;
  const attention = dr.archivedAt ? [] : [
    // the review team's work; oversight sees the same counts to monitor, unlinked
    ...(!summitOver && (seesApps || me?.role === "Oversight")
      ? (Object.keys(FLAGS) as FlagKey[])
          .filter((k) => ["unassigned", "second", "expired", "rereview", "teaser", "kyc", "profile", "unpaid"].includes(k))
          .map((k) => ({ k, href: q(k), label: FLAGS[k].label, n: apps.filter((a) => FLAGS[k].test(a, cfg, now)).length }))
      : []),
    // the coordinator's and operations' work: introductions, scheduling, outcomes
    ...(!summitOver && can("match") ? [{ k: "intro", href: "/dealroom/matching?tab=By%20mission&mission=All&stage=Introduced", label: "Introductions waiting for an answer", n: matches.filter((m) => matchStage(m, cfg, now) === "Introduced").length }] : []),
    ...(!summitOver && can("schedule") ? [{ k: "toschedule", href: "/dealroom/meetings", label: "Accepted pairs to schedule", n: readyToSchedule(dr, cfg).length }] : []),
    ...(can("outcome") || me?.role === "Oversight" ? [{ k: "nooutcome", href: "/dealroom/live", label: "Meetings ended without an outcome", n: meetings.filter((m) => m.end <= now && ((m.status === "Held" && !m.outcome) || (occupies(m, cfg, now) && m.status !== "Held" && m.status !== "No-show"))).length }] : []),
    ...(can("schedule") || can("outcome") || me?.role === "Oversight" ? [{ k: "sessions", href: "/dealroom/programme", label: "Session attendees without an outcome", n: dr.sessions.filter((x) => x.eventId === cfg.eventId && !x.cancelled && x.end <= now).reduce((n, x) => n + sessionOpenOutcomes(x).length, 0) }] : []),
    // after the summit: the owner's and the lead's overdue next actions, and the lead's monthly review (PRD Conversion req. 2, 3)
    ...(owns && !dr.archivedAt ? [{ k: "opp-overdue", href: "/dealroom/opportunities?flag=overdue", label: "Opportunities with an overdue next action", n: mineOpen.filter((o) => oppOverdue(o, now)).length }] : []),
    ...(can("conversion") && !dr.archivedAt && now.slice(0, 10) > cfg.rules.appClose ? [{ k: "opp-review", href: "/dealroom/opportunities?tab=Monthly%20review", label: "Opportunities to review this month", n: mineOpen.filter((o) => !reviewedThisMonth(o, now)).length }] : []),
  ].filter((x) => x.n > 0);

  const stages = [
    { label: "Leads and invitations", n: f.leads, href: q("leads") },
    { label: "Applications started", n: f.started, href: "/dealroom/applications" },
    { label: "Submitted", n: f.submitted, href: q("submitted") },
    { label: "Decided", n: f.decided, href: q("decided") },
    { label: "Qualified", n: f.qualified, href: q("qualified") },
    { label: "Deal Room Ready", n: f.ready, href: q("ready") },
  ];
  const max = Math.max(1, ...stages.map((s) => s.n));

  return (
    <>
      <PageHeader title="Deal Room" kicker={`Connected Africa 3.0, summit 15 to 18 February 2027. Figures as of ${fmtStamp(now)}.`} />

      {/* two to a row on a phone, four on a wide screen; on a phone the date sits under the label */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {targets.map((t) => (
          <Go key={t.label} href={t.href} open={opens(t.href)} className="surface min-w-0 p-3 hover:border-line-strong sm:p-4">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <span className="text-[12px] font-medium leading-tight sm:text-[13px]">{t.label}</span>
              <span className="text-[11px] text-slate sm:whitespace-nowrap sm:text-[12px]">by {fmtStamp(t.due, false)}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
              <span className="t-stat text-[28px] sm:text-[length:var(--t-stat)]">{t.value}</span>
              <span className="text-[12px] text-slate sm:text-sm">of {t.target}</span>
            </div>
            <div className="mt-2">
              <Meter value={t.value} max={t.target} warnAt={2} badAt={2} />
            </div>
            <div className="mt-2 text-[11px] leading-snug text-slate sm:text-[12px]">{t.sub}</div>
          </Go>
        ))}
        <Link href={me?.role === "Lead" || me?.role === "Reviewer" || me?.role === "Coordinator" ? "/dealroom/opportunities" : me?.role === "Oversight" ? "/dealroom/reports?tab=Conversion" : "/dealroom"} className="surface min-w-0 p-3 hover:border-line-strong sm:p-4">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
            <span className="text-[12px] font-medium leading-tight sm:text-[13px]">Conversion tracking</span>
            <span className="text-[11px] text-slate sm:whitespace-nowrap sm:text-[12px]">to {fmtStamp(cfg.rules.conversionEnd, false)}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
            <span className="t-stat text-[28px] sm:text-[length:var(--t-stat)]">{opps.filter(oppOpen).length}</span>
            <span className="text-[12px] text-slate sm:text-sm">open of {opps.length}</span>
          </div>
          <div className="mt-2 text-[11px] leading-snug text-slate sm:text-[12px]">
            {opps.filter((o) => o.stage === "Closed – won").length} won, {opps.filter((o) => o.closed).length} lost
            {can("conversion") || me?.role === "Oversight" ? `. Committed ${value("committed")}, received ${value("received")}` : ". Values are the lead's to see"}
          </div>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Funnel" className="lg:col-span-2">
          <ul className="space-y-3">
            {stages.map((s) => (
              <li key={s.label}>
                <Go href={s.href} open={opens(s.href)} className="grid grid-cols-[minmax(0,8.5rem)_1fr_40px] items-center gap-2 text-sm group sm:grid-cols-[180px_1fr_48px] sm:gap-3">
                  <span className="group-hover:underline underline-offset-4">{s.label}</span>
                  <span className="h-2.5 rounded-full bg-paper-200 overflow-hidden">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${(s.n / max) * 100}%` }} />
                  </span>
                  <span className="num text-right font-medium">{s.n}</span>
                </Go>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-line pt-4">
            <Stat label="Qualified" value={f.approved} href={seesApps ? "/dealroom/applications?decision=Qualified" : undefined} />
            <Stat label="Conditional" value={f.conditional} tone="warn" href={seesApps ? "/dealroom/applications?decision=Conditional" : undefined} />
            <Stat label="Referred" value={f.referred} href={seesApps ? "/dealroom/applications?decision=Referred" : undefined} />
            <Stat label="Declined" value={f.declined} tone="bad" href={seesApps ? "/dealroom/applications?decision=Declined" : undefined} />
          </div>
        </Section>

        <Section title="Needs attention" flush>
          {dr.archivedAt ? (
            <p className="px-5 pb-5 text-sm text-slate">
              Nothing: the Deal Room was archived {fmtStamp(dr.archivedAt)} and is read-only. The post-summit pack went to the lead
              {can("conversion") || me?.role === "Oversight" ? (
                <>
                  ;{" "}
                  <Link className="link" href="/dealroom/reports?tab=Conversion">
                    the final conversion report
                  </Link>{" "}
                  is in Reports.
                </>
              ) : (
                "."
              )}
            </p>
          ) : attention.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate">Nothing waiting.</p>
          ) : (
            <ul>
              {attention.map((a) => (
                <li key={a.k}>
                  <Go href={a.href} open={opens(a.href)} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line last:border-0 hover:bg-paper text-sm">
                    <span>{a.label}</span>
                    <span className="pill bg-warn-50 text-warn">{a.n}</span>
                  </Go>
                </li>
              ))}
            </ul>
          )}
          <div className="px-5 py-3 border-t border-line text-[12px] text-slate">
            Median {medianDays(apps.map((a) => [a.submittedAt, a.firstReviewAt])) ?? "–"} days to first review, {medianDays(apps.filter((a) => a.status === "Decided").map((a) => [a.submittedAt, a.statusAt])) ?? "–"} to a decision.
          </div>
        </Section>
      </div>

      <Section title="By mission" flush className="mt-4">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Mission</th>
              <th className="th-r">Seekers</th>
              <th className="th-r">Investors</th>
              <th className="th-r">Partners</th>
              <th className="th-r">Challenges</th>
              <th className="th-r">In review</th>
              <th className="th-r">Qualified</th>
              <th className="th-r">Ready</th>
            </tr>
          </thead>
          <tbody>
            {cfg.missions.map((m) => {
              const mine = apps.filter((a) => a.mission === m.id);
              return (
                <tr key={m.id} className="hover:bg-paper">
                  <td className="td">
                    <Go href={`/dealroom/applications?mission=${m.id}`} open={seesApps} className="font-medium hover:underline">
                      {m.code} {missionName(cfg, m.id)}
                    </Go>
                  </td>
                  <Num open={seesApps} n={mine.filter((a) => a.type === "seeker").length} href={`/dealroom/applications?mission=${m.id}&type=seeker`} />
                  {(["capital", "partner", "challenge"] as const).map((r) => (
                    <Num key={r} open={seesApps} n={mine.filter((a) => roleOf(a) === r).length} href={`/dealroom/applications?mission=${m.id}&type=${r}`} />
                  ))}
                  <Num open={seesApps} n={mine.filter((a) => ["Submitted", "In review", "Information requested"].includes(a.status)).length} href={`/dealroom/applications?mission=${m.id}&status=${encodeURIComponent("Submitted,In review,Information requested")}`} />
                  <Num open={seesApps} n={mine.filter(qualified).length} href={`/dealroom/applications?mission=${m.id}&flag=qualified`} />
                  <Num open={seesApps} n={mine.filter((a) => a.type === "seeker" && qualified(a) && a.readiness === "Deal Room Ready").length} href={`/dealroom/applications?mission=${m.id}&flag=ready`} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      {me?.role === "Operations" && <p className="mt-4 text-[13px] text-slate">Operations sees meetings and the live board; qualification is the reviewers&apos; work.</p>}
    </>
  );
}

/** A link for a role allowed past it; for anyone else the same block, plain, with no hover. */
function Go({ href, open, className, children }: { href: string; open: boolean; className?: string; children: ReactNode }) {
  if (open)
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  return <div className={className?.replace(/hover:\S+|group\b/g, "")}>{children}</div>;
}

/** A table count that opens the records behind it; a zero stays plain. */
function Num({ n, href, open }: { n: number; href: string; open: boolean }) {
  return <td className="td-r">{n > 0 ? open ? <Link href={href} className="hover:underline underline-offset-4">{n}</Link> : n : <span className="text-slate">0</span>}</td>;
}
