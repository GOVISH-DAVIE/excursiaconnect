"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { DelegateStatus, EventState } from "@excursia/domain/types";

/* ---------- brand ----------
   The files in public/brand: the dark lockup for light grounds, the light lockup for dark grounds
   (white wordmark, coral icon and "Connect"), the icon alone where only a mark fits. */

export function Logo({ variant = "dark", className = "h-10" }: { variant?: "dark" | "light" | "icon"; className?: string }) {
  const src = variant === "icon" ? "/brand/excursia-icon.svg" : variant === "light" ? "/brand/lightexcursia.svg" : "/brand/darkexcursia.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="ExcursiaConnect" className={className} />;
}

/** The icon beside the name in the system face, for rails, bars and "Powered by" lines where the
 *  stacked lockup would be too small to read. On a dark ground the name is white and "Connect" keeps
 *  its coral, as the light lockup does. */
export function Wordmark({ light = false, mono = false, size = "md" }: { light?: boolean; mono?: boolean; size?: "sm" | "md" }) {
  const onDark = light || mono;
  return (
    <span className="inline-flex items-center gap-2">
      <Logo variant="icon" className={size === "sm" ? "h-5" : "h-7"} />
      <span className={`font-medium tracking-[-0.02em] ${size === "sm" ? "text-[14px]" : "text-[18px]"} ${onDark ? "text-white" : "text-ink"}`}>
        Excursia<span className="text-coral">Connect</span>
      </span>
    </span>
  );
}

/* ---------- status ---------- */

const eventTone: Record<EventState, string> = {
  Draft: "bg-paper-200 text-slate",
  Submitted: "bg-warn-50 text-warn",
  "Under review": "bg-warn-50 text-warn",
  "Changes requested": "bg-coral-50 text-coral-600",
  Approved: "bg-ok-50 text-ok",
  Live: "bg-ok text-white",
  Closed: "bg-ink text-white",
  Suspended: "bg-bad text-white",
  Rejected: "bg-bad-50 text-bad",
};
export function EventPill({ state }: { state: EventState }) {
  return <span className={`pill ${eventTone[state]}`}>{state}</span>;
}

const delegateTone: Record<DelegateStatus, string> = {
  Pending: "bg-paper-200 text-slate",
  "Awaiting payment": "bg-warn-50 text-warn",
  Confirmed: "bg-ok-50 text-ok",
  "Checked in": "bg-ok text-white",
  Waitlisted: "bg-paper-200 text-slate",
  "Refund requested": "bg-warn-50 text-warn",
  Cancelled: "bg-bad-50 text-bad",
  Refunded: "bg-bad-50 text-bad",
};
export function StatusPill({ status }: { status: DelegateStatus }) {
  return <span className={`pill ${delegateTone[status]}`}>{status}</span>;
}

export function Tone({ tone, children }: { tone: "ok" | "warn" | "bad" | "mute"; children: ReactNode }) {
  const c = { ok: "bg-ok-50 text-ok", warn: "bg-warn-50 text-warn", bad: "bg-bad-50 text-bad", mute: "bg-paper-200 text-slate" }[tone];
  return <span className={`pill ${c}`}>{children}</span>;
}

/* ---------- layout ---------- */

export type NavItem = { href: string; label: string; exact?: boolean };

function RailNav({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <>
      {nav.map((n) => {
        const active = n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`rounded-md px-3 py-2 text-[14px] whitespace-nowrap transition-colors ${onNavigate ? "py-3 text-[15px]" : ""} ${active ? "bg-white/12 text-white font-medium" : "text-white/70 hover:text-white hover:bg-white/8"}`}>
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

/** The phone's rail when there are more than four pages: a slim bar, and the whole menu in a drawer from the left. */
function RailDrawer({ persona, who, nav, context }: { persona: string; who: string; nav: NavItem[]; context?: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Escape closes it, as a dialog should
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-ink px-4 text-white lg:hidden">
        {/* the icon alone; who is signed in and where are in the drawer */}
        <Link href="/" className="mr-auto shrink-0" aria-label="Excursia Connect home">
          <Logo variant="icon" className="h-7" />
        </Link>
        <button className="flex h-10 shrink-0 items-center gap-2 rounded-md bg-white/10 px-3 text-[14px] font-medium" aria-expanded={open} aria-controls="rail-drawer" onClick={() => setOpen(true)}>
          <span aria-hidden="true" className="grid gap-[3px]">
            <span className="block h-[2px] w-4 rounded bg-white" />
            <span className="block h-[2px] w-4 rounded bg-white" />
            <span className="block h-[2px] w-4 rounded bg-white" />
          </span>
          Menu
        </button>
      </header>
      {open && (
        <div className="lg:hidden">
          <button className="fixed inset-0 z-50 bg-black/45" aria-label="Close the menu" onClick={() => setOpen(false)} />
          <aside id="rail-drawer" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-y-0 left-0 z-50 flex w-[84vw] max-w-[320px] flex-col overflow-y-auto bg-ink text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <Link href="/" className="block" onClick={() => setOpen(false)}>
                  <Wordmark light />
                </Link>
                <div className="mt-3 text-[13px] text-white/60">{persona}</div>
                <div className="truncate text-[14px] font-medium">{who}</div>
              </div>
              <button className="h-10 shrink-0 rounded-md bg-white/10 px-3 text-[14px]" onClick={() => setOpen(false)} autoFocus>
                Close
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 p-3" aria-label="Pages">
              <Suspense fallback={null}>
                <RailNav nav={nav} onNavigate={() => setOpen(false)} />
              </Suspense>
            </nav>
            {context && <div className="mt-auto border-t border-white/10 px-5 py-4">{context}</div>}
          </aside>
        </div>
      )}
    </>
  );
}

/** The persona rail: the dark ground, the light wordmark, the persona and who is signed in. */
export function Rail({
  persona,
  who,
  nav,
  context,
  children,
  footer = "Prototype, mock data",
  drawer: forceDrawer = false,
}: {
  persona: string;
  who: string;
  nav: NavItem[];
  context?: ReactNode;
  children: ReactNode;
  accent?: "ink" | "coral";
  /** the line at the foot of the rail; the prototype's screens say they run on mock data */
  footer?: ReactNode;
  /** on a phone, the slim bar and drawer even with four pages or fewer (a rail with its own controls) */
  drawer?: boolean;
}) {
  // on a phone, more than four pages go in a drawer behind a Menu button; four or fewer stay as a row of tabs
  const drawer = forceDrawer || nav.length > 4;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      {drawer && <RailDrawer persona={persona} who={who} nav={nav} context={context} />}
      <aside className={`bg-ink text-white lg:min-h-screen lg:sticky lg:top-0 lg:h-screen flex-col ${drawer ? "hidden lg:flex" : "flex"}`}>
        <div className="px-5 py-5 border-b border-white/10">
          <Link href="/" className="block">
            <Wordmark light />
          </Link>
          <div className="mt-3 text-[13px] text-white/60">{persona}</div>
          <div className="text-[14px] font-medium truncate">{who}</div>
        </div>
        {context && <div className="px-5 py-4 border-b border-white/10">{context}</div>}
        <nav className="p-3 flex lg:flex-col gap-0.5 overflow-x-auto">
          <Suspense fallback={null}>
            <RailNav nav={nav} />
          </Suspense>
        </nav>
        <div className="mt-auto p-5 text-[13px] text-white/40 hidden lg:block">{footer}</div>
      </aside>
      <main className="min-w-0">
        <div className="mx-auto max-w-[1200px] px-5 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, kicker, actions, crumbs, badge }: { title: ReactNode; kicker?: ReactNode; actions?: ReactNode; crumbs?: { href?: string; label: string }[]; badge?: ReactNode }) {
  return (
    <div className="mb-6">
      {crumbs && (
        <nav className="mb-2 text-[13px] text-slate flex items-center gap-1.5">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {c.href ? (
                <Link href={c.href} className="hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
              {i < crumbs.length - 1 && <span className="text-mute">/</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {/* the title keeps at least 240px; when the actions cannot fit beside it they drop to their own row */}
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="h1 flex items-center gap-3 flex-wrap">
            <span>{title}</span>
            {badge}
          </h1>
          {kicker && <p className="kicker mt-1">{kicker}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

/** A number with its label. With an href it is a linked card: it lifts on hover and opens the list behind the number. */
export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "coral" | "ok" | "warn" | "bad"; href?: string }) {
  // the number stays ink; a tone is a small dot by the label, so a row of stats reads as one row
  const dot = tone === "coral" ? "bg-coral" : tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : null;
  const body = (
    <>
      <div className="stat__value">{value}</div>
      <div className="stat__label">
        {dot && <span className={`stat__dot ${dot}`} aria-hidden="true" />}
        {label}
      </div>
      {sub && <div className="stat__sub">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="stat stat--link">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

export function Section({ title, action, children, className = "", flush = false }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`surface ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="h2">{title}</h2>
        {action}
      </div>
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-strong p-6 text-center text-[14px] text-slate">{children}</div>;
}

export function Bars({ values, color = "bg-coral", height = 80, labels }: { values: number[]; color?: string; height?: number; labels?: [string, string] }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {values.map((v, i) => (
          <div key={i} className={`flex-1 rounded-sm ${color}`} style={{ height: `${(v / max) * 100}%` }} title={String(v)} />
        ))}
      </div>
      {labels && (
        <div className="mt-1.5 flex justify-between text-[13px] text-mute">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Meter({ value, max, warnAt = 0.7, badAt = 0.9 }: { value: number; max: number; warnAt?: number; badAt?: number }) {
  const r = max ? value / max : 0;
  const c = r >= badAt ? "bg-bad" : r >= warnAt ? "bg-warn" : "bg-ok";
  return (
    <div className="h-1.5 rounded-full bg-paper-200 overflow-hidden">
      <div className={`h-full ${c}`} style={{ width: `${Math.min(100, r * 100)}%` }} />
    </div>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="text-[14px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0">
          <dt className="text-slate">{k}</dt>
          <dd className="text-right font-medium min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, counts }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <nav className="flex gap-1 border-b border-line overflow-x-auto mb-5">
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={`px-3 py-2.5 text-[14px] whitespace-nowrap border-b-2 -mb-px transition-colors ${value === t ? "border-ink text-ink font-medium" : "border-transparent text-slate hover:text-ink"}`}>
          {t}
          {counts?.[t] ? <span className="ml-1.5 pill bg-coral text-[#111]">{counts[t]}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString("en-GB", opts);
}
