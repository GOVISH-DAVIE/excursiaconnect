"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useOpenable } from "../bits";

/*
  The Deal Room's charts. Every mark is a link to the records it counts, so a graph is a drill-down too.
  Colours come from the validated categorical palette (slots 1 to 3, light mode, checked against the white
  card: CVD ΔE 9.2, normal 27.6); slot 3 is under 3:1 on white, so every chart prints its values or links
  its table. Marks follow the dataviz specs: bars at most 24px thick, a 4px rounded data end, square at the
  baseline, a 2px surface gap between stacked segments, hairline grid.
*/
export const SERIES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"] as const;

export function ChartCard({ title, sub, table, children }: { title: string; sub?: ReactNode; table?: { href: string; label: string }; children: ReactNode }) {
  const open = useOpenable();
  if (table && !open(table.href)) table = undefined;
  return (
    <section className="surface p-5 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="h2">{title}</h2>
        {table && (
          <Link className="link text-[13px]" href={table.href}>
            {table.label}
          </Link>
        )}
      </div>
      {sub && <p className="mt-1 text-[13px] text-slate">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export type BarRow = { label: string; value: number; shown?: string; href?: string };

/** Ranked or ordered horizontal bars, one series: the label, the bar from one baseline, the value at its tip. */
export function HBars({ rows: given }: { rows: BarRow[] }) {
  // a bar links only where the viewer can open the list behind it
  const open = useOpenable();
  const rows = given.map((r) => ({ ...r, href: open(r.href) }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1">
      {rows.map((r) => {
        const body = (
          <>
            <span className="text-[13px] leading-tight text-slate group-hover:text-ink">{r.label}</span>
            <span className="relative h-5">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 2 : 0, background: SERIES[0], maxHeight: 24 }} />
            </span>
            <span className="num text-right text-[13px] font-medium">{r.shown ?? r.value.toLocaleString("en")}</span>
          </>
        );
        const cls = "group grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_minmax(3rem,auto)] sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(3.5rem,auto)] items-center gap-3 rounded-md px-1 py-1";
        return (
          <li key={r.label}>
            {r.href && r.value > 0 ? (
              <Link href={r.href} className={`${cls} hover:bg-paper focus-visible:bg-paper`} aria-label={`${r.label}: ${r.shown ?? r.value}. Open the list.`}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type Column = { label: string; segments: { key: string; value: number; href?: string }[] };

/** Stacked columns over time: a legend above, each segment a link, the total on the cap, a tooltip on hover and focus. */
export function StackedColumns({ series, columns: given, height = 180 }: { series: { key: string; label: string }[]; columns: Column[]; height?: number }) {
  const open = useOpenable();
  const columns = given.map((c) => ({ ...c, segments: c.segments.map((s) => ({ ...s, href: open(s.href) })) }));
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; value: number; what: string } | null>(null);
  const totals = columns.map((c) => c.segments.reduce((n, s) => n + s.value, 0));
  const top = niceMax(Math.max(1, ...totals));
  const ticks = [0, top / 2, top];
  const color = (key: string) => SERIES[series.findIndex((s) => s.key === key)] ?? SERIES[0];
  const show = (el: HTMLElement, value: number, what: string) => {
    const r = el.getBoundingClientRect();
    const b = box.current!.getBoundingClientRect();
    setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, value, what });
  };
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color(s.key) }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative" onPointerLeave={() => setTip(null)}>
        <div className="relative grid grid-cols-[2rem_minmax(0,1fr)]" style={{ height }}>
          {/* the axis: three clean ticks, hairline grid, recessive */}
          <div className="relative text-[11px] text-mute">
            {ticks.map((t) => (
              <span key={t} className="num absolute right-2" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
                {t}
              </span>
            ))}
          </div>
          <div className="relative">
            {ticks.map((t) => (
              <span key={t} className="absolute inset-x-0 h-px" style={{ bottom: `${(t / top) * 100}%`, background: t === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }} aria-hidden="true" />
            ))}
            <div className="absolute inset-0 flex items-end justify-around">
              {columns.map((c, i) => (
                <div key={c.label} className="relative flex h-full w-6 flex-col-reverse items-stretch">
                  {c.segments
                    .filter((s) => s.value > 0)
                    .map((s, j, shown) => {
                      const what = `${series.find((x) => x.key === s.key)?.label}, ${c.label}`;
                      const style = { height: `calc(${(s.value / top) * 100}% - 2px)`, marginTop: 2, background: color(s.key), borderRadius: j === shown.length - 1 ? "4px 4px 0 0" : 0 };
                      return s.href ? (
                        <Link
                          key={s.key}
                          href={s.href}
                          className="block transition-opacity hover:opacity-80 focus-visible:opacity-80"
                          style={style}
                          aria-label={`${what}: ${s.value}. Open these meetings.`}
                          onPointerEnter={(e) => show(e.currentTarget, s.value, what)}
                          onFocus={(e) => show(e.currentTarget, s.value, what)}
                          onBlur={() => setTip(null)}
                        />
                      ) : (
                        <span key={s.key} className="block" style={style} />
                      );
                    })}
                  <span className="num absolute left-1/2 -translate-x-1/2 text-[12px] font-medium" style={{ bottom: `calc(${(totals[i] / top) * 100}% + 4px)` }}>
                    {totals[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[2rem_minmax(0,1fr)]">
          <span />
          <div className="mt-1.5 flex justify-around text-[12px] text-slate">
            {columns.map((c) => (
              <span key={c.label} className="flex w-6 flex-col items-center whitespace-nowrap leading-tight">
                {/* "Mon 15 Feb" on two lines, so four days fit a phone */}
                <span>{c.label.split(" ")[0]}</span>
                <span>{c.label.split(" ").slice(1).join(" ")}</span>
              </span>
            ))}
          </div>
        </div>
        {tip && (
          <div role="status" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2.5 py-1.5 text-[12px] text-white shadow-lg" style={{ left: tip.x, top: tip.y - 6 }}>
            <div className="num text-[14px] font-medium">{tip.value}</div>
            <div className="text-white/75 whitespace-nowrap">{tip.what}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A clean top for an axis above the largest value. */
function niceMax(n: number) {
  // even steps, so the middle tick is a whole number
  const steps = [2, 4, 6, 8, 10, 20, 30, 40, 50, 60, 80, 100, 120, 160, 200, 300, 400, 500, 1000];
  return steps.find((s) => s >= n) ?? Math.ceil(n / 1000) * 1000;
}
