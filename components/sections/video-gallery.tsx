"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Generic click-to-play video grid (ปอน 2026-06-26 — the /videos page).
 * Handles BOTH kinds of case video:
 *   • youtube — thumbnail (img.youtube.com) → click → autoplay `<iframe>` embed.
 *   • file    — an uploaded clip (Supabase Storage URL) → poster (the article
 *               cover, if any) → click → autoplay `<video controls>`.
 * Same proven pattern as `customs-video-clips`, data-driven so it renders curated
 * videos + CMS video articles (YouTube link OR uploaded file).
 */
export type GalleryVideo =
  | { kind: "youtube"; id: string; title: string; badge?: string }
  | { kind: "file"; src: string; poster?: string; title: string; badge?: string };

const thumbHd = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
const thumbFallback = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const embed = (id: string) =>
  `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;

function onThumbError(e: React.SyntheticEvent<HTMLImageElement>, id: string) {
  const img = e.currentTarget;
  if (img.src.endsWith("maxresdefault.jpg")) img.src = thumbFallback(id);
}

function keyOf(v: GalleryVideo, i: number) {
  return v.kind === "youtube" ? `yt-${v.id}` : `file-${i}-${v.src}`;
}

export function VideoGallery({ videos }: { videos: GalleryVideo[] }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {videos.map((v, i) => {
        const k = keyOf(v, i);
        const isActive = active === k;
        return (
          <div
            key={k}
            className="group relative aspect-video overflow-hidden rounded-2xl bg-primary-600 shadow-[0_8px_20px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(15,23,42,0.16)]"
          >
            {isActive ? (
              v.kind === "youtube" ? (
                <iframe
                  src={embed(v.id)}
                  title={v.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <video
                  src={v.src}
                  poster={v.poster}
                  controls
                  autoPlay
                  preload="metadata"
                  className="absolute inset-0 h-full w-full bg-black object-contain"
                />
              )
            ) : (
              <button
                type="button"
                onClick={() => setActive(k)}
                suppressHydrationWarning
                aria-label={`เล่นวิดีโอ: ${v.title}`}
                className="absolute inset-0 h-full w-full cursor-pointer text-left"
              >
                {/* thumbnail / poster */}
                {v.kind === "youtube" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumbHd(v.id)}
                    onError={(e) => onThumbError(e, v.id)}
                    alt={v.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : v.poster ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={v.poster}
                    alt={v.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="absolute inset-0 bg-gradient-to-br from-primary-600 to-primary-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full border-[3px] border-white bg-primary-600/95 shadow-[0_10px_28px_rgba(0,0,0,0.4)] backdrop-blur transition-transform duration-300 group-hover:scale-110 md:h-[68px] md:w-[68px]">
                    <Play className="h-6 w-6 translate-x-[2px] fill-white text-white md:h-7 md:w-7" strokeWidth={0} />
                  </span>
                </div>

                {v.badge ? (
                  <div className="absolute left-3 top-3 inline-flex items-center rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-black tracking-wide text-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
                    {v.badge}
                  </div>
                ) : null}

                <div className="absolute inset-x-3 bottom-3 z-10">
                  <h3 className="line-clamp-2 text-[13px] font-black leading-[1.3] text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] md:text-[14px]">
                    {v.title}
                  </h3>
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
