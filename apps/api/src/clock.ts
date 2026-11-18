/**
 * The time the rules take as now. Normally the real clock; locally and on staging RULES_CLOCK can start it at a
 * chosen moment, from which it keeps running (config.ts refuses it in production). Sessions, codes and rate limits
 * always use the real clock.
 */
import type { Config } from "./config";
import { toInstant } from "./persistence/time";

export function rulesClock(config: Pick<Config, "RULES_CLOCK">, real: () => Date = () => new Date()): () => Date {
  if (!config.RULES_CLOCK) return real;
  const offset = toInstant(config.RULES_CLOCK).getTime() - real().getTime();
  return () => new Date(real().getTime() + offset);
}
