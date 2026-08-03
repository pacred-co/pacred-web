"use server";

/**
 * Cart item count for the navbar badge (owner 2026-08-03 "เอาตัวเลขในตระกร้า
 * ขึ้นมาด้วยดิ").
 *
 * Server-side on purpose: `tb_cart` is reachable only with the service role —
 * every reader of it (listCart, loadPcsChromeData, the cart page) goes through
 * the admin client. A browser-side count returns 0 no matter how many rows the
 * customer has, which is precisely why the badge showed nothing.
 *
 * Same table + same filter as the sidebar's `countCart` in lib/legacy/pcs-chrome
 * (`tb_cart` WHERE userid = member code), so the two numbers cannot disagree.
 * READ ONLY — no writes, no money.
 */

import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getCartCount(): Promise<number> {
  const data = await getCurrentUserWithProfile();
  const userID = data?.profile?.member_code ?? "";
  if (!userID) return 0;

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("tb_cart")
    .select("id", { count: "exact", head: true })
    .eq("userid", userID);
  if (error) {
    console.error("[cart-count] failed", { code: error.code, message: error.message });
    return 0;
  }
  return count ?? 0;
}
