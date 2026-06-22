"use client";

import { useState } from "react";

/**
 * SlipImage — render a slip of ANY format (owner 2026-06-21/22 "รูปก็ไม่ขึ้น").
 * Slips are uploaded as image OR **PDF** (e.g. SCB "ใบแจ้งการชำระเงิน" PYMTADV_*.pdf).
 * A plain <img src=.pdf> can't render a PDF → it fired onError → a confusing
 * "เปิดสลิปไม่ได้" even though the file is perfectly valid. So:
 *   - PDF  → <object> inline preview (shows the actual PDF · scales to className),
 *            with a 📄 tile fallback if the browser won't embed.
 *   - image→ <img> with onError → "เปิดสลิปไม่ได้" (only for a genuinely missing
 *            legacy file).
 * The parent usually wraps this in an <a href={src} target=_blank> so a click
 * always opens the full slip regardless of inline-render support.
 */
export function SlipImage({
  src,
  alt = "สลิป",
  className = "",
  fallbackClassName = "",
  pdfMode = "embed",
}: {
  src: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  /** "embed" (large detail) → inline <object> preview · "tile" (small list
   *  thumbnail) → a clean 📄 tile, since a cramped 64px PDF embed looks bad.
   *  Both rely on the parent <a> to open the full slip on click. */
  pdfMode?: "embed" | "tile";
}) {
  const [failed, setFailed] = useState(false);
  // .pdf possibly followed by ?token=… (signed URL) or #fragment.
  const isPdf = /\.pdf(\?|#|$)/i.test(src);

  // ── PDF — a clear 📄 tile (thumbnail) or inline <object> preview (detail) ──
  if (isPdf) {
    const tile = (
      <div
        className={`flex flex-col items-center justify-center gap-0.5 bg-rose-50 text-rose-700 text-center text-[11px] leading-tight ${className} ${fallbackClassName}`}
        title="สลิป PDF — คลิกเพื่อเปิด"
      >
        <span aria-hidden>📄</span>
        <span>สลิป PDF</span>
      </div>
    );
    if (pdfMode === "tile") return tile;
    // Detail view — embed the PDF inline. <iframe> renders PDFs far more
    // reliably than <object> in Chrome (the slips are served content-type
    // application/pdf with no X-Frame-Options, so they DO embed); min-h
    // guarantees a visible viewport. The parent <a> still opens it full-screen.
    return (
      <iframe src={src} title={alt} className={`w-full min-h-[360px] ${className}`} />
    );
  }

  // ── image — onError fallback (a genuinely missing legacy file) ──
  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-0.5 bg-amber-50 text-amber-700 text-center text-[11px] leading-tight ${className} ${fallbackClassName}`}
        title="ไฟล์สลิปหาไม่เจอในระบบ (อาจเป็นไฟล์เก่าที่ยังไม่ย้าย)"
      >
        <span aria-hidden>🧾</span>
        <span>เปิดสลิปไม่ได้</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />
  );
}
