/**
 * Zod schemas for QA/QC inspection flows — V-E10.
 *
 * Implementation contract per docs/port-specs/freight-qa-qc-inspection.md.
 *
 * V1 scope:
 *   - Warehouse staff records inspection per arrived cargo_shipment.
 *   - Outcome enum {pass, fail_minor, fail_major, waived}.
 *   - Photos uploaded to bucket 'qa-inspection-photos'.
 *   - Waive requires reason ≥5 chars + super-only role check (gate in action).
 *
 * V1 cargo-only — freight_shipment_id reserved for V-E1.
 */

import { z } from "zod";

export const QA_OUTCOMES   = ["pass", "fail_minor", "fail_major", "waived"] as const;
export const QA_DAMAGE     = ["none", "cosmetic", "partial", "total"] as const;
export type QaOutcome      = (typeof QA_OUTCOMES)[number];
export type QaDamageLevel  = (typeof QA_DAMAGE)[number];

/**
 * Create inspection.
 * - Either cargo_shipment_id OR freight_shipment_id (V1: cargo only — freight
 *   side rejected at action layer until V-E1 ships).
 * - waived_reason required when outcome='waived' (also enforced by DB CHECK).
 * - damage_level required when outcome in {fail_minor, fail_major}.
 */
export const createQaInspectionSchema = z
  .object({
    cargo_shipment_id:   z.string().uuid().optional(),
    freight_shipment_id: z.string().uuid().optional(),
    outcome:             z.enum(QA_OUTCOMES),
    damage_level:        z.enum(QA_DAMAGE).optional(),
    missing_items:       z.number().int().min(0).max(99999).default(0),
    notes:               z.string().trim().max(2000).optional(),
    waived_reason:       z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => (d.cargo_shipment_id ? 1 : 0) + (d.freight_shipment_id ? 1 : 0) === 1,
    { message: "exactly_one_parent_required", path: ["cargo_shipment_id"] },
  )
  .refine(
    (d) => d.outcome !== "waived" || (d.waived_reason && d.waived_reason.length >= 5),
    { message: "waived_reason ต้องระบุ ≥5 ตัวอักษร", path: ["waived_reason"] },
  )
  .refine(
    (d) => !["fail_minor","fail_major"].includes(d.outcome) || !!d.damage_level,
    { message: "damage_level ต้องระบุเมื่อ outcome = fail_*", path: ["damage_level"] },
  );
export type CreateQaInspectionInput = z.infer<typeof createQaInspectionSchema>;

/** Update inspection — only notes + photos are mutable; outcome is immutable. */
export const updateQaInspectionSchema = z.object({
  id:    z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
});
export type UpdateQaInspectionInput = z.infer<typeof updateQaInspectionSchema>;
