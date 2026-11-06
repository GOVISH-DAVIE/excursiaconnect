"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { FLAGS, drCan, missionName, pendingSecond, staffName, type FlagKey } from "@/lib/dealroom/logic";
import type { AppStatus, DrApplication } from "@/lib/dealroom/types";
import { splitCsv } from "@/lib/csv";
import { DecisionPill, ReadinessPill, Refusal, StatusPill, When, typeLabel, useDr } from "../bits";

const STATUSES: AppStatus[] = ["Lead", "Invited", "Draft", "Submitted", "In review", "Information requested", "Decided"];
const tabs = ["Queue", "Import leads", "Duplicates"] as const;

export function Queue() {
  const { dr, cfg, me, now, can, dispatch } = useDr();
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Queue");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const filters = {
    type: search.get("type") ?? "All",
    mission: search.get("mission") ?? "All",
    status: search.get("status") ?? "All",
    assignee: search.get("assignee") ?? (me?.role === "Reviewer" ? me.id : "All"),
    flag: (search.get("flag") ?? "") as FlagKey | "",
  };
  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(search.toString());
    if (v === "All" || !v) p.delete(k);
    else p.set(k, v);
    if (k !== "assignee" && !p.has("assignee") && me?.role === "Reviewer") p.set("assignee", "All");
    router.replace(`/dealroom/applications${p.toString() ? `?${p}` : ""}`);
    setPicked([]);
  };

  const apps = useMemo(() => {
    if (!cfg) return [];
    const needle = q.trim().toLowerCase();
    return dr.apps
      .filter((a) => a.eventId === cfg.eventId)
      .filter((a) => filters.type === "All" || a.type === filters.type)
      .filter((a) => filters.mission === "All" || a.mission === filters.mission)
      .filter((a) => filters.status === "All" || a.status === filters.status)
      .filter((a) => filters.assignee === "All" || (filters.assignee === "none" ? !a.assignee : a.assignee === filters.assignee))
      .filter((a) => !filters.flag || FLAGS[filters.flag]?.test(a, cfg, now))
      .filter((a) => !needle || `${a.ref ?? ""} ${a.org.name} ${a.contact.name} ${a.contact.email} ${a.org.country} ${a.org.sector}`.toLowerCase().includes(needle))
      .sort((x, y) => y.statusAt.localeCompare(x.statusAt));
  }, [dr.apps, cfg, filters.type, filters.mission, filters.status, filters.assignee, filters.flag, q, now]);

  if (!cfg) return null;
  if (!drCan(me, "review") && !drCan(me, "assign")) return <Refusal title="Applications are the review team's">Your role, {me?.role}, works with meetings and the live board.</Refusal>;

  const reviewers = dr.staff.filter((s) => s.active && s.role !== "Operations");
  const open = (s: string) => dr.apps.filter((a) => a.assignee === s && ["Submitted", "In review", "Information requested"].includes(a.status)).length;

  return (
    <>
      <PageHeader title="Applications" kicker="Every application and lead, filtered by mission, type, status and reviewer. Click a row to review it." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "Queue" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <Section title={`${apps.length} ${filters.flag ? FLAGS[filters.flag].label.toLowerCase() : "applications"}`} flush>
            <div className="px-5 pb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <input className="input sm:col-span-3 lg:col-span-2" placeholder="Search reference, organisation, person" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input" aria-label="Type" value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
                <option value="All">All types</option>
                <option value="seeker">Capital seekers</option>
                <option value="provider">Finance providers</option>
              </select>
              <select className="input" aria-label="Mission" value={filters.mission} onChange={(e) => setFilter("mission", e.target.value)}>
                <option value="All">All missions</option>
                {cfg.missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} {m.name}
                  </option>
                ))}
              </select>
              <select className="input" aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="All">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select className="input" aria-label="Reviewer" value={filters.assignee} onChange={(e) => setFilter("assignee", e.target.value)}>
                <option value="All">All reviewers</option>
                <option value="none">Not assigned</option>
                {reviewers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {filters.flag && (
              <div className="px-5 pb-3 text-[13px]">
                Showing <b className="font-medium">{FLAGS[filters.flag].label}</b>.{" "}
                <button className="link" onClick={() => setFilter("flag", "")}>
                  Show all
                </button>
              </div>
            )}
            {can("assign") && picked.length > 0 && (
              <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-paper px-3 py-2 text-[13px]">
                <span>{picked.length} selected</span>
                <select className="input h-8 w-auto text-[13px]" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Assign to…</option>
                  {reviewers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({open(s.id)} open)
                    </option>
                  ))}
                </select>
                <button className="btn-primary btn-sm" disabled={!assignTo} onClick={() => { dispatch({ type: "dr/assign", appIds: picked, staffId: assignTo }); setPicked([]); }}>
                  Assign
                </button>
              </div>
            )}
            {apps.length === 0 ? (
              <div className="p-5">
                <Empty>No applications match.</Empty>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    {can("assign") && (
                      <th className="th w-8">
                        <input type="checkbox" aria-label="Select all" checked={picked.length === apps.length} onChange={(e) => setPicked(e.target.checked ? apps.map((a) => a.id) : [])} />
                      </th>
                    )}
                    <th className="th">Organisation</th>
                    <th className="th">Type and mission</th>
                    <th className="th">Status</th>
                    <th className="th">Reviewer</th>
                    <th className="th">Last change</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a) => (
                    <Row key={a.id} a={a} picked={picked.includes(a.id)} onPick={can("assign") ? (on) => setPicked(on ? [...picked, a.id] : picked.filter((x) => x !== a.id)) : undefined} />
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <div className="space-y-4">
            <Section title="Reviewer workload" flush>
              <ul>
                {reviewers.map((s) => (
                  <li key={s.id}>
                    <button className="w-full flex items-center justify-between gap-2 px-5 py-2.5 border-b border-line last:border-0 hover:bg-paper text-sm text-left" onClick={() => setFilter("assignee", s.id)}>
                      <span>
                        {s.name}
                        <span className="block text-[12px] text-slate">
                          {s.role}
                          {s.role === "Reviewer" && (s.canDecide ? ", decides" : ", recommends")}
                        </span>
                      </span>
                      <span className="num">{open(s.id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="px-5 py-3 text-[12px] text-slate">Open applications per person. {can("assign") ? "Select rows to assign or rebalance." : "The lead assigns and rebalances."}</p>
            </Section>
            <Section title="Shortcuts" flush>
              <ul>
                {(Object.keys(FLAGS) as FlagKey[]).map((k) => {
                  const n = dr.apps.filter((a) => a.eventId === cfg.eventId && FLAGS[k].test(a, cfg, now)).length;
                  return (
                    <li key={k}>
                      <button className={`w-full flex items-center justify-between gap-2 px-5 py-2 border-b border-line last:border-0 hover:bg-paper text-[13px] text-left ${filters.flag === k ? "font-medium" : ""}`} onClick={() => setFilter("flag", filters.flag === k ? "" : k)}>
                        <span>{FLAGS[k].label}</span>
                        <span className="num text-slate">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>
        </div>
      )}

      {tab === "Import leads" && <ImportLeads />}
      {tab === "Duplicates" && <Duplicates />}
    </>
  );
}

function Row({ a, picked, onPick }: { a: DrApplication; picked: boolean; onPick?: (on: boolean) => void }) {
  const { dr, cfg } = useDr();
  const router = useRouter();
  const second = pendingSecond(a);
  return (
    <tr className="hover:bg-paper cursor-pointer" onClick={() => router.push(`/dealroom/applications/${a.id}`)}>
      {onPick && (
        <td className="td" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" aria-label={`Select ${a.org.name}`} checked={picked} onChange={(e) => onPick(e.target.checked)} />
        </td>
      )}
      <td className="td">
        <Link href={`/dealroom/applications/${a.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {a.org.name}
        </Link>
        <div className="text-[12px] text-slate">
          {a.ref ?? "No reference yet"} · {a.org.country}
          {a.type === "seeker" && a.ask ? ` · ${a.org.sector}` : ""}
        </div>
      </td>
      <td className="td text-[13px]">
        {typeLabel(a)}
        <div className="text-[12px] text-slate">{missionName(cfg, a.mission)}</div>
      </td>
      <td className="td">
        <div className="flex flex-wrap gap-1">
          <StatusPill app={a} />
          <DecisionPill app={a} />
          <ReadinessPill app={a} />
          {second && <span className="pill bg-warn-50 text-warn">Second decider</span>}
          {a.reReview && <span className="pill bg-warn-50 text-warn">Re-review</span>}
        </div>
      </td>
      <td className="td text-[13px]">{a.assignee ? staffName(dr, a.assignee) : <span className="text-slate">Not assigned</span>}</td>
      <td className="td text-[13px] text-slate">
        <When at={a.statusAt} />
      </td>
    </tr>
  );
}

const SAMPLE = `type,organisation,contact,email,phone,country,mission,source,owner
seeker,Kasai Grain Ltd,Esi Boateng,esi.boateng.kasai@grain.example,+254711000201,Ghana,M2,Partner,Daniel Ochieng
provider,Atlas Impact Partners,Moses Eze,moses.eze@mail.example,+254711000202,Nigeria,M1,Mission team,Wairimu Gathoni
seeker,,Juma Mushi,juma.mushi@mail.example,+254711000203,Tanzania,M1,Referral,Tom Kiplagat
seeker,Volta Cold Chain Ltd,Fatou Ndiaye,fatou.ndiaye,+254711000204,Senegal,M4,Inbound,Daniel Ochieng`;

/** DL-3: leads from the mobilisation pipeline, each with mission, source and owner; every row checked before import. */
function ImportLeads() {
  const { dr, cfg, now, can, dispatch } = useDr();
  const [text, setText] = useState("");
  const [done, setDone] = useState<string[]>([]);
  if (!cfg) return null;
  if (!can("import")) return <Refusal title="Importing leads is for the lead and reviewers" />;
  const rows = text.trim() ? splitCsv(text) : [];
  const head = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  const col = (n: string) => head.indexOf(n);
  const body = head.includes("organisation") ? rows.slice(1) : rows;
  const checked = body.map((r, i) => {
    const get = (n: string, fb: number) => (col(n) >= 0 ? r[col(n)] : r[fb]) ?? "";
    const row = { line: i + 2, type: get("type", 0).toLowerCase(), org: get("organisation", 1), contact: get("contact", 2), email: get("email", 3), phone: get("phone", 4), country: get("country", 5), mission: get("mission", 6), source: get("source", 7), owner: get("owner", 8) };
    const mission = cfg.missions.find((m) => m.code.toLowerCase() === row.mission.toLowerCase() || m.name.toLowerCase() === row.mission.toLowerCase());
    const owner = dr.staff.find((s) => s.name.toLowerCase() === row.owner.toLowerCase() || s.email.toLowerCase() === row.owner.toLowerCase());
    const dup = dr.apps.some((a) => a.eventId === cfg.eventId && a.contact.email.toLowerCase() === row.email.toLowerCase());
    const error =
      row.type !== "seeker" && row.type !== "provider"
        ? "Type must be seeker or provider"
        : !row.org
          ? "No organisation"
          : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)
            ? "Bad email"
            : !mission
              ? `Unknown mission "${row.mission}"`
              : !cfg.sources.includes(row.source)
                ? `Unknown source "${row.source}"`
                : dup
                  ? "Already in the Deal Room (same email)"
                  : undefined;
    return { ...row, missionId: mission?.id, ownerId: owner?.id ?? dr.actingStaffId, error };
  });
  const ok = checked.filter((r) => !r.error);

  const doImport = () => {
    const apps: DrApplication[] = ok.map((r, i) => {
      const id = `dr_imp_${now.replace(/\D/g, "").slice(-6)}${i}${Math.floor(Math.random() * 1e3)}`;
      return {
        id,
        eventId: cfg.eventId,
        type: r.type as "seeker" | "provider",
        mission: r.missionId!,
        source: r.source,
        owner: r.ownerId,
        org: { name: r.org, regNo: "", country: r.country, sector: "" },
        contact: { name: r.contact, email: r.email, phone: r.phone },
        decisionMaker: { name: "", title: "", email: "", phone: "" },
        documents: [],
        status: "Lead",
        statusAt: now,
        decisions: [],
        recommendations: [],
        assessments: [],
        readiness: "Not ready",
        rfis: [],
        history: [],
        invite: { token: `inv_${id}` },
      };
    });
    dispatch({ type: "dr/import", apps });
    setDone(apps.map((a) => a.id));
    setText("");
  };

  const imported = dr.apps.filter((a) => done.includes(a.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Section title="Paste the pipeline as CSV">
        <textarea className="input font-mono text-[13px] min-h-40" placeholder="type,organisation,contact,email,phone,country,mission,source,owner" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setText(SAMPLE)}>
            Use the sample file
          </button>
          <button className="btn-primary btn-sm" disabled={!ok.length} onClick={doImport}>
            Import {ok.length} lead{ok.length === 1 ? "" : "s"}
          </button>
        </div>
        {checked.length > 0 && (
          <table className="w-full mt-4">
            <thead>
              <tr>
                <th className="th">Line</th>
                <th className="th">Organisation</th>
                <th className="th">Mission and source</th>
                <th className="th">Check</th>
              </tr>
            </thead>
            <tbody>
              {checked.map((r) => (
                <tr key={r.line}>
                  <td className="td text-slate">{r.line}</td>
                  <td className="td">
                    {r.org || <span className="text-slate">–</span>}
                    <div className="text-[12px] text-slate">{r.contact}, {r.email}</div>
                  </td>
                  <td className="td text-[13px]">
                    {r.mission} · {r.source}
                  </td>
                  <td className="td text-[13px]">{r.error ? <span className="text-bad">{r.error}</span> : <span className="text-ok">Ready to import</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="After import">
        {imported.length === 0 ? (
          <p className="text-[14px] text-slate">Each lead gets its own invitation link to complete and submit the application. Send them all at once once imported.</p>
        ) : (
          <>
            <ul className="space-y-2 text-[13px]">
              {imported.map((a) => (
                <li key={a.id}>
                  <div className="font-medium">{a.org.name}</div>
                  <div className="text-slate break-all">/e/connected-africa-3/deal-room/apply?invite={a.invite?.token}</div>
                  <div className="text-slate">{a.status === "Invited" ? `Invited ${a.invite?.sentAt?.slice(11)}` : "Not invited yet"}</div>
                </li>
              ))}
            </ul>
            <button className="btn-primary btn-sm mt-3" disabled={!imported.some((a) => a.status === "Lead")} onClick={() => dispatch({ type: "dr/invite", appIds: imported.map((a) => a.id) })}>
              Send invitations
            </button>
          </>
        )}
      </Section>
    </div>
  );
}

/** PRD Applications req. 10: the same organisation, email or phone twice in one event; the lead merges. */
function Duplicates() {
  const { dr, cfg, me, dispatch } = useDr();
  if (!cfg) return null;
  const apps = dr.apps.filter((a) => a.eventId === cfg.eventId);
  const pairs: { a: DrApplication; b: DrApplication; on: string }[] = [];
  for (let i = 0; i < apps.length; i++)
    for (let j = i + 1; j < apps.length; j++) {
      const a = apps[i];
      const b = apps[j];
      if (a.type !== b.type) continue; // a seeker and a provider at one organisation are two roles, not a duplicate
      const on = a.org.regNo && a.org.regNo === b.org.regNo ? "registration number" : a.contact.email.toLowerCase() === b.contact.email.toLowerCase() ? "email" : a.contact.phone && a.contact.phone === b.contact.phone ? "phone" : "";
      if (on && !(cfg.multiplePerOrg && on === "registration number" && a.ask?.useOfFunds !== b.ask?.useOfFunds)) pairs.push({ a, b, on });
    }
  return (
    <Section title={`${pairs.length} possible duplicate${pairs.length === 1 ? "" : "s"}`} flush>
      {pairs.length === 0 ? (
        <div className="p-5">
          <Empty>No two applications share a registration number, email or phone.</Empty>
        </div>
      ) : (
        <ul>
          {pairs.map(({ a, b, on }) => (
            <li key={a.id + b.id} className="px-5 py-3 border-b border-line last:border-0 grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-center text-sm">
              {[a, b].map((x) => (
                <div key={x.id}>
                  <Link href={`/dealroom/applications/${x.id}`} className="font-medium hover:underline">
                    {x.org.name}
                  </Link>
                  <div className="text-[12px] text-slate">
                    {x.ref ?? x.status} · {x.status} · {x.contact.email}
                  </div>
                </div>
              ))}
              <div className="flex flex-col gap-1 text-[13px]">
                <span className="text-slate">Same {on}</span>
                {me?.role === "Lead" ? (
                  <>
                    <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/merge", keepId: a.id, dropId: b.id })}>
                      Keep {a.ref ?? "first"}
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/merge", keepId: b.id, dropId: a.id })}>
                      Keep {b.ref ?? "second"}
                    </button>
                  </>
                ) : (
                  <span className="text-slate">The lead merges</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
