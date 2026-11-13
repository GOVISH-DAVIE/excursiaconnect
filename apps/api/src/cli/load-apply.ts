/**
 * The load test of applying and uploading (backend-plan.md, M1.5): many applicants at once, each doing what a real
 * one does: load the form, start an application, autosave as they type, upload the seeker's documents, submit.
 * It reports how long each step takes (median, 95th and 99th percentile, slowest), every error, and whether the
 * references came out distinct and gap-free, then removes what it made.
 *
 *   LOCAL_DATABASE=excursia_fresh npm run load:apply -w @excursia/api -- --slug east-africa-growth-capital-summit-2027 \
 *     --users 200 --concurrency 50 [--pathways seeker,capital,partner,challenge] [--doc-kb 900] [--think 0]
 *     [--base http://127.0.0.1:4000] [--keep]
 *
 * --pathways: the registration pathways to rotate through (seeker and capital by default)
 * --doc-kb:   the pitch deck's size in KB (the financial statements are a third of it, the certificate a sixth)
 * --think:    milliseconds between an applicant's autosaves, as someone typing pauses (0: as fast as possible)
 *
 * It signs its applicants in by writing their sessions straight into the database (so it needs DATABASE_URL), and
 * gives each its own address in X-Forwarded-For, which the API trusts from loopback only: run it on the API's own
 * machine. It uses up the event's reference numbers and leaves audit entries (the app role can't delete them):
 * run it against staging or a copy, never a real event in production. It refuses APP_ENV=production.
 */
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createDb } from "@excursia/db";
import { loadConfig } from "../config";
import { loadLocalEnv } from "../env";
import { cookieName } from "../http/session";
import { hashToken, newToken } from "../security/secrets";
import { createLocalStorage, uploadsDir } from "../storage/local";
import { deriveKeys } from "../security/secrets";

loadLocalEnv();
const config = loadConfig();
const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const SLUG = arg("slug");
const USERS = Number(arg("users", "100"));
const CONCURRENCY = Number(arg("concurrency", "25"));
const BASE = arg("base", `http://127.0.0.1:${config.API_PORT}`)!;
const KEEP = process.argv.includes("--keep");
const PATHWAYS = (arg("pathways", "seeker,capital") ?? "")
  .split(",")
  .map((p) => p.trim()) as ("seeker" | "capital" | "partner" | "challenge")[];
const DOC_KB = Number(arg("doc-kb", "900"));
const THINK_MS = Number(arg("think", "0"));
if (
  PATHWAYS.some(
    (p) => !["seeker", "capital", "partner", "challenge"].includes(p),
  )
) {
  console.error(
    "load:apply: --pathways takes seeker, capital, partner and challenge",
  );
  process.exit(2);
}
const ORIGIN = config.WEB_ORIGINS[0];
if (!SLUG) {
  console.error("load:apply: name the event with --slug");
  process.exit(2);
}
if (config.APP_ENV === "production") {
  console.error(
    "load:apply: refused in production: it uses up a real event's reference numbers",
  );
  process.exit(2);
}

const db = createDb(config.DATABASE_URL, Math.min(10, CONCURRENCY));
const run = randomBytes(3).toString("hex");
const DOMAIN = `load-${run}.example`;
const cookie = cookieName(config);

/** A PDF-shaped body of about this size: the API checks the first bytes match the type. */
const pdf = (kb: number) =>
  Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(kb * 1024)]);
const DOCS = [
  { kind: "Pitch deck", body: pdf(DOC_KB) },
  {
    kind: "Financial statements",
    body: pdf(Math.max(1, Math.round(DOC_KB / 3))),
  },
  {
    kind: "Registration certificate",
    body: pdf(Math.max(1, Math.round(DOC_KB / 6))),
  },
];
const pause = () =>
  THINK_MS
    ? new Promise((r) => setTimeout(r, THINK_MS * (0.5 + Math.random())))
    : Promise.resolve();

type Timing = {
  step: string;
  ms: number;
  status: number;
  ok: boolean;
  why?: string;
};
const timings: Timing[] = [];

async function call(
  step: string,
  who: { sid: string; ip: string } | null,
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...extra };
  if (who) {
    headers.Cookie = `${cookie}=${who.sid}`;
    headers["X-Forwarded-For"] = who.ip;
  }
  // a browser sends its origin with every write, the upload's PUT included
  if (method !== "GET") headers.Origin = ORIGIN;
  if (body !== undefined && !Buffer.isBuffer(body))
    headers["Content-Type"] = "application/json";
  const t = performance.now();
  let status = 0;
  let text = "";
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? new Uint8Array(body)
            : JSON.stringify(body),
    });
    status = res.status;
    text = await res.text();
  } catch (e) {
    text = (e as Error).message;
  }
  const ok = status >= 200 && status < 300;
  timings.push({
    step,
    ms: performance.now() - t,
    status,
    ok,
    why: ok ? undefined : text.slice(0, 160),
  });
  if (!ok) throw new Error(`${step}: ${status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : undefined;
}

type Form = {
  missions: { id: string }[];
  sources: string[];
  sectors: string[];
  countries: string[];
};

/** One applicant, start to finish, on the pathways named in turn. */
async function applicant(i: number, form: Form) {
  const email = `applicant${i}@${DOMAIN}`;
  const user = await db.user.create({
    data: { kind: "participant", email, name: `Load ${i}` },
  });
  const sid = newToken();
  const now = new Date();
  await db.session.create({
    data: {
      tokenHash: hashToken(sid),
      userId: user.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
      stepUpAt: now,
    },
  });
  const who = { sid, ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` };
  const mine = `/v1/apply/${SLUG}/mine`;
  const pathway = PATHWAYS[i % PATHWAYS.length];
  const seeker = pathway === "seeker";

  await call("form", who, "GET", `/v1/apply/${SLUG}/form`);
  const app = await call("start", who, "POST", mine, { mode: pathway });
  const id = app.id as string;
  const common = {
    mission: form.missions[0].id,
    source: form.sources[0] ?? "Other",
    "contact.name": `Load ${i}`,
    "contact.phone": "+254700000000",
  };
  const decider = {
    "decisionMaker.name": `Decider ${i}`,
    "decisionMaker.title": "CEO",
    "decisionMaker.email": `decider${i}@${DOMAIN}`,
    "decisionMaker.phone": "+254711000000",
  };
  // autosaves as someone types: a few fields at a time
  const mandate = (kind: string, extra: Record<string, unknown>[] = []) => [
    { "org.name": `Load ${pathway} ${i}`, providerKind: kind },
    {
      "org.country": form.countries[0],
      "mandate.sectors": form.sectors.slice(0, 3),
      "mandate.countries": form.countries.slice(0, 2),
    },
    ...extra,
    {
      "mandate.stages": ["Growth"],
      "mandate.instruments":
        pathway === "challenge" ? ["Procurement and contracts"] : ["Equity"],
    },
    { "mandate.ticketMin": 250_000, "mandate.ticketMax": 2_000_000 },
    decider,
    common,
  ];
  const saves: Record<string, unknown>[] =
    pathway === "partner"
      ? mandate("Distributor or channel partner")
      : pathway === "challenge"
        ? mandate("Public institution", [
            {
              "challenge.title": `Faster permits at county offices (${i})`,
              "challenge.problem":
                "Permits take six weeks and three visits; most of the delay is paper moving between desks.",
            },
            {
              "challenge.users": "Small traders, about 12,000 a year",
              "challenge.outcome": "Permits in five working days",
              "challenge.route": "Pilot",
              "challenge.decisionProcess":
                "The county executive signs off after a three-month pilot",
            },
          ])
        : seeker
          ? [
              { "org.name": `Load Test Co ${i}` },
              {
                "org.regNo": `PVT-${i}`,
                "org.country": form.countries[0],
                "org.sector": form.sectors[0],
                ownerKind: "Private company",
              },
              {
                "ask.amount": 500_000 + i,
                "ask.instrument": "Equity",
                "ask.stage": "Growth",
              },
              {
                "ask.useOfFunds":
                  "Expansion into two new markets and working capital for the first year.",
                "traction.revenueBand": "USD 250k to 1m",
              },
              decider,
              common,
            ]
          : [
              {
                "org.name": `Load Capital ${i}`,
                providerKind: "Venture capital",
              },
              {
                "org.country": form.countries[0],
                "mandate.sectors": form.sectors.slice(0, 3),
                "mandate.countries": form.countries.slice(0, 2),
              },
              {
                "mandate.stages": ["Growth"],
                "mandate.instruments": ["Equity"],
              },
              { "mandate.ticketMin": 250_000, "mandate.ticketMax": 2_000_000 },
              decider,
              common,
            ];
  for (const changes of saves) {
    await pause();
    await call("autosave", who, "PATCH", `${mine}/${id}`, { changes });
  }

  if (seeker)
    for (const d of DOCS) {
      const t = await call(
        "upload: ask",
        who,
        "POST",
        `${mine}/${id}/documents`,
        {
          kind: d.kind,
          name: `${d.kind}.pdf`,
          contentType: "application/pdf",
          size: d.body.length,
        },
      );
      await call("upload: bytes", who, "PUT", t.url, d.body, t.headers);
      await call(
        "upload: attach",
        who,
        "POST",
        `${mine}/${id}/documents/${t.fileId}/complete`,
      );
    }

  const done = await call("submit", who, "POST", `${mine}/${id}/submit`, {});
  return done.ref as string;
}

const pct = (sorted: number[], p: number) =>
  sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ] ?? 0;
const ms = (n: number) => `${Math.round(n)}`;

async function main() {
  const form = (await call(
    "form",
    null,
    "GET",
    `/v1/apply/${SLUG}/form`,
  )) as Form;
  timings.length = 0;
  console.log(
    `load:apply: ${USERS} applicants, ${CONCURRENCY} at a time, against ${BASE} (${SLUG}); run ${run}`,
  );
  const refs: string[] = [];
  const failures: string[] = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, USERS) }, async () => {
      while (next < USERS) {
        const i = next++;
        try {
          refs.push(await applicant(i, form));
        } catch (e) {
          failures.push(`applicant ${i}: ${(e as Error).message}`);
        }
      }
    }),
  );
  const seconds = (performance.now() - t0) / 1000;

  console.log(
    `\n${refs.length} of ${USERS} submitted in ${seconds.toFixed(1)} s (${(timings.length / seconds).toFixed(0)} requests a second)\n`,
  );
  console.log(
    "| Step | Requests | Errors | Median ms | p95 ms | p99 ms | Slowest ms |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const step of [...new Set(timings.map((t) => t.step))]) {
    const of = timings.filter((t) => t.step === step);
    const sorted = of.map((t) => t.ms).sort((a, b) => a - b);
    console.log(
      `| ${step} | ${of.length} | ${of.filter((t) => !t.ok).length} | ${ms(pct(sorted, 50))} | ${ms(pct(sorted, 95))} | ${ms(pct(sorted, 99))} | ${ms(sorted.at(-1) ?? 0)} |`,
    );
  }

  // references: one per submission, none twice, and each series without gaps
  const distinct = new Set(refs).size === refs.length;
  const series = new Map<string, number[]>();
  for (const r of refs) {
    const m = /^(.*-)(\d+)$/.exec(r);
    if (m) series.set(m[1], [...(series.get(m[1]) ?? []), Number(m[2])]);
  }
  const gaps = [...series].filter(([, ns]) => {
    const s = [...ns].sort((a, b) => a - b);
    return s.at(-1)! - s[0] + 1 !== s.length;
  });
  console.log(
    `\nReferences: ${distinct ? "all distinct" : "DUPLICATES"}; ${gaps.length ? `gaps in ${gaps.map(([p]) => p).join(", ")}` : "no gaps"} (${[...series].map(([p, ns]) => `${p}${Math.min(...ns)} to ${Math.max(...ns)}`).join(", ")})`,
  );
  if (failures.length) {
    console.log(`\n${failures.length} applicant(s) failed:`);
    for (const f of failures.slice(0, 15)) console.log(`  ${f}`);
  }

  if (!KEEP) await cleanUp();
  await db.$disconnect();
  process.exit(failures.length || !distinct || gaps.length ? 1 : 0);
}

/** Removes what the run made: its applications, their files and emails, its users and sessions. */
async function cleanUp() {
  const apps = await db.drApplication.findMany({
    where: { contactEmail: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = apps.map((a) => a.id);
  const files = await db.file.findMany({
    where: { ownerKind: "dr_application", ownerId: { in: ids } },
    select: { id: true, storageKey: true },
  });
  const storage = createLocalStorage({
    dir: uploadsDir(config),
    key: deriveKeys(config.AUTH_SECRET).upload,
  });
  for (const f of files) await storage.remove(f.storageKey);
  await db.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  await db.outboxMessage.deleteMany({ where: { recipient: { in: ids } } });
  await db.drApplication.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  console.log(
    `\nCleaned up: ${ids.length} applications, ${files.length} files, their emails, users and sessions. Audit entries stay (append-only).`,
  );
}

main().catch(async (e) => {
  console.error(e);
  if (!KEEP) await cleanUp().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
