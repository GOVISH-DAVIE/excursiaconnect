import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// the database tests read TEST_DATABASE_URL from .env.local locally (scripts/db/setup-local.sh) or from CI's environment
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the database tests skip themselves
}

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// the rule tests: pure modules in src/lib, run in Node against the demo seed; the database tests: src/server
// against the test database, as the app role
export default defineConfig({
  resolve: {
    alias: {
      "@": src("./src"),
      "server-only": src("./tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
