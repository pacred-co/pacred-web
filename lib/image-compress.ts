/**
 * Client-side image compressor (owner 2026-06-26 — avatar upload "ใช้ไม่ได้จริง").
 *
 * ROOT of the bug: the avatar upload clients (staff + customer) hard-rejected
 * any file > 5 MB before uploading. Phone photos are routinely 3–8 MB, so a
 * normal selfie was bounced outright → "ไฟล์ใหญ่เกิน 5 MB" / generic fail.
 *
 * Fix: shrink the image in-browser (canvas → JPEG) BEFORE the size guard, the
 * same approach the juristic-signup upload uses. A 4000px 8 MB phone photo →
 * ~1024px ~150 KB JPEG, well under every cap (uploadToBucket 5 MB · the client
 * guard). Browser-only (uses canvas/createImageBitmap) — import from a
 * "use client" component. Fails SOFT: any decode error returns the original
 * file so the existing guards still apply (never throws).
 */

export async function compressImageFile(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<File> {
  const maxDim = opts.maxDim ?? 1024;
  const quality = opts.quality ?? 0.85;

  // Only attempt for raster images the browser can decode. HEIC etc. usually
  // can't decode to a canvas → we fall back to the original (caught below).
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    // Only swap if we actually shrank it (a small PNG logo may grow as JPEG).
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file; // decode/encode failed → upload the original, guards still apply
  }
}
