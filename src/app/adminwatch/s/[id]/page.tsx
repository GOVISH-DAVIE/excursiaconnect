import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { PageHeader, Section } from "@/components/ui";
import { visitsDb } from "@/server/visits/db";
import { isWatcher } from "@/server/visits/auth";
import { sessionDetail } from "@/server/visits/queries";
import { recordedTabs } from "@/server/visits/replay";
import { Replay } from "./replay";
import { at, length, span, when } from "../../format";

/** One session: its replay, then each page in order with the seconds it was in view and what was clicked on it. */
export default function SessionPage({ params, searchParams }: PageProps<"/adminwatch/s/[id]">) {
  return (
    <Suspense fallback={<p className="text-slate">Loading…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  if (!(await isWatcher())) redirect("/adminwatch");
  const { id } = await params;
  const db = visitsDb();
  const d = sessionDetail(db, id);
  if (!d) notFound();
  const s = d.session;
  const tabs = recordedTabs(db, id);
  const autoPlay = (await searchParams).play === "1";
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/adminwatch", label: "Visitor log" }, { label: `Session from ${s.ip}` }]}
        title={`${s.ip}, ${when(s.started_at)}`}
        kicker={`${s.browser} on ${s.os}, ${s.device}${s.is_bot ? ", a bot or script" : ""}. ${s.views} pages and ${s.clicks} clicks over ${span(s.started_at, s.last_seen_at)}${s.referrer ? `; came from ${s.referrer}` : ""}. Nairobi time.`}
        actions={
          <Link className="btn-secondary" href={`/adminwatch?ip=${encodeURIComponent(s.ip)}&range=90d`}>
            All from this IP
          </Link>
        }
      />
      {tabs.length > 0 ? (
        <Replay sessionId={id} tabs={tabs} autoPlay={autoPlay} />
      ) : (
        <p className="surface mb-4 p-4 text-[14px] text-slate">No screen recording for this session: it was recorded before replays began, or in a browser the recorder cannot run in.</p>
      )}
      <Section title="Pages and clicks, in order" flush>
        <ol>
          {d.views.map((v, i) => {
            const next = d.views[i + 1];
            return (
              <li key={v.id} className="border-t border-line px-5 py-3 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-mono text-[14px]">{v.path}</span>
                  <span className="text-[13px] text-slate">
                    {at(v.at)} · in view {length(v.visible_seconds)}
                    {next ? ` · next page after ${span(v.at, next.at)}` : ""}
                  </span>
                </div>
                {v.clicks.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-[13px]">
                    {v.clicks.map((c, j) => (
                      <li key={j} className="flex flex-wrap gap-x-2">
                        <span className="text-slate tabular-nums">{at(c.at)}</span>
                        <span>
                          {c.kind}: <span className="font-medium">{c.label}</span>
                        </span>
                        {c.href && <span className="font-mono text-slate">→ {c.href}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Section>
      <p className="mt-3 break-all text-[12px] text-slate">User agent: {s.user_agent || "none sent"}</p>
    </>
  );
}
