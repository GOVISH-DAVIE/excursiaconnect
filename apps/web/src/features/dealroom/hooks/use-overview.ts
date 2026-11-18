import { useQuery } from "@tanstack/react-query";
import { overviewQuery } from "../queries";

export const useOverview = (eventId: string) => useQuery(overviewQuery(eventId));
