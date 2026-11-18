/** Times in Nairobi, and lengths in minutes and seconds, for the visitor log. */

const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const when = (iso: string) => stamp.format(new Date(iso));
export const at = (iso: string) => clock.format(new Date(iso));

export function length(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export const span = (from: string, to: string) => length((Date.parse(to) - Date.parse(from)) / 1000);
