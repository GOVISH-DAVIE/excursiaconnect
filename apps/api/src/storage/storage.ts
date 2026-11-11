/**
 * Where uploaded files live (backend-plan.md, Security model, "Documents"). Behind this interface so the local
 * folder used today can become an S3-compatible bucket (D6) without touching the services:
 * - `uploadTarget` hands the browser a short-lived, signed place to PUT exactly one file of an exact size and type;
 *   the bytes never pass through a service, and with a bucket they never reach the API at all;
 * - `stat` says whether the file arrived, and how big it is.
 * Every file starts in quarantine (file.state); the virus scan that clears it is M1.2.
 */
export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };

export interface Storage {
  uploadTarget(key: string, file: { contentType: string; size: number }): UploadTarget;
  stat(key: string): Promise<{ size: number } | null>;
  /** A link that downloads one file, for two minutes, as an attachment with this name and type. */
  downloadUrl(key: string, file: { name: string; contentType: string }): { url: string; expiresAt: Date };
}

/** The types an applicant may upload, with the bytes each must start with (checked when the file arrives). */
export const UPLOAD_TYPES: Record<string, { ext: string; magic: number[][] }> = {
  "application/pdf": { ext: "pdf", magic: [[0x25, 0x50, 0x44, 0x46, 0x2d]] }, // %PDF-
  "image/png": { ext: "png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/jpeg": { ext: "jpg", magic: [[0xff, 0xd8, 0xff]] },
  // Office files are zip containers
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", magic: [[0x50, 0x4b, 0x03, 0x04]] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", magic: [[0x50, 0x4b, 0x03, 0x04]] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", magic: [[0x50, 0x4b, 0x03, 0x04]] },
};

/** Whether the first bytes are what the declared type must start with. */
export function looksLike(contentType: string, head: Uint8Array): boolean {
  const t = UPLOAD_TYPES[contentType];
  return !!t && t.magic.some((m) => m.every((b, i) => head[i] === b));
}

/** A file's name as given, without any folder part or control characters, kept short. */
export const cleanFileName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? "file")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200) || "file";
