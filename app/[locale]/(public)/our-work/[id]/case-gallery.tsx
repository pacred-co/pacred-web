"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Play, Camera } from "lucide-react";

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

type Media = { kind: "image"; src: string } | { kind: "video"; src: string; embedId: string | null };

/**
 * Case gallery — hotel-style photo mosaic (owner 2026-07-20 "จัดรูปแบบนี้"):
 * รูปใหญ่ซ้าย + กริดรูปเล็กขวา แบบหน้าโรงแรม (Agoda/Booking) แทน carousel เลื่อนข้าง
 * ของเดิม — เห็นหลายรูปพร้อมกันในตาเดียว ไม่ต้องเลื่อนทีละรูป.
 *   mobile : hero เต็มกว้าง + แถบ 3 รูปด้านล่าง
 *   md+    : hero กิน 2 คอลัมน์ × 2 แถว + รูปเล็กอีก 6 รูป (รวม 7 ช่อง)
 * Any tile → fullscreen lightbox (ลูกศร · ESC · นับหน้า). 16:9 images (654×368).
 * A video (if any) is the hero with a ▶ badge and plays in the lightbox.
 */
export function CaseGallery({
  images,
  alt,
  videoUrl,
}: {
  images: string[];
  alt: string;
  videoUrl?: string | null;
  verifiedLabel?: string;
}) {
  const media: Media[] = [];
  if (videoUrl) media.push({ kind: "video", src: videoUrl, embedId: extractYouTubeId(videoUrl) });
  for (const src of images) media.push({ kind: "image", src });
  const total = media.length;

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const openAt = useCallback((i: number) => { setIdx(i); setOpen(true); }, []);
  const close = useCallback(() => setOpen(false), []);
  const prevLb = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);
  const nextLb = useCallback(() => setIdx((i) => (i + 1) % total), [total]);

  // lightbox keyboard nav + scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prevLb();
      else if (e.key === "ArrowRight") nextLb();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, close, prevLb, nextLb]);

  if (total === 0) return null;
  const activeMedia = media[Math.min(idx, total - 1)];

  /* Per-COUNT layout (owner 2026-07-20 "ภาพต้องเปลี่ยน responsive ตามจำนวนภาพ ·
     ต้องเต็มจอ"). Every variant fills its grid EXACTLY — no holes, no dropped
     photo — on BOTH breakpoints, and no tile is ever squeezed past the source
     16:9 so nothing gets cropped:
       1  → รูปเดียวเต็มกว้าง
       2  → มือถือซ้อนกัน · จอใหญ่ ครึ่งต่อครึ่ง
       3  → รูปใหญ่ 2/3 (คร่อม 2 แถว) + 2 รูปซ้อนขวา
       4  → มือถือ รูปใหญ่ + แถว 3 · จอใหญ่ 2×2 เท่ากัน (ครบทั้ง 4 ไม่ต้องซ่อน)
       5+ → รูปใหญ่ครึ่งจอ (คร่อม 2 แถว) + 4 รูปขวา · ที่เหลือดูใน "ดูรูปทั้งหมด"
     A hero that spans 2 rows drops its own aspect box and stretches (md:h-full);
     one that sits in a single row keeps its 16:9. */
  const rest = media.slice(1);
  const L =
    total === 1
      ? { shown: 0, grid: "grid-cols-1", hero: "aspect-video" }
      : total === 2
        ? { shown: 1, grid: "grid-cols-1 md:grid-cols-2", hero: "aspect-video" }
        : total === 3
          ? {
              shown: 2,
              grid: "grid-cols-2 md:grid-cols-3 md:grid-rows-2",
              hero: "col-span-2 aspect-video md:col-span-2 md:row-span-2 md:aspect-auto md:h-full",
            }
          : total === 4
            ? { shown: 3, grid: "grid-cols-3 md:grid-cols-2", hero: "col-span-3 aspect-video md:col-span-1" }
            : {
                shown: 4,
                grid: "grid-cols-3 md:grid-cols-4 md:grid-rows-2",
                hero: "col-span-3 aspect-video md:col-span-2 md:row-span-2 md:aspect-auto md:h-full",
              };
  const shown = rest.slice(0, L.shown);
  // A phone fits at most a 3-up strip under the hero; only the 5+ layout has a
  // 4th desktop tile to hide, and hiding it keeps that row full on mobile too.
  const mobileShown = Math.min(L.shown, 3);

  // one tile (image · or the video hero with a ▶ badge) — the button IS the grid item
  const tile = (m: Media, i: number, variant: "hero" | "small", extraCls = "") => (
    <button
      key={`${m.src}-${i}`}
      type="button"
      onClick={() => openAt(i)}
      aria-label={m.kind === "video" ? "วิดีโอ" : `ดูรูปที่ ${i + 1}`}
      className={`group relative overflow-hidden bg-black/5 ${
        variant === "hero" ? `${L.hero} rounded-lg` : "aspect-video rounded-md"
      } ${extraCls}`}
    >
      <Image
        src={m.kind === "video" ? (images[0] ?? m.src) : m.src}
        alt={`${alt} — ${i + 1}`}
        fill
        sizes={variant === "hero" ? "(max-width: 768px) 100vw, 42vw" : "(max-width: 768px) 33vw, 21vw"}
        quality={90}
        priority={variant === "hero"}
        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      {m.kind === "video" ? (
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-primary-700">
            <Play className="h-5 w-5 translate-x-[1px] fill-current" />
          </span>
        </span>
      ) : null}
    </button>
  );

  return (
    <>
      <div className="p-3 md:p-4">
        <div className="relative">
          {/* mosaic — hero ซ้าย + กริดรูปเล็กขวา (แบบหน้าโรงแรม) */}
          <div className={`grid gap-1 ${L.grid}`}>
            {tile(media[0], 0, "hero")}
            {shown.map((m, i) => tile(m, i + 1, "small", i >= mobileShown ? "hidden md:block" : ""))}
          </div>

          {/* ดูรูปทั้งหมด — nests over the bottom-right tile, same spot as the reference */}
          <button type="button" onClick={() => openAt(0)} className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-2 text-[12.5px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75">
            <Camera className="h-3.5 w-3.5" strokeWidth={2.6} /> ดูรูปทั้งหมด {total} รูป
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={close} role="dialog" aria-modal="true" aria-label="แกลเลอรีรูปผลงาน">
          <button type="button" aria-label="ปิด" onClick={close} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25">
            <X className="h-5 w-5" />
          </button>
          {total > 1 ? (
            <>
              <button type="button" aria-label="ก่อนหน้า" onClick={(e) => { e.stopPropagation(); prevLb(); }} className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 md:left-6">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" aria-label="ถัดไป" onClick={(e) => { e.stopPropagation(); nextLb(); }} className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 md:right-6">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
          <div className="relative flex h-[80vh] w-[92vw] max-w-[1100px] items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {activeMedia.kind === "video" ? (
              activeMedia.embedId ? (
                <iframe src={`https://www.youtube-nocookie.com/embed/${activeMedia.embedId}`} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="วิดีโอผลงาน" />
              ) : (
                <video src={activeMedia.src} controls autoPlay className="max-h-full max-w-full" />
              )
            ) : (
              <Image src={activeMedia.src} alt={`${alt} — ${idx + 1}`} fill sizes="92vw" quality={94} className="object-contain" />
            )}
          </div>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold tabular-nums text-white">
            {idx + 1} / {total}
          </span>
        </div>
      ) : null}
    </>
  );
}
