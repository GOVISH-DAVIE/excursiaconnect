"use client";

import { useState } from "react";
import { Empty, Section } from "@/components/ui";
import { useStore } from "@/lib/store";
import { readImage, sizeOf } from "@/lib/media";
import { initials } from "@/lib/brand";
import { SOCIAL_KEYS, type SocialLinks, type Sponsor } from "@excursia/domain/types";

const TIERS: Sponsor["tier"][] = ["Headline", "Gold", "Silver", "Partner"];

/** Website and social fields; each saves when you leave it. `only` narrows the set for a compact row. */
function LinksFields({ value, onChange, only, compact = false }: { value?: SocialLinks; onChange: (links: SocialLinks) => void; only?: (keyof SocialLinks)[]; compact?: boolean }) {
  const keys = SOCIAL_KEYS.filter((k) => !only || only.includes(k.key));
  return (
    <div className={compact ? "grid gap-1.5" : "grid gap-3 sm:grid-cols-3"}>
      {keys.map((k) => (
        <div key={k.key}>
          {!compact && <label className="label">{k.label}</label>}
          <input
            className={`input ${compact ? "h-8 text-[13px]" : ""}`}
            placeholder={compact ? k.label : "https://"}
            aria-label={k.label}
            defaultValue={value?.[k.key] ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (value?.[k.key] ?? "")) return;
              const next = { ...value, [k.key]: v || undefined };
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** One file button in the system's look. */
function Upload({ label, kind, onDone, onMany, className = "" }: { label: string; kind: "banner" | "photo" | "logo" | "gallery"; onDone?: (dataUrl: string) => void; onMany?: (dataUrls: string[]) => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`btn btn-secondary cursor-pointer ${busy ? "opacity-60" : ""} ${className}`}>
      {busy ? "Reading…" : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        multiple={!!onMany}
        className="sr-only"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          setBusy(true);
          try {
            const read = await Promise.all(files.map((f) => readImage(f, kind)));
            if (onMany) onMany(read);
            else onDone?.(read[0]);
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}

export function MediaTab({ eventId }: { eventId: string }) {
  const { state, dispatch } = useStore();
  const event = state.events.find((e) => e.id === eventId)!;
  const banner = state.banners[eventId];
  const floorPlan = state.floorPlans[eventId];
  const gallery = state.galleries[eventId] ?? [];
  const sessions = state.sessions.filter((s) => s.eventId === eventId);
  const speakers = [...new Set(sessions.flatMap((s) => s.speakers))];
  const profile = (name: string) => state.speakerProfiles.find((p) => p.eventId === eventId && p.name === name);
  const sponsors = state.sponsors.filter((s) => s.eventId === eventId);
  const [draft, setDraft] = useState<{ name: string; tier: Sponsor["tier"]; url: string; logo?: string }>({ name: "", tier: "Gold", url: "" });

  return (
    <div className="space-y-4">
      <Section title="Banner" action={banner ? <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "setBanner", eventId })}>Remove</button> : null}>
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg overflow-hidden bg-paper-200 aspect-[628/716] max-h-[360px]" style={{ aspectRatio: "16 / 10" }}>
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full grid place-items-center text-[14px] text-slate p-6 text-center">No banner yet. The public page shows the Day 1 programme in its place.</div>
            )}
          </div>
          <div className="space-y-3 text-[14px]">
            <Upload label={banner ? "Replace banner" : "Upload banner"} kind="banner" onDone={(img) => dispatch({ type: "setBanner", eventId, image: img })} />
            <p className="text-slate">The picture behind the first screen of the public page, and the share image. A landscape photograph of the venue, the stage or last year&apos;s room, 1800 px or wider; the headline and the ticket panel sit over a dark wash, so a busy or bright picture still reads.</p>
            {banner && <p className="text-slate">Stored at {sizeOf(banner)}.</p>}
          </div>
        </div>
      </Section>

      <Section title={`Photo gallery, ${gallery.length}`} action={<Upload label="Add photos" kind="gallery" onMany={(imgs) => dispatch({ type: "addGallery", eventId, images: imgs })} className="btn-sm" />}>
        {gallery.length === 0 ? (
          <Empty>No photographs yet. Add up to twelve from last year&apos;s edition or the venue; the public page shows them in a grid under the programme.</Empty>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {gallery.map((src, i) => (
              <li key={i} className="group relative rounded-md overflow-hidden bg-paper-200" style={{ aspectRatio: "4 / 3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button type="button" className="absolute top-1.5 right-1.5 h-7 px-2 rounded-md bg-ink/80 text-paper text-[12px] opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => dispatch({ type: "removeGallery", eventId, index: i })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[13px] text-slate">The first photograph is shown largest. Landscape pictures 1400 px or wider; people, the room, the stage and the exhibition floor work best. {gallery.length >= 12 && "Twelve is the limit; remove one to add another."}</p>
      </Section>

      <Section title="Venue floor plan" action={floorPlan ? <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "setFloorPlan", eventId })}>Remove</button> : null}>
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg overflow-hidden bg-paper-200" style={{ aspectRatio: "4 / 3", maxHeight: 360 }}>
            {floorPlan ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={floorPlan} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="h-full grid place-items-center text-[14px] text-slate p-6 text-center">No plan yet. The public page draws your zones and rooms to scale by capacity in its place.</div>
            )}
          </div>
          <div className="space-y-3 text-[14px]">
            <Upload label={floorPlan ? "Replace plan" : "Upload floor plan"} kind="banner" onDone={(img) => dispatch({ type: "setFloorPlan", eventId, image: img })} />
            <p className="text-slate">The venue&apos;s own plan, with the halls and rooms named as your zones are. Shown in the Venue section of the public page and on the staff scanner.</p>
          </div>
        </div>
      </Section>

      <Section title="Event website and social links">
        <LinksFields value={event.links} onChange={(links) => dispatch({ type: "setEventLinks", eventId, links })} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="ev-hashtag">Hashtag</label>
            <input id="ev-hashtag" className="input" placeholder="#NBPS2026" defaultValue={event.hashtag ?? ""} onBlur={(e) => e.target.value.trim() !== (event.hashtag ?? "") && dispatch({ type: "setEventLinks", eventId, links: event.links, hashtag: e.target.value.trim() || undefined })} />
          </div>
        </div>
        <p className="mt-3 text-[13px] text-slate">Shown in the public page&apos;s footer and in every email. Leave a field empty and it is left out.</p>
      </Section>

      <Section title={`Speakers, ${speakers.length}`} flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Speaker</th>
              <th className="th">Organisation and title</th>
              <th className="th">Links</th>
              <th className="th">Photo</th>
            </tr>
          </thead>
          <tbody>
            {speakers.map((name) => {
              const p = profile(name);
              const save = (patch: Partial<NonNullable<typeof p>>) => dispatch({ type: "setSpeakerProfile", profile: { eventId, name, ...p, ...patch } });
              return (
                <tr key={name} className="hover:bg-paper">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-10 rounded-full overflow-hidden bg-paper-200 grid place-items-center text-[13px] font-medium text-slate shrink-0">
                        {p?.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(name)
                        )}
                      </span>
                      <div>
                        <div className="font-medium">{name}</div>
                        <div className="text-[13px] text-slate">{sessions.filter((s) => s.speakers.includes(name)).map((s) => `Day ${s.day}`).join(", ")}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <div className="grid gap-1.5">
                      <input className="input h-8 text-[13px]" placeholder="Organisation" aria-label="Organisation" defaultValue={p?.organisation ?? ""} onBlur={(e) => e.target.value !== (p?.organisation ?? "") && save({ organisation: e.target.value })} />
                      <input className="input h-8 text-[13px]" placeholder="Job title" aria-label="Job title" defaultValue={p?.jobTitle ?? ""} onBlur={(e) => e.target.value !== (p?.jobTitle ?? "") && save({ jobTitle: e.target.value })} />
                    </div>
                  </td>
                  <td className="td">
                    <LinksFields compact only={["website", "linkedin", "x"]} value={p?.links} onChange={(links) => save({ links })} />
                  </td>
                  <td className="td whitespace-nowrap">
                    <Upload label={p?.photo ? "Replace" : "Upload photo"} kind="photo" onDone={(img) => save({ photo: img })} className="btn-sm" />
                    {p?.photo && (
                      <button className="btn-quiet text-bad ml-1" onClick={() => save({ photo: undefined })}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[13px] text-slate">Speakers come from the programme: add a session with their name and they appear here. A square photograph, the face in the middle, 600 px or more. Organisation and title save when you leave the field.</p>
      </Section>

      <Section title={`Sponsors and partners, ${sponsors.length}`} flush>
        {sponsors.length === 0 ? (
          <div className="p-5">
            <Empty>No sponsors yet. Add one below; the public page shows them by tier.</Empty>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Logo</th>
                <th className="th">Name</th>
                <th className="th">Tier</th>
                <th className="th">Link</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id} className="hover:bg-paper">
                  <td className="td w-40">
                    <div className="flex items-center gap-2">
                      <span className="h-12 w-24 rounded-md bg-paper-200 grid place-items-center overflow-hidden p-1.5">
                        {s.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.logo} alt="" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-[13px] text-slate">No logo</span>
                        )}
                      </span>
                      <Upload label={s.logo ? "Replace" : "Upload"} kind="logo" onDone={(img) => dispatch({ type: "upsertSponsor", sponsor: { ...s, logo: img } })} className="btn-sm" />
                    </div>
                  </td>
                  <td className="td">
                    <input className="input h-9 text-[14px]" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && dispatch({ type: "upsertSponsor", sponsor: { ...s, name: e.target.value } })} />
                  </td>
                  <td className="td">
                    <select className="input h-9 w-auto text-[14px]" value={s.tier} onChange={(e) => dispatch({ type: "upsertSponsor", sponsor: { ...s, tier: e.target.value as Sponsor["tier"] } })}>
                      {TIERS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    <div className="grid gap-1.5">
                      <input className="input h-8 text-[13px]" placeholder="Website" aria-label="Website" defaultValue={s.url ?? ""} onBlur={(e) => e.target.value !== (s.url ?? "") && dispatch({ type: "upsertSponsor", sponsor: { ...s, url: e.target.value || undefined } })} />
                      <LinksFields compact only={["linkedin", "x"]} value={s.links} onChange={(links) => dispatch({ type: "upsertSponsor", sponsor: { ...s, links } })} />
                    </div>
                  </td>
                  <td className="td text-right">
                    <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "removeSponsor", sponsorId: s.id })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          className="px-5 py-4 border-t border-line grid gap-3 sm:grid-cols-[1fr_140px_1fr_auto_auto] items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim()) return;
            dispatch({ type: "upsertSponsor", sponsor: { id: `sp_${Date.now().toString(36)}`, eventId, name: draft.name.trim(), tier: draft.tier, url: draft.url || undefined, logo: draft.logo } });
            setDraft({ name: "", tier: "Gold", url: "" });
          }}
        >
          <div>
            <label className="label" htmlFor="sp-name">Name</label>
            <input id="sp-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="sp-tier">Tier</label>
            <select id="sp-tier" className="input" value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value as Sponsor["tier"] })}>
              {TIERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sp-url">Link</label>
            <input id="sp-url" className="input" placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          </div>
          <Upload label={draft.logo ? "Logo added" : "Logo"} kind="logo" onDone={(img) => setDraft({ ...draft, logo: img })} />
          <button className="btn btn-primary" type="submit">
            Add sponsor
          </button>
        </form>
        <p className="px-5 pb-4 text-[13px] text-slate">Logos keep their own colours on the page; a PNG or SVG with a transparent ground sits best. Headline logos show largest, partners smallest. {event.brand.logoText && `Your own mark, ${event.brand.logoText}, is set under Tickets and form.`}</p>
      </Section>
    </div>
  );
}
