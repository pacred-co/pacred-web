"use server";

/**
 * AP / เบิกจ่าย ledger — WRITE-side Server Actions (Slice 2).
 * Spec: docs/research/accounting-ap-2026-07-01/spec.md · mig 0239.
 *
 * The money-OUT (AP / เบิกจ่าย / disbursement) workflow, now a first-class DB
 * ledger. This file is the write path over the NEW tables ONLY:
 *   - createApRequest   — ขอเบิก (transfer_status = 'requested')
 *   - approveApRequest  — อนุมัติ (requested → approved · gated)
 *   - markApTransferred — "โอนแล้ว" (approved → transferred · the money-OUT
 *                          REGISTER — an out-of-band bank transfer already
 *                          happened; the slip is the audit artifact). Copies
 *                          the atomic-claim guard from markShopDisbursementPaid
 *                          EXACTLY (pre-read guard + conditional UPDATE folding
 *                          the guard into WHERE + slip upload + orphan cleanup).
 *   - rejectApRequest   — ยกเลิก (requested|approved → rejected)
 *   - updateApReceiptStatus — the receipt-chase axis (a plain field edit, non-money)
 *
 * ── MONEY-SAFETY (spec §5 · the load-bearing rule) ────────────────────
 * The ONLY money table written anywhere in this file is the NEW `ap_disbursement`
 * (+ its optional `ap_disbursement_batch` wrapper). NO existing money table is
 * touched — grep this file: there is NO write to tb_wallet* / tb_payment /
 * tb_cnt_pay* / tb_user_sales_pay / tb_forwarder_invoice / tb_credit / tb_shop_pay*.
 * markApTransferred is a REGISTER (a status stamp + slip), NOT a transfer — it
 * moves ZERO baht in-app. Every mutation is confirm-before-mutate on the UI (§0f)
 * + gated `withAdmin(["accounting","super"])` (which also admits the `ultra` god
 * role via isGodRole in requireAdmin) + audited via logAdminAction.
 *
 * ── Atomic-claim discipline (the double-register guard) ───────────────
 * approve + transfer + reject all fold the expected prior status into the
 * UPDATE WHERE (`.eq("transfer_status", <expected>)`) so a concurrent click / a
 * stale tab can't double-advance the row. A 0-row result = someone else already
 * moved it → abort (and on the transfer path, remove the orphan slip).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { uploadToBucket } from "@/lib/storage/upload";
import {
  createApRequestSchema,
  approveApRequestSchema,
  rejectApRequestSchema,
  markApTransferredSchema,
  updateApReceiptStatusSchema,
} from "@/lib/validators/admin-ap-disbursement";
import { round2 } from "@/lib/admin/ap-disbursement";

/** The private bucket the AP transfer slips live in (mig 0069). */
const AP_SLIP_BUCKET = "disbursement-receipts";

// ────────────────────────────────────────────────────────────
// Helper — resolve the current Supabase user's legacy tb_admin.adminID
// (parity with shop-disbursement · stored in ap_disbursement.legacy_admin_id).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) {
    console.error("[ap-disbursement] auth.getUser failed", {
      code: authErr.code,
      message: authErr.message,
    });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error("[ap-disbursement] tb_admin lookup failed", {
      code: error.code,
      message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20);
}

/** null out an empty/whitespace string (keeps optional text cols tidy). */
function nz(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

// ════════════════════════════════════════════════════════════
// CREATE — ขอเบิก (a RECORD of intent · transfer_status = 'requested')
// Writes ONLY the ap_disbursement row. No bank transfer, no slip, no
// existing-money-table side-effect (spec §5 Slice 1).
// ════════════════════════════════════════════════════════════
export async function createApRequest(
  input: unknown,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createApRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const v = parsed.data;

  return withAdmin<{ id: string }>(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 30);

    // If a batch is referenced, verify it exists (FK is ON DELETE SET NULL, so
    // a bad id would silently null — reject early for a clear error instead).
    if (v.batch_id) {
      const { data: batch, error: batchErr } = await admin
        .from("ap_disbursement_batch")
        .select("id")
        .eq("id", v.batch_id)
        .maybeSingle<{ id: string }>();
      if (batchErr) {
        console.error("[ap-disbursement create] batch lookup failed", {
          code: batchErr.code,
          message: batchErr.message,
        });
        return { ok: false, error: batchErr.message };
      }
      if (!batch) return { ok: false, error: "ไม่พบใบเบิก (batch) ที่อ้างถึง" };
    }

    const row = {
      batch_id: v.batch_id ?? null,
      lane: v.lane,
      entity: v.entity,
      shipment_no: nz(v.shipment_no),
      quotation_no: nz(v.quotation_no),
      invoice_no: nz(v.invoice_no),
      receipt_no: nz(v.receipt_no),
      container_no: nz(v.container_no),
      customer_id: nz(v.customer_id),
      line_name: nz(v.line_name),
      category: v.category,
      item_label: v.item_label,
      expense_category: nz(v.expense_category),
      note: nz(v.note),
      is_customer_named_receipt: v.is_customer_named_receipt,
      amount_withdraw: round2(v.amount_withdraw ?? 0),
      amount_refund: round2(v.amount_refund ?? 0),
      amount_gross: v.amount_gross != null ? round2(v.amount_gross) : null,
      wht_pct: v.wht_pct ?? null,
      wht_cert_no: nz(v.wht_cert_no),
      source_account_key: v.source_account_key ?? null,
      payee_name: nz(v.payee_name),
      payee_account_no: nz(v.payee_account_no),
      payee_bank: nz(v.payee_bank),
      pay_channel: nz(v.pay_channel),
      transfer_status: "requested" as const,
      receipt_status: v.receipt_status,
      requested_by: adminId,
      requested_at: new Date().toISOString(),
      legacy_admin_id: legacyAdminId,
    };

    const { data: created, error: insErr } = await admin
      .from("ap_disbursement")
      .insert(row)
      .select("id")
      .single<{ id: string }>();
    if (insErr) {
      console.error("[ap-disbursement create] insert failed", {
        code: insErr.code,
        message: insErr.message,
      });
      return { ok: false, error: insErr.message };
    }

    await logAdminAction(adminId, "ap_disbursement.create", "ap_disbursement", created.id, {
      legacy_admin_id: legacyAdminId,
      lane: v.lane,
      entity: v.entity,
      category: v.category,
      amount_withdraw: row.amount_withdraw,
      amount_refund: row.amount_refund,
      shipment_no: row.shipment_no,
    });

    revalidatePath("/admin/accounting/ap");
    return { ok: true, data: { id: created.id } };
  });
}

// ════════════════════════════════════════════════════════════
// APPROVE — อนุมัติ (requested → approved · the gate BEFORE pay)
// Writes ONLY the status/approver on the ap_disbursement row. No money.
// Atomic guard: fold transfer_status='requested' into the UPDATE WHERE.
// ════════════════════════════════════════════════════════════
export async function approveApRequest(
  input: unknown,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = approveApRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin<{ id: string }>(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // pre-read guard — must still be 'requested'.
    const { data: cur, error: rowErr } = await admin
      .from("ap_disbursement")
      .select("id, transfer_status")
      .eq("id", id)
      .maybeSingle<{ id: string; transfer_status: string | null }>();
    if (rowErr) {
      console.error("[ap-disbursement approve] lookup failed", { id, code: rowErr.code, message: rowErr.message });
      return { ok: false, error: rowErr.message };
    }
    if (!cur) return { ok: false, error: "ไม่พบรายการเบิกจ่าย" };
    if (cur.transfer_status !== "requested") {
      return {
        ok: false,
        error: `รายการนี้สถานะไม่ใช่ 'ต้องการเบิก' (สถานะ=${cur.transfer_status}) — อนุมัติได้เฉพาะรายการที่รออนุมัติ`,
      };
    }

    // atomic conditional flip 'requested' → 'approved'.
    const { data: updated, error: updErr } = await admin
      .from("ap_disbursement")
      .update({ transfer_status: "approved", approved_by: adminId, approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("transfer_status", "requested")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error("[ap-disbursement approve] update failed", { id, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }
    if (!updated) {
      return { ok: false, error: "รายการถูกดำเนินการไปแล้ว (มีผู้ทำรายการพร้อมกัน) — กรุณารีเฟรช" };
    }

    await logAdminAction(adminId, "ap_disbursement.approve", "ap_disbursement", id, {
      fromStatus: "requested",
      toStatus: "approved",
    });

    revalidatePath("/admin/accounting/ap");
    revalidatePath(`/admin/accounting/ap/${id}`);
    return { ok: true, data: { id } };
  });
}

// ════════════════════════════════════════════════════════════
// REJECT — ยกเลิก (requested|approved → rejected)
// Writes ONLY the status on the ap_disbursement row. No money.
// ════════════════════════════════════════════════════════════
export async function rejectApRequest(
  input: unknown,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = rejectApRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, reason } = parsed.data;

  return withAdmin<{ id: string }>(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // pre-read guard — can only reject a not-yet-transferred, not-already-rejected row.
    const { data: cur, error: rowErr } = await admin
      .from("ap_disbursement")
      .select("id, transfer_status")
      .eq("id", id)
      .maybeSingle<{ id: string; transfer_status: string | null }>();
    if (rowErr) {
      console.error("[ap-disbursement reject] lookup failed", { id, code: rowErr.code, message: rowErr.message });
      return { ok: false, error: rowErr.message };
    }
    if (!cur) return { ok: false, error: "ไม่พบรายการเบิกจ่าย" };
    if (cur.transfer_status === "transferred") {
      return { ok: false, error: "รายการนี้โอนแล้ว ยกเลิกไม่ได้ (ต้องบันทึกรายการคืนแทน)" };
    }
    if (cur.transfer_status === "rejected") {
      return { ok: false, error: "รายการนี้ถูกยกเลิกไปแล้ว" };
    }

    // atomic flip — only from the exact status we read (requested or approved).
    const { data: updated, error: updErr } = await admin
      .from("ap_disbursement")
      .update({ transfer_status: "rejected", note: reason ? nz(reason) : undefined })
      .eq("id", id)
      .eq("transfer_status", cur.transfer_status)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error("[ap-disbursement reject] update failed", { id, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }
    if (!updated) {
      return { ok: false, error: "รายการถูกดำเนินการไปแล้ว (มีผู้ทำรายการพร้อมกัน) — กรุณารีเฟรช" };
    }

    await logAdminAction(adminId, "ap_disbursement.reject", "ap_disbursement", id, {
      fromStatus: cur.transfer_status,
      toStatus: "rejected",
      reason: nz(reason ?? null),
    });

    revalidatePath("/admin/accounting/ap");
    revalidatePath(`/admin/accounting/ap/${id}`);
    return { ok: true, data: { id } };
  });
}

// ════════════════════════════════════════════════════════════
// TRANSFERRED — "โอนแล้ว" (approved → transferred · the money-OUT REGISTER)
//
// ⚠️ MONEY REGISTER, not a transfer. The bank transfer already happened
// out-of-band (K-Shop scan / manual transfer); the slip is the audit artifact.
// This stamps the ap_disbursement row (status + transferred_at + slip + payer)
// and moves ZERO baht in-app. Copies markShopDisbursementPaid EXACTLY:
//   1. pre-read guard: must still be 'approved'
//   2. slip upload to the private bucket 'disbursement-receipts'
//   3. atomic conditional UPDATE folding .eq("transfer_status","approved")
//      into WHERE → 0 rows = a concurrent transfer won → remove orphan slip
//   4. logAdminAction
// No wallet/commission/receipt/ledger side-effect (spec §5 Slice 2 discipline).
// ════════════════════════════════════════════════════════════
export async function markApTransferred(
  input: unknown,
  slipImage: File,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = markApTransferredSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, transferred_at } = parsed.data;

  // Slip is REQUIRED to register a transfer (the audit artifact — same rule as
  // markShopDisbursementPaid: no slip, no register).
  if (!(slipImage instanceof File) || slipImage.size === 0) {
    return { ok: false, error: "กรุณาแนบหลักฐานการโอน (สลิปจ่ายเงิน)" };
  }

  return withAdmin<{ id: string }>(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 30);

    // ── (1) pre-read guard: must still be an 'approved' row (approve gate first) ──
    const { data: row, error: rowErr } = await admin
      .from("ap_disbursement")
      .select("id, transfer_status")
      .eq("id", id)
      .maybeSingle<{ id: string; transfer_status: string | null }>();
    if (rowErr) {
      console.error("[ap-disbursement transfer] lookup failed", { id, code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการเบิกจ่าย" };
    if (row.transfer_status === "transferred") {
      return { ok: false, error: "รายการนี้บันทึกการโอนไปแล้ว (transferred)" };
    }
    if (row.transfer_status !== "approved") {
      return {
        ok: false,
        error: `รายการนี้ต้องอนุมัติก่อนจึงบันทึกการโอนได้ (สถานะปัจจุบัน=${row.transfer_status})`,
      };
    }

    // ── (2) upload the slip (private bucket disbursement-receipts) ──
    const up = await uploadToBucket(slipImage, AP_SLIP_BUCKET, `admin/ap-transfer/${id}`);
    if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };
    const slipPath = up.filename;

    // ── (3) atomic conditional UPDATE — TOCTOU guard folded into WHERE ──
    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from("ap_disbursement")
      .update({
        transfer_status: "transferred",
        transferred_at: transferred_at ?? nowIso,
        transfer_slip_path: slipPath,
        paid_by: adminId,
        legacy_admin_id: legacyAdminId,
      })
      .eq("id", id)
      .eq("transfer_status", "approved")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error("[ap-disbursement transfer] update failed", { id, code: updErr.code, message: updErr.message });
      // remove the just-uploaded slip so a retry is clean.
      await admin.storage.from(AP_SLIP_BUCKET).remove([slipPath]);
      return { ok: false, error: updErr.message };
    }
    if (!updated) {
      // 0 rows — a concurrent transfer won the race; clean up the orphan slip.
      await admin.storage.from(AP_SLIP_BUCKET).remove([slipPath]);
      return { ok: false, error: "รายการถูกบันทึกการโอนไปแล้วโดยผู้อื่น (กรุณารีเฟรช)" };
    }

    await logAdminAction(adminId, "ap_disbursement.transfer", "ap_disbursement", id, {
      legacy_admin_id: legacyAdminId,
      slipPath,
      fromStatus: "approved",
      toStatus: "transferred",
    });

    revalidatePath("/admin/accounting/ap");
    revalidatePath(`/admin/accounting/ap/${id}`);
    return { ok: true, data: { id } };
  });
}

// ════════════════════════════════════════════════════════════
// RECEIPT-CHASE — the SECOND, independent status axis (สถานะการตามใบเสร็จ).
// A plain field edit — NON-money (does not touch the transfer axis at all).
// ════════════════════════════════════════════════════════════
export async function updateApReceiptStatus(
  input: unknown,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = updateApReceiptStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, receipt_status } = parsed.data;

  return withAdmin<{ id: string }>(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: updated, error: updErr } = await admin
      .from("ap_disbursement")
      .update({ receipt_status })
      .eq("id", id)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error("[ap-disbursement receipt-status] update failed", { id, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }
    if (!updated) return { ok: false, error: "ไม่พบรายการเบิกจ่าย" };

    await logAdminAction(adminId, "ap_disbursement.receipt_status", "ap_disbursement", id, { receipt_status });
    revalidatePath(`/admin/accounting/ap/${id}`);
    revalidatePath("/admin/accounting/ap");
    return { ok: true, data: { id } };
  });
}
