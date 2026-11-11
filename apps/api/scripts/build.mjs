/**
 * Builds the API into one file, dist/server.js. The workspace packages (@excursia/domain, /contracts, /db) are
 * TypeScript source, so they are bundled in; every other package stays in node_modules, as Node expects (Prisma's
 * runtime, pg and Express load files of their own at runtime).
 */
import { build } from "esbuild";

const workspace = /^@excursia\//;

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
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
