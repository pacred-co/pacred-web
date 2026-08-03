import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomsFxRates, fxRateMap } from "@/lib/admin/customs-fx";
import { ReviewClient } from "./review-client";

/**
 * `/cart/add/review` — rich product-detail page reached from /cart/add after
 * "ค้นหาและตรวจสอบสินค้า" (owner 2026-07-31 "ไปหน้าใหม่ + skeleton แบบ shopee").
 *
 * Thin Server Component: load the live yuan rate (rsDefault) + customs FX map,
 * then hand off to <ReviewClient> which reads the pasted links from
 * sessionStorage, shows a skeleton per item, and fetches each via
 * searchProductByUrl on the client (so the skeleton→content transition shows).
 */
export const dynamic = "force-dynamic";

export default async function CartAddReviewPage() {
  const admin = createAdminClient();
  const settingsRes = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  const rsDefault = Number(settingsRes.data?.rsdefault ?? 5.0);

  // customs.fx_rates (THB per 1 unit) — powers the per-piece currency selector
  // in the rich card (same source /search + /cart/add use).
  const fxRates = fxRateMap(await getCustomsFxRates());

  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-2 pb-24 md:pb-6">
      {/* Centred reading column (owner 2026-08-03 "จัดให้พอดีกลางจอ") — the card
          used to stretch edge-to-edge, which let the option column grow far
          wider than the photo and threw the page off balance. Capped INSIDE
          `.pcs-content-pad` so the sidebar/floating-tab offsets that class
          applies still hold, and the cap centres in whatever space is left. */}
      <div className="mx-auto w-full max-w-[1200px] px-2 md:px-6">
        <ReviewClient rsDefault={rsDefault} fxRates={fxRates} />
      </div>
    </div>
  );
}
