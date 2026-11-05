"use client";

import { useState } from "react";
import { Logo } from "@/components/ui";
import { scanVerdict, useStore } from "@/lib/store";
import type { Delegate } from "@/lib/types";

type Post = { kind: "desk" } | { kind: "zone"; zoneId: string; direction: "in" | "out" };

export default function Scanner() {
  const { state, dispatch } = useStore();
  const event = state.events.find((e) => e.state === "Live")!;
  const zones = state.zones.filter((z) => z.eventId === event.id);
  const [post, setPost] = useState<Post>({ kind: "desk" });
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ verdict: "allow" | "deny" | "override"; reason?: string; delegate?: Delegate; at: string } | null>(null);
  const [online, setOnline] = useState(true);
  const [override, setOverride] = useState(false);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [log, setLog] = useState<{ name: string; verdict: string; at: string }[]>([]);

  const zone = post.kind === "zone" ? zones.find((z) => z.id === post.zoneId) : null;
  const tierOf = (d: Delegate) => state.tiers.find((t) => t.id === d.tierId)?.name;
  const now = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function scan(input: string) {
    const c = input.trim();
    if (!c) return;
    if (post.kind === "desk") {
      const d = state.delegates.find((x) => x.badgeCode.toLowerCase() === c.toLowerCase() || x.id === c);
      if (!d || d.cancelled || d.status === "Cancelled" || d.status === "Refunded") return done({ verdict: "deny", reason: "Invalid or cancelled badge", delegate: d });
      if (d.status === "Pending" || d.status === "Awaiting payment") return done({ verdict: "deny", reason: "Registration not paid", delegate: d });
      dispatch({ type: "accredit", delegateId: d.id, day: 1 });
      return done({ verdict: "allow", reason: d.accredited ? "Already accredited" : "Accredited, badge printed", delegate: d });
    }
    const v = scanVerdict(state, c, post.zoneId, post.direction);
    if (v.delegate) dispatch({ type: "scan", delegateId: v.delegate.id, zoneId: post.zoneId, direction: post.direction, verdict: v.verdict, reason: v.reason, day: 1 });
    done(v);
  }

  function done(v: { verdict: "allow" | "deny" | "override"; reason?: string; delegate?: Delegate }) {
    const r = { ...v, at: now() };
    setResult(r);
    setLog((l) => [{ name: v.delegate?.name ?? "Unknown", verdict: v.verdict, at: r.at }, ...l].slice(0, 8));
    setCode("");
    setOverride(false);
    setPin("");
    setReason("");
  }

  function doOverride() {
    if (!result?.delegate || post.kind !== "zone" || pin.length < 4 || !reason) return;
    dispatch({ type: "scan", delegateId: result.delegate.id, zoneId: post.zoneId, direction: post.direction, verdict: "override", reason, day: 1 });
    done({ verdict: "override", reason: `Override: ${reason}`, delegate: result.delegate });
  }

  const samples = [
    ["EXC-DEMO-4821", "Amina, Full"],
    ["EXC-VIP-1001", "Hassan, VIP"],
    ["EXC-CANC-0007", "Cancelled"],
    [state.delegates.find((d) => d.status === "Awaiting payment")?.badgeCode ?? "", "Unpaid"],
  ];

  return (
    <div className="min-h-screen bg-paper-200 flex items-start justify-center p-0 sm:p-6">
      <div className="w-full max-w-sm min-h-screen sm:min-h-[760px] bg-ink text-white sm:rounded-[2rem] sm:border-8 sm:border-ink-700 flex flex-col overflow-hidden">
        <header className="px-5 pt-5 pb-3 flex items-center justify-between">
          <Logo variant="icon" className="h-7" />
          <div className="text-[13px] text-white/60 truncate mx-3">{event.name}</div>
          <button onClick={() => setOnline(!online)} className={`pill ${online ? "bg-ok text-white" : "bg-warn text-white"}`}>
            {online ? "Online" : "Offline, 3 queued"}
          </button>
        </header>

        <div className="px-5">
          <label className="text-[13px] text-white/60">My post</label>
          <select
            className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2.5 text-sm"
            value={post.kind === "desk" ? "desk" : `${post.zoneId}:${post.direction}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "desk") setPost({ kind: "desk" });
              else {
                const [zoneId, direction] = v.split(":");
                setPost({ kind: "zone", zoneId, direction: direction as "in" | "out" });
              }
              setResult(null);
            }}
          >
            <option value="desk">Accreditation desk</option>
            {zones.flatMap((z) => [
              <option key={z.id + "in"} value={`${z.id}:in`}>
                {z.name}, entrance
              </option>,
              <option key={z.id + "out"} value={`${z.id}:out`}>
                {z.name}, exit
              </option>,
            ])}
          </select>
          {zone && (
            <div className="mt-2 flex items-center justify-between text-[13px] text-white/60">
              <span>Occupancy</span>
              <span className={`tabular-nums font-medium ${zone.occupancy / zone.capacity >= 0.9 ? "text-coral" : "text-white"}`}>
                {zone.occupancy} / {zone.capacity}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 mx-5 aspect-[4/3] rounded-2xl bg-black/50 border border-white/10 relative grid place-items-center">
          <div className="absolute inset-6 border-2 border-coral/70 rounded-xl" />
          <div className="text-center text-white/50 text-[13px] px-10">Camera viewfinder. In the prototype, type or tap a badge code below.</div>
        </div>

        <form
          className="px-5 mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            scan(code);
          }}
        >
          <input className="flex-1 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-mono placeholder:text-white/30" placeholder="EXC-XXXX-0000" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary">Scan</button>
        </form>
        <div className="px-5 mt-2 flex flex-wrap gap-1">
          {samples.filter(([c]) => c).map(([c, l]) => (
            <button key={c} onClick={() => scan(c)} className="rounded-md bg-white/10 px-2 py-1 text-[13px] text-white/80 hover:bg-white/20">
              {l}
            </button>
          ))}
        </div>

        <div className="px-5 mt-4 flex-1">
          {result ? (
            <div className={`rounded-2xl p-5 ${result.verdict === "deny" ? "bg-bad" : result.verdict === "override" ? "bg-warn" : "bg-ok"}`}>
              <div className="text-[44px] leading-none font-medium tracking-[-0.03em]">{result.verdict === "deny" ? "DENY" : result.verdict === "override" ? "OVERRIDE" : "ALLOW"}</div>
              {result.reason && <div className="text-sm text-white/90">{result.reason}</div>}
              {result.delegate && (
                <div className="mt-3 border-t border-white/30 pt-3">
                  <div className="text-lg font-medium">{result.delegate.name}</div>
                  <div className="text-sm text-white/90">
                    {result.delegate.organisation}, {result.delegate.category}
                  </div>
                  <div className="text-[13px] text-white/70 mt-1">
                    {tierOf(result.delegate)}, {result.delegate.badgeCode}, {result.at}
                  </div>
                </div>
              )}
              {result.verdict === "deny" && result.delegate && post.kind === "zone" && !override && (
                <button onClick={() => setOverride(true)} className="mt-3 w-full rounded-lg bg-white/20 py-2 text-sm font-medium">
                  Override with PIN
                </button>
              )}
              {override && (
                <div className="mt-3 space-y-2">
                  <input className="w-full rounded-lg bg-white/90 text-ink px-3 py-2 text-sm" placeholder="Staff PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
                  <select className="w-full rounded-lg bg-white/90 text-ink px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Reason…</option>
                    <option>Organiser instruction</option>
                    <option>Exit scan missed</option>
                    <option>Manual grant pending sync</option>
                  </select>
                  <button onClick={doOverride} className="w-full rounded-lg bg-ink py-2 text-sm font-medium">
                    Confirm override
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 p-5 text-center text-sm text-white/50">Scan a badge to get a verdict in under a second.</div>
          )}

          {log.length > 0 && (
            <ul className="mt-4 space-y-1 text-[13px] text-white/60">
              {log.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{l.name}</span>
                  <span className={l.verdict === "deny" ? "text-coral" : l.verdict === "override" ? "text-warn" : "text-ok"}>{l.verdict}</span>
                  <span className="font-mono">{l.at}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="px-5 py-3 text-[13px] text-white/40">Checks in order: valid badge → entitled here, now → anti-passback → zone capacity. Offline: cached list, capacity check skipped.</footer>
      </div>
    </div>
  );
}
