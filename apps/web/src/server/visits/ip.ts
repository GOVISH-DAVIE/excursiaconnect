import "server-only";

/**
 * The visitor's IP, as nginx passes it on. Trustworthy only because the app listens on 127.0.0.1, so every
 * request comes through nginx, which sets X-Real-IP to the address it saw (see README, Deployment).
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  return "unknown";
}

/** Whether the request reached nginx over HTTPS, so cookies can be marked Secure. */
export const viaHttps = (headers: Headers) => headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
