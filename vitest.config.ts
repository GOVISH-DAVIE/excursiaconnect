import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// the rule tests: pure modules in src/lib, run in Node against the demo seed
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
