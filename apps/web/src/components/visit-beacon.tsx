"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { flushRecording, isRecording, markPage, startRecording, stopRecording, takeSnapshot } from "./screen-recorder";

/*
  Tells the visitor log what happens in this tab: each page opened, the seconds it stays visible, and what is
  clicked on it, and starts the screen recorder for the replay (screen-recorder.ts), which masks every input
  field. It never sends a query string. The home page says visits are recorded and can be replayed. Anything
  inside [data-no-track] is left out, and the server drops pages it does not record.
*/

type Click = { kind: "link" | "button" | "tab" | "other"; label: string; href: string; t: number };
type View = { id: string; path: string; visibleMs: number; since: number | null; clicks: Click[] };

const ENDPOINT = "/api/visit";
const PING_MS = 60_000;
const FLUSH_MS = 10_000;
// the server decides which pages are never recorded, so no private path is named in code every visitor downloads
const unrecorded = (path: string) => path.startsWith("/api/");

function send(body: object, leaving = false): Promise<void> {
  const json = JSON.stringify(body);
  // a tab that is closing gets a beacon; otherwise a keepalive fetch, so the session cookie is stored
  if (leaving && navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: "application/json" }))) return Promise.resolve();
  return fetch(ENDPOINT, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" }, body: json })
    .then((r) => {
      // the server started a new session (30 minutes idle): the replay needs a fresh snapshot to begin from
      if (r.headers.get("x-session-new") === "1" && isRecording()) takeSnapshot();
    })
    .catch(() => {});
}

const CLICKABLE = "a,button,[role=button],[role=tab],summary,select,input[type=submit],input[type=button],input[type=checkbox],input[type=radio]";

/** An element's text with a space between its parts, so a tab and its count read "Delegates 21", not "Delegates21". */
function words(el: Element) {
  const parts: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n && parts.length < 30; n = walk.nextNode()) {
    const t = n.textContent?.trim();
    if (t) parts.push(t);
  }
  return parts.join(" ");
}

/** What was clicked, in words: its accessible name, else its own text; never a field's value. */
function describe(el: Element): Omit<Click, "t"> {
  const kind: Click["kind"] = el.matches("a") ? "link" : el.matches("[role=tab]") ? "tab" : el.matches("button,[role=button],summary,input[type=submit],input[type=button]") ? "button" : "other";
  const field = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el : null;
  const named = el.getAttribute("aria-label") || (field ? field.labels?.[0]?.innerText || field.name || field.type : words(el)) || el.getAttribute("title") || el.tagName.toLowerCase();
  let href = "";
  if (el instanceof HTMLAnchorElement && el.href) {
    try {
      const u = new URL(el.href);
      href = u.origin === location.origin ? u.pathname : u.origin;
    } catch {}
  }
  return { kind, label: named.replace(/\s+/g, " ").trim().slice(0, 80), href };
}

export function VisitBeacon() {
  const path = usePathname();
  const view = useRef<View | null>(null);
  const first = useRef(true);

  // the listeners live as long as the tab; they act on whichever page is current
  useEffect(() => {
    const seconds = (v: View) => Math.round((v.visibleMs + (v.since === null ? 0 : performance.now() - v.since)) / 1000);
    const flush = (leaving = false) => {
      const v = view.current;
      if (!v?.clicks.length) return;
      const now = Date.now();
      send({ type: "clicks", viewId: v.id, path: v.path, items: v.clicks.splice(0, 20).map(({ t, ...c }) => ({ ...c, ago: now - t })) }, leaving);
    };
    const ping = (leaving = false) => {
      const v = view.current;
      if (v) send({ type: "ping", viewId: v.id, path: v.path, visibleSeconds: seconds(v) }, leaving);
    };
    const onVisibility = () => {
      const v = view.current;
      if (!v) return;
      if (document.visibilityState === "hidden") {
        if (v.since !== null) v.visibleMs += performance.now() - v.since;
        v.since = null;
        ping(true);
        flush(true);
        void flushRecording(true);
      } else v.since = performance.now();
    };
    const onLeave = () => {
      ping(true);
      flush(true);
      void flushRecording(true);
    };
    const onClick = (e: MouseEvent) => {
      const v = view.current;
      const el = e.target instanceof Element ? e.target.closest(CLICKABLE) : null;
      if (!v || !el || el.closest("[data-no-track]")) return;
      v.clicks.push({ ...describe(el), t: Date.now() });
      if (v.clicks.length >= 20) flush();
    };
    const pinger = setInterval(() => document.visibilityState === "visible" && ping(), PING_MS);
    const flusher = setInterval(() => flush(), FLUSH_MS);
    const uploader = setInterval(() => void flushRecording(), 5_000);
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(pinger);
      clearInterval(flusher);
      clearInterval(uploader);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  // a new page: close the last one with its seconds and clicks, then open this one
  useEffect(() => {
    const last = view.current;
    if (last) {
      const secs = Math.round((last.visibleMs + (last.since === null ? 0 : performance.now() - last.since)) / 1000);
      send({ type: "ping", viewId: last.id, path: last.path, visibleSeconds: secs });
      if (last.clicks.length) {
        const now = Date.now();
        send({ type: "clicks", viewId: last.id, path: last.path, items: last.clicks.splice(0, 20).map(({ t, ...c }) => ({ ...c, ago: now - t })) });
      }
    }
    // a page marked data-no-record (the private pages) is never on screen in a replay: recording stops there
    const private_ = !!document.querySelector("[data-no-record]");
    if (private_) stopRecording();
    if (!path || unrecorded(path)) {
      view.current = null;
      return;
    }
    const v: View = { id: crypto.randomUUID(), path, visibleMs: 0, since: document.visibilityState === "visible" ? performance.now() : null, clicks: [] };
    view.current = v;
    const viewed = send({ type: "view", viewId: v.id, path, referrer: first.current ? document.referrer : "" });
    first.current = false;
    if (private_) return;
    // the recorder starts once the page view has set the session cookie, so its first snapshot is kept
    if (isRecording()) markPage(path);
    else void viewed.then(() => startRecording(path));
  }, [path]);

  return null;
}
