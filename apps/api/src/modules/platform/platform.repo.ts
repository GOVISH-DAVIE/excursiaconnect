/**
 * Algotech's own accounts. Two levels: super admins also manage the admins and the organisers' rate cards; admins
 * check KYC, approve events and give Deal Rooms their staff. The first super admin is made from the command line
 * (cli/create-admin.ts); after that, super admins invite others from the workspace.
 */
import { randomBytes } from "node:crypto";
import type { Db, Prisma } from "@excursia/db";

type Tx = Prisma.TransactionClient;

const invitation = (userId: string, superAdmin: boolean) => ({
  id: `msg_${randomBytes(8).toString("hex")}`,
  recipient: `user:${userId}`,
  channel: "email" as const,
  subject: `You are ${superAdmin ? "a super admin" : "an admin"} for Algotech on ExcursiaConnect: set your password to sign in`,
  link: "/signin",
  status: "queued" as const,
});

/** Makes or reuses the admin account behind an email and gives it its level. Null if the email is another kind's. */
async function grant(tx: Tx, email: string, name: string, superAdmin: boolean) {
  const existing = await tx.user.findUnique({ where: { email }, select: { id: true, kind: true, disabledAt: true } });
  if (existing && existing.kind !== "admin") return { refused: existing.kind };
  const user = existing ?? (await tx.user.create({ data: { kind: "admin", email, name }, select: { id: true, kind: true, disabledAt: true } }));
  if (existing?.disabledAt) await tx.user.update({ where: { id: user.id }, data: { disabledAt: null } });
  await tx.membership.updateMany({ where: { userId: user.id, role: { in: ["admin", "super_admin"] }, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.membership.create({ data: { userId: user.id, role: superAdmin ? "super_admin" : "admin" } });
  return { created: !existing, id: user.id };
}

export function createPlatformRepo(db: Db) {
  return {
    /**
     * The command line's admin (no request can make the first one). The first admin ever made is a super admin;
     * after that, `superAdmin` says. Safe to run again for the same person.
     */
    createAdmin: (email: string, name: string, superAdmin?: boolean) =>
      db.$transaction(async (tx) => {
        const anySuper = await tx.membership.count({ where: { role: "super_admin", revokedAt: null } });
        const r = await grant(tx, email, name, superAdmin ?? anySuper === 0);
        if ("id" in r) await tx.auditEntry.create({ data: { actorKind: "system", actorId: null, entity: "app_user", entityId: r.id!, action: "admin/create", detail: { email, super: superAdmin ?? anySuper === 0 }, ip: null } });
        return r;
      }),

    isSuper: async (userId: string) => !!(await db.membership.findFirst({ where: { userId, role: "super_admin", revokedAt: null }, select: { id: true } })),

    /** Every Algotech admin, with their level and whether they have signed in and set up an authenticator. */
    async team() {
      const users = await db.user.findMany({
        where: { kind: "admin", demo: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, passwordHash: true, disabledAt: true, totp: { select: { confirmedAt: true } }, memberships: { where: { revokedAt: null, role: { in: ["admin", "super_admin"] } }, select: { role: true } } },
      });
      return users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email ?? "",
        superAdmin: u.memberships.some((m) => m.role === "super_admin"),
        status: u.disabledAt ? ("removed" as const) : u.passwordHash ? ("active" as const) : ("invited" as const),
        mfa: !!u.totp?.confirmedAt,
      }));
    },

    /** An invitation: the account, its level, the audit row and the email, together. */
    invite: (input: { email: string; name: string; superAdmin: boolean }, by: { userId: string; ip: string | null }) =>
      db.$transaction(async (tx) => {
        const r = await grant(tx, input.email, input.name, input.superAdmin);
        if (!("id" in r)) return r;
        await tx.outboxMessage.create({ data: invitation(r.id!, input.superAdmin) });
        await tx.auditEntry.create({ data: { actorKind: "admin", actorId: by.userId, entity: "app_user", entityId: r.id!, action: "admin/invite", detail: { email: input.email, super: input.superAdmin }, ip: by.ip } });
        return r;
      }),

    /** Super admin or not. Refused (false) if it would leave no super admin. */
    setLevel: (userId: string, superAdmin: boolean, by: { userId: string; ip: string | null }) =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('algotech-admins', 0))`;
        const target = await tx.user.findUnique({ where: { id: userId }, select: { kind: true, disabledAt: true, name: true, email: true } });
        if (!target || target.kind !== "admin" || target.disabledAt) return "not_found" as const;
        if (!superAdmin) {
          const supers = await tx.membership.count({ where: { role: "super_admin", revokedAt: null, userId: { not: userId } } });
          if (supers === 0) return "last_super" as const;
        }
        await grant(tx, target.email!, target.name, superAdmin);
        await tx.auditEntry.create({ data: { actorKind: "admin", actorId: by.userId, entity: "app_user", entityId: userId, action: "admin/level", detail: { super: superAdmin }, ip: by.ip } });
        return "ok" as const;
      }),

    /** Removes an admin: the account is disabled, its levels revoked and every session ended, at once. */
    remove: (userId: string, by: { userId: string; ip: string | null }) =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('algotech-admins', 0))`;
        const target = await tx.user.findUnique({ where: { id: userId }, select: { kind: true, disabledAt: true } });
        if (!target || target.kind !== "admin" || target.disabledAt) return "not_found" as const;
        const supers = await tx.membership.count({ where: { role: "super_admin", revokedAt: null, userId: { not: userId } } });
        const isSuper = await tx.membership.count({ where: { role: "super_admin", revokedAt: null, userId } });
        if (isSuper && supers === 0) return "last_super" as const;
        const now = new Date();
        await tx.user.update({ where: { id: userId }, data: { disabledAt: now } });
        await tx.membership.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
        await tx.auditEntry.create({ data: { actorKind: "admin", actorId: by.userId, entity: "app_user", entityId: userId, action: "admin/remove", detail: {}, ip: by.ip } });
        return "ok" as const;
      }),
  };
}
export type PlatformRepo = ReturnType<typeof createPlatformRepo>;
