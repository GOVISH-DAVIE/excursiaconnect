import { useQuery } from "@tanstack/react-query";
import { teamQuery } from "../queries";

/** The Deal Room team, the signed-in person on it, and whether they may assign. */
export const useTeam = (eventId: string) => useQuery({ ...teamQuery(eventId), enabled: !!eventId });
