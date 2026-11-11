"use client";

import { useEffect, useState } from "react";

/** Today's date as YYYY-MM-DD, known only in the browser: the prerendered shell gets "" and every
 *  date gate stays open until the first render on the client. Never call new Date() in render. */
export function useToday() {
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);
  return today;
}
