"use client";

import { Signed } from "../bits";
import { Organisation } from "./organisation";

export default function OrganisationPage() {
  return (
    <Signed>
      <Organisation />
    </Signed>
  );
}
