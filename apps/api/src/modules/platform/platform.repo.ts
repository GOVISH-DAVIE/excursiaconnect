/** Algotech's own accounts: the first admin is made from the command line (cli/create-admin.ts), never by a request. */
import type { Db } from "@excursia/db";

export function createPlatformRepo(db: Db) {
  return {
    /**
     * An Algotech admin account with no password: they set it with "Set or reset your password", then add the
     * authenticator. Returns null if the email already has an account of another kind.
     */
    createAdmin: (email: string, name: string) =>
      db.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email }, select: { id: true, kind: true } });
        if (existing && existing.kind !== "admin") return { refused: existing.kind };
        const user = existing ?? (await tx.user.create({ data: { kind: "admin", email, name }, select: { id: true, kind: true } }));
        if (!(await tx.membership.findFirst({ where: { userId: user.id, role: "admin", revokedAt: null }, select: { id: true } })))
          await tx.membership.create({ data: { userId: user.id, role: "admin" } });
        await tx.auditEntry.create({ data: { actorKind: "system", actorId: null, entity: "app_user", entityId: user.id, action: "admin/create", detail: { email }, ip: null } });
        return { created: !existing, id: user.id };
      }),
  };
}
