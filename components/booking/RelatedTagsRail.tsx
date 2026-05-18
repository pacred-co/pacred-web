/**
 * BK-1 — Related-article tags rail (side rail card #2).
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §4.5 — the
 * Pacred equivalent of Trip.com's travel-guide upsell: chip links into
 * the existing `/knowledge` hub by tag slug. Keeps a not-yet-ready-to-
 * book visitor INSIDE the ecosystem (the DNA full-loop principle) and
 * feeds SEO internal-linking. Server-renderable — no client state.
 */

import { Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";

interface RelatedTagsRailProps {
  /** Tag slugs from `ServiceConfig.relatedTags`. */
  tags: string[];
}

export function RelatedTagsRail({ tags }: RelatedTagsRailProps) {
  if (tags.length === 0) return null;

  return (
    <section
      aria-label="บทความที่เกี่ยวข้อง"
      className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5"
    >
      <div className="flex items-center gap-2 text-[11px] md:text-[12px] font-black text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
        <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
        {/* i18n-key: booking.rail.tags.header */}
        บทความที่เกี่ยวข้อง
      </div>
      <p className="mt-1.5 text-[11.5px] md:text-[12px] text-muted font-medium leading-snug">
        {/* i18n-key: booking.rail.tags.help */}
        ความรู้เพิ่มเติมเกี่ยวกับบริการนี้
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Link
            key={tag}
            href={`/knowledge/${tag}`}
            data-cta={`booking-tag-${tag}`}
            className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-full bg-primary-50/70 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[11.5px] md:text-[12px] font-bold text-primary-700 dark:text-primary-300 hover:bg-primary-100 hover:border-primary-300 transition-colors"
          >
            #{tag}
          </Link>
        ))}
      </div>
    </section>
  );
}
