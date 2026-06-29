import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Live ฝากสั่ง yuan-rate for PUBLIC marketing surfaces (homepage hero + stats bar).
 *
 * Reads `tb_settings.rsdefault` (id=1) — the SAME column /cart charges with
 * (`actions/cart.ts` readBaselineRate). acc/pricing adjust it DAILY as USD/CNY
 * moves, so the homepage MUST read it live ("แก้ที่เดียวเปลี่ยนทุกที่") instead of
 * a hardcoded number that silently drifts away from what the cart actually bills.
 *
 * Fallback on a missing row / read error: NEXT_PUBLIC_YUAN_RATE env, else the
 * last-known 5.10 (matches the prod value at time of writing). DISPLAY-ONLY —
 * this never feeds any pricing formula; the cart reads tb_settings itself.
 */
export async function getPublicYuanRate(): Promise<number> {
  const fallback = Number(process.env.NEXT_PUBLIC_YUAN_RATE ?? "5.10") || 5.1;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_settings")
      .select("rsdefault")
      .eq("id", 1)
      .maybeSingle<{ rsdefault: number | string | null }>();

    if (error) {
      console.error("[getPublicYuanRate] tb_settings read failed", {
        code: error.code,
        message: error.message,
      });
      return fallback;
    }

    const rate = Number(data?.rsdefault);
    return Number.isFinite(rate) && rate > 0 ? rate : fallback;
  } catch (err) {
    console.error("[getPublicYuanRate] unexpected error", err);
    return fallback;
  }
}
