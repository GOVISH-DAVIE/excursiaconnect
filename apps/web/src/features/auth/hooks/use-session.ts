import { useQuery } from "@tanstack/react-query";
import { sessionQuery } from "../queries";

/** Who is signed in: null when nobody is, undefined while it is still being asked. */
export const useSession = () => useQuery(sessionQuery.options());
