"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Empty, PageHeader, Section } from "@/components/ui";
import { COMMITMENT_TIERS, PIPELINE, compact, missionName, oppParties, pipelineOf, staffName, trackName, type PipelineStatus } from "@/lib/dealroom/logic";
import { downloadCsv, row } from "@/lib/csv";
import { fmtStamp } from "@/lib/time";
import { typeLabel, useDr } from "../bits";

/*
  One pipeline in the decision paper's 13 statuses, from sourced to closed or deployed. Each opportunity owner sits
  at the furthest status its records support, with the date, the responsible owner and the evidence. Commitments
  are reported in the paper's five tiers, never added together.
*/

export default function Pipeline() {
  const { dr, cfg, me, now, can } = useDr();
  const q = useSearchParams();
  const router = useRouter();
  if (!cfg) return null;
  const pick = PIPELINE.find((s) => s === q.get("status"));
  // the opportunity owners: businesses raising capital, and institutions or buyers who brought a challenge
  const owners = dr.apps.filter((a) => a.eventId === cfg.eventId && (a.type === "seeker" || !!a.challenge));
  const rows = owners.map((a) => ({ a, ...pipelineOf(dr, a, now) }));
  const count = (s: PipelineStatus) => rows.filter((r) => r.status === s).length;
  // furthest along first; those on hold, inactive or declined last
  const rank = (s: PipelineStatus) => (s === "On hold / inactive / declined" ? -1 : PIPELINE.indexOf(s));
  const shown = (pick ? rows.filter((r) => r.status === pick) : rows).sort((x, y) => rank(y.status) - rank(x.status) || y.since.localeCompare(x.since));
  const go = (s?: PipelineStatus) => router.replace(s ? `/dealroom/pipeline?status=${encodeURIComponent(s)}` : "/dealroom/pipeline", { scroll: false });

  // the paper's reporting rule: interest, indicative, signed, approved but not disbursed, deployed, each apart
  const opps = dr.opportunities.filter((o) => o.eventId === cfg.eventId);
  const tiers = COMMITMENT_TIERS.map((k) => {
    const xs = opps.flatMap((o) => o.outcomes.filter((x) => x.kind === k).map((x) => ({ x, o })));
    const usd = xs.filter(({ x }) => x.currency === "USD").reduce((n, { x }) => n + (x.amount ?? 0), 0);
    return { k, n: xs.length, usd };
  });

  const csv = () =>
    downloadCsv(`deal-room-pipeline-${now.slice(0, 10)}.csv`, [
      row(["Reference", "Organisation", "Kind", "Mission", "Track", "Status", "Since", "Owner", "Evidence"]),
      ...shown.map((r) => row([r.a.ref ?? "", r.a.org.name, r.a.ownerKind ?? typeLabel(r.a), missionName(cfg, r.a.mission), trackName(cfg, r.a.track), r.status, r.since, staffName(dr, r.owner), r.evidence])),
    ]);

  return (
    <>
      <PageHeader
        title="Pipeline"
        kicker={`Every opportunity owner at the furthest status its records support, ${owners.length} in all. Each status has a date, an owner and its evidence. As of ${fmtStamp(now)}.`}
        actions={
          me?.role === "Oversight" || me?.role === "Lead" || me?.role === "Coordinator" ? (
            <button className="btn-secondary" onClick={csv}>
              Download CSV
            </button>
          ) : undefined
        }
      />

      <section className="surface mb-4 p-4" aria-label="Count at each status">
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1">
          {PIPELINE.map((s, i) => (
            <li key={s}>
              <button
                aria-pressed={pick === s}
                onClick={() => go(pick === s ? undefined : s)}
                className={`flex h-full w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors ${pick === s ? "bg-ink text-white" : "bg-paper hover:bg-paper-200"}`}
              >
                <span className="text-[22px] font-medium leading-none tabular-nums">{count(s)}</span>
                <span className={`mt-1.5 text-[11px] leading-tight ${pick === s ? "text-white/80" : "text-slate"}`}>
                  {i + 1}. {s}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <Section title="Commitments, reported apart" flush>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          {tiers.map((t) => (
            <Link key={t.k} href={`/dealroom/opportunities?has=${encodeURIComponent(t.k)}`} className="bg-white px-4 py-3 hover:bg-paper">
              <div className="text-[13px] text-slate">{t.k}</div>
              <div className="mt-1 text-[20px] font-medium tabular-nums">{t.n}</div>
              <div className="text-[12px] text-slate">{t.usd ? `${compact(t.usd, "USD")} in dollars` : "no dollar amount"}</div>
            </Link>
          ))}
        </div>
        <p className="px-5 py-2 text-[12px] text-slate">Never added together: an indicative commitment is not counted as signed, nor approved financing as deployed.</p>
      </Section>

      <Section title={`${pick ?? "All statuses"}, ${shown.length}`} className="mt-4" action={pick ? <button className="text-[13px] underline underline-offset-4" onClick={() => go()}>Show all</button> : undefined} flush>
        {shown.length === 0 ? (
          <div className="p-5">
            <Empty>None at this status.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr>
                  <th className="th">Organisation</th>
                  <th className="th">Status</th>
                  <th className="th">Since</th>
                  <th className="th">Owner</th>
                  <th className="th">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 200).map((r) => {
                  // the record opens for the review team; a coordinator or oversight reads the row only
                  const href = can("review") || can("assign") ? `/dealroom/applications/${r.a.id}` : undefined;
                  return (
                    <tr key={r.a.id} className="border-t border-line align-top">
                      <td className="td">
                        {href ? (
                          <Link className="font-medium hover:underline underline-offset-4" href={href}>
                            {r.a.org.name || r.a.contact.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.a.org.name || r.a.contact.name}</span>
                        )}
                        <div className="text-[12px] text-slate">
                          {r.a.challenge ? `${r.a.challenge.title}. ${typeLabel(r.a)}` : r.a.ownerKind ?? typeLabel(r.a)} · {missionName(cfg, r.a.mission)}
                          {r.a.track ? `, ${trackName(cfg, r.a.track)}` : ""}
                        </div>
                      </td>
                      <td className="td whitespace-nowrap">{r.status}</td>
                      <td className="td whitespace-nowrap text-slate">{fmtStamp(r.since)}</td>
                      <td className="td whitespace-nowrap">{staffName(dr, r.owner)}</td>
                      <td className="td text-[13px] text-slate">{r.evidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {opps.length > 0 && <p className="mt-2 text-[12px] text-slate">Opportunities count once per owner, at the furthest one: {opps.length} opportunities across {new Set(opps.map((o) => oppParties(dr, o).seeker?.id)).size} owners.</p>}
    </>
  );
}
