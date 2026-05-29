/**
 * MDX-based news loader — Gap #10 foundation.
 *
 * Why MDX-as-files instead of a CMS:
 * Pacred is lean — no WordPress / Sanity / Payload. Editors (เดฟ, ปอน)
 * drop a `.mdx` file into `content/news/` and the public `/news` page
 * picks it up at build time. Same pattern as the team's `docs/learnings/`.
 *
 * Why no `@next/mdx` engine:
 * The team's existing `<ArticleContent>` parser already renders the
 * markdown-like dialect used in news articles (emoji headings, numbered
 * lists, Pacred Tip callouts, CTA blocks). Wiring a full MDX runtime +
 * `@mdx-js/loader` adds ~150KB of build deps for no editorial gain —
 * a small frontmatter parser + the existing renderer covers it.
 *
 * Editorial contract (`content/news/<slug>.mdx`):
 *
 *   ---
 *   title: "ยินดีต้อนรับสู่ Pacred"
 *   slug: welcome-pacred                   # optional — falls back to filename
 *   excerpt: "Pacred Shipping เปิดให้บริการแล้ว..."
 *   publishedAt: 2026-05-24                # ISO YYYY-MM-DD
 *   category: ข่าวด่วน                      # ข่าวด่วน | อัปเดตบริการ | กิจกรรม
 *   image: /images/PacredNews/welcome.png   # cover (card + hero)
 *   author: Pacred Shipping                # optional
 *   inlineImage: /images/PacredNews/x.png   # optional mid-article illustration
 *   inlineImageAlt: "Alt text"
 *   inlineImageCaption: "Caption"
 *   ---
 *
 *   พาดหัวบทความ
 *
 *   ย่อหน้าแนะนำ (lead) ... <body in the markdown dialect that
 *   `<ArticleContent>` parses — see component header for syntax>
 *
 * Build behaviour:
 *   - Files are read at module load time on the server (Node).
 *   - Results are cached in module scope. SSG via `generateStaticParams`.
 *   - This file is server-only — never bundled to the client.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";

import type { PacredNews } from "@/components/sections/pacred-news-data";

const NEWS_DIR = join(process.cwd(), "content", "news");

type Frontmatter = {
  title?: string;
  slug?: string;
  excerpt?: string;
  publishedAt?: string;
  category?: string;
  image?: string;
  author?: string;
  draft?: string;
  inlineImage?: string;
  inlineImageAlt?: string;
  inlineImageCaption?: string;
};

/**
 * Minimal frontmatter parser — supports `key: value`, optional quoted strings,
 * and dates as bare ISO strings. No nested YAML, no arrays — keep it simple.
 *
 * Returns `[frontmatter, body]`. If no frontmatter block, frontmatter = {}.
 */
function parseFrontmatter(raw: string): [Frontmatter, string] {
  // Strip BOM, then normalize Windows CRLF / lone CR → LF. Editors on
  // Windows (เดฟ / ปอน) save .mdx with CRLF; without this the per-line
  // `key: value` parser leaves a trailing \r that breaks every field's
  // `(.*)$` match → frontmatter comes back empty → the article is silently
  // skipped. Normalizing here keeps the rest of the parser LF-only.
  const trimmed = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return [{}, trimmed];
  }
  const [, fmRaw, body] = match;
  const fm: Record<string, string> = {};
  for (const line of fmRaw.split("\n")) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, valueRaw] = kv;
    let value = valueRaw.trim();
    // Strip comments after unquoted values
    if (!value.startsWith('"') && !value.startsWith("'")) {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    // Unquote
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return [fm as Frontmatter, body];
}

const CATEGORIES: ReadonlySet<PacredNews["category"]> = new Set([
  "ข่าวด่วน",
  "อัปเดตบริการ",
  "กิจกรรม",
]);

function isValidCategory(c: string | undefined): c is PacredNews["category"] {
  return !!c && CATEGORIES.has(c as PacredNews["category"]);
}

/**
 * Read every `.mdx` file under `content/news/` and convert it to a
 * `PacredNews` record. Skips files whose frontmatter is incomplete
 * (logs to stderr so editors notice).
 *
 * IDs are assigned deterministically by slug-hash so they're stable
 * across builds and don't collide with the legacy in-code `PACRED_NEWS`
 * (which uses small integers). We offset MDX ids into the 10_000+ range
 * to keep `ArticleStats` localStorage keys disjoint from the in-code set
 * (the detail page already offsets news ids by +1000 — MDX ids land
 * above that, no overlap).
 */
function loadMdxNews(): PacredNews[] {
  if (!existsSync(NEWS_DIR)) return [];
  let entries: string[];
  try {
    entries = readdirSync(NEWS_DIR);
  } catch {
    return [];
  }
  const articles: PacredNews[] = [];

  for (const file of entries) {
    if (!file.endsWith(".mdx")) continue;
    const path = join(NEWS_DIR, file);
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    const raw = readFileSync(path, "utf8");
    const [fm, body] = parseFrontmatter(raw);

    // `draft: true` hides a not-yet-ready article (e.g. its own cover
    // image is still pending) from the public /news listing, detail
    // routes, and sitemap — without deleting the file. Flip the flag to
    // publish once the article is ready.
    if (fm.draft?.trim().toLowerCase() === "true") continue;

    const slug = (fm.slug?.trim() || file.replace(/\.mdx$/, "")).trim();
    const title = fm.title?.trim();
    const excerpt = fm.excerpt?.trim();
    const publishedAt = fm.publishedAt?.trim();
    const image = fm.image?.trim();
    const category = isValidCategory(fm.category)
      ? fm.category
      : ("ข่าวด่วน" as const);

    if (!title || !excerpt || !publishedAt || !image) {
      console.warn(
        `[news/mdx] skipping ${file}: missing required frontmatter ` +
          `(title=${!!title} excerpt=${!!excerpt} publishedAt=${!!publishedAt} image=${!!image})`,
      );
      continue;
    }

    articles.push({
      id: 10_000 + hash32(slug),
      slug,
      category,
      title,
      excerpt,
      image,
      inlineImage: fm.inlineImage?.trim() || undefined,
      inlineImageAlt: fm.inlineImageAlt?.trim() || undefined,
      inlineImageCaption: fm.inlineImageCaption?.trim() || undefined,
      publishedAt,
      content: body.trim(),
    });
  }

  return articles;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000; // bounded so id stays reasonable
}

let cache: PacredNews[] | null = null;

/** Cached accessor — read MDX files once per server boot. */
export function getMdxNews(): PacredNews[] {
  if (cache === null) cache = loadMdxNews();
  return cache;
}
