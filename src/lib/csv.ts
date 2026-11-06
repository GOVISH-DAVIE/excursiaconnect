/** CSV in and out for the prototype: imports are parsed in the browser, exports download as files. */

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

/** Hands the lines to the browser as a .csv download. */
export function downloadCsv(filename: string, lines: string[]) {
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Any text as a download (an .ics invite, for one). */
export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
