/**
 * npm run db:seed:demo            load the prototype's seed (local and staging only), replacing any earlier copy
 * npm run db:seed:demo -- --remove  remove everything the demo seed made
 */
import { createSeedRepo } from "../modules/seed/seed.repo";
import { createSeedService } from "../modules/seed/seed.service";
import { runCommand } from "./run";

await runCommand("seed:demo", async ({ db, env, args }) => {
  const service = createSeedService(createSeedRepo(db));
  if (args.includes("--remove")) {
    await service.removeDemo({ appEnv: env.APP_ENV });
    console.log("Demo data removed.");
    return;
  }
  const t = Date.now();
  const n = await service.seedDemo({ appEnv: env.APP_ENV });
  console.log(
    `Demo seed loaded in ${Date.now() - t} ms (${env.APP_ENV}): ${n.organisers} organisers, ${n.events} events, ${n.delegates} delegates, ` +
      `${n.applications} Deal Room applications, ${n.meetings} meetings holding ${n.busySlots} slot rows, ${n.staff} staff accounts.`,
  );
});
