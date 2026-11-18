/** CSV text in and out: parsing imports and writing export lines. Pure; the browser download is apps/web/src/lib/download.ts. */

/** Rows of cells; quotes around a cell are dropped, blank lines skipped. Commas inside quotes are kept. */
export function splitCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const cells: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
        } else if (ch === "," && !quoted) {
          cells.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
}

/** One cell, quoted, with any quote doubled. */
export const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** A row of cells as one CSV line. */
export const row = (cells: unknown[]) => cells.map(q).join(",");
