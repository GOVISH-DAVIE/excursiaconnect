/*
  The screen replay, recorded in the visitor's browser with rrweb: the page, its changes, scrolling, the mouse
  and clicks. Every input field is masked before anything leaves the browser, and anything inside
  [data-no-track] or [data-no-record] is blocked out. The recorder loads only after the first page is shown,
  and uploads gzipped chunks every few seconds to /api/visit/rec.
*/

type RrEvent = { type: number; timestamp: number };

const ENDPOINT = "/api/visit/rec";
const TAB_KEY = "ec-rec-tab";
const SEQ_KEY = "ec-rec-seq";

const rec: { stop?: () => void; starting: boolean; buffer: RrEvent[]; tab: string; seq: number; addPage?: (path: string) => void } = { starting: false, buffer: [], tab: "", seq: 0 };

/** One id per browser tab, kept across reloads, so a reload carries on the same recording. */
function tabId() {
  try {
    let t = sessionStorage.getItem(TAB_KEY);
    if (!t) sessionStorage.setItem(TAB_KEY, (t = crypto.randomUUID()));
    return t;
  } catch {
    return (rec.tab ||= crypto.randomUUID());
  }
}

function nextSeq() {
  try {
    const n = Number(sessionStorage.getItem(SEQ_KEY) ?? "0") || 0;
    sessionStorage.setItem(SEQ_KEY, String(n + 1));
    return n;
  } catch {
    return rec.seq++;
  }
}

export const isRecording = () => !!rec.stop;
let snapshot: ((checkout?: boolean) => void) | undefined;
/** A fresh full snapshot, for a new session to start its replay from. */
export const takeSnapshot = () => snapshot?.(true);

export async function startRecording(path: string) {
  if (rec.stop || rec.starting) return;
  rec.starting = true;
  try {
    const { record } = await import("@rrweb/record");
    rec.tab = tabId();
    const stop = record({
      emit: (e) => {
        rec.buffer.push(e as RrEvent);
        if (rec.buffer.length >= 400) void flushRecording();
      },
      maskAllInputs: true,
      blockSelector: "[data-no-track],[data-no-record]",
      sampling: { mousemove: 100, scroll: 150, media: 800, input: "last" },
      checkoutEveryNms: 5 * 60_000, // a fresh snapshot every 5 minutes keeps seeking in the player quick
      slimDOMOptions: true,
      recordCanvas: false,
      collectFonts: false,
      inlineImages: false,
    });
    rec.stop = stop ?? undefined;
    rec.addPage = (p) => record.addCustomEvent("page", { path: p });
    snapshot = record.takeFullSnapshot;
    rec.addPage(path);
  } catch {
    // a browser the recorder cannot run in still has its pages and clicks logged
  } finally {
    rec.starting = false;
  }
}

/** Marks where a page starts, so the player can jump to it. */
export const markPage = (path: string) => rec.stop && rec.addPage?.(path);

export function stopRecording() {
  void flushRecording(true);
  rec.stop?.();
  rec.stop = undefined;
}

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
  } catch {
    return null;
  }
}

/** Sends what has been recorded since the last send. A closing tab sends it as it is, without waiting to compress. */
export async function flushRecording(leaving = false) {
  if (!rec.buffer.length || !rec.tab) return;
  const events = rec.buffer.splice(0);
  const seq = nextSeq();
  const json = JSON.stringify(events);
  const zipped = leaving ? null : await gzip(json);
  const body = zipped ?? new Blob([json], { type: "application/json" });
  const url = `${ENDPOINT}?tab=${encodeURIComponent(rec.tab)}&seq=${seq}&enc=${zipped ? "gzip" : "json"}`;
  // a closing tab may only send small bodies; anything larger goes as an ordinary request and may be lost
  if (leaving && body.size < 60_000 && navigator.sendBeacon?.(url, body)) return;
  fetch(url, { method: "POST", keepalive: body.size < 60_000, credentials: "same-origin", headers: { "content-type": "application/octet-stream" }, body }).catch(() => {});
}
