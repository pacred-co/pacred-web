"use server";

/**
 * TTW/อี้อู (Yiwu) packing-staging — CS assigns a PR to a staged tracking row.
 *
 * The 8 Yiwu packing lists (mig 0262 · ttw_packing_line) arrive with the warehouse's
 * own 单号 tracking + a 唛头 mark but NO customer/PR (会员 = "YY"). CS matches the mark
 * ↔ a delivery note → the real PR, then fills it here (owner 2026-07-18 "ให้ CS มา
 * ช่วยกันใส่ PR เอาใบส่งของมาจับคู่").
 *
 * SAFETY: ttw_packing_line is a NON-billable STAGING table (§0e isolation). This
 * action ONLY writes member_code / pr_source on a staged row — it does NOT create a
 * billable tb_forwarder row, touch any price/wallet, or change any status. Committing
 * a staged row to a billable row (grouping + creating the tb_forwarder shipment) is a
 * SEPARATE, later, gated step. A row already committed (committed_forwarder_id set) is
 * frozen — reassigning its PR is refused.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { revalidatePath } from "next/cache";

const AssignSchema = z.object({
  id: z.string().uuid(),
  // Empty string = clear the PR. Otherwise a PR-like code (stored uppercased).
  memberCode: z.string().trim().max(30),
});

export type TtwAssignResult = {
  id: string;
  memberCode: string | null;
  found: boolean;          // does this PR exist in tb_users?
  customerName: string | null;
  /** How many OTHER uncommitted no-PR rows with the SAME 唛头 mark got this PR
   *  auto-propagated (mark = TTW's per-customer code → same mark = same customer ·
   *  owner 2026-07-18 "จับคู่ PR ให้เราด้วยเลย" — CS ใส่ครั้งเดียวต่อมาร์ค). */
  propagated: number;
};

// CS roles who reconcile arrival packing lists ↔ customers.
const CS_ROLES = ["super", "ops", "sales", "sales_admin", "accounting"] as const;

export async function adminAssignTtwPackingPr(
  input: unknown,
): Promise<AdminActionResult<TtwAssignResult>> {
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { id } = parsed.data;
  const memberCode = parsed.data.memberCode.toUpperCase() || null; // "" → clear

  return withAdmin<TtwAssignResult>([...CS_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Guard: refuse if the staged row is already committed to a billable row.
    const { data: row, error: rowErr } = await admin
      .from("ttw_packing_line")
      .select("id, member_code, shipping_mark, committed_forwarder_id")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) {
      console.error("[ttw assign-pr] load failed", { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: "อ่านข้อมูลไม่สำเร็จ" };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการนี้" };
    if (row.committed_forwarder_id != null) {
      return { ok: false, error: "รายการนี้ commit เป็นรายการนำเข้าแล้ว — แก้ PR ไม่ได้" };
    }

    // Look the PR up (feedback only — CS may enter a PR not yet in tb_users).
    let found = false;
    let customerName: string | null = null;
    if (memberCode) {
      const { data: u, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName")
        .eq("userID", memberCode)
        .maybeSingle();
      if (uErr) {
        // Soft-fail — this lookup is display feedback only and does NOT gate the
        // write below (CS may legitimately enter a PR not yet in tb_users). Log
        // it so a real DB fault isn't mistaken for "PR ยังไม่มีในระบบ".
        console.error("[ttw assign-pr] member lookup failed", { memberCode, code: uErr.code, message: uErr.message });
      }
      if (u) {
        found = true;
        customerName = (u as { userName?: string | null }).userName?.trim() || null;
      }
    }

    // Update only member_code / pr_source (never a money/status field), and re-guard
    // committed_forwarder_id IS NULL at the write so a concurrent commit can't be raced.
    const { error: upErr, count } = await admin
      .from("ttw_packing_line")
      .update({ member_code: memberCode, pr_source: memberCode ? "cs" : null, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
      .is("committed_forwarder_id", null);
    if (upErr) {
      console.error("[ttw assign-pr] update failed", { code: upErr.code, message: upErr.message });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${upErr.message}` };
    }
    if (!count) return { ok: false, error: "บันทึกไม่สำเร็จ (อาจถูก commit ไปแล้ว)" };

    // ── MARK-FAMILY PROPAGATION (owner 2026-07-18 "จับคู่ PR ให้เราด้วยเลย") ──
    // The 唛头 mark is TTW's per-CUSTOMER code (e.g. SPK/KTM888/SEA = one customer's
    // whole stream · 101 rows). Assigning a PR to ONE row therefore identifies the
    // whole mark family → fill every OTHER uncommitted row of the same mark that has
    // NO PR yet (fill-when-NULL only · never overwrites a CS/auto value · staging only).
    // Clearing a PR ("" → null) does NOT touch the family — only the one row.
    let propagated = 0;
    const mark = (row.shipping_mark ?? "").trim();
    if (memberCode && mark) {
      const { count: pCount, error: pErr } = await admin
        .from("ttw_packing_line")
        .update(
          { member_code: memberCode, pr_source: "mark", updated_at: new Date().toISOString() },
          { count: "exact" },
        )
        .eq("shipping_mark", mark)
        .is("member_code", null)
        .is("committed_forwarder_id", null)
        .neq("id", id);
      if (pErr) {
        // best-effort — the single-row assign already landed; CS can fill the rest
        console.error("[ttw assign-pr] mark propagation failed", { code: pErr.code, message: pErr.message });
      } else {
        propagated = pCount ?? 0;
      }
    }

    await logAdminAction(adminId, "ttw_packing.assign_pr", "ttw_packing_line", id, {
      member_code: memberCode, found, mark, propagated,
    });
    revalidatePath("/admin/api-forwarder-ttw");

    return { ok: true, data: { id, memberCode, found, customerName, propagated } };
  });
}
