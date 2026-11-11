/**
 * The sign-in steps that change the session. Each is a mutation that asks for the session again when it succeeds,
 * so every screen reading useSession sees the change.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api";
import { sessionQuery } from "../queries";
import { useSessionMutation } from "./use-session-mutation";

/** An applicant: the emailed code. */
export const useVerifyCode = () => useSessionMutation(authApi.verifyCode);

/** Staff: the password; the session stays pending until the authenticator code. */
export const useStaffSignIn = () => useSessionMutation(authApi.staffSignIn);

/** Staff: the first code from a new authenticator; returns the recovery codes. */
export const useConfirmTotp = () => useSessionMutation(authApi.confirmTotp);

/** Staff: an authenticator code, or one recovery code, finishes the sign-in. */
export const useVerifyTotp = () => useSessionMutation(authApi.verifyTotp);

/** Staff: "set up later", within the 7 days after the first sign-in (D14). */
export const useSkipTotp = () => useSessionMutation(authApi.skipTotp);

/** Staff: a new password with the emailed code; every earlier session ends. */
export const useSetPassword = () => useSessionMutation(authApi.setPassword);

/** Ends this session; nobody is signed in afterwards, so the answer is known without asking. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: authApi.signOut, onSuccess: () => queryClient.setQueryData(sessionQuery.key, null) });
}
