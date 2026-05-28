/**
 * Zod schemas + enums for the REBUILT QA/QC inspection module (P0 #2 ·
 * 2026-05-21 ค่ำ Wave 3D). Co-located here instead of in the
 * `"use server"` action file because Next.js rejects non-async exports
 * from "use server" modules (see actions/admin/qa-inspections.ts header
 * comment).
 *
 * NOTE: `lib/validators/qa-inspection.ts` still holds the legacy V-E10
 * cargo_shipments schema (referenced by `lib/validators/qa-inspection.test.ts`).
 * We use a NEW file (qa-inspection-rebuilt.ts) so the legacy tests keep
 * passing and the new tb_forwarder spine schemas stay separable.
 *
 * Verdict enum (REBUILT · tb_forwarder spine):
 *   pass         — ผ่าน (ส่งต่อได้)
 *   fail         — ตก (สี/ไซส์ผิด · ต้องคุยลูกค้า/supplier)
 *   hold         — กักไว้ (รอลูกค้าตัดสินใจ refund/replacement)
 *   fake_product — ของปลอม · ห้ามส่งต่อ · Blacklist (Guidebook L451-454)
 */

import { z } from "zod";

export const QA_VERDICTS = ["pass", "fail", "hold", "fake_product"] as const;
export type QaVerdict = (typeof QA_VERDICTS)[number];

/** Create a QA inspection. forwarder_f_no = tb_forwarder.id (bigint). */
export const createQaInspectionSchema = z.object({
  forwarder_f_no: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "เลขนำเข้า (f_no) ไม่ถูกต้อง",
        });
        return z.NEVER;
      }
      return n;
    }),
  verdict:        z.enum(QA_VERDICTS),
  notes:          z.string().trim().max(2000).optional(),
  photo_urls:     z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  blacklist_shop: z.boolean().optional(),
});
export type CreateQaInspectionInput = z.input<typeof createQaInspectionSchema>;

export const updateQaInspectionSchema = z
  .object({
    id:             z.string().uuid(),
    verdict:        z.enum(QA_VERDICTS).optional(),
    notes:          z.string().trim().max(2000).optional(),
    blacklist_shop: z.boolean().optional(),
  })
  .refine(
    (d) => d.verdict !== undefined || d.notes !== undefined || d.blacklist_shop !== undefined,
    { message: "no_fields_to_update", path: ["id"] },
  );
export type UpdateQaInspectionInput = z.input<typeof updateQaInspectionSchema>;
