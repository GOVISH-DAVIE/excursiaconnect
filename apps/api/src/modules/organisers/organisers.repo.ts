/**
 * Organisers and their events in PostgreSQL. A change to an organiser or an event runs in one transaction holding
 * that row's lock (SELECT … FOR UPDATE), so two requests can't both read the old record and both write; the audit
 * row commits with it. The record is the rules' own shape (JSONB), with the indexed columns kept in step.
 */
import { randomBytes } from "node:crypto";
import type { Db, Prisma } from "@excursia/db";
import type { EventRecord, Organiser } from "@excursia/domain/types";
import { json } from "../events/events.mapper";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import { toDay } from "../../persistence/time";

export type Audit = { actorKind: string; actorId: string; action: string; detail?: object; ip: string | null };
/** An email to queue with the change (M1.4): to "user:<id>", naming the action only, linking to where it is done. */
export type Note = { to: string; subject: string; link: string; eventId?: string | null };

const outboxRows = (notes: Note[]) =>
  notes.map((n) => ({ id: `msg_${randomBytes(8).toString("hex")}`, eventId: n.eventId ?? null, recipient: n.to, channel: "email" as const, subject: n.subject, link: n.link, status: "queued" as const }));

type Tx = Prisma.TransactionClient;

const eventColumns = (e: EventRecord) => ({ organiserId: e.organiserId, slug: e.slug, name: e.name, startDate: toDay(e.startDate), endDate: toDay(e.endDate), timezone: e.timezone ?? "Africa/Nairobi", state: e.state, record: json(e) });

const auditRow = (a: Audit, entity: string, entityId: string, eventId: string | null) => ({
  actorKind: a.actorKind,
  actorId: a.actorId,
  eventId,
  entity,
  entityId,
  action: a.action,
  detail: (a.detail ?? {}) as Prisma.InputJsonValue,
  ip: a.ip,
});

export function createOrganisersRepo(db: Db) {
  return {
    userByEmail: (email: string) => db.user.findUnique({ where: { email }, select: { id: true, kind: true } }),

    /** The new owner's account, their organiser and the membership joining them, together or not at all. */
    createOwner(input: { user: { email: string; name: string; passwordHash: string }; organiser: Organiser; audit: Omit<Audit, "actorId"> }) {
      return db.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { kind: "staff", ...input.user } });
        await tx.organiser.create({ data: { id: input.organiser.id, name: input.organiser.name, record: json(input.organiser) } });
        await tx.membership.create({ data: { userId: user.id, role: "owner", organiserId: input.organiser.id } });
        await tx.auditEntry.create({ data: auditRow({ ...input.audit, actorId: user.id }, "organiser", input.organiser.id, null) });
        return user;
      });
    },

    /** Who hears about an organiser: its owners, and Algotech's admins. */
    ownerIds: async (organiserId: string) =>
      (await db.membership.findMany({ where: { organiserId, role: "owner", revokedAt: null }, select: { userId: true } })).map((m) => `user:${m.userId}`),
    adminIds: async () => (await db.user.findMany({ where: { kind: "admin", disabledAt: null, demo: false }, select: { id: true } })).map((u) => `user:${u.id}`),

    /**
     * Algotech opens an organiser for a client (PA-1): the organiser, the owner's account (made if there is none,
     * with no password until they set one) and their membership, the audit row and the invitation, together.
     * Null if the email belongs to an applicant or an Algotech admin.
     */
    openForClient: (input: { organiser: Organiser; owner: { email: string; name: string } }, audit: Audit) =>
      db.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: input.owner.email }, select: { id: true, kind: true } });
        if (existing && existing.kind !== "staff") return { refused: existing.kind };
        const user = existing ?? (await tx.user.create({ data: { kind: "staff", email: input.owner.email, name: input.owner.name }, select: { id: true, kind: true } }));
        await tx.organiser.create({ data: { id: input.organiser.id, name: input.organiser.name, record: json(input.organiser) } });
        await tx.membership.create({ data: { userId: user.id, role: "owner", organiserId: input.organiser.id } });
        await tx.auditEntry.create({ data: auditRow(audit, "organiser", input.organiser.id, null) });
        await tx.outboxMessage.createMany({
          data: outboxRows([
            {
              to: `user:${user.id}`,
              subject: existing
                ? `Algotech added ${input.organiser.name} to your ExcursiaConnect account: complete its KYC`
                : `Algotech opened an ExcursiaConnect account for ${input.organiser.name}: set your password, then complete KYC`,
              link: "/signin",
            },
          ]),
        });
        return { id: input.organiser.id, existing: !!existing };
      }),

    /** The organisers this user owns. */
    ownedBy: async (userId: string) =>
      (await db.membership.findMany({ where: { userId, role: "owner", revokedAt: null, organiserId: { not: null } }, select: { organiserId: true } })).map((m) => m.organiserId!),

    isOwner: async (userId: string, organiserId: string) => !!(await db.membership.findFirst({ where: { userId, organiserId, role: "owner", revokedAt: null }, select: { id: true } })),

    organiser: (id: string) => db.organiser.findUnique({ where: { id } }),

    ownerOf: async (organiserId: string) => {
      const m = await db.membership.findFirst({ where: { organiserId, role: "owner", revokedAt: null }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } } } });
      return m ? { name: m.user.name, email: m.user.email ?? "" } : null;
    },

    eventsOf: (organiserId: string) => db.event.findMany({ where: { organiserId }, orderBy: { startDate: "asc" } }),
    event: (id: string) => db.event.findUnique({ where: { id }, include: { organiser: true, drConfig: true } }),
    slugTaken: async (slug: string) => !!(await db.event.findUnique({ where: { slug }, select: { id: true } })),

    /** Changes one organiser under its row lock: `change` gets the record as it is now and returns the next one. */
    withOrganiser<T>(id: string, change: (o: Organiser, tx: Tx) => Promise<{ record: Organiser; audit: Audit; result?: T; notify?: Note[] }>) {
      return db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ record: Organiser }[]>`SELECT record FROM organiser WHERE id = ${id} FOR UPDATE`;
        if (!row) return null;
        const out = await change(row.record, tx);
        await tx.organiser.update({ where: { id }, data: { name: out.record.name, record: json(out.record) } });
        await tx.auditEntry.create({ data: auditRow(out.audit, "organiser", id, null) });
        if (out.notify?.length) await tx.outboxMessage.createMany({ data: outboxRows(out.notify) });
        return out;
      });
    },

    /**
     * Changes one event under its row lock, its organiser read alongside. `dealRoom` is the Deal Room to create
     * with it (Algotech's approval with the add-on), in the same transaction.
     */
    withEvent(id: string, change: (e: EventRecord, o: Organiser) => Promise<{ record: EventRecord; audit: Audit; dealRoom?: DrConfigRecord; notify?: Note[] }>) {
      return db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ record: EventRecord; organiser: Organiser }[]>`
          SELECT e.record, o.record AS organiser FROM event e JOIN organiser o ON o.id = e.organiser_id WHERE e.id = ${id} FOR UPDATE OF e`;
        if (!row) return null;
        const out = await change(row.record, row.organiser);
        await tx.event.update({ where: { id }, data: eventColumns(out.record) });
        if (out.dealRoom && !(await tx.drConfig.findUnique({ where: { eventId: id }, select: { eventId: true } })))
          await tx.drConfig.create({ data: { eventId: id, record: json(out.dealRoom) } });
        await tx.auditEntry.create({ data: auditRow(out.audit, "event", id, id) });
        if (out.notify?.length) await tx.outboxMessage.createMany({ data: outboxRows(out.notify) });
        return out;
      });
    },

    createEvent: (e: EventRecord, audit: Audit) =>
      db.$transaction(async (tx) => {
        await tx.event.create({ data: { id: e.id, ...eventColumns(e) } });
        await tx.auditEntry.create({ data: auditRow(audit, "event", e.id, e.id) });
      }),

    // KYC documents: File rows owned by the organiser, kept in quarantine until M1.2's scan
    addFile: (f: { id: string; organiserId: string; kind: string; storageKey: string; name: string; contentType: string; size: number }) =>
      db.file.create({ data: { id: f.id, ownerKind: "organiser", ownerId: f.organiserId, kind: f.kind, storageKey: f.storageKey, name: f.name, contentType: f.contentType, size: f.size } }),
    fileOf: (id: string, organiserId: string) => db.file.findFirst({ where: { id, ownerKind: "organiser", ownerId: organiserId } }),
    recentFiles: (organiserId: string, since: Date) => db.file.count({ where: { ownerKind: "organiser", ownerId: organiserId, createdAt: { gt: since } } }),
    audit: (a: Audit, entity: string, entityId: string, eventId: string | null) => db.auditEntry.create({ data: auditRow(a, entity, entityId, eventId) }),

    /** The Deal Room's staff, and whether each has set a password yet (their invitation taken up). */
    async dealRoomStaff(eventId: string) {
      const staff = await db.drStaff.findMany({ where: { eventId }, orderBy: { id: "asc" } });
      const ids = staff.map((s) => s.userId).filter((x): x is string => !!x);
      const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, passwordHash: true } });
      const ready = new Set(users.filter((u) => u.passwordHash).map((u) => u.id));
      return staff.map((s) => ({ record: s.record, signedUp: !!s.userId && ready.has(s.userId) }));
    },

    // Algotech's lists
    organisersByStatus: (statuses: string[]) =>
      db.organiser.findMany({ where: { demo: false, OR: statuses.map((s) => ({ record: { path: ["kycStatus"], equals: s } })) }, orderBy: { createdAt: "asc" } }),
    eventsByState: (states: string[]) => db.event.findMany({ where: { demo: false, state: { in: states } }, include: { organiser: { select: { name: true } } }, orderBy: { updatedAt: "asc" } }),
  };
}
export type OrganisersRepo = ReturnType<typeof createOrganisersRepo>;
