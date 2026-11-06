"use client";

import { useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { EV_CA3, acting, decisionOf, drCan, publicStatus, type DrCap } from "@/lib/dealroom/logic";
import type { DocKind, DrApplication, DrDocument } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";

/** The Deal Room slice, its config, the signed-in staff member and "now" from the demo clock. */
export function useDr(eventId = EV_CA3) {
  const { state, dispatch, hydrated } = useStore();
  const dr = state.dealRoom;
  const cfg = dr.configs[eventId];
  const me = acting(dr);
  return { state, dispatch, hydrated, dr, cfg, me, now: dr.clock, can: (cap: DrCap) => drCan(me, cap), event: state.events.find((e) => e.id === eventId)! };
}

const tones = {
  ok: "bg-ok-50 text-ok",
  okSolid: "bg-ok text-white",
  warn: "bg-warn-50 text-warn",
  bad: "bg-bad-50 text-bad",
  mute: "bg-paper-200 text-slate",
  ink: "bg-ink text-white",
  coral: "bg-coral-50 text-coral-600",
};

export function Pill({ tone = "mute", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`pill ${tones[tone]} whitespace-nowrap`}>{children}</span>;
}

export function StatusPill({ app }: { app: DrApplication }) {
  const t = app.status === "Information requested" ? "warn" : app.status === "In review" || app.status === "Submitted" ? "coral" : app.status === "Decided" ? "ink" : "mute";
  return <Pill tone={t}>{app.status}</Pill>;
}

export function DecisionPill({ app }: { app: DrApplication }) {
  if (app.type === "provider") {
    const v = app.verification?.state;
    if (!v || v === "Not started") return null;
    return <Pill tone={v === "Verified" ? "ok" : v === "Declined" ? "bad" : "warn"}>{v}</Pill>;
  }
  const d = decisionOf(app)?.decision;
  if (!d) return null;
  return <Pill tone={d === "Approved" ? "ok" : d === "Conditional" ? "warn" : d === "Declined" ? "bad" : "mute"}>{d}</Pill>;
}

export function ReadinessPill({ app }: { app: DrApplication }) {
  if (app.type !== "seeker" || !decisionOf(app) || app.readiness === "Not ready") return app.type === "seeker" && decisionOf(app) && ["Approved", "Conditional"].includes(decisionOf(app)!.decision) ? <Pill>Not ready</Pill> : null;
  return <Pill tone={app.readiness === "Deal Room Ready" ? "okSolid" : "warn"}>{app.readiness}</Pill>;
}

export function ApplicantStatus({ app }: { app: DrApplication }) {
  const s = publicStatus(app);
  const tone = ["Approved", "Verified"].includes(s) ? "ok" : s === "Conditional" || s === "Information requested" ? "warn" : s === "Declined" ? "bad" : "coral";
  return <Pill tone={tone}>{s}</Pill>;
}

export const typeLabel = (a: DrApplication) => (a.type === "seeker" ? "Capital seeker" : a.providerKind ?? "Finance provider");

export function When({ at, time = true }: { at?: string; time?: boolean }) {
  if (!at) return <span className="text-slate">–</span>;
  return <span className="whitespace-nowrap">{fmtStamp(at, time)}</span>;
}

/** A document as a name and size; the prototype keeps metadata only, never the file. */
export function DocLine({ doc, children }: { doc: DrDocument; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-line last:border-0 text-sm">
      <span className="h-8 w-7 rounded-sm bg-paper-200 grid place-items-center text-[10px] font-medium text-slate shrink-0">PDF</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{doc.kind}</div>
        <div className="text-[12px] text-slate truncate">
          {doc.name} · {(doc.size / 1024 / 1024).toFixed(1)} MB · {fmtStamp(doc.at, false)}
          {!doc.download && " · view only"}
        </div>
      </div>
      {children}
    </div>
  );
}

let docSeq = 0;
/** A document record from a picked file, or a sample when the tester cannot drive a file picker. */
export function makeDoc(kind: DocKind, at: string, file?: File): DrDocument {
  docSeq++;
  return {
    id: `doc_${at.replace(/\D/g, "").slice(-6)}${docSeq}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: file?.name ?? `${kind.replace(/\W+/g, "-").toLowerCase()}-sample.pdf`,
    kind,
    size: file?.size ?? Math.round((0.4 + Math.random() * 6) * 1024 * 1024),
    at,
    download: kind !== "Financial statements",
  };
}

/** A file button that also offers a sample file. Files over 25 MB are refused (PRD Module req. 4). */
export function UploadDoc({ kind, at, onDone, label }: { kind: DocKind; at: string; onDone: (d: DrDocument) => void; label?: string }) {
  const [err, setErr] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="btn-secondary btn-sm cursor-pointer">
        {label ?? "Upload"}
        <input
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 25 * 1024 * 1024) return setErr(`${f.name} is over 25 MB.`);
            setErr("");
            onDone(makeDoc(kind, at, f));
          }}
        />
      </label>
      <button type="button" className="text-[13px] text-slate underline underline-offset-4 hover:text-ink" onClick={() => onDone(makeDoc(kind, at))}>
        Use a sample file
      </button>
      {err && <span className="text-[12px] text-bad">{err}</span>}
    </span>
  );
}

/** A screen or block the signed-in role may not use, said plainly. */
export function Refusal({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="surface p-6 max-w-xl">
      <div className="h2">{title}</div>
      <p className="mt-2 text-[14px] text-slate">{children}</p>
    </div>
  );
}

export function Labeled({ label, children, help, span }: { label: string; children: ReactNode; help?: ReactNode; span?: boolean }) {
  return (
    <label className={`block ${span ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[12px] text-slate">{help}</span>}
    </label>
  );
}
