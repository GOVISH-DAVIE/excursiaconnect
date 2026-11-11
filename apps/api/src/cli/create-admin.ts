/**
 * npm run db:admin -- --email person@algotech.example --name "Full Name"
 *
 * Makes an Algotech admin account, the one account no request can make (backend-plan.md, M2.3). It has no password:
 * the person sets one on the sign-in page (Staff → "Set or reset your password"), then adds their authenticator.
 * Safe to run again for the same person.
 */
import { Email } from "@excursia/contracts/auth";
import { createPlatformRepo } from "../modules/platform/platform.repo";
import { runCommand } from "./run";

class AdminRefused extends Error {
  name = "AdminRefused";
}

await runCommand("admin", async ({ db, env, args }) => {
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = Email.safeParse(value("--email") ?? "");
  const name = (value("--name") ?? "").trim();
  if (!email.success || name.length < 2) {
    console.error('admin: give an email and a name, for example npm run db:admin -- --email person@algotech.example --name "Full Name"');
    return 2;
  }
  const r = await createPlatformRepo(db).createAdmin(email.data, name);
  if ("refused" in r) throw new AdminRefused(`${email.data} already has a ${r.refused} account; an admin needs an email of its own.`);
  console.log(`${r.created ? "Made" : "Already there:"} Algotech admin ${email.data} (${env.APP_ENV}). They set a password on the sign-in page: Staff → "Set or reset your password".`);
});
