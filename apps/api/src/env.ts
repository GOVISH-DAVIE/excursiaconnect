/**
 * Locally, the API and its commands read the repository's .env.local (scripts/db/setup-local.sh writes it). A
 * server never has that file: its systemd unit's EnvironmentFile sets the variables (deploy.md).
 */
import { fileURLToPath } from "node:url";

export function loadLocalEnv() {
  if (process.env.NODE_ENV === "production") return;
  try {
    // src/env.ts and dist/*.js both sit two folders below the repository root
    process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
  } catch {
    // no .env.local: the variables are already in the environment
  }
}
