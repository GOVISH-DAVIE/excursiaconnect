/**
 * How the API sends an email. Only one-time codes go this way: they must arrive in seconds and must never sit in
 * the outbox table, which keeps no message bodies. Everything else goes through the outbox and the worker (M1.4).
 *
 * The provider is decision D7 (SES or Resend); until then the only transport is "log", which prints to the
 * console for local work and records for tests, and refuses in production rather than pretend to send.
 */
export type Mail = { to: string; subject: string; text: string };
export type Mailer = { send(mail: Mail): Promise<void> };

export class MailUnavailable extends Error {
  constructor() {
    super("Email is not set up on this server yet");
    this.name = "MailUnavailable";
  }
}

export function logMailer(opts: { production: boolean; write?: (line: string) => void }): Mailer {
  const write = opts.write ?? ((line) => console.log(line));
  return {
    async send(mail) {
      if (opts.production) throw new MailUnavailable();
      write(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    },
  };
}

/** For tests: keeps what was sent. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return { sent, send: async (mail) => void sent.push(mail) };
}
