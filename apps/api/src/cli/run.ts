/**
 * What every database command shares: its settings, checked like the API's, one database pool, a clean exit
 * code, and refusals printed as sentences rather than stack traces.
 */
import { createDb, type Db } from "@excursia/db";
import { z } from "zod";
import { loadLocalEnv } from "../env";

const Env = z.object({
  /** Which kind of environment this database belongs to. Never defaulted: the demo seed's guard depends on it. */
  APP_ENV: z.enum(["local", "staging", "production"], { error: "APP_ENV must be local, staging or production" }),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),
});
export type CliEnv = z.infer<typeof Env>;

export async function runCommand(name: string, body: (ctx: { db: Db; env: CliEnv; args: string[] }) => Promise<number | void>) {
  loadLocalEnv();
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error(`${name}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    process.exit(2);
  }
  const db = createDb(parsed.data.DATABASE_URL, 2);
  let code = 0;
  try {
    code = (await body({ db, env: parsed.data, args: process.argv.slice(2) })) ?? 0;
  } catch (e) {
    // a refusal is a sentence for the person running the command; anything else is a bug and keeps its stack
    const refusal = e instanceof Error && /Refused$/.test(e.name);
    console.error(`${name}: ${refusal ? (e as Error).message : ""}`);
    if (!refusal) console.error(e);
    code = 1;
  } finally {
    await db.$disconnect();
  }
  process.exit(code);
}
