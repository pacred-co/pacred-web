import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomsFxRates, fxRateMap } from "@/lib/admin/customs-fx";
import { ManualEntryClient } from "./manual-entry-client";
import { CartAdsBanner } from "../cart-ads-banner";

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
        {/* ฟอร์ม (ซ้าย) + แบนเนอร์ (ขวา · เดสก์ท็อปเท่านั้น) — โครงเดียวกับ /cart/add
            เป๊ะ (owner 2026-08-04 "ทำให้เล็กกว่านี้หน่อย ผมจะเอาแบนเนอร์มาใส่ข้างๆ
            แบบหน้าเพิ่มสินค้า"): คอลัมน์ภาพล็อก 400px ตายตัวเพื่อให้กล่องแบนเนอร์
            ออกแบบง่าย · ฟอร์ม minmax(0,1fr) กินที่เหลือ. */}
        {/* xl: ไม่ใช่ lg: — ที่ 1024-1280px แบนเนอร์ 400px จะบีบการ์ดเหลือ ~338px
            (วัดจากจอ) ฟอร์มต้องซ้อนคอลัมน์เดียวแล้วยาวมาก ไม่คุ้มกับการโชว์แบนเนอร์ */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <ManualEntryClient rsDefault={rsDefault} fxRates={fxRates} />
          {/* mt เท่ากับความสูงของหัวคอลัมน์ซ้าย (หัวข้อ+ลิงก์ย้อนกลับแถวเดียวกัน + คำอธิบาย
              + แท็บรายการ) = 119px วัดจากจอจริง — ให้ขอบบนแบนเนอร์ตรงกับขอบบนการ์ดพอดี
              (owner 2026-08-04 "ขยับแบนเนอร์ลงมาให้พอดีกันหน่อย").
              ⚠️ ถ้าแก้หัวคอลัมน์ซ้ายเมื่อไร ต้องวัดใหม่แล้วอัปเลขนี้ด้วย — รอบนี้ย้าย
              ลิงก์ย้อนกลับขึ้นไปแถวเดียวกับหัวข้อ หัวเลยเตี้ยลงจาก 150 → 119 */}
          <aside className="hidden self-start xl:mt-[119px] xl:block">
            <CartAdsBanner
              single={{
                src: "/images/linkpurchaser.png",
                alt: "ฝากสั่งซื้อสินค้าจากจีน — Pacred",
              }}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
