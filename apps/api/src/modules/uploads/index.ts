/** The uploads module: the local storage's receiving end. A bucket (D6) takes uploads directly and needs none. */
import type { LocalStorage } from "../../storage/local";
import { createUploadsController } from "./uploads.controller";
import { uploadsRoutes } from "./uploads.routes";

export const uploadsModule = (deps: { storage: LocalStorage; maxBytes: number }) => uploadsRoutes(createUploadsController(deps.storage), deps.maxBytes);
