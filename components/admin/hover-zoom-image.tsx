"use client";

/**
 * HoverZoomImage — magnify-on-hover document viewer (เดฟ 2026-05-30).
 *
 * Owner ask: when reviewing a นิติบุคคล (juristic) customer's documents
 * (หนังสือรับรอง · ภพ20 · บัตรประชาชน), staff need to read small printed
 * numbers (tax id) to compare against the submitted data — WITHOUT opening
 * the image full-size in another tab and tabbing back and forth. This is a
 * cursor-follow magnifier: hover the image → that area renders zoomed in
 * place, so the eye stays on one spot to read + compare numbers fast.
 *
 * - Images: cursor-follow zoom overlay (default 3×). Move the mouse to pan.
 * - PDFs: native <iframe> (its own pinch/scroll zoom) — magnifier N/A.
 * - "เปิดเต็มจอ" link always available as a fallback.
 *
 * Pure client component; takes a (signed) URL + mime. No server-only.
 */

import { useRef, useState } from "react";

export function HoverZoomImage({
  src,
  alt,
  mime,
  zoom = 3,
  className = "",
}: {
  src: string;
  alt: string;
  /** "application/pdf" → iframe; anything else → image magnifier. */
  mime?: string;
  /** Magnification factor for images (default 3×). */
  zoom?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number; show: boolean }>({
    x: 50,
    y: 50,
    show: false,
  });

  const isPdf = mime === "application/pdf" || /\.pdf($|\?)/i.test(src);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setLens({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
      show: true,
    });
  }

  if (isPdf) {
    return (
      <div className={`rounded-lg border border-border overflow-hidden bg-surface-alt ${className}`}>
        <iframe src={src} title={alt} className="w-full h-72" />
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-2 py-1 text-center text-[11px] text-primary-600 hover:bg-surface-alt"
        >
          เปิดเต็มจอ ↗
        </a>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseEnter={() => setLens((l) => ({ ...l, show: true }))}
        onMouseLeave={() => setLens((l) => ({ ...l, show: false }))}
        className="relative h-72 w-full overflow-hidden rounded-lg border border-border bg-surface-alt cursor-crosshair"
        title="เลื่อนเมาส์เพื่อขยายอ่านตัวเลข"
      >
        {/* base (fit) */}
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL · admin doc review · not LCP */}
        <img
          src={src}
          alt={alt}
          className={`h-full w-full object-contain select-none pointer-events-none transition-opacity ${lens.show ? "opacity-0" : "opacity-100"}`}
          draggable={false}
        />
        {/* cursor-follow magnified overlay */}
        {lens.show && (
          <div
            className="absolute inset-0 bg-no-repeat pointer-events-none"
            style={{
              backgroundImage: `url("${src}")`,
              backgroundSize: `${zoom * 100}%`,
              backgroundPosition: `${lens.x}% ${lens.y}%`,
            }}
          />
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white pointer-events-none">
          🔍 {lens.show ? `${zoom}×` : "เลื่อนเมาส์เพื่อขยาย"}
        </span>
      </div>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-0.5 block text-center text-[11px] text-primary-600 hover:underline"
      >
        เปิดเต็มจอ ↗
      </a>
    </div>
  );
}
