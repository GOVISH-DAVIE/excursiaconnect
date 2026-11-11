import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// Locally, the visitor log's settings live in the repository's .env.local with the API's. The web app takes only
// those: it must never hold a database URL or the API's secrets. A server sets them in web.env (deploy.md).
const rootEnv = resolve(process.cwd(), "../../.env.local");
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, "utf8")))) {
    if (/^(ADMINWATCH_|VISITS_)/.test(key) && process.env[key] === undefined) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
