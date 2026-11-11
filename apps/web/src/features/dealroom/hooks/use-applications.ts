import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { QueueFilter } from "../api";
import { applicationsQuery } from "../queries";

/** The review queue; the previous list stays on screen while a new filter loads. */
export const useApplications = (eventId: string, filter: QueueFilter) => useQuery({ ...applicationsQuery(eventId, filter), placeholderData: keepPreviousData });
