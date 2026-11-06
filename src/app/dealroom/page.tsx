"use client";

import Link from "next/link";
import { Meter, PageHeader, Section, Stat } from "@/components/ui";
import { FLAGS, bothAccepted, compact, conversionValues, funnel, medianDays, missionName, occupies, oppOpen, oppOverdue, qualified, reviewedThisMonth, type FlagKey } from "@/lib/dealroom/logic";
import { fmtStamp } from "@/lib/time";
import { useDr } from "./bits";

/** DL-8: one funnel from lead to qualified, against Bouer's targets, every number a link to its records. */
export default function DealRoomDashboard() {
  const { dr, cfg, now, me, can } = useDr();
  if (!cfg) return null;
  const f = funnel(dr, cfg.eventId);
  const apps = dr.apps.filter((a) => a.eventId === cfg.eventId);
  const q = (k: string) => `/dealroom/applications?flag=${k}`;

  const targets = [
    { label: "Qualified counterparties", value: f.qualified, target: 150, due: "2027-01-31", href: q("qualified"), sub: `${f.qualifiedSeekers} seekers approved, ${f.verified} providers verified` },
    { label: "Deal Room Ready, both sides", value: dr.matches.filter(bothAccepted).length, target: 60, due: "2027-02-20", href: "/dealroom/matching?tab=By%20mission&mission=All&stage=Accepted", sub: `${f.ready} seekers ready; pairs counted once both accept` },
    { label: "Booked meetings", value: dr.meetings.filter((m) => occupies(m, cfg, now) || m.status === "Held").length, target: 200, due: "2027-03-18", href: "/dealroom/meetings", sub: `${dr.meetings.filter((m) => m.status === "Held").length} held so far, summit week 15 to 18 March` },
  ];

  const opps = dr.opportunities.filter((o) => o.eventId === cfg.eventId);
  const value = (k: "committed" | "received") =>
    Object.entries(conversionValues(dr, opps))
      .filter(([, v]) => v[k] > 0)
      .map(([cur, v]) => compact(v[k], cur))
      .join(" · ") || "none yet";
  const owns = me?.role === "Lead" || me?.role === "Reviewer";
  const mineOpen = opps.filter((o) => oppOpen(o) && (me?.role === "Lead" || o.owner === me?.id));
  const attention = [
    ...(Object.keys(FLAGS) as FlagKey[])
      .filter((k) => ["unassigned", "second", "expired", "rereview", "teaser", "kyc", "profile"].includes(k))
      .map((k) => ({ k, href: q(k), label: FLAGS[k].label, n: apps.filter((a) => FLAGS[k].test(a, cfg, now)).length })),
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
      <PageHeader title="Deal Room" kicker={`Connected Africa 3.0, summit 15 to 18 March 2027. Figures as of ${fmtStamp(now)}.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        {targets.map((t) => (
          <Link key={t.label} href={t.href} className="surface p-4 hover:border-line-strong">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">{t.label}</span>
              <span className="text-[12px] text-slate whitespace-nowrap">by {fmtStamp(t.due, false)}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="t-stat">{t.value}</span>
              <span className="text-slate text-sm">of {t.target}</span>
            </div>
            <div className="mt-2">
              <Meter value={t.value} max={t.target} warnAt={2} badAt={2} />
            </div>
            <div className="mt-2 text-[12px] text-slate">{t.sub}</div>
          </Link>
        ))}
        <Link href={me?.role === "Lead" || me?.role === "Reviewer" ? "/dealroom/opportunities" : "/dealroom"} className="surface p-4 hover:border-line-strong">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium">Conversion tracking</span>
            <span className="text-[12px] text-slate whitespace-nowrap">to {fmtStamp(cfg.rules.conversionEnd, false)}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="t-stat">{opps.filter(oppOpen).length}</span>
            <span className="text-slate text-sm">open of {opps.length}</span>
          </div>
          <div className="mt-2 text-[12px] text-slate">
            {opps.filter((o) => o.stage === "Closed – won").length} won, {opps.filter((o) => o.closed).length} lost
            {can("conversion") ? `. Committed ${value("committed")}, received ${value("received")}` : ". Values are the lead's to see"}
          </div>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Funnel" className="lg:col-span-2">
          <ul className="space-y-3">
            {stages.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="grid grid-cols-[180px_1fr_48px] items-center gap-3 text-sm group">
                  <span className="group-hover:underline underline-offset-4">{s.label}</span>
                  <span className="h-2.5 rounded-full bg-paper-200 overflow-hidden">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${(s.n / max) * 100}%` }} />
                  </span>
                  <span className="num text-right font-medium">{s.n}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-4 sm:grid-cols-4 border-t border-line pt-4">
            <Stat label="Approved" value={f.approved} href="/dealroom/applications?decision=Approved" />
            <Stat label="Conditional" value={f.conditional} tone="warn" href="/dealroom/applications?decision=Conditional" />
            <Stat label="Waitlisted" value={f.waitlisted} href="/dealroom/applications?decision=Waitlisted" />
            <Stat label="Declined" value={f.declined} tone="bad" href="/dealroom/applications?decision=Declined" />
          </div>
        </Section>

        <Section title="Needs attention" flush>
          {attention.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate">Nothing waiting.</p>
          ) : (
            <ul>
              {attention.map((a) => (
                <li key={a.k}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line last:border-0 hover:bg-paper text-sm">
                    <span>{a.label}</span>
                    <span className="pill bg-warn-50 text-warn">{a.n}</span>
                  </Link>
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
              <th className="th-r">Providers</th>
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
                    <Link href={`/dealroom/applications?mission=${m.id}`} className="font-medium hover:underline">
                      {m.code} {missionName(cfg, m.id)}
                    </Link>
                  </td>
                  <Num n={mine.filter((a) => a.type === "seeker").length} href={`/dealroom/applications?mission=${m.id}&type=seeker`} />
                  <Num n={mine.filter((a) => a.type === "provider").length} href={`/dealroom/applications?mission=${m.id}&type=provider`} />
                  <Num n={mine.filter((a) => ["Submitted", "In review", "Information requested"].includes(a.status)).length} href={`/dealroom/applications?mission=${m.id}&status=${encodeURIComponent("Submitted,In review,Information requested")}`} />
                  <Num n={mine.filter(qualified).length} href={`/dealroom/applications?mission=${m.id}&flag=qualified`} />
                  <Num n={mine.filter((a) => a.type === "seeker" && qualified(a) && a.readiness === "Deal Room Ready").length} href={`/dealroom/applications?mission=${m.id}&flag=ready`} />
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

/** A table count that opens the records behind it; a zero stays plain. */
function Num({ n, href }: { n: number; href: string }) {
  return <td className="td-r">{n > 0 ? <Link href={href} className="hover:underline underline-offset-4">{n}</Link> : <span className="text-slate">0</span>}</td>;
}
