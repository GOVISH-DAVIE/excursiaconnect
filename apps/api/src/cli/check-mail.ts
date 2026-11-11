/**
 * npm run mail:check                     log in to the mail server with the settings, sending nothing
 * npm run mail:check -- --to you@x.y    and send one test email to that address
 *
 * Exits 1 if the login (or the test email) fails, with the server's reason; the password is never printed.
 */
import { loadConfig } from "../config";
import { loadLocalEnv } from "../env";
import { mailerFor } from "../mail/mailer";

loadLocalEnv();
const config = loadConfig();
if (config.MAIL_TRANSPORT !== "smtp") {
  console.error("mail:check: MAIL_TRANSPORT is not smtp; nothing to check.");
  process.exit(2);
}
const mailer = mailerFor(config) as ReturnType<typeof mailerFor> & { verify(): Promise<void> };
const to = process.argv.includes("--to") ? process.argv[process.argv.indexOf("--to") + 1] : undefined;
try {
  await mailer.verify();
  console.log(`Logged in to ${config.SMTP_HOST}:${config.SMTP_PORT} as ${config.SMTP_USER}.`);
  if (to) {
    await mailer.send({ to, subject: "ExcursiaConnect: test email", text: "This is a test from ExcursiaConnect's mail settings. Nothing to do." });
    console.log(`Test email handed to the server for ${to}${config.MAIL_ALLOW.length || config.APP_ENV === "production" ? "" : " (MAIL_ALLOW is empty, so it was printed, not sent)"}.`);
  }
} catch (e) {
  const err = e as { code?: string; responseCode?: number; response?: string; message: string };
  console.error(`mail:check: ${err.code ?? ""} ${err.responseCode ?? ""} ${err.response ?? err.message}`.trim());
  process.exit(1);
}
