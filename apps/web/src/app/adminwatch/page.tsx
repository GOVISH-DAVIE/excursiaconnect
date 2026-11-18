import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Empty, PageHeader, Section, Stat } from "@/components/ui";
import { visitsDb } from "@/server/visits/db";
import { isWatcher, watchConfig } from "@/server/visits/auth";
import { RANGES, people, pages, readFilter, sessionList, topClicks, totals, type Range, type WatchFilter } from "@/server/visits/queries";
import { AutoRefresh, SignInForm } from "./client";
import { signOut } from "./actions";
import { at, length, span, when } from "./format";

/*
  The visitor log: who opened the prototype, by IP and session, the pages they saw with the seconds each was
  visible, and what they clicked. Private: a password in the server's environment, never linked, not indexed.
*/

export default function VisitorLog({ searchParams }: PageProps<"/adminwatch">) {
  return (
    <Suspense fallback={<p className="text-slate">Loading…</p>}>
      <Log searchParams={searchParams} />
    </Suspense>
  );
}

async function Log({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // read per request: the password, the cookie and the log are never baked into a prerendered page
  await connection();
  if (!watchConfig()) return <NotSetUp />;
  if (!(await isWatcher())) return <SignInForm />;
  const f = readFilter(await searchParams);
  const db = visitsDb();
  const now = new Date();
  const t = totals(db, f, now);
  const sessions = sessionList(db, f, now);
  const byIp = people(db, f, now);
  const byPage = pages(db, f, now);
  const clicked = topClicks(db, f, now);
  const query = (extra: Record<string, string>) => new URLSearchParams({ range: f.range, ...(f.bots ? { bots: "1" } : {}), ...(f.ip ? { ip: f.ip } : {}), ...extra }).toString();
  const csv = (kind: string) => (
    <a className="text-[13px] underline underline-offset-4" href={`/adminwatch/export?${query({ kind })}`}>
      Download CSV
    </a>
  );

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Visitor log"
        kicker={`Who opened the prototype, by IP address and session. ${RANGES[f.range]}, as of ${at(now.toISOString())} Nairobi time; refreshes every 30 seconds. Records go after 90 days.`}
        actions={
          <form action={signOut}>
            <button className="btn-secondary">Sign out</button>
          </form>
        }
      />
      <Filters f={f} />
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="People" value={t.people} sub="distinct IP addresses" />
        <Stat label="Sessions" value={t.sessions} sub="30 minutes idle ends one" />
        <Stat label="Pages opened" value={t.views} />
        <Stat label="Clicks" value={t.clicks} />
        <Stat label="Here now" value={t.live} sub="seen in the last 5 minutes" tone={t.live ? "ok" : undefined} />
      </div>

      <Section title={`Sessions, ${sessions.length}${sessions.length === 200 ? " most recent" : ""}`} action={csv("sessions")} flush>
        {sessions.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No visits in this range.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr>
                  <th className="th">Started</th>
                  <th className="th">IP address</th>
                  <th className="th">Browser</th>
                  <th className="th-r">Pages</th>
                  <th className="th-r">Clicks</th>
                  <th className="th-r">Length</th>
                  <th className="th-r">In view</th>
                  <th className="th">Came in on, last seen on</th>
                  <th className="th">Replay</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-paper-200/50">
                    <td className="td whitespace-nowrap">
                      <Link className="font-medium hover:underline underline-offset-4" href={`/adminwatch/s/${s.id}`}>
                        {when(s.started_at)}
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap font-mono text-[13px]">
                      <Link className="hover:underline underline-offset-4" href={`/adminwatch?${query({ ip: s.ip })}`}>
                        {s.ip}
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap text-slate">
                      {s.browser} · {s.os} · {s.device}
                      {s.is_bot ? <span className="pill ml-2 bg-warn-50 text-warn">bot</span> : null}
                    </td>
                    <td className="td-r">{s.views}</td>
                    <td className="td-r">{s.clicks}</td>
                    <td className="td-r whitespace-nowrap">{span(s.started_at, s.last_seen_at)}</td>
                    {/* the browser's count and the server's clock can differ by a second; in view never exceeds the length */}
                    <td className="td-r whitespace-nowrap">{length(Math.min(s.visible_seconds, (Date.parse(s.last_seen_at) - Date.parse(s.started_at)) / 1000))}</td>
                    <td className="td text-[13px] text-slate">
                      <span className="font-mono">{s.entry_path}</span>
                      {s.last_path && s.last_path !== s.entry_path && (
                        <>
                          {" → "}
                          <span className="font-mono">{s.last_path}</span>
                        </>
                      )}
                    </td>
                    <td className="td whitespace-nowrap">
                      {s.recorded ? (
                        <Link className="btn-secondary btn-sm" href={`/adminwatch/s/${s.id}?play=1`} aria-label={`Play the session from ${s.ip}`}>
                          ▶ Play
                        </Link>
                      ) : (
                        <span className="text-[13px] text-slate">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="mt-4 grid gap-4">
        <Section title="People, by IP address" flush>
          <Table
            head={["IP address", "Sessions", "Pages", "Clicks", "Time", "Last seen"]}
            rows={byIp.map((p) => [
              <Link key="ip" className="font-mono text-[13px] hover:underline underline-offset-4" href={`/adminwatch?${query({ ip: p.ip })}`} title={p.agent}>
                {p.ip}
              </Link>,
              p.sessions,
              p.views,
              p.clicks,
              length(p.seconds),
              when(p.last_seen),
            ])}
          />
        </Section>
        <Section title="Pages" action={csv("views")} flush>
          <Table
            head={["Page", "Opened", "Average in view", "Median", "Clicks"]}
            rows={byPage.map((p) => [<span key="p" className="font-mono text-[13px]">{p.path}</span>, p.views, length(p.avg), length(p.median), p.clicks])}
          />
        </Section>
      </div>

      <Section title="Most clicked" action={csv("clicks")} className="mt-4" flush>
        <Table
          head={["What", "Kind", "On page", "Goes to", "Clicks"]}
          rows={clicked.map((c) => [c.label, c.kind, <span key="p" className="font-mono text-[13px]">{c.path}</span>, <span key="h" className="font-mono text-[13px] text-slate">{c.href || "–"}</span>, c.n])}
        />
      </Section>
    </>
  );
}

function Filters({ f }: { f: WatchFilter }) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="label">Range</span>
        <select name="range" defaultValue={f.range} className="input h-10 w-36 text-[14px]">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <option key={r} value={r}>
              {RANGES[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">IP address starts with</span>
        <input name="ip" defaultValue={f.ip} className="input h-10 w-48 font-mono text-[14px]" inputMode="decimal" />
      </label>
      <label className="flex h-10 items-center gap-2 text-[14px]">
        <input type="checkbox" name="bots" value="1" defaultChecked={f.bots} /> Include bots and scripts
      </label>
      <button className="btn-secondary btn-sm h-10">Show</button>
      {(f.ip || f.bots || f.range !== "7d") && (
        <Link className="h-10 content-center text-[13px] underline underline-offset-4" href="/adminwatch">
          Clear
        </Link>
      )}
    </form>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length)
    return (
      <div className="px-5 pb-5">
        <Empty>Nothing in this range.</Empty>
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i === 0 ? "th" : "th-r"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "td" : "td-r whitespace-nowrap"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotSetUp() {
  return (
    <div className="surface mx-auto mt-16 max-w-md p-6 text-[14px]">
      <h1 className="text-[22px] font-medium tracking-[-0.02em]">Visitor log</h1>
      <p className="mt-2 text-slate">Not set up on this server. Set ADMINWATCH_PASSWORD, and ADMINWATCH_SECRET of 32 characters or more, then restart the app.</p>
    </div>
  );
}
