/**
 * What the rule tests share: the rules with the prototype's Ctx (the demo clocks and persona switchers), without
 * the React store. Tests that need a particular actor or a reproducible run build their own Ctx with fixedCtx.
 */
import { reducer as coreReducer, type Action } from "@excursia/domain/core/reducer";
import { protoCtx } from "@excursia/domain/proto-ctx";
import type { AppState } from "@excursia/domain/types";

export const reducer = (state: AppState, action: Action): AppState => coreReducer(state, action, protoCtx(state, action));
export { roomVerdict, scanRefusal, scanVerdict } from "@excursia/domain/core/scan";
