"use server";

/**
 * Manual "ออกใบเสร็จ" for a PAID ฝากนำเข้า order that has no receipt yet (owner 2026-07-15).
 *
 * The pay-on-behalf + slip-approve paths already mint a receipt via
 * autoIssueReceiptOnPaymentLand, but it is best-effort — a transient failure (or an
 * older payment made before that code) leaves a paid order with money taken and NO
 * receipt (real: PR215/PR217). This lets staff close the loop themselves: one click
 * issues the receipt (idempotent — returns the existing one if any active receipt
 * already covers the order).
 *
 * Money-safe: mints the audit-of-record for money ALREADY taken; it does not move any
 * money. Only allowed once the order is settled (fstatus ≥ 6 · เตรียมส่ง/สำเร็จ).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";

const RECEIPT_ROLES = ["super", "accounting", "ops", "sales", "sales_admin", "freight_import_doc", "freight_export_doc"] as const;

export async function adminIssueReceiptForForwarder(
  fid: number,
): Promise<AdminActionResult<{ receiptId: number | null; rid: string | null; alreadyIssued: boolean }>> {
  if (!Number.isInteger(fid) || fid <= 0) return { ok: false, error: "invalid_fid" };
  return withAdmin<{ receiptId: number | null; rid: string | null; alreadyIssued: boolean }>(
    [...RECEIPT_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const { data: f, error } = await admin
        .from("tb_forwarder")
        .select("id, userid, fstatus")
        .eq("id", fid)
        .maybeSingle<{ id: number; userid: string; fstatus: string | null }>();
      if (error) {
        console.error("[adminIssueReceiptForForwarder read]", { fid, code: error.code, message: error.message });
        return { ok: false, error: error.message };
      }
      if (!f) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
      // Only issue the record-of-payment for a SETTLED order (fstatus ≥ 6 = เตรียมส่ง/กำลังจัดส่ง/สำเร็จ).
      const st = parseInt(f.fstatus ?? "0", 10);
      if (!Number.isFinite(st) || st < 6) {
        return { ok: false, error: "ออเดอร์นี้ยังไม่ได้ชำระเงิน — ออกใบเสร็จได้เมื่อเก็บเงินแล้ว (สถานะ ≥ เตรียมส่ง)" };
      }

      const r = await autoIssueReceiptOnPaymentLand(admin, {
        userid: f.userid,
        fids: [fid],
        dateSlip: new Date(),
        source: "manual.issue-receipt",
      });
      // alreadyIssued (a non-cancelled receipt already covers it) lives on the FAILURE
      // variant of the union → narrow via !r.ok before reading it. It's an idempotent success.
      const already = !r.ok && r.alreadyIssued === true;
      if (!r.ok && !already) {
        console.error("[adminIssueReceiptForForwarder issue]", { fid, error: r.error });
        return { ok: false, error: `ออกใบเสร็จไม่สำเร็จ: ${r.error ?? "unknown"}` };
      }

      await logAdminAction(adminId, "forwarder.issue_receipt", "tb_forwarder", String(fid), {
        rid: r.ok ? r.data.rid : null, alreadyIssued: already,
      });
      revalidatePath(`/admin/forwarders/${fid}`);
      revalidatePath("/admin/wallet/pay-user");
      revalidatePath("/[locale]/(admin)/admin/accounting/receipts", "page");
      return {
        ok: true,
        data: {
          receiptId: r.ok ? r.data.receiptId : null,
          rid: r.ok ? r.data.rid : null,
          alreadyIssued: already,
        },
      };
    },
  );
}
