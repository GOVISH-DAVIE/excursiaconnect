/**
 * The demo seed, kept apart from real data (backend-plan.md, M0.3). It loads the prototype's seed into the
 * database for local work and staging, and never anywhere else:
 * - it refuses when APP_ENV is production;
 * - it refuses when the database holds any event it did not make, so a misconfigured environment can't mix demo
 *   records into real ones;
 * - everything it writes carries the `demo` flag, so `checkNoDemo` can prove production holds none.
 */
import { seed } from "@excursia/domain/seed";
import type { AppState } from "@excursia/domain/types";
import { dealRoomToRows, staffAccounts } from "../dealroom/dealroom.mapper";
import { coreToRows } from "../events/events.mapper";
import type { DemoCounts, SeedRepo, SeedRows } from "./seed.repo";

export type AppEnv = "local" | "staging" | "production";

export class SeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefused";
  }
}

/** The demo user behind a staff member. Fixed, so a reload gives everyone the same ids. */
export const demoUserId = (staffId: string) => `usr_${staffId}`;

/** The prototype's seed as rows, every Deal Room on its own demo clock. */
export function demoRows(state: AppState = seed): SeedRows {
  const dealRooms = Object.keys(state.dealRoom.configs).map((eventId) => {
    const rows = dealRoomToRows(state.dealRoom, eventId, state.dealRoom.clock);
    return { ...rows, staff: rows.staff.map((s) => ({ ...s, userId: demoUserId(s.id) })) };
  });
  const accounts = staffAccounts(state.dealRoom.staff, { demo: true, userIdOf: (s) => demoUserId(s.id) });
  return {
    core: coreToRows({ organisers: state.organisers, events: state.events, tiers: state.tiers, delegates: state.delegates }, { demo: true }),
    dealRooms,
    ...accounts,
  };
}

export function createSeedService(repo: SeedRepo) {
  return {
    async seedDemo(opts: { appEnv: AppEnv }) {
      if (opts.appEnv === "production") throw new SeedRefused("The demo seed never runs in production (APP_ENV=production).");
      const real = await repo.realEvents();
      if (real.length)
        throw new SeedRefused(
          `This database holds ${real.length} event(s) the demo seed did not make (${real.map((e) => e.id).join(", ")}). ` +
            "The demo seed loads only into a database with no real events.",
        );
      const rows = demoRows();
      await repo.replaceDemo(rows);
      return {
        organisers: rows.core.organisers.length,
        events: rows.core.events.length,
        delegates: rows.core.delegates.length,
        applications: rows.dealRooms.reduce((n, d) => n + d.apps.length, 0),
        meetings: rows.dealRooms.reduce((n, d) => n + d.meetings.length, 0),
        busySlots: rows.dealRooms.reduce((n, d) => n + d.busy.length, 0),
        staff: rows.users.length,
      };
    },

    async removeDemo(opts: { appEnv: AppEnv }) {
      if (opts.appEnv === "production") throw new SeedRefused("Production holds no demo data to remove; nothing was done.");
      await repo.removeDemo();
    },

    /** What demo data the database holds; production must answer all zeros. */
    demoCounts: (): Promise<DemoCounts> => repo.demoCounts(),
  };
}
export type SeedService = ReturnType<typeof createSeedService>;
