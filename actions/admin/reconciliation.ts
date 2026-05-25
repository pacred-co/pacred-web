"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

/**
 * V-A3 — Payment ↔ Order reconciliation actions (chat ops forensics).
 *
 * Today: a customer pays a forwarder via wallet_tx, but the forwarder
 * row sometimes stays at status='pending_payment' (data drift from PHP
 * imports OR a transient flow break). Result: "เครดิตค้างนำเข้า" piles
 * up and accountant escalates to dev to update SQL by hand.
 *
 * V-A3 surfaces these mismatches on /admin/accounting/reconcile and
 * provides one-click resolution where it's safe.
 *
 * RBAC: super OR accounting (these are money-state mutations).
 */

// ────────────────────────────────────────────────────────────
// AUTO-CLEAR: forwarder still pending_payment but completed wallet_tx
// for that f_no exists → flip to shipped_china, log + notify customer.
// ────────────────────────────────────────────────────────────

const autoClearSchema = z.object({
  f_no: z.string().min(1),
});

export async function adminAutoClearForwarderPayment(
  input: z.infer<typeof autoClearSchema>,
): Promise<AdminActionResult<{ from_status: string; to_status: string; tx_id: string }>> {
  const parsed = autoClearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  type Result = { from_status: string; to_status: string; tx_id: string };
  return withAdmin<Result>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: f, error: fErr } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, status, total_price")
      .eq("f_no", parsed.data.f_no)
      .maybeSingle<{ id: string; f_no: string; profile_id: string; status: string; total_price: number }>();
    if (fErr) {
      console.error(`[forwarders mutation lookup] failed`, { code: fErr.code, message: fErr.message });
      return { ok: false, error: `db_error:${fErr.code ?? "unknown"}` };
    }
    if (!f) return { ok: false, error: "forwarder_not_found" };

    if (f.status !== "pending_payment") {
      return {
        ok: false,
        error: `forwarder ${f.f_no} ไม่ได้อยู่ pending_payment (ปัจจุบัน: ${f.status}) — ไม่ต้อง auto-clear`,
      };
    }

    // Confirm a completed wallet_tx exists with full amount match
    const { data: tx, error: txErr } = await admin
      .from("wallet_transactions")
      .select("id, amount")
      .eq("reference_type", "forwarder")
      .eq("reference_id",   f.f_no)
      .eq("kind",           "import_payment")
      .eq("status",         "completed")
      .maybeSingle<{ id: string; amount: number }>();
    if (txErr) {
      console.error(`[wallet_transactions mutation lookup] failed`, { code: txErr.code, message: txErr.message });
      return { ok: false, error: `db_error:${txErr.code ?? "unknown"}` };
    }
    if (!tx) {
      return { ok: false, error: "ไม่พบ wallet_tx completed สำหรับ forwarder นี้ — ไม่ใช่ mismatch ที่ auto-clear ได้" };
    }

    // Sanity: tx.amount should match -total_price (debit). Tolerate small rounding.
    const expectedDebit = -Number(f.total_price);
    if (Math.abs(Number(tx.amount) - expectedDebit) > 0.01) {
      return {
        ok: false,
        error: `จำนวน wallet_tx (${tx.amount}) ไม่ตรงกับยอด forwarder (${expectedDebit}) — ตรวจมือก่อน, อย่า auto-clear`,
      };
    }

    const { error: updErr } = await admin
      .from("forwarders")
      .update({
        status:             "shipped_china",
        date_shipped_china: new Date().toISOString(),
        admin_id_update:    adminId,
      })
      .eq("id", f.id)
      .eq("status", "pending_payment");          // race-safe optimistic
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "forwarder.auto_clear_payment", "forwarder", f.id, {
      f_no:        f.f_no,
      from_status: "pending_payment",
      to_status:   "shipped_china",
      tx_id:       tx.id,
      reason:      "V-A3 reconciliation auto-clear (completed wallet_tx existed)",
    });

    void sendNotification(f.profile_id, {
      category: "forwarder",
      severity: "success",
      title:    `ฝากนำเข้า ${f.f_no} ปรับสถานะแล้ว`,
      body:     `ตรวจพบการชำระจาก wallet ก่อนหน้า — เปลี่ยนสถานะเป็น "ออกจากจีน" อัตโนมัติ`,
      link_href: `/service-import/${f.f_no}`,
      reference_type: "forwarder",
      reference_id:   f.id,
    });

    revalidatePath("/admin/accounting/reconcile");
    revalidatePath(`/admin/forwarders/${f.f_no}`);
    revalidatePath("/admin/forwarders");
    return { ok: true, data: { from_status: "pending_payment", to_status: "shipped_china", tx_id: tx.id } };
  });
}

// ────────────────────────────────────────────────────────────
// FLAG MISMATCH (informational only — no auto-fix; staff investigates)
// Future: extend with adminMarkInvestigated(f_no, note) once we know the
// most common resolutions. V1 just lists them for visibility.
// ────────────────────────────────────────────────────────────
