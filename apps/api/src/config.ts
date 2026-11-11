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
    /** How email leaves: "log" writes it to the console, for local work and tests only. */
    MAIL_TRANSPORT: z.enum(["log"]).default("log"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.WEB_ORIGINS.some((o) => !o.startsWith("https://")))
      ctx.addIssue({ code: "custom", path: ["WEB_ORIGINS"], message: "every web origin must be https in production" });
    if (!env.COOKIE_DOMAIN) ctx.addIssue({ code: "custom", path: ["COOKIE_DOMAIN"], message: "required in production" });
  });

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "environment"}: ${i.message}`);
  throw new Error(`The API's environment is not valid:\n  ${problems.join("\n  ")}`);
}
