/**
 * The form's working copy of an application, and what changed in it since the last save. The fields components
 * edit a whole DrApplication; autosave sends only the dotted paths that differ (DraftChanges), and the server
 * merges them into the draft on record.
 */
import type { DraftChanges, MyApplication } from "@excursia/contracts/apply";
import { blankApplication, writablePaths, type DraftPath } from "@excursia/domain/dealroom/apply";
import type { DrApplication } from "@excursia/domain/dealroom/types";

/** The application as the fields components expect it: a blank of its kind, with what the server holds on top. */
export function toDraft(app: MyApplication, eventId: string): DrApplication {
  const blank = blankApplication({ id: app.id, eventId, mode: app.mode, email: app.form.contact.email, now: app.draftSavedAt ?? "" });
  const f = app.form as unknown as Partial<DrApplication>;
  return {
    ...blank,
    ...f,
    org: { ...blank.org, ...f.org },
    contact: { ...blank.contact, ...f.contact },
    decisionMaker: { ...blank.decisionMaker, ...f.decisionMaker },
    ask: blank.ask && { ...blank.ask, ...f.ask },
    traction: blank.traction && { ...blank.traction, ...f.traction },
    mandate: blank.mandate && { ...blank.mandate, ...f.mandate },
    challenge: blank.challenge && { ...blank.challenge, ...f.challenge },
    documents: [],
  } as DrApplication;
}

const valueAt = (app: DrApplication, path: string): unknown => {
  const [group, field] = path.split(".");
  const top = (app as unknown as Record<string, unknown>)[group];
  const v = field ? (top as Record<string, unknown> | undefined)?.[field] : top;
  // an unchosen select is "" on the wire, never undefined
  return v === undefined ? "" : v;
};

/** Every writable path's current value, as JSON, to compare against later. */
export function snapshot(app: DrApplication): Record<string, string> {
  return Object.fromEntries([...writablePaths(app)].map((p) => [p, JSON.stringify(valueAt(app, p))]));
}

/** The paths whose value differs from the snapshot. */
export function changesSince(saved: Record<string, string>, app: DrApplication): DraftChanges {
  const out: Record<string, unknown> = {};
  for (const p of writablePaths(app)) {
    const v = valueAt(app, p);
    if (saved[p] !== JSON.stringify(v)) out[p] = v;
  }
  return out as DraftChanges;
}

/** The snapshot once these changes are saved. */
export const withSaved = (saved: Record<string, string>, changes: DraftChanges) => ({
  ...saved,
  ...Object.fromEntries(Object.entries(changes).map(([p, v]) => [p as DraftPath, JSON.stringify(v)])),
});
