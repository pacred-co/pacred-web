"use server";

/**
 * assignOrderPurchaser — per-order purchaser (ผู้สั่งซื้อ) assignment
 * (owner ④ · 2026-07-06 · mig 0241).
 *
 * Writes the NEW `adminidpurchaser` field on ONE order (a tb_admin.adminID
 * string · the SAME identity world the order-creator cols adminid/adminidcreate
 * already use). '' clears the assignment (ยังไม่มอบหมาย).
 *
 *   kind="shop"       → tb_header_order (key `hno`) — ฝากสั่งซื้อ
 *   kind="forwarder"  → tb_forwarder    (key `id`)  — ฝากนำเข้า
 *
 * Gate (owner ④): only those who may HAND OFF work may reassign —
 * interpreter + purchaser_lead + the true god roles (ultra/super). `normies`
 * is god-NAV but is deliberately EXCLUDED (owner named an explicit set), so we
 * re-check `canReassignPurchaser(ctx.roles)` in the body rather than trusting
 * isGodRole alone. A plain `purchaser` cannot reassign.
 *
 * ⚠️ ASSIGNMENT-ONLY — this touches NOTHING but `adminidpurchaser` + the audit
 * log. No money / price / status / eligibility side-effect (§0e-safe).
 *
 * The schema lives in a non-async section but is NOT exported (a "use server"
 * file may only export async functions).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReassignPurchaser, PURCHASER_REASSIGN_ROLES } from "@/lib/admin/purchaser-scope";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const assignSchema = z.object({
  kind: z.enum(["shop", "forwarder"]),
  // shop → hno (string like "P123") · forwarder → the numeric id (as string/number)
  orderNo: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  // '' clears the assignment. Otherwise a tb_admin.adminID (validated below).
  purchaserAdminId: z.string().trim().max(20).default(""),
});
export type AssignOrderPurchaserInput = z.infer<typeof assignSchema>;

export async function assignOrderPurchaser(
  input: AssignOrderPurchaserInput,
): Promise<AdminActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { kind, orderNo, purchaserAdminId } = parsed.data;
  if (!orderNo) return { ok: false, error: "ไม่พบเลขออเดอร์" };

  // withAdmin gates on the reassign-eligible list; god (ultra/super/normies)
  // also passes via isGodRole. The body then re-checks the EXPLICIT set so a
  // normies (god-nav) is refused — owner ④ named {interpreter, purchaser_lead,
  // ultra, super} only.
  return withAdmin(
    [...PURCHASER_REASSIGN_ROLES.filter((r) => r === "interpreter" || r === "purchaser_lead")],
    async ({ adminId, roles }) => {
      if (!canReassignPurchaser(roles)) {
        return { ok: false, error: "ไม่มีสิทธิ์มอบหมาย/เปลี่ยนผู้สั่งซื้อ" };
      }

      const admin = createAdminClient();

      // Validate the target purchaser (unless clearing). Any ACTIVE admin is a
      // valid purchaser (there is no dedicated adminStatusPurchaser flag).
      if (purchaserAdminId !== "") {
        const { data: rep, error: repErr } = await admin
          .from("tb_admin")
          .select("adminID, adminStatusA")
          .eq("adminID", purchaserAdminId)
          .maybeSingle<{ adminID: string; adminStatusA: string | null }>();
        if (repErr) {
          console.error("[assignOrderPurchaser rep read] failed", {
            purchaserAdminId,
            code: repErr.code,
            message: repErr.message,
          });
          return { ok: false, error: repErr.message };
        }
        if (!rep) return { ok: false, error: "ไม่พบผู้สั่งซื้อปลายทาง (adminID ไม่ตรงกับ tb_admin)" };
        if (rep.adminStatusA !== "1") return { ok: false, error: "ผู้สั่งซื้อปลายทางถูกปิดใช้งาน" };
      }

      const table = kind === "shop" ? "tb_header_order" : "tb_forwarder";
      const keyCol = kind === "shop" ? "hno" : "id";
      // forwarder key is numeric — coerce so the .eq matches the int PK.
      const keyVal: string | number =
        kind === "forwarder" ? Number(orderNo) : orderNo;
      if (kind === "forwarder" && !Number.isFinite(keyVal as number)) {
        return { ok: false, error: "เลขออเดอร์ (id) ไม่ถูกต้อง" };
      }

      // Read the current value first (for the audit before/after + a no-op skip).
      const { data: before, error: beforeErr } = await admin
        .from(table)
        .select(`${keyCol}, adminidpurchaser`)
        .eq(keyCol, keyVal)
        .maybeSingle<Record<string, string | number | null>>();
      if (beforeErr) {
        console.error("[assignOrderPurchaser order read] failed", {
          table,
          orderNo,
          code: beforeErr.code,
          message: beforeErr.message,
        });
        return { ok: false, error: beforeErr.message };
      }
      if (!before) return { ok: false, error: "ไม่พบออเดอร์" };
      const current = (before.adminidpurchaser as string | null) ?? "";
      if (current === purchaserAdminId) return { ok: true }; // no-op

      const { error } = await admin
        .from(table)
        .update({ adminidpurchaser: purchaserAdminId })
        .eq(keyCol, keyVal);
      if (error) {
        console.error("[assignOrderPurchaser update] failed", {
          table,
          orderNo,
          code: error.code,
          message: error.message,
        });
        return { ok: false, error: error.message };
      }

      await logAdminAction(adminId, "order.assign_purchaser", table, String(orderNo), {
        kind,
        before: current || null,
        after: purchaserAdminId || null,
      });

      revalidatePath(kind === "shop" ? "/admin/service-orders" : "/admin/forwarders");
      return { ok: true };
    },
  );
}
