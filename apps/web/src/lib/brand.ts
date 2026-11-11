/**
 * Brand helpers. An organiser's colour becomes the accent of its public event
 * page; the label on it must still read, so the ink is chosen by contrast.
 */

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a #rrggbb colour (WCAG 2). */
export function luminance(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string) {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

/** White when it reads at 4.5:1 on the colour, else near-black ink. Coral #FF664C gets the ink. */
export function readableOn(hex: string): "#ffffff" | "#111111" {
  return contrast("#ffffff", hex) >= 4.5 ? "#ffffff" : "#111111";
}

/** Two letters for a mark tile: "Epic PR & Events Ltd" becomes "EP". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Small counts in words, so copy reads "All three days", never "All 3 days". */
export function numberWord(n: number) {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] ?? String(n);
}
