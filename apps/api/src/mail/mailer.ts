/**
 * How email leaves. One-time codes go straight out this way: they must arrive in seconds and must never sit in
 * the outbox table, which keeps no message bodies. Everything else goes through the outbox and the worker (M1.4),
 * which sends with the same transport.
 *
 * The provider is Zoho, over SMTP (D7, decided 12 Nov 2026). "log" prints to the console for local work and
 * records for tests, and refuses in production rather than pretend to send.
 */
import nodemailer from "nodemailer";
export type Mail = { to: string; subject: string; text: string };
/** `available` is false where mail can't go out yet; callers check it before anything that would differ by account. */
/** `send` answers with the provider's message id when it has one, kept for delivery questions. */
export type Mailer = { available: boolean; send(mail: Mail): Promise<{ id?: string } | void> };

export class MailUnavailable extends Error {
  constructor() {
    super("Email is not set up on this server yet");
    this.name = "MailUnavailable";
  }
}

export function logMailer(opts: { production: boolean; write?: (line: string) => void }): Mailer {
  const write = opts.write ?? ((line) => console.log(line));
  return {
    available: !opts.production,
    async send(mail) {
      if (opts.production) throw new MailUnavailable();
      write(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    },
  };
}

/** For tests: keeps what was sent. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return { sent, available: true, send: async (mail) => void sent.push(mail) };
}

/** Whether this address may get real mail away from production: listed itself, or its @domain is. */
export function allowed(to: string, allow: string[]) {
  const address = to.trim().toLowerCase();
  return allow.some((a) => {
    const rule = a.trim().toLowerCase();
    return rule.startsWith("@") ? address.endsWith(rule) : address === rule;
  });
}

export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; password: string; from: string };

/**
 * Mail through SMTP. `allow` is null in production (everyone gets mail); elsewhere only the listed addresses do,
 * and the rest is printed as the log transport would, so test addresses never bounce off the real sender.
 */
export function smtpMailer(smtp: SmtpSettings, opts: { allow: string[] | null; write?: (line: string) => void }): Mailer & { verify(): Promise<void> } {
  const write = opts.write ?? ((line) => console.log(line));
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    // a slow provider must not hold a sign-in request open for long
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    available: true,
    async send(mail) {
      if (opts.allow && !allowed(mail.to, opts.allow)) {
        write(`[mail] to ${mail.to} (not in MAIL_ALLOW, so not sent): ${mail.subject}\n${mail.text}`);
        return;
      }
      const info = await transport.sendMail({ from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text });
      return { id: info.messageId };
    },
    /** Logs in to the server without sending anything. */
    async verify() {
      await transport.verify();
    },
  };
}

/** The mailer the settings ask for. Production sends to everyone; anywhere else only to MAIL_ALLOW. */
export function mailerFor(config: {
  NODE_ENV: string;
  APP_ENV?: string;
  MAIL_TRANSPORT: "log" | "smtp";
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  EMAIL_FROM?: string;
  MAIL_ALLOW: string[];
}) {
  const production = config.APP_ENV ? config.APP_ENV === "production" : config.NODE_ENV === "production";
  if (config.MAIL_TRANSPORT === "log") return logMailer({ production: config.NODE_ENV === "production" });
  return smtpMailer(
    { host: config.SMTP_HOST!, port: config.SMTP_PORT, secure: config.SMTP_SECURE, user: config.SMTP_USER!, password: config.SMTP_PASSWORD!, from: config.EMAIL_FROM! },
    { allow: production ? null : config.MAIL_ALLOW },
  );
}
