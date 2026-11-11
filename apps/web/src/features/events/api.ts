/** Public event reads: the only file in the web app that knows these paths. */
import { PublicEvent } from "@excursia/contracts/public";
import { http } from "../http";

export const publicApi = {
  event: (slug: string) => http.get(`/v1/public/events/${slug}`, { schema: PublicEvent }),
};
