/**
 * Builds the API into dist/server.js, and each database command into dist/cli/ (production runs them without tsx:
 * node dist/cli/check-demo.js, node dist/cli/import-reference.js <file>). The workspace packages (@excursia/domain, /contracts, /db) are
 * TypeScript source, so they are bundled in; every other package stays in node_modules, as Node expects (Prisma's
 * runtime, pg and Express load files of their own at runtime).
 */
import { build } from "esbuild";

const workspace = /^@excursia\//;

await build({
  entryPoints: { server: "src/server.ts", worker: "src/worker.ts", "cli/seed-demo": "src/cli/seed-demo.ts", "cli/check-demo": "src/cli/check-demo.ts", "cli/import-reference": "src/cli/import-reference.ts", "cli/create-admin": "src/cli/create-admin.ts", "cli/check-mail": "src/cli/check-mail.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "external-node-modules",
      setup(b) {
        // a bare import (not ./ or /) that is not one of ours is left for Node to load
        b.onResolve({ filter: /^[^./]/ }, (args) => (workspace.test(args.path) ? undefined : { path: args.path, external: true }));
      },
    },
  ],
});
