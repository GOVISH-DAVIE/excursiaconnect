/** The payments module, assembled: M-Pesa (Daraja, the test one, or none), the shared runCommand, its routes. */
import type { Db } from "@excursia/db";
import type { Mpesa } from "../../payments/mpesa";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createPaymentsController } from "./payments.controller";
import { createPaymentsRepo } from "./payments.repo";
import { hookRoutes, payRoutes } from "./payments.routes";
import { createPaymentsService } from "./payments.service";

export function paymentsService(deps: { db: Db; now: () => Date; mpesa: Mpesa | null; callbackBase: () => string; log?: Pick<Console, "error" | "log"> }) {
  const commands = createCommands({ repo: createDealRoomRepo(deps.db), now: deps.now });
  return createPaymentsService({ repo: createPaymentsRepo(deps.db), commands, mpesa: deps.mpesa, callbackBase: deps.callbackBase, now: deps.now, log: deps.log });
}

export function paymentsModule(deps: Parameters<typeof paymentsService>[0]) {
  const service = paymentsService(deps);
  const controller = createPaymentsController(service);
  return { service, pay: payRoutes(controller), hooks: hookRoutes(controller) };
}
