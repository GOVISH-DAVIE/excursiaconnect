/**
 * What anyone may read of an event, signed in or not: its public page and its Deal Room's public page. Only what
 * the organiser publishes and the Deal Room's own settings; never a person's details (a challenge's owner is the
 * institution, or "A corporate buyer").
 */
import { z } from "zod";

export const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60) });

const Links = z.object({ website: z.string(), linkedin: z.string(), x: z.string(), instagram: z.string(), facebook: z.string(), youtube: z.string() }).partial();

export const PublicDealRoom = z.object({
  /** taking applications today: the event is live, the Deal Room is set up, and today is in its window */
  open: z.boolean(),
  missions: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), description: z.string() })),
  tracks: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), missionId: z.string(), description: z.string() })),
  eligibility: z.array(z.object({ id: z.string(), text: z.string() })),
  seekerFee: z.object({ amount: z.number(), currency: z.enum(["USD", "KES"]) }),
  providerKinds: z.array(z.string()),
  sectors: z.array(z.string()),
  countries: z.array(z.string()),
  /** the dates and limits the page explains */
  rules: z.object({
    appOpen: z.string(),
    appClose: z.string(),
    meetingMin: z.number(),
    bufferMin: z.number(),
    seekerCap: z.number(),
    profileDays: z.number(),
    introDays: z.number(),
    conversionEnd: z.string(),
  }),
  /** published challenges: the problem, who brings it, how it would be bought */
  challenges: z.array(z.object({ id: z.string(), title: z.string(), owner: z.string(), route: z.string(), budget: z.string() })),
});
export type PublicDealRoom = z.infer<typeof PublicDealRoom>;

export const PublicEvent = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  venue: z.string(),
  city: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  /** Live, Suspended or Closed: an event is public only once published */
  state: z.enum(["Live", "Suspended", "Closed"]),
  brand: z.object({ primary: z.string(), logoText: z.string() }),
  links: Links,
  hashtag: z.string().nullable(),
  organiser: z.object({ name: z.string() }),
  /** the Deal Room, once its lead has set it up; null if the event has none or it isn't ready */
  dealRoom: PublicDealRoom.nullable(),
  /** the rules' date today, so "open" reads the same on the page as on the server */
  today: z.string(),
});
export type PublicEvent = z.infer<typeof PublicEvent>;
