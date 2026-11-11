/**
 * Reading one event's Deal Room back from PostgreSQL. Rows come back by id; dealroom.mapper.ts turns them into the
 * rules' state. Saving changed records under the event lock is runCommand's (M0.5).
 */
import type { Db } from "@excursia/db";
import type { DealRoomStored } from "./dealroom.mapper";

export type DealRoomRepo = { load(eventId: string): Promise<DealRoomStored | null> };

export function createDealRoomRepo(db: Db): DealRoomRepo {
  return {
    async load(eventId) {
      const where = { eventId };
      const byId = { orderBy: { id: "asc" as const } };
      const config = await db.drConfig.findUnique({ where: { eventId } });
      if (!config) return null;
      const [staff, apps, matches, meetings, sessions, opportunities, exceptions, incidents, consents, access, outbox, counters] = await Promise.all([
        db.drStaff.findMany({ where, ...byId }),
        db.drApplication.findMany({ where, ...byId }),
        db.drMatch.findMany({ where, ...byId }),
        db.drMeeting.findMany({ where, ...byId }),
        db.drSession.findMany({ where, ...byId }),
        db.drOpportunity.findMany({ where, ...byId }),
        db.drException.findMany({ where, ...byId }),
        db.drIncident.findMany({ where, ...byId }),
        db.drConsent.findMany({ where, ...byId }),
        db.drAccess.findMany({ where, ...byId }),
        db.outboxMessage.findMany({ where, ...byId }),
        db.drCounter.findMany({ where }),
      ]);
      return { config, staff, apps, matches, meetings, sessions, opportunities, exceptions, incidents, consents, access, outbox, counters };
    },
  };
}
