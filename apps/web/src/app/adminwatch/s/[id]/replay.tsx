"use client";

import { useEffect, useRef, useState } from "react";
import "rrweb-player/dist/style.css";

type Tab = { tab: string; events: number; bytes: number; first_ts: number; last_ts: number };
type Mark = { path: string; offset: number };
type PlayerLike = { goto: (offset: number, play?: boolean) => void; pause: () => void; $destroy?: () => void };

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Plays back what the visitor saw: the page, scrolling, the mouse and each click, as rrweb recorded it in their
 * browser, with input fields masked. Each page the visitor opened is a button that jumps the replay to it.
 */
export function Replay({ sessionId, tabs, autoPlay }: { sessionId: string; tabs: Tab[]; autoPlay: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerLike | null>(null);
  const [tab, setTab] = useState(tabs[0]?.tab);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    let gone = false;
    (async () => {
      const [{ default: Player }, res] = await Promise.all([import("rrweb-player"), fetch(`/adminwatch/s/${sessionId}/events?tab=${encodeURIComponent(tab)}`)]);
      if (!res.ok) throw new Error("not found");
      const events = (await res.json()) as { type: number; timestamp: number; data?: { tag?: string; payload?: { path?: string } } }[];
      // a replay needs a full snapshot of the page (type 2) to begin from
      if (gone || !box.current || !events.some((e) => e.type === 2)) throw new Error("no snapshot");
      events.sort((a, b) => a.timestamp - b.timestamp);
      const first = events[0].timestamp;
      setMarks(events.filter((e) => e.type === 5 && e.data?.tag === "page" && e.data.payload?.path).map((e) => ({ path: e.data!.payload!.path!, offset: e.timestamp - first })));
      box.current.replaceChildren();
      // the player's controls sit under the screen; the screen keeps the visitor's proportions within this width
      const width = Math.max(320, box.current.clientWidth);
      player.current = new Player({
        target: box.current,
        props: { events: events as never, width, height: Math.round(width * 0.58), autoPlay, skipInactive: true, speedOption: [1, 2, 4, 8], showController: true, mouseTail: true },
      }) as unknown as PlayerLike;
      setState("ready");
    })().catch(() => !gone && setState("error"));
    return () => {
      gone = true;
      player.current?.pause();
      player.current?.$destroy?.();
      player.current = null;
    };
  }, [sessionId, tab, autoPlay]);

  return (
    <section className="surface mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Replay</h2>
        {tabs.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] text-slate">
            Browser tab
            <select className="input h-9 w-auto text-[13px]" value={tab} onChange={(e) => { setState("loading"); setTab(e.target.value); }}>
              {tabs.map((t, i) => (
                <option key={t.tab} value={t.tab}>
                  Tab {i + 1}, {clock(t.last_ts - t.first_ts)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {marks.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-slate">Jump to:</span>
          {marks.map((m, i) => (
            <button key={i} className="pill bg-paper-200 hover:bg-ink hover:text-white" onClick={() => player.current?.goto(m.offset, true)}>
              {clock(m.offset)} <span className="font-mono">{m.path}</span>
            </button>
          ))}
        </div>
      )}
      {state === "loading" && <p className="py-10 text-center text-[14px] text-slate">Loading the recording…</p>}
      {state === "error" && <p className="py-10 text-center text-[14px] text-slate">This recording cannot be played: its first snapshot of the page did not arrive. The pages and clicks below are complete.</p>}
      {/* always laid out, so the player can measure its width; empty until the recording has loaded */}
      <div ref={box} className={`replay overflow-hidden rounded-lg ${state === "ready" ? "border border-line" : ""}`} />
    </section>
  );
}
