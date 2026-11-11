/**
 * The wall clock, for the core platform's rules until Ctx carries "now" into them (M0.0). Pure modules take
 * "now" as an argument; these two are the only reads of the machine clock left in the core.
 */
export function stamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function nowTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
