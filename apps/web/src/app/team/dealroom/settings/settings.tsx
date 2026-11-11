"use client";

/**
 * The Deal Room's settings, as its lead sets them up: the missions applicants apply under, the tracks within them,
 * when applications open and close, and how long an applicant has to answer a request. Applications open once
 * these are set and the event is live. The rubric is the platform's standard one for now (shown, not edited).
 */
import { useState } from "react";
import type { DealRoomSettings, DealRoomSettingsInput } from "@excursia/contracts/onboarding";
import { PageHeader, Section } from "@/components/ui";
import { useDealRoomSettings, useSaveSettings } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, Gaps, History, Loading } from "../../bits";

type Mission = DealRoomSettings["missions"][number];
type Track = DealRoomSettings["tracks"][number];

export function Settings({ eventId }: { eventId: string }) {
  const q = useDealRoomSettings(eventId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  return <Form key={q.data.log.length} eventId={eventId} s={q.data} />;
}

function Form({ eventId, s }: { eventId: string; s: DealRoomSettings }) {
  const save = useSaveSettings(eventId);
  const [missions, setMissions] = useState<Mission[]>(s.missions);
  const [tracks, setTracks] = useState<Track[]>(s.tracks);
  const [dates, setDates] = useState({ appOpen: s.appOpen, appClose: s.appClose, rfiDays: String(s.rfiDays) });
  const edit = s.canEdit;
  const nextId = (prefix: "m" | "t", list: { id: string }[]) => `${prefix}${Math.max(0, ...list.map((x) => Number(x.id.slice(1)) || 0)) + 1}`;
  const input: DealRoomSettingsInput = { missions, tracks, appOpen: dates.appOpen, appClose: dates.appClose, rfiDays: Number(dates.rfiDays) };
  const live = s.event.state === "Live";

  return (
    <>
      <PageHeader title="Deal Room settings" kicker={`${s.event.name} · starts ${s.event.startDate}`} />
      <div className="mb-4">
        {s.gaps.length ? (
          <Gaps title="Applications open once you have:" gaps={s.gaps} />
        ) : (
          <p className="rounded-lg bg-ok-50 px-4 py-3 text-[14px] text-ok">
            {live ? `Taking applications at /e/${s.event.slug}/deal-room/apply` : "Ready. Applications open once the organiser publishes the event."}
          </p>
        )}
      </div>
      <form
        className="grid gap-4 lg:grid-cols-[1fr_340px]"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(input);
        }}
      >
        <div className="space-y-4">
          <Section title="Missions" action={edit && <button type="button" className="btn-secondary btn-sm" onClick={() => setMissions((m) => [...m, { id: nextId("m", m), code: `M${m.length + 1}`, name: "", description: "" }])}>Add a mission</button>}>
            <div className="space-y-4">
              {missions.map((m, i) => (
                <div key={m.id} className="grid gap-2 sm:grid-cols-[80px_1fr_auto]">
                  <input className="input" aria-label="Code" value={m.code} disabled={!edit} onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
                  <input className="input" aria-label="Mission" placeholder="What the mission is about" value={m.name} disabled={!edit} onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  {edit && (
                    <button type="button" className="text-[13px] text-bad hover:underline" onClick={() => { setMissions((l) => l.filter((_, j) => j !== i)); setTracks((t) => t.filter((x) => x.missionId !== m.id)); }}>
                      Remove
                    </button>
                  )}
                  <textarea className="input sm:col-span-3" rows={2} aria-label="Description" placeholder="One or two sentences for applicants" value={m.description} disabled={!edit} onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                </div>
              ))}
              {!missions.length && <p className="text-[14px] text-slate">No missions yet. Applicants choose one when they apply.</p>}
            </div>
          </Section>

          <Section title="Tracks" action={edit && missions.length > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setTracks((t) => [...t, { id: nextId("t", t), code: `T${t.length + 1}`, name: "", missionId: missions[0].id, description: "" }])}>Add a track</button>}>
            <div className="space-y-3">
              {tracks.map((t, i) => (
                <div key={t.id} className="grid gap-2 sm:grid-cols-[80px_1fr_180px_auto]">
                  <input className="input" aria-label="Code" value={t.code} disabled={!edit} onChange={(e) => setTracks((l) => l.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
                  <input className="input" aria-label="Track" placeholder="Track name" value={t.name} disabled={!edit} onChange={(e) => setTracks((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <select className="input" aria-label="Mission" value={t.missionId} disabled={!edit} onChange={(e) => setTracks((l) => l.map((x, j) => (j === i ? { ...x, missionId: e.target.value } : x)))}>
                    {missions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} {m.name}
                      </option>
                    ))}
                  </select>
                  {edit && (
                    <button type="button" className="text-[13px] text-bad hover:underline" onClick={() => setTracks((l) => l.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {!tracks.length && <p className="text-[14px] text-slate">Optional: themes within a mission.</p>}
            </div>
          </Section>

          <Section title="Scoring rubric">
            <p className="mb-3 text-[13px] text-slate">The platform&apos;s standard rubric. Weights add up to 100.</p>
            <ul className="space-y-1 text-[14px]">
              {s.rubric.assessment.map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span>{c.text}</span>
                  <span className="font-mono text-slate">{c.weight}%</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Dates">
            <div className="space-y-3">
              {(["appOpen", "appClose"] as const).map((k) => (
                <div key={k}>
                  <label className="label" htmlFor={`d-${k}`}>
                    {k === "appOpen" ? "Applications open" : "Applications close"}
                  </label>
                  <input id={`d-${k}`} type="date" className="input" value={dates[k]} disabled={!edit} onChange={(e) => setDates((d) => ({ ...d, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="label" htmlFor="d-rfi">
                  Days to answer a request
                </label>
                <input id="d-rfi" type="number" min={1} max={30} className="input" value={dates.rfiDays} disabled={!edit} onChange={(e) => setDates((d) => ({ ...d, rfiDays: e.target.value }))} />
              </div>
            </div>
          </Section>
          {edit && (
            <div className="space-y-2">
              <Failed error={save.error} />
              <button className="btn-primary w-full" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save settings"}
              </button>
            </div>
          )}
          <Section title="Changes">
            <History items={[...s.log].reverse().map((l) => ({ at: l.at, what: l.what }))} />
          </Section>
        </div>
      </form>
    </>
  );
}
