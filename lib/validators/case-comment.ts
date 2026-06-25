import { z } from "zod";

/**
 * Zod schema for public case-study comments (/our-work/[id]). Lives outside the
 * "use server" action file (which may only export async functions). ปอน 2026-06-25.
 */
export const postCaseCommentSchema = z.object({
  caseSlug: z.string().trim().min(1).max(300),
  body: z
    .string()
    .trim()
    .min(2, "พิมพ์ความคิดเห็นอย่างน้อย 2 ตัวอักษร")
    .max(2000, "ความคิดเห็นยาวเกินไป (สูงสุด 2,000 ตัวอักษร)"),
  // 1–5 star review (optional — a comment can be posted without a rating).
  rating: z.coerce.number().int().min(1).max(5).optional(),
});
export type PostCaseCommentInput = z.infer<typeof postCaseCommentSchema>;
