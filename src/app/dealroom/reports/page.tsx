"use client";

import { useState, type ReactNode } from "react";
import { PageHeader, Section, Tabs } from "@/components/ui";
import { decisionOf, drCan, medianDays, missionName, qualified, staffName } from "@/lib/dealroom/logic";
import type { DrApplication } from "@/lib/dealroom/types";
import { downloadCsv, row } from "@/lib/csv";
import { Refusal, useDr } from "../bits";

const tabs = ["Mobilisation", "Qualification", "Verification"] as const;

/** PRD Reporting: one table per area, each broken down and exportable. Role limits apply (req. 5). */
export default function Reports() {
  const { dr, cfg, me } = useDr();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Mobilisation");
  if (!cfg) return null;
  const apps = dr.apps.filter((a) => a.eventId === cfg.eventId);
  const review = drCan(me, "review") || me?.role === "Lead";
  if (!review) return <Refusal title="Qualification reports are for the lead and reviewers">Operations sees the meeting reports once matching opens.</Refusal>;

  return (
    <>
      <PageHeader title="Reports" kicker="Every table breaks down by mission, source, owner or reviewer, and downloads as CSV." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "Mobilisation" && <Mobilisation apps={apps} />}
      {tab === "Qualification" && <Qualification apps={apps} />}
      {tab === "Verification" && <VerificationReport apps={apps} />}
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
