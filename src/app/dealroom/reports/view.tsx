"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageHeader, Section, Tabs } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DR_ZONE, compact, conversionValues, decisionOf, drCan, matchStage, medianDays, missionName, occupies, oppOpen, oppOverdue, oppParties, qualified, staffName, type MatchStage } from "@/lib/dealroom/logic";
import type { DrApplication, DrMeeting, DrOpportunity } from "@/lib/dealroom/types";
import { downloadCsv, row } from "@/lib/csv";
import { addMinutes, fmtStamp } from "@/lib/time";
import { Refusal, useDr } from "../bits";

const allTabs = ["Mobilisation", "Qualification", "Verification", "Matchmaking", "Meetings", "Daily", "Conversion"] as const;
type Tab = (typeof allTabs)[number];

/** PRD Reporting: one table per area, each broken down and exportable. Role limits apply (req. 5): reviewers see
 *  qualification and matching, operations meetings, the lead everything. */
export default function Reports() {
  const { dr, cfg, me } = useDr();
  const q = useSearchParams();
  const review = drCan(me, "review");
  const ops = drCan(me, "schedule");
  // conversion values are the lead's alone (PRD Reporting req. 5)
  const tabs = allTabs.filter((t) => (t === "Conversion" ? drCan(me, "conversion") : ["Mobilisation", "Qualification", "Verification", "Matchmaking"].includes(t) ? review : ops || me?.role === "Lead"));
  const [picked, setTab] = useState<Tab | null>(null);
  const asked = allTabs.find((t) => t === q.get("tab"));
  const tab = picked ?? (asked && tabs.includes(asked) ? asked : tabs[0]);
  if (!cfg) return null;
  if (!tabs.length) return <Refusal title="No reports for this role" />;
  const apps = dr.apps.filter((a) => a.eventId === cfg.eventId);

  return (
    <>
      <PageHeader title="Reports" kicker="Every table breaks down and downloads as CSV. What you see depends on your role." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
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

type Col<T> = { h: string; v: (x: T) => ReactNode; csv?: (x: T) => unknown; right?: boolean };

function Table<T>({ title, rows, cols, file }: { title: string; rows: T[]; cols: Col<T>[]; file: string }) {
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
              {cols.map((c) => (
                <td key={c.h} className={c.right ? "td-r" : "td"}>
                  {c.v(r)}
                </td>
              ))}
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
          { h: "Leads", v: (x) => x.list.filter((a) => a.status === "Lead" || a.status === "Invited").length, right: true },
          { h: "Started", v: (x) => x.list.filter((a) => a.status !== "Lead" && a.status !== "Invited").length, right: true },
          { h: "Submitted", v: (x) => x.list.filter((a) => !!a.ref).length, right: true },
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
          { h: "In review", v: (x) => x.list.filter((a) => a.status === "Submitted" || a.status === "In review").length, right: true },
          { h: "Info requested", v: (x) => x.list.filter((a) => a.status === "Information requested").length, right: true },
          { h: "Approved", v: (x) => dec(x.list, "Approved"), right: true },
          { h: "Conditional", v: (x) => dec(x.list, "Conditional"), right: true },
          { h: "Waitlisted", v: (x) => dec(x.list, "Waitlisted"), right: true },
          { h: "Declined", v: (x) => dec(x.list, "Declined"), right: true },
          { h: "Ready", v: (x) => x.list.filter((a) => qualified(a) && a.readiness === "Deal Room Ready").length, right: true },
          { h: "Days to decision, median", v: (x) => medianDays(x.list.filter((a) => a.status === "Decided").map((a) => [a.submittedAt, a.statusAt])) ?? "–", right: true },
        ]}
      />
    </>
  );
}

function VerificationReport({ apps }: { apps: DrApplication[] }) {
  const providers = apps.filter((a) => a.type === "provider" && a.ref);
  const g = groups(providers, (a) => a.providerKind ?? "Not set");
  return (
    <Table
      title="Finance providers by type"
      file="deal-room-verification"
      rows={g}
      cols={[
        { h: "Type", v: (x) => x.k },
        { h: "Applied", v: (x) => x.list.length, right: true },
        { h: "KYC pending", v: (x) => x.list.filter((a) => a.verification?.state === "Verification pending").length, right: true },
        { h: "NDA signed", v: (x) => x.list.filter((a) => !!a.verification?.nda).length, right: true },
        { h: "Verified", v: (x) => x.list.filter((a) => a.verification?.state === "Verified").length, right: true },
        { h: "Declined", v: (x) => x.list.filter((a) => a.verification?.state === "Declined").length, right: true },
      ]}
    />
  );
}

const STAGES: MatchStage[] = ["Approved", "Introduced", "Accepted", "Declined", "Expired", "Rejected", "Deferred", "Suggested"];

function Matchmaking() {
  const { dr, cfg, now } = useDr();
  const [by, setBy] = useState<"mission" | "sector" | "ticket">("mission");
  const band = (a: number) => (a < 1e6 ? "Under USD 1m" : a < 5e6 ? "USD 1m to 5m" : "USD 5m and over");
  const rows = dr.matches.map((m) => {
    const s = dr.apps.find((a) => a.id === m.seekerId)!;
    return { m, st: matchStage(m, cfg!, now), key: by === "mission" ? missionName(cfg!, s.mission) : by === "sector" ? s.org.sector : band(s.ask?.amount ?? 0) };
  });
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
        cols={[{ h: by[0].toUpperCase() + by.slice(1), v: (x) => x.k }, ...STAGES.map((st) => ({ h: st, v: (x: { list: { st: MatchStage }[] }) => x.list.filter((r) => r.st === st).length, right: true }))]}
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
  const byRoom = state.rooms.filter((r) => r.zoneId === DR_ZONE).map((r) => ({ r, n: list.filter((m) => m.roomId === r.id && m.status !== "Cancelled").length, cap: (cfg!.rooms[r.id]?.tables ?? 0) * slotsPerDay * event.days }));
  return (
    <div className="space-y-4">
      <Table
        title="Meetings by day"
        file="deal-room-meetings-by-day"
        rows={rows}
        cols={[
          { h: "Day", v: (x) => fmtStamp(x.d, false), csv: (x) => x.d },
          { h: "Proposed", v: (x) => x.proposed, right: true },
          { h: "Confirmed", v: (x) => x.confirmed, right: true },
          { h: "Held", v: (x) => x.held, right: true },
          { h: "Moved", v: (x) => x.changed, right: true },
          { h: "Cancelled", v: (x) => x.cancelled, right: true },
          { h: "No-show", v: (x) => x.noShow, right: true },
          { h: "Room use", v: (x) => `${x.use}%`, right: true },
        ]}
      />
      <Table title="Room utilisation, whole summit" file="deal-room-rooms" rows={byRoom} cols={[{ h: "Room", v: (x) => x.r.name }, { h: "Meetings", v: (x) => x.n, right: true }, { h: "Table slots", v: (x) => x.cap, right: true }, { h: "Used", v: (x) => `${x.cap ? Math.round((x.n / x.cap) * 100) : 0}%`, right: true }]} />
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
          {[
            ["Scheduled", ms.length],
            ["Held", ms.filter((m) => m.status === "Held").length],
            ["No-shows", ms.filter((m) => m.status === "No-show").length],
            ["Positive", cat("Positive")],
            ["Follow-up needed", cat("Follow-up needed")],
            ["Not a fit", cat("Not a fit")],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div className="t-stat">{v}</div>
              <div className="text-[13px] text-slate">{k}</div>
            </div>
          ))}
        </div>
        {missing.length > 0 && <p className="mt-4 text-[14px] text-bad">{missing.length} meeting{missing.length > 1 ? "s" : ""} ended without an outcome: operations fixes them before the report is sent again.</p>}
      </Section>
      <Section title={`${actions.length} next actions created`} flush>
        <table className="w-full">
          <tbody>
            {actions.map((m) => (
              <tr key={m.id}>
                <td className="td text-[13px]">{name(m)}</td>
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
          { h: "Open", v: (x) => x.list.filter(oppOpen).length, right: true },
          { h: "Overdue", v: (x) => x.list.filter((o) => oppOverdue(o, now)).length, right: true },
          { h: "Won", v: (x) => x.list.filter((o) => o.stage === "Closed – won").length, right: true },
          { h: "Lost", v: (x) => x.list.filter((o) => !!o.closed).length, right: true },
          { h: "Sought", v: (x) => money(x.list, "sought"), right: true },
          { h: "Promised", v: (x) => money(x.list, "promised"), right: true },
          { h: "Committed", v: (x) => money(x.list, "committed"), right: true },
          { h: "Received", v: (x) => money(x.list, "received"), right: true },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Table title="Closed as lost, by reason" file="deal-room-closed-by-reason" rows={reasons} cols={[{ h: "Reason", v: (x) => x.r }, { h: "Opportunities", v: (x) => x.list.length, right: true }]} />
        <Table
          title={`Overdue next actions, ${overdue.length}`}
          file="deal-room-overdue-actions"
          rows={overdue}
          cols={[
            { h: "Opportunity", v: (o) => `${oppParties(dr, o).seeker?.org.name} · ${oppParties(dr, o).provider?.org.name}` },
            { h: "Owner", v: (o) => staffName(dr, o.owner) },
            { h: "Next action", v: (o) => o.nextAction },
            { h: "Due", v: (o) => fmtStamp(o.due, false), csv: (o) => o.due },
          ]}
        />
      </div>
    </>
  );
}
