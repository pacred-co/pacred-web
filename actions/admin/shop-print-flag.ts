"use server";

/**
 * markShopOrdersPrinted — flip tb_header_order.hPrintBill / hPrintBill2 to '1'
 * when a shop bill/invoice is printed (faithful port of printShop.php L86-92).
 *
 *   isReceipt (print=1) → hprintbill  = '1'  (ใบเสร็จรับเงิน)
 *   else      (invoice) → hprintbill2 = '1'  (ใบแจ้งหนี้)
 *
 * Legacy flips the flag during the print GET render; a Next.js Server Component
 * render must stay a pure read (the print page is `force-dynamic` + read-only),
 * so this runs as a Server Action fired once when the print view mounts (see
 * <MarkPrintedOnMount>). The /admin/service-orders list badges
 * ("พิมพ์ใบเสร็จแล้ว" / "ใบแจ้งหนี้แล้ว") read these flags — without this write
 * they never appeared (the columns are only ever set to '' at creation).
 *
 * Auth = any admin (matches the print page's bare requireAdmin()).
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const schema = z.object({
  hNos:      z.array(z.string().trim().min(1)).min(1).max(200),
  isReceipt: z.boolean(),
});

export async function markShopOrdersPrinted(
  input: { hNos: string[]; isReceipt: boolean },
): Promise<AdminActionResult<{ marked: number }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const hNos = Array.from(new Set(parsed.data.hNos));
  const col  = parsed.data.isReceipt ? "hprintbill" : "hprintbill2";

  return withAdmin<{ marked: number }>(undefined, async ({ adminId }) => {
    const admin = createAdminClient();
    // Flip only rows not already '1' (null or non-'1') → accurate count, no
    // redundant write on re-print, faithful "marked as printed".
    const { data, error } = await admin
      .from("tb_header_order")
      .update({ [col]: "1" })
      .in("hno", hNos)
      .or(`${col}.is.null,${col}.neq.1`)
      .select("hno");
    if (error) {
      console.error(`[markShopOrdersPrinted ${col}] failed`, { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    const marked = data?.length ?? 0;
    if (marked > 0) {
      await logAdminAction(adminId, "shop_order.mark_printed", "tb_header_order", hNos.join(","), { col, marked });
    }
    return { ok: true, data: { marked } };
  });
}
