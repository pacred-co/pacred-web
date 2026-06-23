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
  excerpt: z.string().trim().max(600).default(""),
  coverUrl: z.string().trim().max(2000).default(""),
  body: z.string().trim().min(1, "ใส่เนื้อหาบทความ").max(60_000),
  subCategory: z.string().trim().max(40).default(""),
  // SEO overrides — blank falls back to title / excerpt on the public page.
  metaTitle: z.string().trim().max(200).default(""),
  metaDescription: z.string().trim().max(400).default(""),
});
export type SaveCmsArticleInput = z.infer<typeof saveCmsArticleSchema>;

export const cmsArticleIdSchema = z.object({ id: z.number().int().positive() });

export const rejectCmsArticleSchema = z.object({
  id: z.number().int().positive(),
  note: z.string().trim().max(600).default(""),
});
