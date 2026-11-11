import { useMutation } from "@tanstack/react-query";
import { authApi } from "../api";

/** Emails a code for setting or resetting a staff password; the same answer for any address. */
export const useRequestPasswordCode = () => useMutation({ mutationFn: authApi.requestPasswordCode });
