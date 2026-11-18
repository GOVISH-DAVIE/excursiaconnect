import { useMutation } from "@tanstack/react-query";
import { authApi } from "../api";

/** A new authenticator secret, shown once. */
export const useStartTotp = () => useMutation({ mutationFn: authApi.startTotp });
