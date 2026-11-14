// prints the current authenticator code for a walk-through staff email (excursia_fresh), and nothing else secret
import { createDb } from "@excursia/db";
import { decrypt, deriveKeys } from "/Users/mac/Documents/code/next/excursiaconnect/apps/api/src/security/secrets.ts";
import { stepAt, totpCode } from "/Users/mac/Documents/code/next/excursiaconnect/apps/api/src/security/totp.ts";
process.loadEnvFile("/Users/mac/Documents/code/next/excursiaconnect/.env.local");
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/excursia_fresh";
const db = createDb(url.toString(), 1);
const row = await db.totpSecret.findFirst({ where: { user: { email: process.argv[2] } } });
if (!row) console.log("no authenticator for", process.argv[2]);
else console.log(totpCode(decrypt(deriveKeys(process.env.AUTH_SECRET!).totp, row.secretEncrypted), stepAt(new Date())), "| seconds left:", 30 - Math.floor((Date.now() / 1000) % 30));
await db.$disconnect();
