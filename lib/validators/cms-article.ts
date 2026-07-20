import { z } from "zod";

/**
 * Zod schemas + shared enums for the no-code article CMS (owner 2026-06-23).
 * Lives outside the "use server" action file (which may only export async fns).
 */

export const CMS_CATEGORIES = ["knowledge", "news", "our_work"] as const;
export type CmsCategory = (typeof CMS_CATEGORIES)[number];

/** Category → its Thai label + the public route it publishes to. */
export const CMS_CATEGORY_META: Record<CmsCategory, { label: string; path: string }> = {
  knowledge: { label: "สาระน่ารู้",   path: "/knowledge" },
  news:      { label: "ข่าวสาร",      path: "/news" },
  our_work:  { label: "ผลงานของเรา",  path: "/our-work" },
};

/** Knowledge badge options — mirror the public /knowledge CATEGORIES. */
export const KNOWLEDGE_SUBCATS = ["นำเข้า", "เคลียร์", "ส่งออก"] as const;

/** News badge options — mirror the public /news category badges. */
export const NEWS_SUBCATS = ["ข่าวด่วน", "อัปเดตบริการ", "กิจกรรม"] as const;

/**
 * URL slug from a title — KEEPS Thai (owner 2026-07-20 "ตั้งชื่อ url ได้ · มี
 * แพทเทิร์นแบบเดิมให้ก่อน แล้วแก้ไขได้").
 *
 * The published cases seeded before the editor existed use readable Thai slugs
 * ("ชิปปิ้ง-เคลียร์สินค้า-พิธีการศุลกากร-กวางโจว-สุวรรณภูมิ-โคมไฟ-led"), but the
 * old generator matched `[^a-z0-9\s-]` which strips every Thai character — a
 * Thai-only title slugified to "" and fell back to `article-<rand>`. That is why
 * cms_articles #49 (written in the admin editor) reads `article-f2lgjk` while
 * #45-48 (seeded) read properly. `\p{L}` keeps letters of ANY script, so a Thai
 * title now yields the same shape as the seeded ones.
 */
export function slugifyTitle(title: string): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "") // zero-width junk from pasted text
    // Letters (any script) + digits + space/dash. \p{M} is REQUIRED for Thai:
    // สระ/วรรณยุกต์ (ิ ี ุ ์ ่ ้) are Marks, not Letters — without it "ชิปปิ้ง"
    // slugifies to "ชปปง" (verified: it did, before this was added).
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
}

/** The canonical ข้อมูลขนส่ง labels a case page knows how to group + icon.
 *  Free-text labels still work, but they fall into "รายละเอียดเพิ่มเติม" with a
 *  generic icon — these are the ones that land in the right group (mirrors
 *  lib/reviews/catalog.ts + the groupCaseFacts regex on the case page). */
export const CASE_FACT_LABELS = [
  "บริการ / ช่องทาง",
  "Term",
  "Port / เส้นทาง",
  "เขตจัดส่ง",
  "รถขนส่ง",
  "แรงงาน",
  "สินค้า",
  "ระยะเวลาดำเนินการ",
  "HS Code",
] as const;

export const CMS_STATUSES = ["draft", "pending", "published", "rejected"] as const;
export type CmsStatus = (typeof CMS_STATUSES)[number];

export const CMS_STATUS_LABEL: Record<CmsStatus, string> = {
  draft:     "ร่าง",
  pending:   "รออนุมัติ",
  published: "เผยแพร่แล้ว",
  rejected:  "ตีกลับ",
};

export const saveCmsArticleSchema = z.object({
  id: z.number().int().positive().optional(), // present → update; absent → create
  category: z.enum(CMS_CATEGORIES),
  title: z.string().trim().min(1, "ใส่หัวข้อบทความ").max(300),
  // The URL. Blank → derived from the title (slugifyTitle). Sanitised again on
  // the server so a hand-typed value can never contain "/" or spaces.
  slug: z.string().trim().max(160).default(""),
  excerpt: z.string().trim().max(600).default(""),
  coverUrl: z.string().trim().max(2000).default(""),
  // body optional for our_work (gallery + video may be the primary content).
  body: z.string().trim().max(60_000).default(""),
  subCategory: z.string().trim().max(40).default(""),
  // SEO overrides — blank falls back to title / excerpt on the public page.
  metaTitle: z.string().trim().max(200).default(""),
  metaDescription: z.string().trim().max(400).default(""),
  // Free-form tags (HS code · product category …) — the /our-work filter bar.
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  // our_work media — ignored (saved as empty) for knowledge / news.
  videoUrl: z.string().trim().max(2000).default(""),
  galleryImages: z.array(z.string().trim().max(2000)).max(20).default([]),
  // our_work case-study pattern fields (mig 0213) — match the website case page.
  casePrice: z.string().trim().max(80).default(""),          // "เริ่ม $500"
  caseRating: z.number().min(0).max(5).nullable().default(null),
  caseRoute: z.string().trim().max(120).default(""),         // "กวางโจว → แหลมฉบัง"
  caseFacts: z
    .array(z.object({ label: z.string().trim().max(60), value: z.string().trim().max(200) }))
    .max(20)
    .default([]),
  // ── English translation (mig 0265) — blank = fall back to Thai on the public
  //    page. Language-NEUTRAL fields (slug · cover · gallery · video · rating ·
  //    tags) are deliberately shared, so one case stays one URL with one set of
  //    view/like/share counters and one comment thread.
  titleEn: z.string().trim().max(300).default(""),
  excerptEn: z.string().trim().max(600).default(""),
  bodyEn: z.string().trim().max(60_000).default(""),
  metaTitleEn: z.string().trim().max(200).default(""),
  metaDescriptionEn: z.string().trim().max(400).default(""),
  caseRouteEn: z.string().trim().max(120).default(""),
  casePriceEn: z.string().trim().max(80).default(""),
  caseFactsEn: z
    .array(z.object({ label: z.string().trim().max(60), value: z.string().trim().max(200) }))
    .max(20)
    .default([]),
});
export type SaveCmsArticleInput = z.infer<typeof saveCmsArticleSchema>;
export type CaseFact = { label: string; value: string };

export const cmsArticleIdSchema = z.object({ id: z.number().int().positive() });

export const rejectCmsArticleSchema = z.object({
  id: z.number().int().positive(),
  note: z.string().trim().max(600).default(""),
});
