/**
 * Image uploads in the prototype. A real build sends the file to object storage and keeps a URL;
 * here the file is read in the browser, scaled down and kept as a data URL in the store, so it
 * survives a reload without a server. Logos keep PNG (and so transparency); photographs become JPEG.
 */

export const LIMITS = {
  banner: { side: 1800, quality: 0.82 },
  photo: { side: 600, quality: 0.84 },
  logo: { side: 480, quality: 0.9 },
  gallery: { side: 1400, quality: 0.8 },
} as const;

export function readImage(file: File, kind: keyof typeof LIMITS): Promise<string> {
  const { side, quality } = LIMITS[kind];
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const png = kind === "logo" && (file.type === "image/png" || file.type === "image/svg+xml");
      resolve(canvas.toDataURL(png ? "image/png" : "image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not an image"));
    };
    img.src = url;
  });
}

/** Roughly how much of the browser's storage an image takes, for the note under an upload. */
export function sizeOf(dataUrl?: string) {
  if (!dataUrl) return "";
  const kb = Math.round((dataUrl.length * 3) / 4 / 1024);
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}
