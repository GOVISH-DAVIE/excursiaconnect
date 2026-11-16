/**
 * Stamped copies (backend-plan.md, M3.1; PRD Confidentiality req. 5): a document a seeker shares with a counterparty
 * opens as a copy carrying the viewer's name, organisation and the date across every page, so a forwarded copy says
 * whose it was. A PDF is stamped page by page; a PNG or JPEG becomes a one-page PDF with the stamp over it. Word,
 * Excel and PowerPoint files can't be stamped reliably: they go as they are, and only where the seeker allows
 * downloads (the rules check that). The original is never changed: each copy is made when it is opened.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/** The types that open as a stamped copy. */
export const stampable = (contentType: string) => contentType === "application/pdf" || contentType === "image/png" || contentType === "image/jpeg";

export class StampRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StampRefused";
  }
}

/** The standard fonts write Latin-1 only: an accent loses its mark and anything else becomes "?", rather than failing. */
const plain = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");

/** The longest side of an image's page, in points (A3's). */
const IMAGE_PAGE = 1190;

const UNREADABLE = "This file can't be read, so it can't be stamped and shared. Ask the business for another copy.";

/** The document to stamp: a PDF as it is, an image on a page of its own. Throws StampRefused if it can't be read. */
async function open(bytes: Uint8Array, contentType: string): Promise<PDFDocument> {
  try {
    if (contentType === "application/pdf") {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      if (doc.getPageCount() === 0) throw new Error("no pages");
      return doc;
    }
    if (contentType === "image/png" || contentType === "image/jpeg") {
      const doc = await PDFDocument.create();
      const img = contentType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const { width, height } = img.scale(Math.min(1, IMAGE_PAGE / Math.max(img.width, img.height)));
      doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
      return doc;
    }
  } catch (e) {
    // a password-protected PDF, a damaged one, or something else under a PDF's name
    throw new StampRefused((e as Error).name === "EncryptedPDFError" ? "This PDF is password-protected, so it can't be stamped and shared. Ask the business for a copy without a password." : UNREADABLE);
  }
  throw new StampRefused("Only PDFs and images are stamped.");
}

/** Whether a file can be stamped: checked before an opening is logged, so a file that can't be is refused with the reason. */
export async function checkStampable(bytes: Uint8Array, contentType: string): Promise<void> {
  await open(bytes, contentType);
}

/**
 * A stamped copy: `mark` across each page, diagonally and four times, faint enough to read through, and
 * `footer` in small print along the bottom edge. Answers the PDF's bytes.
 */
export async function stamp(bytes: Uint8Array, contentType: string, words: { mark: string; footer: string }): Promise<Uint8Array> {
  const doc = await open(bytes, contentType);
  try {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mark = plain(words.mark);
    const footer = plain(words.footer);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      // the mark on its slant spans at most the page's width and half its height, so all four fit, top to bottom
      const angle = (30 * Math.PI) / 180;
      const base = Math.max(9, Math.min(width, height) / 34);
      const long = font.widthOfTextAtSize(mark, base);
      const size = base * Math.min(1, (width - 32) / (long * Math.cos(angle)), (height * 0.5) / (long * Math.sin(angle)));
      const run = font.widthOfTextAtSize(mark, size) * Math.cos(angle);
      const rise = font.widthOfTextAtSize(mark, size) * Math.sin(angle);
      const x = Math.max(16, (width - run) / 2);
      const bottom = 24;
      const top = Math.max(bottom, height - rise - 16);
      for (let i = 0; i < 4; i++) {
        page.drawText(mark, { x, y: bottom + ((top - bottom) * i) / 3, size, font, color: rgb(0.55, 0.1, 0.1), opacity: 0.16, rotate: degrees(30) });
      }
      const small = Math.min(7, (width - 24) / Math.max(1, font.widthOfTextAtSize(footer, 1)));
      page.drawText(footer, { x: 12, y: 8, size: small, font, color: rgb(0.3, 0.3, 0.3), opacity: 0.9 });
    }
    return await doc.save();
  } catch {
    throw new StampRefused(UNREADABLE);
  }
}
