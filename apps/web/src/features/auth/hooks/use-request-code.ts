import { useMutation } from "@tanstack/react-query";
import { authApi } from "../api";

/** Emails a sign-in code. The answer is the same whether or not the address has an account. */
export const useRequestCode = () => useMutation({ mutationFn: authApi.requestCode });
