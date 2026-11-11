import { useSession } from "@/features/auth/hooks/use-session";

/** The event whose Deal Room the signed-in person works on: their Deal Room membership's event. */
export function useDealRoomEvent(): string | undefined {
  const { data } = useSession();
  return data?.memberships.find((m) => m.role.startsWith("dr_") && m.eventId)?.eventId ?? undefined;
}
