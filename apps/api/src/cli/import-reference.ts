/**
 * npm run db:import -- <file.json>   import a real event's reference data (reference.schema.ts). Safe to run again.
 * The file is checked in full before anything is written; problems are listed by path, without the values.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { nairobiNow } from "@excursia/domain/ctx";
import { createReferenceRepo } from "../modules/reference/reference.repo";
import { ReferenceFile } from "../modules/reference/reference.schema";
import { createReferenceService } from "../modules/reference/reference.service";
import { runCommand } from "./run";

await runCommand("import", async ({ db, env, args }) => {
  const named = args.find((a) => !a.startsWith("-"));
  if (!named) {
    console.error("import: name the reference file, for example npm run db:import -- /etc/excursia/reference/connected-africa-3.json");
    return 2;
  }
  // npm runs the command inside apps/api; a relative path means relative to where it was typed
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), named);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    console.error(`import: ${path} could not be read as JSON (${(e as Error).message})`);
    return 2;
  }
  const parsed = ReferenceFile.safeParse(raw);
  if (!parsed.success) {
    console.error(`import: ${path} is not valid reference data:`);
    for (const i of parsed.error.issues) console.error(`  ${i.path.join(".") || "(file)"}: ${i.message}`);
    return 2;
  }
  const r = await createReferenceService(createReferenceRepo(db)).importFile(parsed.data, nairobiNow(new Date()));
  console.log(`Imported ${path} (${env.APP_ENV}).`);
  if (r.created.length) console.log(`  created: ${r.created.join(", ")}`);
  if (r.updated.length) console.log(`  updated: ${r.updated.join(", ")}`);
  if (r.staffNotInFile.length) console.log(`  still active but not in the file (revoke in the app if they should go): ${r.staffNotInFile.join(", ")}`);
});
