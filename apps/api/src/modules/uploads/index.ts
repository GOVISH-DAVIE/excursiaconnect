/** The uploads module: the local storage's receiving end. A bucket (D6) takes uploads directly and needs none. */
import type { LocalStorage } from "../../storage/local";
import { createUploadsController } from "./uploads.controller";
import { filesRoutes, uploadsRoutes } from "./uploads.routes";

export function uploadsModule(deps: { storage: LocalStorage; maxBytes: number }) {
  const c = createUploadsController(deps.storage);
  return { uploads: uploadsRoutes(c, deps.maxBytes), files: filesRoutes(c) };
}
