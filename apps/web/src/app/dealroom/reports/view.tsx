"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageHeader, Section, Stat, Tabs } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DR_ZONE, bothAccepted, funnel, ticketBand, compact, conversionValues, decisionOf, drCan, matchStage, medianDays, missionName, occupies, oppOpen, oppOverdue, oppParties, qualified, staffName, type MatchStage } from "@excursia/domain/dealroom/logic";
import type { DrApplication, DrMeeting, DrOpportunity } from "@excursia/domain/dealroom/types";
import { row } from "@excursia/domain/csv";
import { downloadCsv } from "@/lib/download";
import { addMinutes, fmtStamp } from "@excursia/domain/time";
import { Refusal, useDr, useOpenable } from "../bits";
import { ChartCard, HBars, StackedColumns } from "./charts";

const allTabs = ["Overview", "Mobilisation", "Qualification", "Verification", "Matchmaking", "Meetings", "Daily", "Conversion"] as const;
type Tab = (typeof allTabs)[number];

/** PRD Reporting: one table per area, each broken down and exportable. Role limits apply (req. 5): reviewers see
 *  qualification and matching, operations meetings, the lead everything. */
export default function Reports() {
  const { dr, cfg, me } = useDr();
  const q = useSearchParams();
  const review = drCan(me, "review");
  const ops = drCan(me, "schedule");
  // conversion values are the lead's alone (PRD Reporting req. 5)
  // Momentum's oversight reads every report; nothing in them opens a file
  const tabs = allTabs.filter((t) => (t === "Overview" || me?.role === "Oversight" ? true : t === "Conversion" ? drCan(me, "conversion") : ["Mobilisation", "Qualification", "Verification", "Matchmaking"].includes(t) ? review : ops || me?.role === "Lead"));
  const [picked, setTab] = useState<Tab | null>(null);
  const asked = allTabs.find((t) => t === q.get("tab"));
  const tab = picked ?? (asked && tabs.includes(asked) ? asked : tabs[0]);
  if (!cfg) return null;
  if (!tabs.length) return <Refusal title="No reports for this role" />;
  const apps = dr.apps.filter((a) => a.eventId === cfg.eventId);

  return (
    <>
      <PageHeader title="Reports" kicker="Graphs on the Overview; every bar, segment and count opens the records behind it, where your role can open them. Tables break down and download as CSV. What you see depends on your role." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "Overview" && <Overview />}
      {tab === "Mobilisation" && <Mobilisation apps={apps} />}
      {tab === "Qualification" && <Qualification apps={apps} />}
      {tab === "Verification" && <VerificationReport apps={apps} />}
      {tab === "Matchmaking" && <Matchmaking />}
      {tab === "Meetings" && <MeetingsReport />}
      {tab === "Daily" && <Daily day={q.get("day") ?? undefined} />}
      {tab === "Conversion" && <Conversion />}
    </>
  );
}

type Col<T> = { h: string; v: (x: T) => ReactNode; csv?: (x: T) => unknown; right?: boolean; href?: (x: T) => string | undefined };

/** A query string from the filters a drill-down passes on; empty ones are left out. */
const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");

function Table<T>({ title, rows, cols, file }: { title: string; rows: T[]; cols: Col<T>[]; file: string }) {
  const open = useOpenable();
  return (
    <Section
      title={title}
      flush
      action={
        <button className="btn-secondary btn-sm" onClick={() => downloadCsv(file, [row(cols.map((c) => c.h)), ...rows.map((r) => row(cols.map((c) => (c.csv ? c.csv(r) : c.v(r)))))])}>
          Download CSV
        </button>
      }
    >
      <table className="w-full">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.h} className={c.right ? "th-r" : "th"}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-paper">
              {cols.map((c) => {
                const v = c.v(r);
                const href = c.href && v !== 0 && v !== "–" ? open(c.href(r)) : undefined;
                return (
                  <td key={c.h} className={c.right ? "td-r" : "td"}>
                    {href ? (
                      <Link href={href} className="hover:underline underline-offset-4">
                        {v}
                      </Link>
                    ) : (
                      v
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function groups(apps: DrApplication[], key: (a: DrApplication) => string) {
  const m = new Map<string, DrApplication[]>();
  for (const a of apps) m.set(key(a), [...(m.get(key(a)) ?? []), a]);
  return [...m.entries()].map(([k, list]) => ({ k, list })).sort((a, b) => b.list.length - a.list.length);
}

function Mobilisation({ apps }: { apps: DrApplication[] }) {
  const { dr, cfg } = useDr();
  const [by, setBy] = useState<"mission" | "source" | "owner" | "type">("mission");
  const label = (a: DrApplication) => (by === "mission" ? missionName(cfg!, a.mission) : by === "source" ? a.source : by === "owner" ? staffName(dr, a.owner) : a.type === "seeker" ? "Capital seeker" : "Finance provider");
  const g = groups(apps, label);
  const scope = (x: { list: DrApplication[] }) => {
    const a = x.list[0];
    return by === "mission" ? { mission: a.mission } : by === "source" ? { source: a.source } : by === "owner" ? { owner: a.owner } : { type: a.type };
  };
  const to = (x: { list: DrApplication[] }, more: Record<string, string>) => `/dealroom/applications?${qs({ ...scope(x), ...more })}`;
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-[14px]">
        <span className="text-slate">Break down by</span>
        <select className="input h-9 w-auto" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="mission">Mission</option>
          <option value="source">Source</option>
          <option value="owner">Owner</option>
          <option value="type">Counterparty type</option>
        </select>
      </div>
      <Table
        title="From lead to submission"
        file={`deal-room-mobilisation-by-${by}`}
        rows={g}
        cols={[
          { h: by[0].toUpperCase() + by.slice(1), v: (x) => x.k },
          { h: "Leads", v: (x) => x.list.filter((a) => a.status === "Lead" || a.status === "Invited").length, right: true, href: (x) => to(x, { flag: "leads" }) },
          { h: "Started", v: (x) => x.list.filter((a) => a.status !== "Lead" && a.status !== "Invited").length, right: true, href: (x) => to(x, { status: "Draft,Submitted,In review,Information requested,Decided" }) },
          { h: "Submitted", v: (x) => x.list.filter((a) => !!a.ref).length, right: true, href: (x) => to(x, { flag: "submitted" }) },
          { h: "Days to first review, median", v: (x) => medianDays(x.list.map((a) => [a.submittedAt, a.firstReviewAt])) ?? "–", right: true },
        ]}
      />
    </>
  );
}

function Qualification({ apps }: { apps: DrApplication[] }) {
  const { dr, cfg } = useDr();
  const [by, setBy] = useState<"mission" | "reviewer">("mission");
  const seekers = apps.filter((a) => a.type === "seeker" && a.ref);
  const g = groups(seekers, (a) => (by === "mission" ? missionName(cfg!, a.mission) : a.assignee ? staffName(dr, a.assignee) : "Not assigned"));
  const dec = (l: DrApplication[], d: string) => l.filter((a) => decisionOf(a)?.decision === d).length;
  const to = (x: { list: DrApplication[] }, more: Record<string, string>) => `/dealroom/applications?${qs({ type: "seeker", ...(by === "mission" ? { mission: x.list[0].mission } : { assignee: x.list[0].assignee ?? "none" }), ...more })}`;
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-[14px]">
        <span className="text-slate">Break down by</span>
        <select className="input h-9 w-auto" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="mission">Mission</option>
          <option value="reviewer">Reviewer</option>
        </select>
      </div>
      <Table
        title="Capital seekers, from submission to Deal Room Ready"
        file={`deal-room-qualification-by-${by}`}
        rows={g}
        cols={[
          { h: by === "mission" ? "Mission" : "Reviewer", v: (x) => x.k },
          { h: "In review", v: (x) => x.list.filter((a) => a.status === "Submitted" || a.status === "In review").length, right: true, href: (x) => to(x, { status: "Submitted,In review" }) },
          { h: "Info requested", v: (x) => x.list.filter((a) => a.status === "Information requested").length, right: true, href: (x) => to(x, { status: "Information requested" }) },
          { h: "Qualified", v: (x) => dec(x.list, "Qualified"), right: true, href: (x) => to(x, { decision: "Qualified" }) },
          { h: "Conditional", v: (x) => dec(x.list, "Conditional"), right: true, href: (x) => to(x, { decision: "Conditional" }) },
          { h: "Referred", v: (x) => dec(x.list, "Referred"), right: true, href: (x) => to(x, { decision: "Referred" }) },
          { h: "Declined", v: (x) => dec(x.list, "Declined"), right: true, href: (x) => to(x, { decision: "Declined" }) },
          { h: "Ready", v: (x) => x.list.filter((a) => qualified(a) && a.readiness === "Deal Room Ready").length, right: true, href: (x) => to(x, { flag: "ready" }) },
          { h: "Days to decision, median", v: (x) => medianDays(x.list.filter((a) => a.status === "Decided").map((a) => [a.submittedAt, a.statusAt])) ?? "–", right: true },
        ]}
      />
    </>
  );
}

function VerificationReport({ apps }: { apps: DrApplication[] }) {
  const providers = apps.filter((a) => a.type === "provider" && a.ref);
  const g = groups(providers, (a) => a.providerKind ?? "Not set");
  const to = (x: { list: DrApplication[] }, more: Record<string, string>) => `/dealroom/applications?${qs({ type: "provider", kind: x.list[0].providerKind, ...more })}`;
  return (
    <Table
      title="Finance providers by type"
      file="deal-room-verification"
      rows={g}
      cols={[
        { h: "Type", v: (x) => x.k },
        { h: "Applied", v: (x) => x.list.length, right: true, href: (x) => to(x, { flag: "submitted" }) },
        { h: "KYC pending", v: (x) => x.list.filter((a) => a.verification?.state === "Verification pending").length, right: true, href: (x) => to(x, { verification: "Verification pending" }) },
        { h: "NDA signed", v: (x) => x.list.filter((a) => !!a.verification?.nda).length, right: true, href: (x) => to(x, { nda: "1" }) },
        { h: "Verified", v: (x) => x.list.filter((a) => a.verification?.state === "Verified").length, right: true, href: (x) => to(x, { verification: "Verified" }) },
        { h: "Declined", v: (x) => x.list.filter((a) => a.verification?.state === "Declined").length, right: true, href: (x) => to(x, { verification: "Declined" }) },
      ]}
    />
  );
}

const STAGES: MatchStage[] = ["Approved", "Introduced", "Accepted", "Declined", "Expired", "Rejected", "Deferred", "Suggested"];

function Matchmaking() {
  const { dr, cfg, now } = useDr();
  const [by, setBy] = useState<"mission" | "sector" | "ticket">("mission");
  const rows = dr.matches.map((m) => {
    const s = dr.apps.find((a) => a.id === m.seekerId)!;
    return { m, st: matchStage(m, cfg!, now), key: by === "mission" ? missionName(cfg!, s.mission) : by === "sector" ? s.org.sector : ticketBand(s.ask?.amount ?? 0), mission: s.mission };
  });
  const to = (x: { k: string; list: { mission: string }[] }, st: string) => `/dealroom/matching?${qs({ tab: "By mission", mission: by === "mission" ? x.list[0].mission : "All", sector: by === "sector" ? x.k : undefined, band: by === "ticket" ? x.k : undefined, stage: st })}`;
  const groups = [...new Set(rows.map((r) => r.key))].map((k) => ({ k, list: rows.filter((r) => r.key === k) }));
  const answered = (side: "seeker" | "provider") => dr.matches.filter((m) => m.intro?.[side]);
  const rate = (side: "seeker" | "provider") => (answered(side).length ? Math.round((answered(side).filter((m) => m.intro![side]!.response === "Accepted").length / answered(side).length) * 100) : 0);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[14px]">
        <span className="text-slate">Break down by</span>
        <select className="input h-9 w-auto" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="mission">Mission</option>
          <option value="sector">Sector</option>
          <option value="ticket">Ticket band</option>
        </select>
        <span className="text-slate">Acceptance: seekers {rate("seeker")}%, providers {rate("provider")}%</span>
      </div>
      <Table
        title="From proposal to acceptance"
        file={`deal-room-matchmaking-by-${by}`}
        rows={groups}
        cols={[{ h: by[0].toUpperCase() + by.slice(1), v: (x) => x.k }, ...STAGES.map((st) => ({ h: st, v: (x: { list: { st: MatchStage }[] }) => x.list.filter((r) => r.st === st).length, right: true, href: (x: (typeof groups)[number]) => to(x, st) }))]}
      />
    </>
  );
}

function MeetingsReport() {
  const { state } = useStore();
  const { dr, cfg, event, now } = useDr();
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10));
  const list = dr.meetings;
  const tables = Object.values(cfg!.rooms).reduce((a, r) => a + r.tables, 0);
  const slotsPerDay = Math.floor(((Number(cfg!.rules.dayEnd.slice(0, 2)) - Number(cfg!.rules.dayStart.slice(0, 2))) * 60) / (cfg!.rules.meetingMin + cfg!.rules.bufferMin));
  const rows = days.map((d) => {
    const ms = list.filter((m) => m.start.slice(0, 10) === d);
    const booked = ms.filter((m) => occupies(m, cfg!, now) || m.status === "Held");
    return { d, proposed: ms.filter((m) => m.status === "Proposed").length, confirmed: ms.filter((m) => ["Confirmed", "In progress"].includes(m.status)).length, held: ms.filter((m) => m.status === "Held").length, cancelled: ms.filter((m) => m.status === "Cancelled").length, changed: ms.filter((m) => m.status === "Change requested" || m.history.some((h) => h.what.startsWith("Moved"))).length, noShow: ms.filter((m) => m.status === "No-show").length, use: Math.round((booked.filter((m) => !m.link).length / (tables * slotsPerDay)) * 100) };
  });
  const byRoom = state.rooms.filter((r) => r.zoneId === DR_ZONE && !!cfg!.rooms[r.id]).map((r) => ({ r, n: list.filter((m) => m.roomId === r.id && m.status !== "Cancelled").length, cap: (cfg!.rooms[r.id]?.tables ?? 0) * slotsPerDay * event.days }));
  return (
    <div className="space-y-4">
      <Table
        title="Meetings by day"
        file="deal-room-meetings-by-day"
        rows={rows}
        cols={[
          { h: "Day", v: (x) => fmtStamp(x.d, false), csv: (x) => x.d, href: (x) => `/dealroom/meetings?${qs({ tab: "Schedule", day: x.d })}` },
          { h: "Proposed", v: (x) => x.proposed, right: true, href: (x) => `/dealroom/meetings?${qs({ tab: "Schedule", day: x.d, status: "Proposed" })}` },
          { h: "Confirmed", v: (x) => x.confirmed, right: true, href: (x) => `/dealroom/meetings?${qs({ tab: "Schedule", day: x.d, status: "Confirmed,In progress" })}` },
          { h: "Held", v: (x) => x.held, right: true, href: (x) => `/dealroom/meetings?${qs({ tab: "Schedule", day: x.d, status: "Held" })}` },
          { h: "Moved", v: (x) => x.changed, right: true, href: () => "/dealroom/meetings?tab=Changes" },
          { h: "Cancelled", v: (x) => x.cancelled, right: true },
          { h: "No-show", v: (x) => x.noShow, right: true, href: (x) => `/dealroom/meetings?${qs({ tab: "Schedule", day: x.d, status: "No-show" })}` },
          { h: "Room use", v: (x) => `${x.use}%`, right: true },
        ]}
      />
      <Table title="Room utilisation, whole summit" file="deal-room-rooms" rows={byRoom} cols={[{ h: "Room", v: (x) => x.r.name }, { h: "Meetings", v: (x) => x.n, right: true, href: () => "/dealroom/meetings?tab=Schedule" }, { h: "Table slots", v: (x) => x.cap, right: true }, { h: "Used", v: (x) => `${x.cap ? Math.round((x.n / x.cap) * 100) : 0}%`, right: true }]} />
    </div>
  );
}

/** DL-9: the evening report for one summit day: meetings, no-shows, outcomes, next actions, room use. */
function Daily({ day }: { day?: string }) {
  const { dr, event, now } = useDr();
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10)).filter((d) => d <= now.slice(0, 10));
  const [d, setD] = useState(day && days.includes(day) ? day : days[days.length - 1] ?? event.startDate);
  const ms = dr.meetings.filter((m) => m.start.slice(0, 10) === d && m.status !== "Cancelled");
  const cat = (c: string) => ms.filter((m) => m.outcome?.category === c).length;
  const missing = ms.filter((m) => m.end <= now && ["Confirmed", "In progress"].includes(m.status));
  const actions = ms.filter((m) => m.outcome?.nextAction);
  const name = (m: DrMeeting) => {
    const mm = dr.matches.find((x) => x.id === m.matchId)!;
    return `${dr.apps.find((a) => a.id === mm.seekerId)?.org.name} · ${dr.apps.find((a) => a.id === mm.providerId)?.org.name}`;
  };
  if (!days.length) return <Section title="Daily report">The first report goes out at 19:00 on the first summit day.</Section>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {days.map((x) => (
          <button key={x} className={x === d ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setD(x)}>
            {fmtStamp(x, false)}
          </button>
        ))}
      </div>
      <Section title={`Daily report, ${fmtStamp(d, false)}${d === now.slice(0, 10) && now.slice(11) < "19:00" ? ", so far" : ""}`}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Scheduled", ms.length, ""],
              ["Held", ms.filter((m) => m.status === "Held").length, "Held"],
              ["No-shows", ms.filter((m) => m.status === "No-show").length, "No-show"],
              ["Diligence or proposal", cat("Due diligence") + cat("Financing or partnership proposal") + cat("Commitment documented"), "Held"],
              ["Follow-up or information", cat("Follow-up meeting") + cat("Information requested") + cat("Pilot or procurement"), "Held"],
              ["No fit", cat("No fit"), "Held"],
            ] as const
          ).map(([k, v, st]) => (
            <Go key={k} href={`/dealroom/meetings?${qs({ tab: "Schedule", day: d, status: st || undefined })}`} className="group">
              <div className="t-stat group-hover:underline underline-offset-4">{v}</div>
              <div className="text-[13px] text-slate">{k}</div>
            </Go>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="mt-4 text-[14px] text-bad">
            {missing.length} meeting{missing.length > 1 ? "s" : ""} ended without an outcome: operations fixes them before the report is sent again.{" "}
            <Go className="link" href="/dealroom/live">
              Open the live board
            </Go>
          </p>
        )}
      </Section>
      <Section title={`${actions.length} next actions created`} flush>
        <table className="w-full">
          <tbody>
            {actions.map((m) => (
              <tr key={m.id}>
                <td className="td text-[13px]">
                  {dr.opportunities.find((o) => o.meetingId === m.id) ? (
                    <Go className="hover:underline" href={`/dealroom/opportunities/${dr.opportunities.find((o) => o.meetingId === m.id)!.id}`}>
                      {name(m)}
                    </Go>
                  ) : (
                    <Go className="hover:underline" href={`/dealroom/matches/${m.matchId}`}>
                      {name(m)}
                    </Go>
                  )}
                </td>
                <td className="td text-[13px]">{m.outcome!.nextAction}</td>
                <td className="td text-[13px]">{staffName(dr, m.outcome!.owner)}</td>
                <td className="td text-[13px]">{m.outcome!.due && fmtStamp(m.outcome!.due, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

/** PRD Reporting, Conversion: value at the stage it is evidenced, never summed across stages; overdue actions; closed by reason. */
function Conversion() {
  const { dr, cfg, now } = useDr();
  const [by, setBy] = useState<"owner" | "mission" | "sector" | "month">("owner");
  const opps = dr.opportunities.filter((o) => o.eventId === cfg!.eventId);
  const sector = (o: DrOpportunity) => oppParties(dr, o).seeker?.org.sector ?? "–";
  const key = (o: DrOpportunity) => (by === "owner" ? staffName(dr, o.owner) : by === "mission" ? missionName(cfg!, oppParties(dr, o).seeker?.mission ?? "") : by === "sector" ? sector(o) : (o.stageDates["Follow-up"] ?? "").slice(0, 7));
  const groups = [...new Set(opps.map(key))].sort().map((k) => ({ k, list: opps.filter((o) => key(o) === k) }));
  const total = { k: "All", list: opps };
  const money = (list: DrOpportunity[], f: "sought" | "promised" | "committed" | "received") =>
    Object.entries(conversionValues(dr, list))
      .filter(([, v]) => v[f] > 0)
      .map(([cur, v]) => compact(v[f], cur))
      .join(" · ") || "–";
  const reasons = ["No fit", "Timing", "Terms", "Diligence failed", "Other"].map((r) => ({ r, list: opps.filter((o) => o.closed?.reason === r) }));
  const scope = (x: { k: string; list: DrOpportunity[] }) => {
    if (x.k === "All" || !x.list.length) return {};
    const o = x.list[0];
    return by === "owner" ? { owner: o.owner } : by === "mission" ? { mission: oppParties(dr, o).seeker?.mission } : by === "sector" ? { sector: sector(o) } : { month: x.k };
  };
  const to = (x: { k: string; list: DrOpportunity[] }, more: Record<string, string>) => `/dealroom/opportunities?${qs({ ...scope(x), ...more })}`;
  const overdue = opps.filter((o) => oppOverdue(o, now)).sort((a, b) => a.due.localeCompare(b.due));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[14px]">
        <span className="text-slate">Break down by</span>
        <select className="input h-9 w-auto" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="owner">Owner</option>
          <option value="mission">Mission</option>
          <option value="sector">Sector</option>
          <option value="month">Month opened</option>
        </select>
        <span className="text-[13px] text-slate">Value counts at the stage it is evidenced: sought, promised, committed, received are never added together.</span>
      </div>
      <Table
        title="Opportunities and value by stage of evidence"
        file={`deal-room-conversion-by-${by}`}
        rows={[...groups, total]}
        cols={[
          { h: by === "month" ? "Month opened" : by[0].toUpperCase() + by.slice(1), v: (x) => (x.k === "All" ? <b className="font-medium">All</b> : x.k), csv: (x) => x.k },
          { h: "Open", v: (x) => x.list.filter(oppOpen).length, right: true, href: (x) => to(x, {}) },
          { h: "Overdue", v: (x) => x.list.filter((o) => oppOverdue(o, now)).length, right: true, href: (x) => to(x, { flag: "overdue" }) },
          { h: "Won", v: (x) => x.list.filter((o) => o.stage === "Closed – won").length, right: true, href: (x) => to(x, { stage: "Closed – won" }) },
          { h: "Lost", v: (x) => x.list.filter((o) => !!o.closed).length, right: true, href: (x) => to(x, { stage: "Closed – lost" }) },
          { h: "Sought", v: (x) => money(x.list, "sought"), right: true },
          { h: "Indicative", v: (x) => money(x.list, "promised"), right: true, href: (x) => to(x, { has: "Indicative commitment" }) },
          { h: "Signed or approved", v: (x) => money(x.list, "committed"), right: true, href: (x) => to(x, { has: "Signed commitment" }) },
          { h: "Deployed", v: (x) => money(x.list, "received"), right: true, href: (x) => to(x, { has: "Deployed" }) },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Table title="Closed as lost, by reason" file="deal-room-closed-by-reason" rows={reasons} cols={[{ h: "Reason", v: (x) => x.r }, { h: "Opportunities", v: (x) => x.list.length, right: true, href: (x) => `/dealroom/opportunities?${qs({ reason: x.r })}` }]} />
        <Table
          title={`Overdue next actions, ${overdue.length}`}
          file="deal-room-overdue-actions"
          rows={overdue}
          cols={[
            { h: "Opportunity", v: (o) => `${oppParties(dr, o).seeker?.org.name} · ${oppParties(dr, o).provider?.org.name}`, href: (o) => `/dealroom/opportunities/${o.id}` },
            { h: "Owner", v: (o) => staffName(dr, o.owner) },
            { h: "Next action", v: (o) => o.nextAction },
            { h: "Due", v: (o) => fmtStamp(o.due, false), csv: (o) => o.due },
          ]}
        />
      </div>
    </>
  );
}

/** The graphs: each answers one question, each mark opens the records it counts, each card links its table. What a role sees follows PRD Reporting req. 5. */
function Overview() {
  const { dr, cfg, me, now, can, event } = useDr();
  const open = useOpenable();
  if (!cfg) return null;
  const f = funnel(dr, cfg.eventId);
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10));
  // the lead and Momentum's oversight see every opportunity; anyone else sees their own
  const lead = can("conversion") || me?.role === "Oversight";
  const opps = dr.opportunities.filter((o) => o.eventId === cfg.eventId && (lead || o.owner === me?.id));
  const stages = STAGES.map((st) => ({ st, n: dr.matches.filter((m) => matchStage(m, cfg, now) === st).length }));
  const usd = conversionValues(dr, dr.opportunities.filter((o) => o.eventId === cfg.eventId)).USD ?? { sought: 0, promised: 0, committed: 0, received: 0 };
  const booked = (m: DrMeeting) => ["Confirmed", "In progress", "Proposed", "Change requested"].includes(m.status) && occupies(m, cfg, now);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Qualified, of 150" value={f.qualified} href={open("/dealroom/applications?flag=qualified")} />
        <Stat label="Ready on both sides, of 60" value={dr.matches.filter(bothAccepted).length} href={open("/dealroom/matching?tab=By%20mission&mission=All&stage=Accepted")} />
        <Stat label="Meetings booked or held, of 200" value={dr.meetings.filter((m) => occupies(m, cfg, now) || m.status === "Held").length} href={open("/dealroom/meetings?tab=Schedule")} />
        <Stat label={lead ? "Opportunities open" : "Your opportunities open"} value={opps.filter(oppOpen).length} href={open("/dealroom/opportunities")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {can("review") && (
          <ChartCard title="From lead to Deal Room Ready" sub="Applications at each step. Click a bar for the list." table={{ href: "/dealroom/reports?tab=Mobilisation", label: "As a table" }}>
            <HBars
              rows={[
                { label: "Leads and invitations", value: f.leads, href: "/dealroom/applications?flag=leads" },
                { label: "Started", value: f.started, href: "/dealroom/applications" },
                { label: "Submitted", value: f.submitted, href: "/dealroom/applications?flag=submitted" },
                { label: "Decided", value: f.decided, href: "/dealroom/applications?flag=decided" },
                { label: "Qualified", value: f.qualified, href: "/dealroom/applications?flag=qualified" },
                { label: "Deal Room Ready", value: f.ready, href: "/dealroom/applications?flag=ready" },
              ]}
            />
          </ChartCard>
        )}
        {can("match") && (
          <ChartCard title="Pairs by stage" sub="Every seeker and provider pair the team has looked at. Click a bar for the pairs." table={{ href: "/dealroom/reports?tab=Matchmaking", label: "As a table" }}>
            <HBars rows={stages.map(({ st, n }) => ({ label: st, value: n, href: `/dealroom/matching?${qs({ tab: "By mission", mission: "All", stage: st })}` }))} />
          </ChartCard>
        )}
        {(can("schedule") || me?.role === "Lead") && (
          <ChartCard title="Meetings by summit day" sub="Click a segment for that day's meetings on the schedule." table={{ href: "/dealroom/reports?tab=Meetings", label: "As a table" }}>
            <StackedColumns
              series={[
                { key: "Held", label: "Held" },
                { key: "Booked", label: "Booked, not yet held" },
                { key: "No-show", label: "No-show" },
              ]}
              columns={days.map((d) => {
                const ms = dr.meetings.filter((m) => m.start.slice(0, 10) === d);
                return {
                  label: fmtStamp(d, false),
                  segments: [
                    { key: "Held", value: ms.filter((m) => m.status === "Held").length, href: `/dealroom/meetings?${qs({ tab: "Schedule", day: d, status: "Held" })}` },
                    { key: "Booked", value: ms.filter(booked).length, href: `/dealroom/meetings?${qs({ tab: "Schedule", day: d, status: "Confirmed,In progress,Proposed,Change requested" })}` },
                    { key: "No-show", value: ms.filter((m) => m.status === "No-show").length, href: `/dealroom/meetings?${qs({ tab: "Schedule", day: d, status: "No-show" })}` },
                  ],
                };
              })}
            />
          </ChartCard>
        )}
        {(lead || me?.role === "Reviewer") && (
          <ChartCard title={lead ? "Opportunities by stage" : "Your opportunities by stage"} sub="Click a bar for the opportunities." table={lead ? { href: "/dealroom/reports?tab=Conversion", label: "As a table" } : undefined}>
            <HBars rows={(["Follow-up", "Diligence", "Negotiation", "Closed – won", "Closed – lost"] as const).map((st) => ({ label: st, value: opps.filter((o) => o.stage === st).length, href: `/dealroom/opportunities?${qs({ stage: st })}` }))} />
          </ChartCard>
        )}
        {lead && (
          <ChartCard title="Value at each stage of evidence" sub="US dollars. Counted where the evidence is, never added across stages. Click a bar for the opportunities." table={{ href: "/dealroom/reports?tab=Conversion", label: "As a table" }}>
            <HBars
              rows={[
                { label: "Sought", value: usd.sought, shown: compact(usd.sought), href: "/dealroom/opportunities" },
                { label: "Indicative", value: usd.promised, shown: compact(usd.promised), href: `/dealroom/opportunities?has=${encodeURIComponent("Indicative commitment")}` },
                { label: "Signed or approved", value: usd.committed, shown: compact(usd.committed), href: `/dealroom/opportunities?has=${encodeURIComponent("Signed commitment")}` },
                { label: "Deployed", value: usd.received, shown: compact(usd.received), href: "/dealroom/opportunities?has=Deployed" },
              ]}
            />
          </ChartCard>
        )}
      </div>
    </>
  );
}

/** A link the viewer can open, or the same content plain: a report never ends in a refusal. */
function Go({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const open = useOpenable();
  if (open(href))
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  return <span className={className?.includes("group") ? "block" : undefined}>{children}</span>;
}
