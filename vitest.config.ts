import { defineConfig } from "vitest/config";

// the database tests read TEST_DATABASE_URL from .env.local locally (scripts/db/setup-local.sh) or from CI's environment
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the database tests skip themselves
}

// One run for the whole repository:
//   packages/domain/tests  the rules, pure, in Node against the demo seed
//   packages/db/tests      what PostgreSQL itself guarantees, as the app role, against the test database
//   apps/api/tests         the Express app on a random port
// Workspace packages resolve through node_modules, as they do in the apps.
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
    environment: "node",
    env: { NODE_ENV: "test" },
  },
});
