/**
 * npm run db:check-demo   exits 1 if the database holds anything the demo seed made. The production deploy runs it
 * after migrating (deploy.md), so production provably holds no demo record.
 */
import { createSeedRepo } from "../modules/seed/seed.repo";
import { createSeedService } from "../modules/seed/seed.service";
import { runCommand } from "./run";

await runCommand("check-demo", async ({ db, env }) => {
  const n = await createSeedService(createSeedRepo(db)).demoCounts();
  const total = n.organisers + n.events + n.users;
  if (total === 0) {
    console.log(`No demo data (${env.APP_ENV}).`);
    return 0;
  }
  console.error(`Demo data present (${env.APP_ENV}): ${n.organisers} organisers, ${n.events} events, ${n.users} users.`);
  return 1;
});
