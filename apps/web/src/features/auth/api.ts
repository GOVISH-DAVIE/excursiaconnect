/**
 * Sign-in's calls to the API (backend-plan.md, notes on M0.4). The session itself is a cookie the browser keeps;
 * nothing here ever sees it.
 */
import { RecoveryCodes, SessionView, SignInNext, TotpEnrolment } from "@excursia/contracts/auth";
import { ApiError, http } from "../http";

export const authApi = {
  /** Who is signed in, or null when nobody is. */
  session: async () => {
    try {
      return await http.get("/v1/session", { schema: SessionView });
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthenticated") return null;
      throw e;
    }
  },
  requestCode: (email: string) => http.post("/v1/auth/code", { body: { email } }),
  verifyCode: (input: { email: string; code: string }) => http.post("/v1/auth/code/verify", { body: input, schema: SignInNext }),
  staffSignIn: (input: { email: string; password: string }) => http.post("/v1/auth/staff/signin", { body: input, schema: SignInNext }),
  requestPasswordCode: (email: string) => http.post("/v1/auth/staff/password/code", { body: { email } }),
  setPassword: (input: { email: string; code: string; password: string }) => http.post("/v1/auth/staff/password", { body: input }),
  startTotp: () => http.post("/v1/auth/totp/setup", { schema: TotpEnrolment }),
  confirmTotp: (code: string) => http.post("/v1/auth/totp/confirm", { body: { code }, schema: RecoveryCodes }),
  skipTotp: () => http.post("/v1/auth/totp/skip", { schema: SignInNext }),
  verifyTotp: (proof: { code: string } | { recoveryCode: string }) => http.post("/v1/auth/totp/verify", { body: proof, schema: SignInNext }),
  signOut: () => http.post("/v1/auth/signout"),
};
