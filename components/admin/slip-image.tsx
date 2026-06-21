"use client";

import { useState } from "react";

/**
 * SlipImage — a slip <img> with a graceful onError fallback (owner 2026-06-21
 * "รูปก็ไม่ขึ้น"). A signed Supabase URL can still 404 on GET when the legacy
 * slip file was never migrated into the bucket; a raw <img> then shows a
 * confusing broken-image icon. This renders a clear "เปิดสลิปไม่ได้" placeholder
 * instead, so the admin knows the slip is recorded but the file is missing.
 *
 * Server components pass a resolved (signed) `src`; this client wrapper only
 * adds the error state.
 */
export function SlipImage({
  src,
  alt = "สลิป",
  className = "",
  fallbackClassName = "",
}: {
  src: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-0.5 bg-amber-50 text-amber-700 text-center text-[10px] leading-tight ${className} ${fallbackClassName}`}
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
