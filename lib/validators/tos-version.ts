/**
 * Zod schemas for V-G4 TOS version management.
 */

import { z } from "zod";

export const TOS_SCOPES = ["all", "cargo_only", "freight_only"] as const;
export type TosScope = (typeof TOS_SCOPES)[number];

export const TOS_SCOPE_LABEL: Record<TosScope, string> = {
  all:          "ใช้ทุกบริการ",
  cargo_only:   "เฉพาะ cargo",
  freight_only: "เฉพาะ freight",
};

export const createTosVersionSchema = z.object({
  version_no: z
    .string()
    .trim()
    .min(1, "version_no required")
    .max(40, "version_no ยาวเกินไป")
    .regex(/^[\w.\-]+$/, "version_no ใช้ได้แค่ a-zA-Z0-9._-"),
  title:          z.string().trim().min(1, "title required").max(200),
  body_md:        z.string().min(1, "body_md required").max(200_000),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effective_from ต้องเป็น YYYY-MM-DD"),
  applies_to:     z.enum(TOS_SCOPES).default("all"),
  is_active:      z.boolean().optional().default(false),
});
export type CreateTosVersionInput = z.infer<typeof createTosVersionSchema>;

export const updateTosVersionSchema = z.object({
  id:             z.string().uuid(),
  title:          z.string().trim().min(1).max(200).optional(),
  body_md:        z.string().min(1).max(200_000).optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  applies_to:     z.enum(TOS_SCOPES).optional(),
  is_active:      z.boolean().optional(),
});
export type UpdateTosVersionInput = z.infer<typeof updateTosVersionSchema>;
