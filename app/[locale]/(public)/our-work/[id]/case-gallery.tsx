"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Play, Camera } from "lucide-react";

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

type Media = { kind: "image"; src: string } | { kind: "video"; src: string; embedId: string | null };

/**
 * Case gallery — Trip.com-style centered carousel (ปอน 2026-07-13):
 * ONE horizontal scroll-snap track where the ACTIVE slide is BIG and centered,
 * with the previous/next slides PEEKING at the edges (รูปกลางใหญ่ · ข้างๆ เล็ก).
 * เลื่อนซ้าย-ขวา · page-dots (1/slide) · ◀▶ arrows · "ดูรูปทั้งหมด N รูป".
 * Any tile → fullscreen lightbox. 16:9 images (654×368). A video (if any) is the
 * first slide with a ▶ badge and plays in the lightbox.
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

  // carousel — the active slide is the one whose center is nearest the viewport center
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const centerSlide = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const c = el.children[Math.max(0, Math.min(total - 1, i))] as HTMLElement | undefined;
    if (!c) return;
    el.scrollTo({ left: c.offsetLeft - (el.clientWidth - c.offsetWidth) / 2, behavior: "smooth" });
  }, [total]);
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i] as HTMLElement;
      const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    setActive(best);
  }, []);

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

  // one 16:9 slide tile (image · or video with a ▶ badge)
  const tile = (m: Media, i: number, priority = false) => (
    <button
      type="button"
      onClick={() => openAt(i)}
      aria-label={m.kind === "video" ? "วิดีโอ" : `ดูรูปที่ ${i + 1}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl bg-black/5"
    >
      <Image
        src={m.kind === "video" ? (images[0] ?? m.src) : m.src}
        alt={`${alt} — ${i + 1}`}
        fill
        sizes="(max-width: 768px) 86vw, 62vw"
        quality={90}
        priority={priority}
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
          {/* track — big centered slide + side peeks · เลื่อนซ้าย-ขวา */}
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {media.map((m, i) => (
              <div key={`${m.src}-${i}`} className="w-[86%] shrink-0 snap-center sm:w-[72%] md:w-[62%]">
                {tile(m, i, i === 0)}
              </div>
            ))}
          </div>

          {/* ◀▶ arrows */}
          {total > 1 ? (
            <>
              <button type="button" aria-label="ก่อนหน้า" onClick={() => centerSlide(active - 1)} disabled={active <= 0} className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-0 md:left-4">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" aria-label="ถัดไป" onClick={() => centerSlide(active + 1)} disabled={active >= total - 1} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-0 md:right-4">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          {/* ดูรูปทั้งหมด */}
          <button type="button" onClick={() => openAt(active)} className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-2 text-[12.5px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75">
            <Camera className="h-3.5 w-3.5" strokeWidth={2.6} /> ดูรูปทั้งหมด {total} รูป
          </button>
        </div>

        {/* page dots (1 per slide) */}
        {total > 1 ? (
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            {media.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`รูปที่ ${i + 1}`}
                onClick={() => centerSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-primary-600" : "w-1.5 bg-black/20 hover:bg-black/40"}`}
              />
            ))}
          </div>
        ) : null}
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
