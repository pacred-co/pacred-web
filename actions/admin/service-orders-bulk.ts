"use server";

// ─────────────────────────────────────────────────────────────────────────────
// bulkUpdateShopOrderStatus — manual status override for ฝากสั่งซื้อ (shop orders).
// ภูม flag 2026-06-11.
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY: /admin/service-orders ติ๊กหลายรายการได้แต่ bulk bar มีแค่พิมพ์ใบแจ้งหนี้/
// ใบเสร็จ — ไม่มี "ขยับสถานะแมนนวล" แบบที่ /admin/forwarders มี (the
// BulkActionsToolbar "เปลี่ยน status"). ภูมขอให้มีตัวเดียวกันฝั่ง shop.
//
// SCOPE = MANUAL OVERRIDE (a correction tool · NOT the happy-path workflow):
//   - Writes ONLY tb_header_order.hstatus + the target status-stamp column +
//     hdateupdate + adminidupdate, then audit-logs. NOTHING ELSE.
//   - 💰 Deliberately does NOT run the workflow side-effects — no auto-receipt,
//     no commission accrual, no wallet move, no customer notification. Those
//     live in the dedicated per-row actions (adminQuoteShopOrder 1→2 ·
//     adminMarkShopOrderOrdered 3→4) and stay there. A bare hstatus UPDATE is
//     money-safe: tb_header_order has NO DB trigger that fires on hstatus
//     change (verified 2026-06-11), so the receipt/commission paths can only
//     be reached through their own actions, never through this UPDATE.
//   - This mirrors the forwarders bulkUpdateStatus philosophy: a staff tool to
//     CORRECT a stuck/wrong status, not to drive the customer-facing flow.
//
// Status model — tb_header_order.hstatus char(1):
//   "1" รอดำเนินการ · "2" รอชำระเงิน · "3" สั่งสินค้า · "4" รอร้านจีนจัดส่ง ·
//   "5" สำเร็จ · "6" ยกเลิก. (No "7" — distinct from tb_forwarder.fstatus.)
//
// Status-stamp columns — hdate2..hdate5 are per-status timestamps. We stamp the
// target's column ONLY for 2..5. We do NOT re-stamp hdate (= the status-1 /
// creation timestamp) on a rollback to "1", nor invent a column for "6" — that
// would corrupt the create date / add a phantom column. Every move stamps
// hdateupdate + adminidupdate regardless.
//
// Read-with:
//   - actions/admin/forwarders-bulk.ts        — the forwarders pattern this mirrors
//   - actions/admin/service-orders-shop-workflow.ts — the happy-path actions (the
//                                               ones that DO carry money side-effects)
//   - app/.../service-orders/service-orders-table.tsx — the bulk bar that calls this

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";

const MAX_BULK = 100;

// resolveLegacyAdminId — local copy of the same helper service-orders-shop-
// workflow.ts uses (the #178 "lift to common.ts" is still pending; the 7 other
// callers all inline it). Maps the signed-in admin's email → tb_admin.adminID
// so adminidupdate carries the real legacy admin slug — matching what the
// shop happy-path actions write, not a truncated UUID.
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders-bulk.resolveLegacyAdminId auth.getUser] failed`, {
      code: authErr.code, message: authErr.message,
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
    console.error(`[service-orders-bulk.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  return data?.adminID ?? email;
}

export const SHOP_STATUSES = ["1", "2", "3", "4", "5", "6"] as const;
export type ShopOrderStatus = (typeof SHOP_STATUSES)[number];

/** Result envelope — mirrors forwarders-bulk so the UI renders partial failure. */
export type BulkShopOrderResult = {
  succeeded: string[];                          // hno values updated (or no-op'd) cleanly
  failed:    { hno: string; error: string }[];  // hno + per-row error
};

// Target status → the status-stamp column to set. ONLY 2..5 get a dedicated
// stamp; "1" preserves hdate (creation), "6" (cancel) has no date column.
const STATUS_STAMP_COL: Partial<Record<ShopOrderStatus, "hdate2" | "hdate3" | "hdate4" | "hdate5">> = {
  "2": "hdate2",
  "3": "hdate3",
  "4": "hdate4",
  "5": "hdate5",
};

const schema = z.object({
  hnos:    z.array(z.string().trim().min(1)).min(1).max(MAX_BULK),
  hstatus: z.enum(SHOP_STATUSES),
  note:    z.string().trim().max(500).optional(),
});

/**
 * Manually move the selected shop orders to a target hstatus. Pure status
 * write — see the file header for the money-safety contract.
 *
 * Per-row classification: a missing hno fails that row; an order already AT the
 * target status is a no-op counted as success (idempotent, like the legacy
 * `WHERE hStatus<>'<n>'`); everything else is updated in one bulk statement
 * (all selected rows share the same target → same stamp column).
 */
export async function bulkUpdateShopOrderStatus(
  hnos: string[],
  hstatus: ShopOrderStatus,
  note?: string,
): Promise<AdminActionResult<BulkShopOrderResult>> {
  const parsed = schema.safeParse({ hnos, hstatus, note });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<BulkShopOrderResult>(["super", "ops", "sales_admin", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // De-dup the input hnos (a double-tick shouldn't double-classify).
    const wanted = Array.from(new Set(d.hnos));

    // ── 1. Snapshot current state (one round-trip) ────────────────────────
    const { data: rows, error: readErr } = await admin
      .from("tb_header_order")
      .select("hno, hstatus")
      .in("hno", wanted);
    if (readErr) {
      console.error(`[service-orders-bulk] tb_header_order lookup failed`, {
        code: readErr.code, message: readErr.message,
      });
      return { ok: false, error: `lookup failed: ${readErr.message}` };
    }
    const byHno = new Map<string, string>(
      (rows ?? []).map((r) => [(r as { hno: string }).hno, (r as { hstatus: string | null }).hstatus ?? ""]),
    );

    // ── 2. Classify per-row ───────────────────────────────────────────────
    const succeeded: string[] = [];
    const failed:    { hno: string; error: string }[] = [];
    const before:    Record<string, string> = {};
    const toUpdate:  string[] = [];

    for (const hno of wanted) {
      if (!byHno.has(hno)) {
        failed.push({ hno, error: "ไม่พบรายการ" });
        continue;
      }
      const cur = byHno.get(hno)!;
      if (cur === d.hstatus) {
        succeeded.push(hno); // already at target — idempotent no-op
        continue;
      }
      before[hno] = cur;
      toUpdate.push(hno);
    }

    if (toUpdate.length === 0) {
      return { ok: true, data: { succeeded, failed } };
    }

    // ── 3. One bulk UPDATE (every selected row shares the target) ──────────
    const nowIso = new Date().toISOString();
    const stampCol = STATUS_STAMP_COL[d.hstatus];
    const patch: Record<string, string> = {
      hstatus:       d.hstatus,
      hdateupdate:   nowIso,
      adminidupdate: legacyAdminId,
    };
    if (stampCol) patch[stampCol] = nowIso;

    const { error: updErr } = await admin
      .from("tb_header_order")
      .update(patch)
      .in("hno", toUpdate);
    if (updErr) {
      console.error(`[service-orders-bulk] bulk UPDATE failed`, {
        code: updErr.code, message: updErr.message, hnos: toUpdate,
      });
      return { ok: false, error: `update failed: ${updErr.message}` };
    }

    // ── 4. Audit (one row · carries before-states + reason) ───────────────
    await logAdminAction(
      adminId,
      "shop_order.bulk_status_override",
      "tb_header_order",
      toUpdate.join(","),
      {
        to_status: d.hstatus,
        before,
        note: d.note ?? null,
        count: toUpdate.length,
        manual_override: true,
      },
    );

    for (const hno of toUpdate) succeeded.push(hno);

    revalidatePath("/admin/service-orders");
    // Status change moves the per-status badge counts in the sidebar/tabs.
    bustAdminChrome();
    return { ok: true, data: { succeeded, failed } };
  });
}
