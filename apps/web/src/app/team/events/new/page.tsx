"use client";

import { useRouter } from "next/navigation";
import type { EventInput } from "@excursia/contracts/onboarding";
import { PageHeader, Section } from "@/components/ui";
import { onboardingApi } from "@/features/onboarding/api";
import { useEventChange, useMyOrganisers } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, Loading, Signed } from "../../bits";
import { EventForm } from "../event-form";

function NewEvent() {
  const router = useRouter();
  const mine = useMyOrganisers();
  const o = mine.data?.[0];
  const create = useEventChange((input: EventInput) => onboardingApi.createEvent(o!.id, input));
  if (mine.isPending) return <Loading />;
  if (!o) return <PageHeader title="New event" kicker="Only an organiser's owner can create events." />;
  return (
    <>
      <PageHeader title="New event" crumbs={[{ href: "/team/events", label: "Events" }, { label: "New" }]} kicker="A draft only you can see. Send it to Algotech once your KYC is verified." />
      <Section title="Details">
        <EventForm submitLabel="Create the draft" busy={create.isPending} onSave={(input) => create.mutate(input, { onSuccess: (e) => router.replace(`/team/events/${e.id}`) })} />
        <div className="mt-3">
          <Failed error={create.error} />
        </div>
      </Section>
    </>
  );
}

export default function NewEventPage() {
  return (
    <Signed>
      <NewEvent />
    </Signed>
  );
}
