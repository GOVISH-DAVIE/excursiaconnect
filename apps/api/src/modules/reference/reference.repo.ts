/**
 * Writing reference data: upserts, so the same file can be imported again after an edit. One transaction.
 */
import type { Db } from "@excursia/db";
import type { DrStaff } from "@excursia/domain/dealroom/types";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import { json } from "../events/events.mapper";
import { toDay } from "../../persistence/time";
import type { ReferenceFile } from "./reference.schema";

const ROLE = { Lead: "dr_lead", Reviewer: "dr_reviewer", Operations: "dr_operations", Coordinator: "dr_coordinator", Oversight: "dr_oversight" } as const;

export type ImportResult = { created: string[]; updated: string[]; staffNotInFile: string[] };

export type ReferenceRepo = {
  /** Whether the ids the file names belong to demo data, and which event already has the file's slug. */
  conflicts(file: ReferenceFile): Promise<{ demoOrganiser: boolean; demoEvent: boolean; demoUsers: string[]; slugTakenBy?: string }>;
  importFile(file: ReferenceFile, now: string): Promise<ImportResult>;
};

export function createReferenceRepo(db: Db): ReferenceRepo {
  return {
    async conflicts(file) {
      const emails = file.dealRoom?.staff.map((s) => s.email) ?? [];
      const [organiser, event, users, bySlug] = await Promise.all([
        db.organiser.findUnique({ where: { id: file.organiser.id }, select: { demo: true } }),
        db.event.findUnique({ where: { id: file.event.id }, select: { demo: true } }),
        db.user.findMany({ where: { email: { in: emails }, demo: true }, select: { email: true } }),
        db.event.findUnique({ where: { slug: file.event.slug }, select: { id: true } }),
      ]);
      return {
        demoOrganiser: !!organiser?.demo,
        demoEvent: !!event?.demo,
        demoUsers: users.map((u) => u.email ?? ""),
        slugTakenBy: bySlug && bySlug.id !== file.event.id ? bySlug.id : undefined,
      };
    },

    importFile(file, now) {
      return db.$transaction(async (tx) => {
        const result: ImportResult = { created: [], updated: [], staffNotInFile: [] };
        const note = (existed: unknown, what: string) => (existed ? result.updated : result.created).push(what);

        const { organiser: o, event: e } = file;
        note(await tx.organiser.findUnique({ where: { id: o.id }, select: { id: true } }), `organiser ${o.id}`);
        await tx.organiser.upsert({ where: { id: o.id }, create: { id: o.id, name: o.name, record: json(o) }, update: { name: o.name, record: json(o) } });

        const eventRow = { organiserId: e.organiserId, slug: e.slug, name: e.name, startDate: toDay(e.startDate), endDate: toDay(e.endDate), state: e.state, record: json(e) };
        note(await tx.event.findUnique({ where: { id: e.id }, select: { id: true } }), `event ${e.id}`);
        await tx.event.upsert({ where: { id: e.id }, create: { id: e.id, ...eventRow }, update: eventRow });

        if (!file.dealRoom) return result;
        const { config, staff } = file.dealRoom;

        // the config is replaced; the aggregate's own history (grants, admin log, live window) is kept
        const existing = await tx.drConfig.findUnique({ where: { eventId: e.id } });
        const kept = existing ? (existing.record as unknown as DrConfigRecord) : { grants: [], adminLog: [] };
        const record: DrConfigRecord = { ...kept, config: config as unknown as DrConfigRecord["config"] };
        note(existing, `Deal Room config for ${e.id}`);
        await tx.drConfig.upsert({ where: { eventId: e.id }, create: { eventId: e.id, record: json(record) }, update: { record: json(record) } });

        for (const s of staff) {
          const user = await tx.user.upsert({ where: { email: s.email }, create: { kind: "staff", email: s.email, name: s.name }, update: { name: s.name } });
          const before = await tx.drStaff.findUnique({ where: { id: s.id } });
          const prior = before?.record as unknown as DrStaff | undefined;
          const member: DrStaff = { ...s, eventId: e.id, active: true, addedAt: prior?.addedAt ?? now, revokedAt: undefined };
          note(before, `staff ${s.id} (${s.role})`);
          await tx.drStaff.upsert({
            where: { id: s.id },
            create: { id: s.id, eventId: e.id, userId: user.id, role: s.role, active: true, record: json(member) },
            update: { userId: user.id, role: s.role, active: true, record: json(member) },
          });
          const membership = { userId: user.id, role: ROLE[s.role], eventId: e.id, canDecide: s.canDecide, revokedAt: null };
          await tx.membership.upsert({ where: { id: `mem_${s.id}` }, create: { id: `mem_${s.id}`, ...membership }, update: membership });
        }

        // staff on the event but missing from the file are reported, never revoked silently
        const listed = new Set(staff.map((s) => s.id));
        const onEvent = await tx.drStaff.findMany({ where: { eventId: e.id, active: true }, select: { id: true } });
        result.staffNotInFile = onEvent.map((s) => s.id).filter((x) => !listed.has(x));
        return result;
      });
    },
  };
}
