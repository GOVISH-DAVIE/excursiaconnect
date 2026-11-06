"use client";

import { useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { askBand, canSee, compact, confirmBy, consentGranted, ics, introExpiresAt, lapsed, matchStage, matchable } from "@/lib/dealroom/logic";
import type { DrApplication, DrDocument, DrMatch, DrMeeting } from "@/lib/dealroom/types";
import { downloadText } from "@/lib/csv";
import { fmtStamp } from "@/lib/time";

function Card({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="surface p-5">
      {(title || aside) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          {title && <h2 className="h2">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const Refused = ({ reason }: { reason: string }) => (
  <Card title="Not open to you yet">
    <p className="text-[14px] text-slate">{reason}</p>
  </Card>
);

/* ---------- the directory of teasers (FP-5, FP-6) ---------- */

export function Directory({ app }: { app: DrApplication }) {
  const { state, dispatch } = useStore();
  const dr = state.dealRoom;
  const cfg = dr.configs[app.eventId];
  const gate = canSee(dr, app, { kind: "directory" });
  const [f, setF] = useState({ sector: "", country: "", band: "", instrument: "" });
  if (!gate.ok) return <Refused reason={gate.reason!} />;
  const teasers = dr.apps.filter((a) => a.type === "seeker" && canSee(dr, app, { kind: "teaser", seekerId: a.id }).ok);
  const list = teasers.filter((a) => (!f.sector || a.org.sector === f.sector) && (!f.country || a.org.country === f.country) && (!f.band || askBand(a.ask!.amount) === f.band) && (!f.instrument || a.ask!.instrument === f.instrument));
  const bands = ["Under USD 500k", "USD 0.5m to 2m", "USD 2m to 10m", "USD 10m and over"];
  return (
    <>
      <Card title={`${list.length} businesses ready to meet`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="input h-9 text-[13px]" aria-label="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>
            <option value="">Any sector</option>
            {cfg.sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input h-9 text-[13px]" aria-label="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            <option value="">Any country</option>
            {cfg.countries.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input h-9 text-[13px]" aria-label="Ask" value={f.band} onChange={(e) => setF({ ...f, band: e.target.value })}>
            <option value="">Any ask</option>
            {bands.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input h-9 text-[13px]" aria-label="Instrument" value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })}>
            <option value="">Any instrument</option>
            {["Equity", "Debt", "Mezzanine", "Grant", "Trade finance", "Other"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[12px] text-slate">Teasers only. A full profile and documents open with an introduction from the Deal Room team, and documents only with the business&apos;s consent.</p>
      </Card>
      {list.map((s) => {
        const existing = dr.matches.find((m) => m.seekerId === s.id && m.providerId === app.id);
        return (
          <Card key={s.id}>
            <div className="text-[12px] text-slate">
              {s.org.sector} · {s.org.country} · {askBand(s.ask!.amount)} · {s.ask!.instrument}
            </div>
            <div className="mt-1 font-medium">{s.teaser!.anonymous ? s.teaser!.title : s.org.name}</div>
            <p className="mt-1 text-[14px]">{s.teaser!.summary}</p>
            <div className="mt-3">
              {existing ? (
                <span className="pill bg-paper-200 text-slate">{existing.origin === "interest" && existing.decision === "Suggested" ? "Interest sent to the Deal Room team" : "Already in your matches"}</span>
              ) : (
                <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/interest", providerId: app.id, seekerId: s.id })}>
                  Express interest
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </>
  );
}

/* ---------- introductions (CS-8, CS-9, FP-7, FP-8) ---------- */

export function Introductions({ app }: { app: DrApplication }) {
  const { state } = useStore();
  const dr = state.dealRoom;
  const mine = dr.matches.filter((m) => m.intro && (app.type === "seeker" ? m.seekerId === app.id : m.providerId === app.id)).sort((a, b) => b.intro!.sentAt.localeCompare(a.intro!.sentAt));
  if (app.type === "provider" && !canSee(dr, app, { kind: "directory" }).ok) return <Refused reason={canSee(dr, app, { kind: "directory" }).reason!} />;
  if (app.type === "seeker" && !matchable(app) && !mine.length) return <Refused reason="Introductions start once you are Deal Room Ready: approved, profile complete, conditions met and readiness scored." />;
  if (!mine.length) return <Card title="No introductions yet">The Deal Room team proposes them as matching runs; you will get an email and SMS.</Card>;
  return (
    <>
      {mine.map((m) => (
        <Intro key={m.id} app={app} m={m} />
      ))}
    </>
  );
}

function Intro({ app, m }: { app: DrApplication; m: DrMatch }) {
  const { state, dispatch } = useStore();
  const dr = state.dealRoom;
  const cfg = dr.configs[app.eventId];
  const seeker = dr.apps.find((a) => a.id === m.seekerId)!;
  const provider = dr.apps.find((a) => a.id === m.providerId)!;
  const side = app.type;
  const other = side === "seeker" ? provider : seeker;
  const mine = m.intro![side];
  const stage = matchStage(m, cfg, dr.clock);
  const docs = m.intro!.items.filter((i) => i !== "teaser" && i !== "profile").map((id) => seeker.documents.find((d) => d.id === id)).filter(Boolean) as DrDocument[];
  const [consent, setConsent] = useState<string[]>(docs.map((d) => d.id));
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const exp = introExpiresAt(m, cfg)!;
  return (
    <Card title={side === "seeker" ? `${provider.org.name}, ${provider.providerKind}` : seeker.teaser?.anonymous && stage !== "Accepted" ? seeker.teaser.title : seeker.org.name} aside={<span className={`pill ${stage === "Accepted" ? "bg-ok-50 text-ok" : stage === "Introduced" ? "bg-warn-50 text-warn" : "bg-paper-200 text-slate"}`}>{stage === "Introduced" ? (mine ? "Waiting for the other side" : `Answer by ${fmtStamp(exp)}`) : stage}</span>}>
      <p className="whitespace-pre-line text-[14px] leading-relaxed">{m.brief?.text}</p>
      {m.brief && m.brief.agenda.length > 0 && (
        <ol className="mt-2 list-decimal pl-5 text-[14px] text-slate">
          {m.brief.agenda.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
      )}

      {side === "provider" && stage !== "Expired" && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[13px] font-medium">Shared with this introduction</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => { dispatch({ type: "dr/access", seekerId: seeker.id, item: "profile", viewer: app.id, action: "view" }); setViewing("profile"); }}>
              Open the full profile
            </button>
            {docs.map((d) => {
              const g = canSee(dr, app, { kind: "doc", seekerId: seeker.id, docId: d.id });
              return (
                <span key={d.id} className="inline-flex items-center gap-1">
                  <button className="btn-secondary btn-sm" disabled={!g.ok} title={g.reason} onClick={() => { dispatch({ type: "dr/access", seekerId: seeker.id, item: d.id, viewer: app.id, action: "view" }); setViewing(d.id); }}>
                    {d.kind}
                  </button>
                  {g.ok && d.download && (
                    <button
                      className="link text-[12px]"
                      onClick={() => {
                        dispatch({ type: "dr/access", seekerId: seeker.id, item: d.id, viewer: app.id, action: "download" });
                        downloadText(d.name.replace(/\.pdf$/, "") + `-for-${app.org.name.replace(/\W+/g, "-").toLowerCase()}.txt`, `${d.kind} of ${seeker.org.name}\nDownloaded by ${app.decisionMaker.name}, ${app.org.name}, ${dr.clock}\nThis is a stand-in: the prototype keeps no file content.`);
                      }}
                    >
                      download
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {docs.some((d) => !canSee(dr, app, { kind: "doc", seekerId: seeker.id, docId: d.id }).ok) && <p className="mt-2 text-[12px] text-slate">Greyed documents open once both of you accept and the business consents to share each one with you.</p>}
          {viewing && <Preview seeker={seeker} viewer={app} item={viewing} onClose={() => setViewing(null)} />}
        </div>
      )}

      {side === "seeker" && stage === "Accepted" && docs.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[13px] font-medium">What {provider.org.name} may open</div>
          {docs.map((d) => {
            const on = consentGranted(dr, seeker.id, provider.id, d.id);
            const opened = dr.access.filter((a) => a.seekerId === seeker.id && a.viewer === provider.id && a.item === d.id);
            return (
              <div key={d.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <span>
                  {d.kind}
                  <span className="text-[12px] text-slate">{opened.length ? ` · opened ${fmtStamp(opened[opened.length - 1].at)}` : " · not opened"}</span>
                </span>
                <button className={on ? "btn-secondary btn-sm text-bad" : "btn-secondary btn-sm"} onClick={() => dispatch({ type: "dr/consent", seekerId: seeker.id, providerId: provider.id, docId: d.id, granted: !on })}>
                  {on ? "Withdraw consent" : "Allow"}
                </button>
              </div>
            );
          })}
          <p className="mt-2 text-[12px] text-slate">Withdrawing stops access at once; what was already opened stays in your access log.</p>
        </div>
      )}

      {!mine && stage === "Introduced" && (
        <div className="mt-4 border-t border-line pt-3">
          {side === "seeker" && docs.length > 0 && (
            <>
              <div className="text-[13px] font-medium">Consent: which documents may {provider.org.name} open?</div>
              {docs.map((d) => (
                <label key={d.id} className="mt-1.5 flex items-center gap-2 text-[14px]">
                  <input type="checkbox" checked={consent.includes(d.id)} onChange={(e) => setConsent(e.target.checked ? [...consent, d.id] : consent.filter((x) => x !== d.id))} />
                  {d.kind}
                  {!d.download && <span className="text-[12px] text-slate">view only</span>}
                </label>
              ))}
              <p className="mt-1 text-[12px] text-slate">Your full profile goes with the introduction; each document only if ticked.</p>
            </>
          )}
          {declining ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-primary btn-sm" onClick={() => dispatch({ type: "dr/respondIntro", matchId: m.id, side, response: "Declined", reason })}>
                Decline
              </button>
              <button className="btn-quiet" onClick={() => setDeclining(false)}>
                Back
              </button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" onClick={() => dispatch({ type: "dr/respondIntro", matchId: m.id, side, response: "Accepted", consent: side === "seeker" ? consent : undefined })}>
                Accept the introduction
              </button>
              <button className="btn-secondary" onClick={() => setDeclining(true)}>
                Decline
              </button>
            </div>
          )}
          <p className="mt-2 text-[12px] text-slate">A meeting is booked only if both of you accept. {other.org.name} {m.intro![side === "seeker" ? "provider" : "seeker"] ? `has ${m.intro![side === "seeker" ? "provider" : "seeker"]!.response.toLowerCase()}` : "has not answered yet"}.</p>
        </div>
      )}
      {mine && (
        <p className="mt-3 text-[13px] text-slate">
          You {mine.response.toLowerCase()} on {fmtStamp(mine.at)}
          {mine.reason ? `: ${mine.reason}` : ""}.
        </p>
      )}
    </Card>
  );
}

/** A watermarked preview: the viewer's name and organisation across the page (PRD Confidentiality req. 5). */
function Preview({ seeker, viewer, item, onClose }: { seeker: DrApplication; viewer: DrApplication; item: string; onClose: () => void }) {
  const { state } = useStore();
  const doc = seeker.documents.find((d) => d.id === item);
  const mark = `${viewer.decisionMaker.name}, ${viewer.org.name}, ${state.dealRoom.clock}`;
  return (
    <div className="mt-3 relative overflow-hidden rounded-lg border border-line bg-white p-5 min-h-56">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-content-center gap-10 opacity-[0.10] -rotate-[24deg] select-none">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="whitespace-nowrap text-[18px] font-medium">
            {mark}
          </div>
        ))}
      </div>
      <div className="relative">
        <div className="flex justify-between gap-3">
          <div className="font-medium">{item === "profile" ? `${seeker.org.name}: full profile` : `${doc?.kind}, ${seeker.org.name}`}</div>
          <button className="btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {item === "profile" ? (
          <dl className="mt-3 grid gap-1 text-[14px]">
            <div>
              <dt className="inline text-slate">Ask: </dt>
              <dd className="inline">
                {compact(seeker.ask!.amount, seeker.ask!.currency)} {seeker.ask!.instrument.toLowerCase()}, {seeker.ask!.stage.toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate">Use of funds: </dt>
              <dd className="inline">{seeker.ask!.useOfFunds}</dd>
            </div>
            <div>
              <dt className="inline text-slate">Traction: </dt>
              <dd className="inline">
                {seeker.traction?.revenueBand}; {seeker.traction?.customers}; {seeker.traction?.metrics}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate">Decision-maker: </dt>
              <dd className="inline">
                {seeker.decisionMaker.name}, {seeker.decisionMaker.title}, {seeker.decisionMaker.email}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-[14px] text-slate">Page 1 of 14. The prototype keeps no file content; in the product this is the document itself, served through a short-lived link and watermarked with your name.</p>
        )}
        <p className="mt-4 text-[12px] text-slate">This opening is recorded and the business can see it.</p>
      </div>
    </div>
  );
}

/* ---------- meetings (CS-10, FP-9) ---------- */

export function Meetings({ app }: { app: DrApplication }) {
  const { state, dispatch } = useStore();
  const dr = state.dealRoom;
  const cfg = dr.configs[app.eventId];
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const list = dr.meetings
    .filter((mt) => mt.status !== "Cancelled" && dr.matches.some((m) => m.id === mt.matchId && (m.seekerId === app.id || m.providerId === app.id)))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!list.length) return <Card title="No meetings yet">A meeting is proposed once you and the other party both accept an introduction. You confirm it here.</Card>;
  const side = app.type;
  const label = (mt: DrMeeting) => {
    if (lapsed(mt, cfg, dr.clock)) return "Lapsed: the slot was released";
    if (mt.status === "Proposed" || mt.status === "Change requested") return mt.confirm[side] ? "You confirmed; waiting for the other side" : `Please confirm by ${fmtStamp(confirmBy(mt, cfg))}`;
    return mt.status;
  };
  return (
    <>
      {list.map((mt) => {
        const m = dr.matches.find((x) => x.id === mt.matchId)!;
        const other = dr.apps.find((a) => a.id === (side === "seeker" ? m.providerId : m.seekerId))!;
        const room = state.rooms.find((r) => r.id === mt.roomId);
        const where = mt.link ? `Online: ${mt.link}` : `${room?.name}${mt.table && (cfg.rooms[mt.roomId!]?.tables ?? 1) > 1 ? `, table ${mt.table}` : ""}`;
        const canConfirm = (mt.status === "Proposed" || mt.status === "Change requested") && !mt.confirm[side] && !lapsed(mt, cfg, dr.clock);
        return (
          <Card key={mt.id} title={`${fmtStamp(mt.start)} to ${mt.end.slice(11)}`} aside={<span className={`pill ${mt.status === "Confirmed" ? "bg-ok-50 text-ok" : mt.status === "Held" ? "bg-ink text-white" : "bg-warn-50 text-warn"}`}>{label(mt)}</span>}>
            <p className="text-[15px]">
              With <b className="font-medium">{other.org.name}</b> ({other.decisionMaker.name}), {where}.
            </p>
            {mt.change && <p className="mt-1 text-[13px] text-slate">The {mt.change.by} asked to move: {mt.change.reason}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {canConfirm && (
                <button className="btn-primary btn-sm" onClick={() => dispatch({ type: "dr/confirm", meetingId: mt.id, side })}>
                  Confirm this slot
                </button>
              )}
              {["Proposed", "Confirmed"].includes(mt.status) && !lapsed(mt, cfg, dr.clock) && (
                <button className="btn-secondary btn-sm" onClick={() => setAsking(asking === mt.id ? null : mt.id)}>
                  Ask to move it
                </button>
              )}
              {mt.status === "Confirmed" && (
                <button className="btn-secondary btn-sm" onClick={() => downloadText(`deal-room-${mt.start.slice(0, 10)}-${mt.start.slice(11).replace(":", "")}.ics`, ics(mt, `Deal Room: ${other.org.name}`, where), "text/calendar")}>
                  Add to calendar (.ics)
                </button>
              )}
            </div>
            {asking === mt.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="What works instead" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn-primary btn-sm" disabled={!reason.trim()} onClick={() => { dispatch({ type: "dr/requestChange", meetingId: mt.id, side, reason }); setAsking(null); setReason(""); }}>
                  Send to the team
                </button>
              </div>
            )}
            {mt.status === "Confirmed" && <p className="mt-2 text-[12px] text-slate">Reminders come 24 hours and 30 minutes before. Check in with your badge at the Deal Room desk.</p>}
          </Card>
        );
      })}
    </>
  );
}

/* ---------- the access log (CS-11) ---------- */

export function AccessLog({ app }: { app: DrApplication }) {
  const { state } = useStore();
  const dr = state.dealRoom;
  const rows = dr.access.filter((a) => a.seekerId === app.id);
  const what = (item: string) => (item === "profile" ? "Full profile" : item === "teaser" ? "Teaser" : app.documents.find((d) => d.id === item)?.kind ?? item);
  const who = (id: string) => (id === "admin" ? "Algotech support, under a grant" : dr.apps.find((a) => a.id === id)?.org.name ?? id);
  return (
    <Card title="Who opened your file">
      {rows.length === 0 ? (
        <p className="text-[14px] text-slate">Nobody yet.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="py-2 border-b border-line last:border-0 text-[14px] flex flex-wrap justify-between gap-2">
              <span>
                <b className="font-medium">{who(r.viewer)}</b> {r.action === "download" ? "downloaded" : "opened"} {what(r.item).toLowerCase()}
              </span>
              <span className="text-[12px] text-slate">{fmtStamp(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
