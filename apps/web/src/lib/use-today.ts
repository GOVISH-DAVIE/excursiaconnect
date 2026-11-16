"use client";

import { useSyncExternalStore } from "react";

const never = () => () => {};

/** Today's date as YYYY-MM-DD, known only in the browser: the prerendered shell gets "" and every
 *  date gate stays open until the first render on the client. Never call new Date() in render. */
export function useToday() {
  return useSyncExternalStore(
    never,
    () => new Date().toISOString().slice(0, 10),
    () => "",
  );
}
