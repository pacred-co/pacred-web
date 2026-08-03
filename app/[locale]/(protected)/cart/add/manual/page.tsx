import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomsFxRates, fxRateMap } from "@/lib/admin/customs-fx";
import { ManualEntryClient } from "./manual-entry-client";

/**
 * `/cart/add/manual` — "เพิ่มสินค้าด้วยตัวเอง" (owner 2026-08-03: "ถ้ากด ไม่มีลิงก์
 * สินค้าแล้วผมอยากให้เป็นแบบนี้ ใช้หน้าแบบมีลิงก์แหละ แต่เป็นฟอร์มเปล่า").
 *
 * Same shell as the with-link review page — รายการที่ N tabs · a 2-column card ·
 * a bottom summary bar — but the left column is a photo uploader and the right
 * column is a blank form instead of API-fetched product data. The "ไม่มีลิงก์
 * สินค้า" tab on /cart/add routes here.
 *
 * Thin Server Component (mirrors review/page.tsx): live yuan rate + customs FX
 * map, then the client owns the form. Money path is the SHARED addCartItemsBulk
 * → tb_cart — no new one.
 */
export const dynamic = "force-dynamic";

export default async function CartAddManualPage() {
  const admin = createAdminClient();
  const settingsRes = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  const rsDefault = Number(settingsRes.data?.rsdefault ?? 5.0);

  // customs.fx_rates (THB per 1 unit) — powers the per-piece currency selector,
  // the same source /search + /cart/add + the review card read.
  const fxRates = fxRateMap(await getCustomsFxRates());

  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-2 pb-24 md:pb-6">
      {/* Same centred reading column as the review page so both entry paths
          (มีลิงก์ / ไม่มีลิงก์) sit at the identical width. */}
      <div className="mx-auto w-full max-w-[1200px] px-2 md:px-6">
        <ManualEntryClient rsDefault={rsDefault} fxRates={fxRates} />
      </div>
    </div>
  );
}
