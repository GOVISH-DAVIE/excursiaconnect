/**
 * The API's settings, read once from the environment at startup and checked. A bad or missing value stops the
 * process with the variable's name (never its value, which may be a password).
 *
 * Locally they come from the repository's .env.local (scripts/db/setup-local.sh writes the database URLs); on a
 * server, from the systemd unit's EnvironmentFile (deploy.md).
 */
import { z } from "zod";

const list = z
  .string()
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean));

const Env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Which kind of environment this is; staging runs production builds, so NODE_ENV can't tell them apart. */
    APP_ENV: z.enum(["local", "staging", "production"]).optional(),
    /** Loopback only: nginx is the one way in (deploy.md). */
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    /** The web app's origins, comma separated: the only sites whose pages may call the API with cookies. */
    WEB_ORIGINS: list.default(["http://localhost:3010"]),
    /** The parent domain the session cookie is scoped to (".example.co.ke"), so web and api share it. */
    COOKIE_DOMAIN: z.string().optional(),
    /**
     * The API's own secret, 32 bytes or more, base64: one-time codes are hashed with a key derived from it and
     * TOTP secrets encrypted with another, so a copy of the database alone reveals neither.
     */
    AUTH_SECRET: z
      .string()
      .refine((s) => Buffer.from(s, "base64").length >= 32, "must be at least 32 random bytes, base64 (openssl rand -base64 32)"),
    /** How email leaves: "smtp" through the mail provider (D7: Zoho), or "log" to the console, for local work and tests. */
    MAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    /** TLS from the first byte (port 465); false means STARTTLS on 587, which nodemailer then requires */
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    /** The sender, as "Name <address>"; the address must be the SMTP account's own, or one it may send as */
    EMAIL_FROM: z.string().optional(),
    /**
     * Away from production: the only recipients that get real mail, as addresses or @domains, comma separated.
     * Everyone else's mail is printed to the console, so test addresses never bounce off the real sender.
     */
    MAIL_ALLOW: list.default([]),
    /**
     * Local and staging only: the time the rules take as now, "YYYY-MM-DD HH:MM" in Nairobi, running on from there
     * (so a demo can apply before applications open). Sessions and codes keep the real clock. Refused in production.
     */
    RULES_CLOCK: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "must be YYYY-MM-DD HH:MM")
      .optional(),
    /** Where uploaded files are kept, until an object store is chosen (D6). Backed up with the database. */
    STORAGE_DIR: z.string().optional(),
    /** The largest upload accepted, in megabytes. */
    UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(50).default(15),
    /**
     * ClamAV's daemon, for the worker's virus scan: "127.0.0.1:3310" or its socket's path. Required in production.
     * Unset elsewhere, the worker uses a test scanner that catches only the EICAR test file.
     */
    CLAMD_ADDRESS: z
      .string()
      .regex(/^(\/\S+|[\w.-]+:\d{1,5})$/, "must be host:port or a socket path")
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.RULES_CLOCK && (env.APP_ENV === "production" || (env.NODE_ENV === "production" && env.APP_ENV !== "staging")))
      ctx.addIssue({ code: "custom", path: ["RULES_CLOCK"], message: "is for local and staging only" });
    if (env.MAIL_TRANSPORT === "smtp")
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const)
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "is required when MAIL_TRANSPORT is smtp" });
    if (env.APP_ENV === "production" && !env.CLAMD_ADDRESS) ctx.addIssue({ code: "custom", path: ["CLAMD_ADDRESS"], message: "required in production: uploads are scanned before anyone can open them" });
    if (env.NODE_ENV !== "production") return;
    if (env.WEB_ORIGINS.some((o) => !o.startsWith("https://")))
      ctx.addIssue({ code: "custom", path: ["WEB_ORIGINS"], message: "every web origin must be https in production" });
    if (!env.COOKIE_DOMAIN) ctx.addIssue({ code: "custom", path: ["COOKIE_DOMAIN"], message: "required in production" });
    if (!env.APP_ENV) ctx.addIssue({ code: "custom", path: ["APP_ENV"], message: "required in production (staging or production)" });
  });

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "environment"}: ${i.message}`);
  throw new Error(`The API's environment is not valid:\n  ${problems.join("\n  ")}`);
}
