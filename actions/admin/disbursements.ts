"use server";

/**
 * U2-2 · Container disbursements (AP ledger) — STUB (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * `container_disbursements` FK'd to the retired spine table `cargo_containers`
 * (migration 0033/0069). Under D1 Option A the spine was retired in Wave 2;
 * the AP ledger module is deferred to Phase C when the legacy `tb_bill` /
 * `tb_bill_item` disbursement workflow can be faithfully ported.
 *
 * The admin UI `/admin/accounting/disbursements` is already a tombstone
 * (see the matching page.tsx). These server actions preserve their shapes
 * so any mid-flight client-component bundle still compiles + reports a
 * clear deprecation error.
 *
 * RBAC unchanged: super + accounting only.
 */

import { z } from "zod";
import { withAdmin, type AdminActionResult } from "./common";

// Kept for type compatibility — disbursement-form.tsx imports DisbursementKind.
const KINDS = [
  "freight", "customs_duty", "handling", "fuel", "storage",
  "trucking", "container_lease", "other",
] as const;
export type DisbursementKind = (typeof KINDS)[number];

const DEPRECATION_ERROR =
  "AP Ledger (container disbursements) ถูกพักการใช้งานใน Wave 3 — บันทึก disbursement ผ่าน legacy tb_bill / tb_bill_item ในระบบ PCS Cargo จนกว่าจะ port faithful ใน Phase C";

const createSchema = z.object({
  cargo_container_id: z.string().uuid(),
  kind:               z.enum(KINDS),
  amount_thb:         z.number().positive("amount ต้องมากกว่า 0").max(50_000_000),
  vendor_name:        z.string().trim().min(1).max(200),
  invoice_no:         z.string().trim().max(100).optional(),
  paid_at:            z.string().datetime({ offset: true }).optional(),
  attachment_path:    z.string().trim().max(500).optional(),
  note:               z.string().trim().max(2000).optional(),
}).refine(
  (d) => d.kind !== "other" || (d.note && d.note.trim().length > 0),
  { message: "kind=other ต้องระบุ note อธิบายค่าใช้จ่ายนี้", path: ["note"] },
);
export type CreateDisbursementInput = z.infer<typeof createSchema>;

export async function adminCreateDisbursement(
  _input: CreateDisbursementInput,
): Promise<AdminActionResult<{ id: string }>> {
  return withAdmin(["super", "accounting"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

const updateSchema = z.object({
  id:              z.string().uuid(),
  kind:            z.enum(KINDS).optional(),
  amount_thb:      z.number().positive().max(50_000_000).optional(),
  vendor_name:     z.string().trim().min(1).max(200).optional(),
  // nullable fields — caller may pass null to CLEAR an existing value
  invoice_no:      z.string().trim().max(100).nullable().optional(),
  paid_at:         z.string().datetime({ offset: true }).nullable().optional(),
  attachment_path: z.string().trim().max(500).nullable().optional(),
  note:            z.string().trim().max(2000).nullable().optional(),
});
export type UpdateDisbursementInput = z.infer<typeof updateSchema>;

export async function adminUpdateDisbursement(
  _input: UpdateDisbursementInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "accounting"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

const deleteSchema = z.object({
  id:     z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type DeleteDisbursementInput = z.infer<typeof deleteSchema>;

export async function adminDeleteDisbursement(
  _input: DeleteDisbursementInput,
): Promise<AdminActionResult> {
  return withAdmin(["super"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}
