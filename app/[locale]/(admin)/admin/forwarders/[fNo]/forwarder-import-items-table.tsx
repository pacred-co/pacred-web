/**
 * <ForwarderImportItemsTable> — the legacy admin `forwarder/update` "รายการสินค้า"
 * table, rebuilt as Pacred (clean Tailwind · real data · NO "PCS"/¥ chrome).
 *
 * 2026-06-10 (ปอน · owner "ลอกอันนี้มาเลย แต่ทำให้เป็นเรา pacred ข้อมูลตามจริง"):
 * the owner pasted the full legacy update page. Its items table is the simple
 * 16-column, single-฿-row layout (NOT the ¥ + freight-breakdown combo that
 * <FreightBreakdownTable> renders for /edit). This component reproduces that
 * legacy table 1:1 in column set + order + number formatting, using the real
 * tb_forwarder header values:
 *
 *   # · รายละเอียด · กล่อง · น้ำหนัก Kg. · ปริมาตรรวม CBM · คิดราคาตาม · เรทนำเข้า ·
 *   ค่านำเข้าจีน-ไทย · ค่าสินค้า เพิ่ม/ลด · ค่าตีลัง · ค่าขนส่งจีน+ · ค่าขนส่งไทย ·
 *   ค่าบริการ · ค่าอื่นๆ · ส่วนลด · ราคารวม
 *
 * One row = the order (legacy renders the header aggregate as a single row —
 * per-item cost columns are header-level in our schema). The รายละเอียด cell
 * lists the real item names (tb_order if shop-spawned · else tb_forwarder_item)
 * + ประเภทสินค้า, so a multi-item order still shows every product. ราคารวม is the
 * gross the customer owes (no WHT column — the legacy 16-col table has none; the
 * juristic WHT deduction is applied at payment, shown on the receipt/invoice).
 *
 * Money math mirrors edit/freight-breakdown-table.tsx (legacy detail.php
 * L372-377): priceAllUser = ค่านำเข้า + ขนส่งไทย + สินค้าเพิ่ม/ลด + บริการ +
 * ขนส่งจีน+ + ตีลัง + อื่นๆ − ส่วนลด.
 *
 * Async server component — fetches the item names inline.
 */

import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  r: {
    id: number;
    reforder: string | null;
    fdetail: string | null;
    fproductstype: string | null;
    famount: number | null;
    fweight: number | string | null;
    fvolume: number | string | null;
    frefprice: string | null;
    frefrate: number | string | null;
    ftotalprice: number | string | null;
    fpriceupdate: number | string | null;
    pricecrate: number | string | null;
    ftransportpricechnthb: number | string | null;
    ftransportprice: number | string | null;
    fshippingservice: number | string | null;
    priceother: number | string | null;
    fdiscount: number | string | null;
  };
};

// legacy nameProductsType — function.php L1196-1208
const PRODUCT_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป", "2": "มอก.", "3": "อย.", "4": "พิเศษ", "5": "ควบคุมพิเศษ",
};
// legacy nameRefPrice — the "คิดราคาตาม" basis
const REF_PRICE_LABEL: Record<string, string> = {
  "1": "น้ำหนัก", "2": "ปริมาตร", "3": "เปรียบเทียบ",
};

function fmtMoney(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number, digits: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export async function ForwarderImportItemsTable({ r }: Props) {
  const admin = createAdminClient();

  // ── Real item names for the รายละเอียด cell (shop-spawned preferred) ──
  let itemNames: string[] = [];
  if (r.reforder && r.reforder.trim() !== "") {
    const { data, error } = await admin
      .from("tb_order")
      .select("ctitle")
      .eq("hno", r.reforder.trim())
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[ForwarderImportItemsTable tb_order]`, { code: error.code, message: error.message, hno: r.reforder });
    } else {
      itemNames = ((data ?? []) as { ctitle: string | null }[])
        .map((it) => (it.ctitle ?? "").trim())
        .filter((s) => s !== "");
    }
  }
  if (itemNames.length === 0) {
    const { data, error } = await admin
      .from("tb_forwarder_item")
      .select("productname")
      .eq("fid", r.id)
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[ForwarderImportItemsTable tb_forwarder_item]`, { code: error.code, message: error.message, fid: r.id });
    } else {
      itemNames = ((data ?? []) as { productname: string | null }[])
        .map((it) => (it.productname ?? "").trim())
        .filter((s) => s !== "");
    }
  }
  // legacy uses fdetail as the row label; fall back to the joined item names.
  const detailText =
    r.fdetail && r.fdetail.trim() !== "" && r.fdetail.trim() !== "..."
      ? r.fdetail.trim()
      : itemNames.length > 0
        ? itemNames[0]
        : "";

  // ── Header money (legacy detail.php L372-377) ──
  const frefRate              = Number(r.frefrate ?? 0);
  const fTotalPrice           = Number(r.ftotalprice ?? 0);
  const fPriceUpdate          = Number(r.fpriceupdate ?? 0);
  const priceCrate            = Number(r.pricecrate ?? 0);
  const fTransportPriceCHNTHB = Number(r.ftransportpricechnthb ?? 0);
  const fTransportPrice       = Number(r.ftransportprice ?? 0);
  const fShippingService      = Number(r.fshippingservice ?? 0);
  const priceOther            = Number(r.priceother ?? 0);
  const fDiscount             = Number(r.fdiscount ?? 0);
  const priceAllUser =
    fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
    fTransportPriceCHNTHB + priceCrate + priceOther - fDiscount;

  const refPriceLabel  = REF_PRICE_LABEL[r.frefprice ?? ""] ?? "ไม่พบข้อมูล";
  const productTypeLbl = PRODUCT_TYPE_LABEL[r.fproductstype ?? ""] ?? "ไม่พบข้อมูล";

  const TH = "px-2 py-2 font-semibold text-muted whitespace-nowrap";
  const TD = "px-2 py-2 text-right font-mono tabular-nums whitespace-nowrap";

  return (
    <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border">
      <table className="w-full text-xs md:text-sm">
        <thead className="bg-surface-alt/50 text-[10px] md:text-[11px] uppercase tracking-wide">
          <tr className="text-center">
            <th className={TH}>#</th>
            <th className={`${TH} text-left`}>รายละเอียด</th>
            <th className={TH}>กล่อง</th>
            <th className={TH}>น้ำหนัก Kg.</th>
            <th className={TH}>ปริมาตรรวม CBM</th>
            <th className={TH}>คิดราคาตาม</th>
            <th className={TH}>เรทนำเข้า</th>
            <th className={TH}>ค่านำเข้าจีน-ไทย</th>
            <th className={TH}>ค่าสินค้า เพิ่ม/ลด</th>
            <th className={TH}>ค่าตีลัง</th>
            <th className={TH}>ค่าขนส่งจีน+</th>
            <th className={TH}>ค่าขนส่งไทย</th>
            <th className={TH}>ค่าบริการ</th>
            <th className={TH}>ค่าอื่นๆ</th>
            <th className={TH}>ส่วนลด</th>
            <th className={`${TH} font-bold`}>ราคารวม</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border odd:bg-surface-alt/20 align-top">
            <td className="px-2 py-2 text-center font-mono text-muted">1</td>
            <td className="px-2 py-2 min-w-[220px] max-w-[360px] text-left">
              {detailText ? (
                <span className="break-words">{detailText}</span>
              ) : (
                <span className="text-muted">ไม่พบข้อมูล</span>
              )}
              {itemNames.length > 1 && (
                <ul className="mt-0.5 list-disc pl-4 text-[11px] text-muted">
                  {itemNames.slice(1).map((name, i) => (
                    <li key={i} className="break-words">{name}</li>
                  ))}
                </ul>
              )}
              <div className="mt-0.5 text-[11px] text-muted">ประเภทสินค้า : {productTypeLbl}</div>
            </td>
            <td className={TD}>{r.famount ?? 0}</td>
            <td className={TD}>{fmtNum(Number(r.fweight ?? 0), 2)}</td>
            <td className={TD}>{fmtNum(Number(r.fvolume ?? 0), 5)}</td>
            <td className="px-2 py-2 text-center whitespace-nowrap">{refPriceLabel}</td>
            <td className={TD}>{fmtMoney(frefRate)}</td>
            <td className={TD}>{fmtMoney(fTotalPrice)}</td>
            <td className={TD}>{fmtMoney(fPriceUpdate)}</td>
            <td className={TD}>{fmtMoney(priceCrate)}</td>
            <td className={TD}>{fmtMoney(fTransportPriceCHNTHB)}</td>
            <td className={TD}>{fmtMoney(fTransportPrice)}</td>
            <td className={TD}>{fmtMoney(fShippingService)}</td>
            <td className={TD}>{fmtMoney(priceOther)}</td>
            <td className={`${TD} text-amber-700`}>{fDiscount > 0 ? `−${fmtMoney(fDiscount)}` : fmtMoney(0)}</td>
            <td className={`${TD} font-bold text-red-600`}>{fmtMoney(priceAllUser)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
