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
 * 2026-06-16 (ภูม · owner live-test of ฝากนำเข้า — 2 detail bugs):
 *   ① ONE row per SIBLING TRACKING, not one. A split parcel = several
 *      tb_forwarder rows sharing (baseTracking, userid) (MOMO `-N/M` boxes, or
 *      a manually-split order). The legacy detail page rendered only the landed
 *      row, so an order with many trackings showed a single line. We now fetch
 *      the siblings + drop the MOMO หัวบิล placeholder, MIRRORING the list page
 *      (forwarders-table.tsx · countableGroupMembers / buildDisplayUnits) so the
 *      detail page and the list page agree row-for-row.
 *   ② ปริมาตรรวม CBM — match the COST calc (lib/forwarder/live-rate.ts L284):
 *      fvolume is the TOTAL when famountcount==='1' (every MOMO commit writes
 *      famountcount=1, so 1.728 for a 48-box parcel is already whole → NEVER
 *      ×boxes again) and PER-BOX otherwise (manual multi-box). The 2026-06-16
 *      always-×boxes formula double-counted MOMO (1.728 → 82.944); fixed
 *      2026-06-17 (ภูม owner flag) to the famountcount rule in `rowCbm` so the
 *      display equals the cost the engine actually charged.
 *
 * Each row lists its real item names (tb_order if shop-spawned · else
 * tb_forwarder_item) + ประเภทสินค้า, so a multi-item tracking still shows every
 * product; a totals row sums boxes / weight / CBM / money across siblings.
 * ราคารวม is the gross the customer owes (no WHT column — the legacy 16-col table
 * has none; the juristic WHT deduction is applied at payment, on the receipt).
 *
 * Money math mirrors edit/freight-breakdown-table.tsx (legacy detail.php
 * L372-377): priceAllUser = ค่านำเข้า + ขนส่งไทย + สินค้าเพิ่ม/ลด + บริการ +
 * ขนส่งจีน+ + ตีลัง + อื่นๆ − ส่วนลด.
 *
 * Async server component — fetches the sibling rows + item names inline.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { fetchCountableForwarderSiblings } from "@/lib/admin/forwarder-siblings";

type ItemRow = {
  id: number;
  ftrackingchn?: string | null;
  reforder: string | null;
  fdetail: string | null;
  fproductstype: string | null;
  famount: number | null;
  famountcount: number | string | null;
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
  // 2026-06-18 (ภูม · image-3 layout) — per-tracking dims + รับ-warehouse so the
  // detail row shows กว้าง/ยาว/สูง (different dims per แทค → different price).
  fwidth?: number | string | null;
  flength?: number | string | null;
  fheight?: number | string | null;
  fwarehousename?: string | null;
  // userid drives the sibling lookup. The detail page's `r` always carries it;
  // it's optional here only so older callers still type-check.
  userid?: string | null;
};

type Props = { r: ItemRow; isJuristic?: boolean };

// legacy nameProductsType — function.php L1196-1208
const PRODUCT_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป", "2": "มอก.", "3": "อย.", "4": "พิเศษ", "5": "ควบคุมพิเศษ",
};
// legacy nameRefPrice — the "คิดราคาตาม" basis
const REF_PRICE_LABEL: Record<string, string> = {
  "1": "น้ำหนัก", "2": "ปริมาตร", "3": "เปรียบเทียบ",
};
// legacy optionWarehouse() (function.php L1823-1833) — โกดังที่รับ (ไทย)
const WAREHOUSE_TH_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

function fmtMoney(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number, digits: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// CBM display — MUST match the COST calc (lib/forwarder/live-rate.ts L284 +
// legacy calPriceForwarder L1935-1941): cbmProduct = famountcount==='1'
// ? fvolume : fvolume*famount. So fvolume is the TOTAL when famountcount==='1'
// (every MOMO commit writes famountcount=1 → fvolume is already the whole-parcel
// CBM, e.g. 1.728 for a 48-box MOMO parcel — NEVER ×boxes again) and PER-BOX
// otherwise (manual multi-box entries). Replaces the 2026-06-16 always-×boxes
// formula that double-counted MOMO (1.728 → 82.944). ภูม 2026-06-17 owner flag:
// "fvolume = total, ไม่คำนวณ CBM ซ้ำ" — exactly true for MOMO/famountcount=1;
// the famountcount branch keeps the display == the cost the engine used.
function rowCbm(
  fvolume: number | string | null,
  famount: number | null,
  famountcount: number | string | null,
): number {
  const vol = Number(fvolume ?? 0);
  if (String(famountcount ?? "").trim() === "1") return vol; // total (MOMO)
  return vol * (Number(famount ?? 0) || 1); // per-box × boxes (manual multi-box)
}

export async function ForwarderImportItemsTable({ r, isJuristic = false }: Props) {
  const admin = createAdminClient();

  // ── Gather the sibling tracking rows (Issue ① · ภูม 2026-06-16) ──
  // A split parcel = multiple tb_forwarder rows sharing (baseTracking, userid).
  // Routed through the shared helper (ภูม 2026-06-23) so this DISPLAY and the
  // ยอดเก็บจริง collect calc on the page use the IDENTICAL row set — they can
  // never disagree on which trackings make up the shipment again.
  const base = baseTracking(r.ftrackingchn);
  const display = await fetchCountableForwarderSiblings(admin, r);

  // ── Item names for the รายละเอียด cell, batched across all siblings ──
  // shop-spawned (tb_order by reforder→hno) preferred, else tb_forwarder_item
  // by fid. Two queries total instead of N×2.
  const reforders = Array.from(
    new Set(display.map((row) => (row.reforder ?? "").trim()).filter((s) => s !== "")),
  );
  const fids = display.map((row) => row.id);

  const namesByHno = new Map<string, string[]>();
  if (reforders.length > 0) {
    const { data, error } = await admin
      .from("tb_order")
      .select("hno, ctitle")
      .in("hno", reforders)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error(`[ForwarderImportItemsTable tb_order]`, { code: error.code, message: error.message });
    } else {
      for (const it of (data ?? []) as { hno: string | null; ctitle: string | null }[]) {
        const hno = (it.hno ?? "").trim();
        const name = (it.ctitle ?? "").trim();
        if (hno === "" || name === "") continue;
        const list = namesByHno.get(hno);
        if (list) list.push(name);
        else namesByHno.set(hno, [name]);
      }
    }
  }

  const namesByFid = new Map<number, string[]>();
  if (fids.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder_item")
      .select("fid, productname")
      .in("fid", fids)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error(`[ForwarderImportItemsTable tb_forwarder_item]`, { code: error.code, message: error.message });
    } else {
      for (const it of (data ?? []) as { fid: number | null; productname: string | null }[]) {
        if (it.fid == null) continue;
        const name = (it.productname ?? "").trim();
        if (name === "") continue;
        const list = namesByFid.get(it.fid);
        if (list) list.push(name);
        else namesByFid.set(it.fid, [name]);
      }
    }
  }

  // ── Derive per-row display values + totals (legacy detail.php L372-377) ──
  const rendered = display.map((row) => {
    const reforder = (row.reforder ?? "").trim();
    const itemNames =
      reforder !== "" && namesByHno.has(reforder)
        ? namesByHno.get(reforder)!
        : (namesByFid.get(row.id) ?? []);
    // legacy uses fdetail as the row label; fall back to the joined item names,
    // then to the China tracking number (MOMO/auto imports carry only a
    // tracking, so it beats "ไม่พบข้อมูล" when there IS an identifier).
    const detailText =
      row.fdetail && row.fdetail.trim() !== "" && row.fdetail.trim() !== "..."
        ? row.fdetail.trim()
        : itemNames.length > 0
          ? itemNames[0]
          : (row.ftrackingchn ?? "").trim();

    const boxes                 = Number(row.famount ?? 0);
    const weight                = Number(row.fweight ?? 0);
    const cbm                   = rowCbm(row.fvolume, row.famount, row.famountcount);
    const frefRate              = Number(row.frefrate ?? 0);
    const fTotalPrice           = Number(row.ftotalprice ?? 0);
    const fPriceUpdate          = Number(row.fpriceupdate ?? 0);
    const priceCrate            = Number(row.pricecrate ?? 0);
    const fTransportPriceCHNTHB = Number(row.ftransportpricechnthb ?? 0);
    const fTransportPrice       = Number(row.ftransportprice ?? 0);
    const fShippingService      = Number(row.fshippingservice ?? 0);
    const priceOther            = Number(row.priceother ?? 0);
    const fDiscount             = Number(row.fdiscount ?? 0);
    const priceAllUser =
      fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
      fTransportPriceCHNTHB + priceCrate + priceOther - fDiscount;

    return {
      id: row.id,
      tracking: (row.ftrackingchn ?? "").trim(),
      itemNames,
      detailText,
      boxes,
      weight,
      cbm,
      frefRate,
      fTotalPrice,
      fPriceUpdate,
      priceCrate,
      fTransportPriceCHNTHB,
      fTransportPrice,
      fShippingService,
      priceOther,
      fDiscount,
      priceAllUser,
      width: Number(row.fwidth ?? 0),
      length: Number(row.flength ?? 0),
      height: Number(row.fheight ?? 0),
      warehouseLbl: WAREHOUSE_TH_LABEL[row.fwarehousename ?? ""] ?? "—",
      refPriceLabel: REF_PRICE_LABEL[row.frefprice ?? ""] ?? "ไม่พบข้อมูล",
      productTypeLbl: PRODUCT_TYPE_LABEL[row.fproductstype ?? ""] ?? "ไม่พบข้อมูล",
    };
  });

  const totals = rendered.reduce(
    (s, x) => ({
      boxes: s.boxes + x.boxes,
      weight: s.weight + x.weight,
      cbm: s.cbm + x.cbm,
      fTotalPrice: s.fTotalPrice + x.fTotalPrice,
      fPriceUpdate: s.fPriceUpdate + x.fPriceUpdate,
      priceCrate: s.priceCrate + x.priceCrate,
      fTransportPriceCHNTHB: s.fTransportPriceCHNTHB + x.fTransportPriceCHNTHB,
      fTransportPrice: s.fTransportPrice + x.fTransportPrice,
      fShippingService: s.fShippingService + x.fShippingService,
      priceOther: s.priceOther + x.priceOther,
      fDiscount: s.fDiscount + x.fDiscount,
      priceAllUser: s.priceAllUser + x.priceAllUser,
    }),
    {
      boxes: 0, weight: 0, cbm: 0, fTotalPrice: 0, fPriceUpdate: 0, priceCrate: 0,
      fTransportPriceCHNTHB: 0, fTransportPrice: 0, fShippingService: 0,
      priceOther: 0, fDiscount: 0, priceAllUser: 0,
    },
  );

  const TH = "px-2 py-2 font-semibold text-muted whitespace-nowrap border-r border-border";
  const TD = "px-2 py-2 text-right font-mono tabular-nums whitespace-nowrap border-r border-border";
  const TDc = "px-2 py-2 text-center whitespace-nowrap border-r border-border";

  const shipmentId = base || (rendered[0]?.tracking ?? "—");
  const productLabel = rendered[0]?.productTypeLbl ?? "—";
  // คิดราคาตาม / เรทนำเข้า can differ per แทค → only show one value when the whole
  // shipment is uniform, else "—" (mixed) so the aggregate isn't misleading.
  const uniqRef = new Set(rendered.map((x) => x.refPriceLabel));
  const uniqRate = new Set(rendered.map((x) => x.frefRate));
  const refPriceCell = uniqRef.size === 1 ? [...uniqRef][0] : "—";
  const rateCell = uniqRate.size === 1 ? fmtMoney([...uniqRate][0]) : "—";

  // LESS WITHHOLDING TAX 1% — PCS column (owner ภูม 2026-06-18 · owner 2026-06-24).
  // The legacy "รายการสินค้า" table ALWAYS renders this column for EVERY customer
  // (นิติ/บุคคล · ยอดถึง/ไม่ถึง) — when no WHT applies the cell is just blank, the
  // column never disappears (owner: "ขึ้นโชว์ตลอด ถ้าไม่หักก็ไม่ต้องใส่ยอด").
  // WHT is DEDUCTED for a juristic customer (นิติบุคคล) — owner 2026-07-22: the
  // ฿1,000 minimum was abolished, so it applies on ANY positive amount (this now
  // matches calcForwarderOutstanding, which never had the minimum). `applyWHT`
  // gates the AMOUNT, never the column.
  const applyWHT = isJuristic && totals.priceAllUser > 0;
  const wht1 = applyWHT ? Math.round(totals.priceAllUser * 0.01 * 100) / 100 : 0;
  const netAfterWht = totals.priceAllUser - wht1;

  // 2026-06-18 (พี่ป๊อป via ภูม) — TOTAL-ONLY summary. The per-แทค breakdown was
  // rejected ("เอาแค่รวมทั้งหมด"); the per-tracking dimension/price detail lives
  // in the edit form below (per-tracking editor). This table = ONE aggregated row
  // in the legacy PCS 16-col layout (matches the owner's PCS reference).
  return (
    <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border">
      <table className="w-full text-xs md:text-sm">
        <thead className="text-[11px] md:text-[11px] uppercase tracking-wide bg-surface-alt/50 text-center">
          <tr>
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
            <th className={`${TH} text-[11px] leading-tight text-blue-700`}>LESS<br />WITHHOLDING<br />TAX 1%</th>
            <th className={`${TH} font-bold`}>ราคารวม</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border align-top bg-primary-50/30 dark:bg-primary-950/10">
            <td className="px-2 py-2 min-w-[200px] max-w-[320px] text-left border-r border-border">
              <span className="break-words font-semibold text-primary-700">{shipmentId}</span>
              {rendered.length > 1 && (
                <span className="ml-1 text-[11px] text-muted">({rendered.length} แทรคกิง)</span>
              )}
              <div className="mt-0.5 text-[11px] text-muted">ประเภท : {productLabel}</div>
            </td>
            <td className={TD}>{totals.boxes}</td>
            <td className={TD}>{fmtNum(totals.weight, 2)}</td>
            <td className={TD}>{fmtNum(totals.cbm, 6)}</td>
            <td className={TDc}>{refPriceCell}</td>
            <td className={TD}>{rateCell}</td>
            <td className={TD}>{fmtMoney(totals.fTotalPrice)}</td>
            <td className={TD}>{fmtMoney(totals.fPriceUpdate)}</td>
            <td className={TD}>{fmtMoney(totals.priceCrate)}</td>
            <td className={TD}>{fmtMoney(totals.fTransportPriceCHNTHB)}</td>
            <td className={TD}>{fmtMoney(totals.fTransportPrice)}</td>
            <td className={TD}>{fmtMoney(totals.fShippingService)}</td>
            <td className={TD}>{fmtMoney(totals.priceOther)}</td>
            <td className={`${TD} text-amber-700`}>{totals.fDiscount > 0 ? `−${fmtMoney(totals.fDiscount)}` : fmtMoney(0)}</td>
            <td className={`${TD} text-blue-700`}>{applyWHT ? `−${fmtMoney(wht1)}` : <span className="text-muted">—</span>}</td>
            <td className={`${TD} font-bold text-red-600`}>{fmtMoney(netAfterWht)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
