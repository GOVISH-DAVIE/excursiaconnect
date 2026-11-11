"use client";

import { Signed } from "../../bits";
import { EventScreen } from "./event";

export function EventGate({ id }: { id: string }) {
  return (
    <Signed>
      <EventScreen id={id} />
    </Signed>
  );
}
