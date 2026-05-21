"use server";

/**
 * QA/QC inspection admin actions — V-E10. STUB (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * The V-E10 QA module was built on the retired spine table `cargo_shipments`
 * + the `freight_qa_inspections` table that FK'd it. Under D1 Option A the
 * spine was retired in Wave 2; this module is deferred to Phase C when a
 * faithful port of legacy ตรวจสอบสินค้า workflow can be built on the
 * `tb_forwarder` + `tb_forwarder_items` shape.
 *
 * The admin UI `/admin/warehouse/qa-inspections` is already a tombstone (see
 * `app/[locale]/(admin)/admin/warehouse/qa-inspections/page.tsx`). Server
 * actions exported from this file now return a clear deprecation error so any
 * mid-flight client bundle that still calls them surfaces the issue instead
 * of writing to a vanished table. The QA gate consumer
 * `isCargoShipmentQaPassed()` returns `false` (no inspection = blocked).
 *
 * Replaced by: legacy ตรวจสอบสินค้า workflow in PCS Cargo until Phase C.
 */

import { withAdmin, type AdminActionResult } from "./common";
import type {
  CreateQaInspectionInput,
  UpdateQaInspectionInput,
} from "@/lib/validators/qa-inspection";

const DEPRECATION_ERROR =
  "โมดูล QA inspection (V-E10) ถูกพักการใช้งานใน Wave 3 — จะกลับมาใน Phase C เมื่อ port workflow ตรวจสอบสินค้าจากระบบเดิม";

// ────────────────────────────────────────────────────────────
// 1) Create QA inspection — STUB
// ────────────────────────────────────────────────────────────

type CreateResult = {
  id:             string;
  inspection_no:  string;
};

export async function createQaInspection(
  _input: CreateQaInspectionInput,
): Promise<AdminActionResult<CreateResult>> {
  return withAdmin(["super", "accounting", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Update inspection notes — STUB
// ────────────────────────────────────────────────────────────

export async function updateQaInspectionNotes(
  _input: UpdateQaInspectionInput,
): Promise<AdminActionResult<void>> {
  return withAdmin(["super", "accounting", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Upload QA photo — STUB
// ────────────────────────────────────────────────────────────

export async function uploadQaPhoto(
  _inspectionId: string,
  _file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  return withAdmin(["super", "accounting", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Billing-gate consumer — STUB (returns false = blocked)
// ────────────────────────────────────────────────────────────

/**
 * Returns true if a cargo_shipment is cleared for billing per QA gate.
 *
 * STUB: V-E10 is deferred to Phase C. With the spine retired, there is no
 * `cargo_shipments` table to look up an inspection against. We return
 * `false` (block) by default — V-E7 freight invoicing (when revived) must
 * route through the legacy ตรวจสอบสินค้า workflow.
 */
export async function isCargoShipmentQaPassed(
  _cargo_shipment_id: string,
): Promise<boolean> {
  return false;
}
