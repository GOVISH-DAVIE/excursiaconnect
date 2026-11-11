import { useQuery } from "@tanstack/react-query";
import { messagesQuery } from "../queries";

export const useMessages = (eventId: string) => useQuery(messagesQuery(eventId));
