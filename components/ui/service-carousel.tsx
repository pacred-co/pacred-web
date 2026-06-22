"use client";

import { useState } from "react";
import { Truck, Heart, Image as ImageIcon } from "lucide-react";

const GAP = 20;
const VISIBLE = 3;

export interface ServiceItem {
  route: string;
  price: string;
  type?: string;
  note?: string;
  badges?: string[];
}

export interface ImageCardItem {
  imageSrc?: string;
  bottomLeftBadges?: string[];
  bottomRightBadge?: string;
}

export interface BlogCardItem {
  title: string;
  imageSrc?: string;
  href?: string;
}

interface Props {
  cardWidth?: number;
  cardHeight?: number;
  imageHeight?: number;
  items?: ServiceItem[];
  imageItems?: ImageCardItem[];
  blogItems?: BlogCardItem[];
}

export function ServiceCarousel({
  cardWidth = 300,
  cardHeight = 360,
  imageHeight = 190,
  items,
  imageItems,
  blogItems,
}: Props) {
  const totalCards =
    blogItems?.length ?? imageItems?.length ?? items?.length ?? 6;
  const step = cardWidth + GAP;
  const maxOffset = Math.max(0, (totalCards - VISIBLE) * step);

  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const goNext = () => {
    if (busy || offset >= maxOffset) return;
    setBusy(true);
    setOffset((o) => Math.min(maxOffset, o + step));
  };

  const goPrev = () => {
    if (busy || offset <= 0) return;
    setBusy(true);
    setOffset((o) => Math.max(0, o - step));
  };

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ gap: GAP, transform: `translateX(-${offset}px)` }}
        onTransitionEnd={() => setBusy(false)}
      >
        {Array.from({ length: totalCards }, (_, i) => {
          const item = items?.[i];
          const imageItem = imageItems?.[i];
          const blogItem = blogItems?.[i];

          // Blog card variant — full red bg + title overlay at bottom
          if (blogItem) {
            return (
              <a
                key={i}
                href={blogItem.href ?? "#"}
                style={{ width: cardWidth, height: cardHeight }}
                className="group relative flex shrink-0 flex-col justify-end overflow-hidden rounded-xl bg-primary-600 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                {blogItem.imageSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={blogItem.imageSrc}
                    alt={blogItem.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                {/* Bottom title overlay with subtle gradient for readability */}
                <div className="relative z-10 bg-gradient-to-t from-black/60 via-black/30 to-transparent p-4 pt-12">
                  <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-white">
                    {blogItem.title}
                  </h3>
                </div>
              </a>
            );
          }

          // Image card variant
          if (imageItem) {
            const leftBadges = imageItem.bottomLeftBadges ?? ["LCL", "FCL"];
            const rightBadge = imageItem.bottomRightBadge ?? "นำเข้า";
            return (
              <div
                key={i}
                style={{ width: cardWidth, height: cardHeight }}
                className="relative flex shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-primary-600 p-4 text-white shadow-sm"
              >
                {/* Top row: placeholder icon + heart */}
                <div className="flex items-start justify-between">
                  <ImageIcon className="h-6 w-6" />
                  <button
                    type="button"
                    aria-label="Like"
                    className="rounded-full p-1 transition-colors hover:bg-white/15"
                  >
                    <Heart className="h-6 w-6" />
                  </button>
                </div>
                {/* Bottom row: badges */}
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {leftBadges.map((b) => (
                      <span
                        key={b}
                        className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
                    {rightBadge}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              style={{ width: cardWidth, height: cardHeight }}
              className="shrink-0 rounded-xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden flex flex-col"
            >
              {item ? (
                <>
                  {/* Image slot — red placeholder, ready for image */}
                  <div
                    className="w-full shrink-0 bg-primary-600"
                    style={{ height: imageHeight }}
                  />
                  {/* Text slot — badges + route + price + type + note */}
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    {item.badges && item.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.badges.map((b) => (
                          <span
                            key={b}
                            className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Truck className="h-4 w-4 shrink-0 text-primary-600" />
                      {item.route}
                    </p>
                    <p className="text-2xl font-bold leading-tight text-primary-600">
                      {item.price}
                    </p>
                    {item.type && (
                      <p className="text-sm text-foreground">{item.type}</p>
                    )}
                    {item.note && (
                      <p className="text-sm text-muted">{item.note}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="w-full shrink-0 bg-surface dark:bg-background"
                    style={{ height: imageHeight }}
                  />
                  <div className="flex-1 p-4" />
                </>
              )}
            </div>
          );
        })}
      </div>

      {offset > 0 && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white dark:bg-surface border border-border shadow flex items-center justify-center text-lg hover:bg-surface transition-colors"
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {offset < maxOffset && (
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white dark:bg-surface border border-border shadow flex items-center justify-center text-lg hover:bg-surface transition-colors"
          aria-label="Next"
        >
          ›
        </button>
      )}
    </div>
  );
}
