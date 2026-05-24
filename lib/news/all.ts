/**
 * Merged Pacred News listing — server-only.
 *
 * This module unifies two sources into one sorted, deduped list used by
 * the public `/news` routes + sitemap:
 *
 *   1. **In-code legacy items** from `components/sections/pacred-news-data.ts`
 *      (`PACRED_NEWS`). Pre-MDX content that lives in TypeScript so the
 *      homepage `<Blog>` carousel — which is `"use client"` — can inline
 *      it into the client bundle without an `fs` read.
 *
 *   2. **MDX files** under `content/news/*.mdx` (Gap #10 foundation).
 *      Editors (เดฟ / ปอน) drop a new `.mdx` file with frontmatter and
 *      the news routes pick it up at build time — no code change.
 *      See `lib/news/mdx.ts` for the editorial contract.
 *
 * Why server-only: `getMdxNews()` reads from the filesystem at module
 * load time via `fs`. That can't run in the browser. **Never import
 * this module from a `"use client"` component.** Client-side consumers
 * (the homepage `<Blog>` carousel) should keep importing from
 * `components/sections/pacred-news-data.ts` directly — they only need
 * the legacy snapshot for marketing teasers, not the full MDX list.
 *
 * Sort order: newest `publishedAt` first; slug as a deterministic
 * tie-breaker so the build output is stable. If an MDX file and a
 * legacy item share a slug, MDX wins — editors can promote a legacy
 * item to MDX just by creating `content/news/<slug>.mdx`.
 */

import {
  PACRED_NEWS as LEGACY_PACRED_NEWS,
  type PacredNews,
} from "@/components/sections/pacred-news-data";
import { getMdxNews } from "@/lib/news/mdx";

function buildAllNews(): PacredNews[] {
  const mdx = getMdxNews();
  const mdxSlugs = new Set(mdx.map((n) => n.slug));
  const merged = [
    ...mdx,
    ...LEGACY_PACRED_NEWS.filter((n) => !mdxSlugs.has(n.slug)),
  ];
  return merged.sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      return a.publishedAt < b.publishedAt ? 1 : -1;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}

/**
 * Full sorted list of every news item across both sources.
 * Computed once at module load — the page routes are server-rendered
 * (or pre-rendered via `generateStaticParams`), so a single sort + scan
 * per build is fine.
 */
export const ALL_NEWS: PacredNews[] = buildAllNews();

export function getNewsBySlug(slug: string): PacredNews | undefined {
  return ALL_NEWS.find((n) => n.slug === slug);
}

/**
 * Pick up to N items that aren't the current one — used by the
 * "ข่าวสาร Pacred อื่นๆ" related panel on a detail page.
 */
export function getRelatedNews(currentSlug: string, limit = 3): PacredNews[] {
  return ALL_NEWS.filter((n) => n.slug !== currentSlug).slice(0, limit);
}
