"use client";

/**
 * The Deal Room desk's scanner (backend-plan.md, M2.2), on an enrolled tablet or phone. Someone on the desk team
 * signs in with their own PIN; a handheld scanner types the badge code and Enter into the box, or the camera reads
 * the QR where the browser can. Each scan shows the server's verdict; offline, the device decides from the badge
 * list and sends the scans when the connection returns (features/scan/hooks/use-desk.ts).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScannerHome } from "@excursia/contracts/scan";
import { ApiError } from "@/features/http";
import { scanApi } from "@/features/scan/api";
import { forgetList, useDesk, type Shown } from "@/features/scan/hooks/use-desk";

const HOME = ["scan", "home"] as const;
const HOME_KEY = "desk-home";

/**
 * The device's details, from the API; kept in this browser, so a reload while the connection is down still opens
 * the scanner (with the badge list kept beside it). Anything but a lost connection is the API's answer.
 */
async function loadHome(): Promise<ScannerHome> {
  try {
    const home = await scanApi.home();
    try {
      localStorage.setItem(HOME_KEY, JSON.stringify(home));
    } catch {
      // storage refused
    }
    return home;
  } catch (e) {
    if (!(e instanceof ApiError && e.code === "network")) throw e;
    let kept: ScannerHome | null = null;
    try {
      kept = JSON.parse(localStorage.getItem(HOME_KEY) ?? "null") as ScannerHome | null;
    } catch {
      // nothing kept
    }
    if (!kept) throw e;
    return kept;
  }
}

export function Desk() {
  const home = useQuery({ queryKey: HOME, queryFn: loadHome, retry: false, refetchOnWindowFocus: false });
  const queryClient = useQueryClient();
  const reload = useCallback(() => void queryClient.invalidateQueries({ queryKey: HOME }), [queryClient]);

  let body: React.ReactNode;
  // once the device is known it stays on screen: a refetch that fails while offline doesn't take the scanner away
  if (home.data) body = home.data.signedIn ? <Scanner home={home.data} onSignedOut={reload} /> : <PinPad home={home.data} onSignedIn={(h) => queryClient.setQueryData(HOME, h)} />;
  else if (home.isPending) body = <p className="text-slate">Loading…</p>;
  else
    body =
      home.error instanceof ApiError && home.error.status === 404 ? (
        <Panel title="This device isn't a scanner yet">
          <p className="text-[15px] text-slate">Someone on the Deal Room desk team (the lead, operations or a coordinator) enrols it: sign in to the workspace on this device, open Desk scanners and choose Use this device.</p>
          <Link href="/team/desk" className="btn btn-primary mt-4 w-full sm:w-auto">
            Open Desk scanners
          </Link>
        </Panel>
      ) : (
        <Panel title="The scanner can't load">
          <p className="text-[15px] text-slate">{home.error.message}</p>
          <button className="btn btn-secondary mt-4" onClick={reload}>
            Try again
          </button>
        </Panel>
      );

  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="h2">Deal Room desk</h1>
          {home.data && <span className="text-[13px] text-slate">{home.data.device.name}</span>}
        </div>
        {body}
      </main>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      {title && <h2 className="h2 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

/** Choose who you are, then your six digits. */
function PinPad({ home, onSignedIn }: { home: ScannerHome; onSignedIn: (h: ScannerHome) => void }) {
  const [who, setWho] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const person = home.operators.find((o) => o.id === who);
  if (!person)
    return (
      <Panel title={`Sign in to scan for ${home.event.name}`}>
        <p className="mb-3 text-[14px] text-slate">Who is at the desk?</p>
        <ul className="grid gap-2">
          {home.operators.map((o) => (
            <li key={o.id}>
              <button className="btn btn-secondary w-full justify-between" disabled={!o.pinSet} onClick={() => { setWho(o.id); setPin(""); setError(null); }}>
                <span>{o.name}</span>
                <span className="text-[13px] text-slate">{o.pinSet ? o.role : "no PIN yet"}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-slate">No PIN yet? Set one in the workspace, under Desk scanners.</p>
      </Panel>
    );
  return (
    <Panel title={`${person.name}, your PIN`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            onSignedIn(await scanApi.signIn(person.id, pin));
          } catch (err) {
            setError(err instanceof Error ? err.message : "That didn't work. Try again.");
            setPin("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="input text-center font-mono text-2xl tracking-[0.5em]"
          aria-label="Six-digit PIN"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        {error && (
          <p className="mt-2 text-[14px] text-bad" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setWho(null)}>
            Back
          </button>
          <button className="btn btn-primary flex-1" disabled={busy || pin.length !== 6}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Scanner({ home, onSignedOut }: { home: ScannerHome; onSignedOut: () => void }) {
  const desk = useDesk(home.event, onSignedOut);
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const submit = async (value: string) => {
    setCode("");
    await desk.scan(value);
    input.current?.focus();
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
        <span>
          {home.signedIn?.name} · {home.event.name}
        </span>
        <span className="flex items-center gap-2">
          <span className={`pill ${desk.online ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{desk.online ? "Online" : "Offline"}</span>
          {desk.queued > 0 && <span className="pill bg-warn-50 text-warn">{desk.queued} to send</span>}
          <button
            className="btn btn-quiet btn-sm"
            onClick={async () => {
              await desk.sync();
              await scanApi.signOut().catch(() => undefined);
              forgetList(home.event.id);
              onSignedOut();
            }}
          >
            Sign out
          </button>
        </span>
      </div>

      <form
        className="surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <label className="label" htmlFor="badge-code">
          Scan or type the badge code
        </label>
        <div className="flex gap-2">
          <input id="badge-code" ref={input} className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="EXC-DR-…" />
          <button className="btn btn-primary" disabled={!code.trim()}>
            Check in
          </button>
        </div>
        <Camera onCode={(c) => void submit(c)} />
      </form>

      {desk.last && <Result s={desk.last} />}

      {desk.summary && (
        <p className="text-[14px] text-slate">
          {desk.summary.accredited} of {desk.summary.badges} participants accredited · {desk.summary.arrivedToday} checked in today
        </p>
      )}

      {desk.differ.length > 0 && (
        <section className="rounded-xl border border-warn/40 bg-warn-50 px-4 py-3 text-[14px]" role="status">
          <div className="font-medium">Decided differently once the scans reached the server</div>
          <ul className="mt-1 list-disc pl-5">
            {desk.differ.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {desk.recent.length > 1 && (
        <section className="surface p-4">
          <h2 className="label">Earlier scans</h2>
          <ul className="divide-y divide-line text-[14px]">
            {desk.recent.slice(1).map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{s.name || <span className="font-mono">{s.code}</span>}</span>
                <span className={s.verdict === "allow" ? "text-ok" : "text-bad"}>{s.verdict === "allow" ? "In" : "Refused"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** The banner's first word, by what the scan did; a scan sent again shows the stored verdict's own words. */
const HEADLINE: Record<string, string> = { accredited: "Accredited", early: "Already accredited", arrived: "Checked in", again: "Already checked in" };

function Result({ s }: { s: Shown }) {
  const ok = s.verdict === "allow";
  return (
    <section className={`rounded-2xl px-5 py-6 text-center ${ok ? "bg-ok text-white" : "bg-bad text-white"}`} role="status" aria-live="assertive">
      <div className="text-[13px] uppercase tracking-wide opacity-80">{HEADLINE[s.outcome] ?? (ok ? "Checked in" : "Refused")}</div>
      <div className={`mt-1 text-2xl font-medium ${s.name ? "" : "font-mono"}`}>{s.name || s.code}</div>
      {s.organisation && <div className="text-[15px] opacity-90">{s.organisation}</div>}
      <p className="mt-3 text-[15px]">{s.reason}</p>
      {s.offline && <p className="mt-2 text-[13px] opacity-80">Offline: decided on this device from the badge list; sent when the connection returns.</p>}
    </section>
  );
}

const never = () => () => {};
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/** The camera, where the browser can read a QR code itself (Chrome on Android, for one); otherwise nothing shows. */
function Camera({ onCode }: { onCode: (code: string) => void }) {
  const supported = useSyncExternalStore(never, () => "BarcodeDetector" in window, () => false);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const seen = useRef<{ code: string; at: number } | null>(null);
  // the latest handler, so a new render doesn't restart the camera
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const found = (await detector.detect(video.current).catch(() => []))[0]?.rawValue;
          // the same badge held in front of the camera is one scan, not one every 300 ms
          if (found && !(seen.current?.code === found && Date.now() - seen.current.at < 4000)) {
            seen.current = { code: found, at: Date.now() };
            handler.current(found);
          }
        }, 300);
      })
      .catch(() => setError("The camera isn't available. Allow it in the browser, or type the code."));
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  if (!supported) return null;
  return (
    <div className="mt-3">
      <button type="button" className="link text-[14px]" onClick={() => setOn((x) => !x)}>
        {on ? "Stop the camera" : "Use the camera"}
      </button>
      {on && <video ref={video} className="mt-2 aspect-video w-full rounded-lg bg-ink object-cover" muted playsInline />}
      {error && <p className="mt-1 text-[13px] text-bad">{error}</p>}
    </div>
  );
}
