/**
 * Sending what is in the outbox (M1.4). A message holds only the action and its date, never private data (PRD
 * Notifications); the email around it is written here: a greeting, the message, and a link to where it is acted
 * on, on this site. Links are written for who gets them: an applicant's go to their application on the event's
 * apply page, staff's to the workspace, an organiser's or Algotech's to the page the message names.
 *
 * Retries: 1, 5, 15, 60 and 240 minutes after a failure, then "failed", visible on the messages screen.
 */
import type { Mailer } from "../../mail/mailer";
import type { Claimed, OutboxRepo, Recipient } from "./outbox.repo";

const BACKOFF_MIN = [1, 5, 15, 60, 240];

/** Where the link in the email points, on the web app. */
export function linkFor(web: string, r: Recipient, link: string): string {
  if (r.kind === "applicant") {
    const apply = r.slug ? `/e/${r.slug}/deal-room/apply` : "/signin";
    return `${web}${apply}${link.includes("invite=") && r.invite ? `?invite=${encodeURIComponent(r.invite)}` : ""}`;
  }
  if (r.kind === "staff") {
    const app = /\/dealroom\/applications\/(dr_[a-z0-9_]+)/.exec(link)?.[1];
    return `${web}${app ? `/team/applications/${app}` : "/team"}`;
  }
  return `${web}${link.startsWith("/") ? link : "/team"}`;
}

/** The email for one message. */
export function render(web: string, r: Recipient, m: Pick<Claimed, "subject" | "link">) {
  const first = r.name.trim().split(/\s+/)[0];
  const from = r.eventName ? (r.kind === "user" ? r.eventName : `${r.eventName} Deal Room`) : "ExcursiaConnect";
  const why =
    r.kind === "applicant"
      ? "You get this because you applied to this Deal Room."
      : r.kind === "staff"
        ? "You get this because you are on this Deal Room's team."
        : "You get this because of your account on ExcursiaConnect.";
  const subject = r.eventName && r.kind !== "user" ? `${m.subject} · ${r.eventName}` : m.subject;
  const text = [
    first ? `Hello ${first},` : "Hello,",
    "",
    `${m.subject.replace(/[.:]$/, "")}.`,
    "",
    `Open it here: ${linkFor(web, r, m.link)}`,
    "",
    "The details are on the page, not in this email.",
    "",
    `${from}, on ExcursiaConnect`,
    why,
  ].join("\n");
  return { subject, text };
}

export function createOutboxService({ repo, mailer, web, log = console.log }: { repo: OutboxRepo; mailer: Mailer; web: string; log?: (line: string) => void }) {
  return {
    /** Sends one batch; answers how many went, how many will be retried, and how many failed for good. */
    async drain(batch = 20) {
      await repo.requeueStuck();
      const claimed = await repo.claim(batch);
      const tally = { sent: 0, retrying: 0, failed: 0 };
      for (const m of claimed) {
        const r = await repo.recipient(m.recipient, m.eventId);
        if (!r) {
          // nobody to send to (an old demo id, a revoked staff member): retrying won't change that
          await repo.failed(m.id);
          tally.failed++;
          log(`[outbox] ${m.id}: no address for ${m.recipient}; marked failed`);
          continue;
        }
        try {
          const out = await mailer.send({ to: r.email, ...render(web, r, m) });
          await repo.sent(m.id, (out && out.id) || null);
          tally.sent++;
        } catch (e) {
          const wait = BACKOFF_MIN[m.attempts - 1];
          if (wait === undefined) {
            await repo.failed(m.id);
            tally.failed++;
          } else {
            await repo.retryAt(m.id, new Date(Date.now() + wait * 60_000));
            tally.retrying++;
          }
          log(`[outbox] ${m.id}: attempt ${m.attempts} failed (${(e as Error).message})${wait === undefined ? "; gave up" : `; again in ${wait} min`}`);
        }
      }
      return { ...tally, claimed: claimed.length };
    },
  };
}
export type OutboxService = ReturnType<typeof createOutboxService>;
