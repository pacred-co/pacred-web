"use server";

/**
 * Wave 19 BUG #3 — Server actions for the `/admin/wallet/[id]` topup-detail
 * edit form (faithful port of `pcs-admin/include/pages/wallet/w-s-deposit-detail.php`).
 *
 * Three actions:
 *   1. adminUpdateWalletHsDateSlip — admin types the correct "วันที่โอน
 *      ในสลิป" before approving (legacy form `updateDate`). This unlocks the
 *      similar-transaction detector + the auto-receipt date.
 *   2. adminApproveWalletHs        — approve the topup (status 1 → 2) + credit
 *      tb_wallet.wallettotal. Mirrors `adminBulkApproveWalletHs` semantics
 *      (already in tb-bulk.ts L41-154) but for a single row triggered from
 *      the detail page.
 *   3. adminRejectWalletHs         — reject the topup (status 1 → 3) without
 *      any wallet adjustment.
 *
 * Why a NEW file (separate from wallet-hs.ts):
 *   wallet-hs.ts owns the manual-CREATE action; this file owns single-row
 *   UPDATE actions on existing rows. Keeping them apart so the next agent
 *   that retires either flow can delete one file cleanly.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L6159
 *   (tb_wallet_hs) + L6135 (tb_wallet · per-customer balance row).
 *
 * Status convention (legacy comment L6213):
 *   '1' pending · '2' approved · '3' rejected
 *
 * Type convention (legacy comment L6220):
 *   type='1' deposit · '2'=order pay · '3'=withdraw · '4'=order pay forwarder
 *   · '5'=refund · '6'=transfer · '7'=pending-topup
 *   typenew='1'=deposit · '2'=refund · '3..7' various pay
 * Wallet delta rule (matches tb-bulk.ts L83-87):
 *   type '1'/'2' → credit  (wallettotal += amount)
 *   type '4'/'7' → debit   (wallettotal -= amount)
 *   anything else → no balance change (safe default)
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — duplicated from wallet-hs.ts L54 (third caller —
// next refactor task should lift it to actions/admin/common.ts).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string | null }>();
  if (error) {
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminid) return data.adminid;
  return email.slice(0, 30);
}

// ════════════════════════════════════════════════════════════════
// 1. adminUpdateWalletHsDateSlip — admin sets "วันที่โอนในสลิป"
// ════════════════════════════════════════════════════════════════

const updateDateSlipSchema = z.object({
  id:       z.number().int().positive(),
  dateslip: z.string().trim().min(1, "ต้องระบุวันที่"),  // local datetime string e.g. "2026-05-25T10:30"
});
export type AdminUpdateWalletHsDateSlipInput = z.infer<typeof updateDateSlipSchema>;

export async function adminUpdateWalletHsDateSlip(
  input: AdminUpdateWalletHsDateSlipInput,
): Promise<AdminActionResult<{ id: number; dateslip: string }>> {
  const parsed = updateDateSlipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, dateslip } = parsed.data;

  // Parse the wall-clock datetime string from the form. Treat as local time
  // (legacy stored "YYYY-MM-DD HH:mm" as a wall clock); ISO-encode to
  // preserve the entered moment.
  const dt = new Date(dateslip);
  if (Number.isNaN(dt.getTime())) {
    return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  }
  const dateslipIso = dt.toISOString();

  return withAdmin<{ id: number; dateslip: string }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Confirm row exists + is still pending (the only state where editing
      // the slip date matters for the "ตรวจสอบรายการซ้ำ" detector).
      const { data: existing, error: existingErr } = await admin
        .from("tb_wallet_hs")
        .select("id, status, userid, amount")
        .eq("id", id)
        .maybeSingle<{ id: number; status: string | null; userid: string; amount: number }>();
      if (existingErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: existingErr.code, message: existingErr.message });
        return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
      }
      if (!existing) return { ok: false, error: "ไม่พบรายการ" };

      const { error: updErr } = await admin
        .from("tb_wallet_hs")
        .update({ dateslip: dateslipIso, adminidupdate: legacyAdminId })
        .eq("id", id);
      if (updErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "tb_wallet_hs.update_dateslip", "tb_wallet_hs", String(id), {
        userid: existing.userid,
        amount: existing.amount,
        new_dateslip: dateslipIso,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");

      return { ok: true, data: { id, dateslip: dateslipIso } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 2. adminApproveWalletHs — single-row approve (status 1 → 2)
// ════════════════════════════════════════════════════════════════

const approveSchema = z.object({
  id: z.number().int().positive(),
});
export type AdminApproveWalletHsInput = z.infer<typeof approveSchema>;

export async function adminApproveWalletHs(
  input: AdminApproveWalletHsInput,
): Promise<AdminActionResult<{ id: number; new_balance: number }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin<{ id: number; new_balance: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // 1. Read the pending row.
      const { data: row, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status")
        .eq("id", id)
        .maybeSingle<{ id: number; userid: string; amount: number; type: string | null; status: string | null }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "ไม่พบรายการ" };
      if (row.status !== "1") {
        return { ok: false, error: `รายการนี้ดำเนินการแล้ว (สถานะ ${row.status})` };
      }

      const amt = Number(row.amount);
      const t = row.type ?? "1";
      const delta = (t === "1" || t === "2") ? amt
                  : (t === "4" || t === "7") ? -amt
                  : 0;

      // 2. UPDATE tb_wallet_hs status='2'.
      const { error: updHsErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
        .eq("id", id)
        .eq("status", "1");
      if (updHsErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
        return { ok: false, error: updHsErr.message };
      }

      // 3. Adjust tb_wallet.wallettotal (if applicable).
      let newTotal = delta;
      if (delta !== 0) {
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", row.userid)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (wRowErr) {
          console.error(`[tb_wallet list] failed`, { code: wRowErr.code, message: wRowErr.message });
        }
        if (!wRow) {
          const { error: insErr } = await admin
            .from("tb_wallet")
            .insert({ userid: row.userid, wallettotal: delta });
          if (insErr) {
            return {
              ok: false,
              error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet insert ล้มเหลว: ${insErr.message}`,
            };
          }
        } else {
          newTotal = Number(wRow.wallettotal) + delta;
          const { error: updWErr } = await admin
            .from("tb_wallet")
            .update({ wallettotal: newTotal })
            .eq("userid", row.userid);
          if (updWErr) {
            return {
              ok: false,
              error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet update ล้มเหลว: ${updWErr.message}`,
            };
          }
        }
      }

      await logAdminAction(adminId, "tb_wallet_hs.approve", "tb_wallet_hs", String(id), {
        userid: row.userid,
        amount: amt,
        delta,
        new_balance: newTotal,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return { ok: true, data: { id, new_balance: newTotal } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 3. adminRejectWalletHs — single-row reject (status 1 → 3)
// ════════════════════════════════════════════════════════════════

const rejectSchema = z.object({
  id:   z.number().int().positive(),
  note: z.string().trim().max(1000).optional(),
});
export type AdminRejectWalletHsInput = z.infer<typeof rejectSchema>;

export async function adminRejectWalletHs(
  input: AdminRejectWalletHsInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, note } = parsed.data;

  return withAdmin<{ id: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      const { data: row, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, status")
        .eq("id", id)
        .maybeSingle<{ id: number; userid: string; status: string | null }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "ไม่พบรายการ" };
      if (row.status !== "1") {
        return { ok: false, error: `รายการนี้ดำเนินการแล้ว (สถานะ ${row.status})` };
      }

      const patch: Record<string, unknown> = {
        status: "3",
        adminid: legacyAdminId,
        adminidupdate: legacyAdminId,
      };
      if (note && note.length > 0) patch.note = note;

      const { error: updErr } = await admin
        .from("tb_wallet_hs")
        .update(patch)
        .eq("id", id)
        .eq("status", "1");
      if (updErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "tb_wallet_hs.reject", "tb_wallet_hs", String(id), {
        userid: row.userid,
        note,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return { ok: true, data: { id } };
    },
  );
}
