/**
 * A published event, read on the web server for its public pages, so search engines and link previews see the
 * real page. Kept a few minutes. Null when the API has no such published event (a demo, a draft, a typo); an API
 * that can't be reached throws, is not kept, and the page falls back to the prototype's.
 */
import { cacheLife } from "next/cache";
import type { PublicEvent } from "@excursia/contracts/public";
import { ApiError } from "../http";
import { publicApi } from "./api";

export async function publishedEvent(slug: string): Promise<PublicEvent | null> {
  "use cache";
  cacheLife("minutes");
  try {
    return await publicApi.event(slug);
  } catch (e) {
    if (e instanceof ApiError && e.code === "not_found") return null;
    throw e;
  }
}

/** The event, or null for anything the prototype's page should answer instead (not published, or no API here). */
export const publishedOrNull = (slug: string) => publishedEvent(slug).catch(() => null);
