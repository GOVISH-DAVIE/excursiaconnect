import { writeFileSync } from "node:fs";
import { hashToken, newToken } from "../security/secrets";
import { runCommand } from "./run";

const SP = "/private/tmp/claude-501/-Users-mac-Documents-code-next-excursiaconnect/68e1774e-bc50-465a-9765-e7ba4caed735/scratchpad";
await runCommand("walk-sessions", async ({ db }) => {
  const at = new Date();
  const made: string[] = [];
  const sessionFor = async (who: string, userId: string) => {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: at, lastSeenAt: at, expiresAt: new Date(at.getTime() + 4 * 3600_000), stepUpAt: at } });
    writeFileSync(`${SP}/${who}.token`, token);
  };
  await sessionFor("ops", "usr_st_ops1");
  const apps = await db.drApplication.findMany({ where: { eventId: "ev_ca3" }, select: { id: true, contactEmail: true, record: true } });
  for (const [who, org] of [["sahel", "Sahel Water Ltd"], ["kilima", "Kilima Holdings"]]) {
    const app = apps.find((a) => (a.record as { org: { name: string } }).org.name === org)!;
    const existing = await db.user.findUnique({ where: { email: app.contactEmail! } });
    const u = existing ?? (await db.user.create({ data: { kind: "participant", email: app.contactEmail!, name: org } }));
    if (!existing) made.push(u.id);
    await sessionFor(who, u.id);
  }
  writeFileSync(`${SP}/made.users`, made.join("\n"));
  console.log("sessions made; new users:", made.length);
});
