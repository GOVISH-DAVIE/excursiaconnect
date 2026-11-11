/**
 * The reference-data file: what production starts from instead of the demo seed (backend-plan.md, M0.3). One file
 * per real event: its organiser, the event, and its Deal Room's configuration and staff. It holds no applicants,
 * delegates or payments; those arrive through the product.
 *
 * Checked strictly where the rules depend on a value, and passed through where a record carries more than the
 * import needs to know. The real file holds staff names and emails, so it lives on the server
 * (/etc/excursia/reference/), not in the repository; reference/*.example.json shows the shape.
 */
import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const wall = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "a Nairobi time as YYYY-MM-DD HH:MM");
const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}[a-z0-9_]+$`), `an id starting ${prefix}`);

const Organiser = z.looseObject({ id: id("org_"), name: z.string().min(2) });

const Event = z.looseObject({
  id: id("ev_"),
  slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and hyphens"),
  organiserId: id("org_"),
  name: z.string().min(2),
  startDate: day,
  endDate: day,
  state: z.enum(["Draft", "Submitted", "Under review", "Changes requested", "Approved", "Live", "Closed", "Suspended"]),
});

const DrConfig = z.looseObject({
  eventId: id("ev_"),
  missions: z.array(z.looseObject({ id: z.string(), code: z.string(), name: z.string() })).min(1),
  tracks: z.array(z.looseObject({ id: z.string(), code: z.string(), name: z.string(), missionId: z.string() })),
  sources: z.array(z.string()),
  sectors: z.array(z.string()),
  countries: z.array(z.string()),
  rubric: z.looseObject({}),
  matching: z.array(z.looseObject({ field: z.string(), mandatory: z.boolean() })),
  fields: z.record(z.string(), z.enum(["required", "advisory"])),
  ordering: z.enum(["criteria", "readiness"]),
  rules: z.looseObject({ meetingMin: z.number().int().positive(), bufferMin: z.number().int().min(0), confirmHours: z.number().min(0) }),
  freezeDate: z.union([day, wall]),
  secondReview: z.object({ decline: z.boolean(), askAbove: z.number().min(0) }),
  seekerFee: z.object({ amount: z.number().min(0), currency: z.enum(["USD", "KES"]), reminderDays: z.number().int().min(0) }),
  multiplePerOrg: z.boolean(),
  rooms: z.record(z.string(), z.object({ tables: z.number().int().min(0), from: z.string(), to: z.string() })),
  sessionRooms: z.array(z.string()),
  log: z.array(z.unknown()).default([]),
});

const Staff = z.object({
  id: id("st_"),
  name: z.string().min(2),
  email: z.email(),
  org: z.enum(["Bouer", "Excursia Connect", "Momentum"]).optional(),
  role: z.enum(["Lead", "Reviewer", "Operations", "Coordinator", "Oversight"]),
  canDecide: z.boolean(),
  mfa: z.boolean().default(true),
});

export const ReferenceFile = z
  .object({
    organiser: Organiser,
    event: Event,
    dealRoom: z.object({ config: DrConfig, staff: z.array(Staff).min(1) }).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.event.organiserId !== f.organiser.id) ctx.addIssue({ code: "custom", path: ["event", "organiserId"], message: `must be the organiser's id, ${f.organiser.id}` });
    if (f.event.endDate < f.event.startDate) ctx.addIssue({ code: "custom", path: ["event", "endDate"], message: "is before the start date" });
    if (!f.dealRoom) return;
    if (f.dealRoom.config.eventId !== f.event.id) ctx.addIssue({ code: "custom", path: ["dealRoom", "config", "eventId"], message: `must be the event's id, ${f.event.id}` });
    const seen = new Map<string, number>();
    f.dealRoom.staff.forEach((s, i) => {
      for (const key of [s.id, s.email.toLowerCase()]) {
        if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["dealRoom", "staff", i], message: `${key} is listed twice` });
        seen.set(key, i);
      }
    });
    if (!f.dealRoom.staff.some((s) => s.role === "Lead" && s.canDecide))
      ctx.addIssue({ code: "custom", path: ["dealRoom", "staff"], message: "needs a Lead who can decide" });
  });
export type ReferenceFile = z.infer<typeof ReferenceFile>;
