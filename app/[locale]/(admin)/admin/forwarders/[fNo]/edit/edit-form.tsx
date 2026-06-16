"use client";

/**
 * Client form for /admin/forwarders/[fNo]/edit — Wave 12-C ภาค 2.
 *
 * Per docs/learnings/pacred-design-philosophy.md:
 *   - Legacy field list = data source (fweight · L×W×H · fvolume · fproductstype ·
 *     frefprice · fnote + per-item chinawoodencratefee*)
 *   - Pacred UI = our Tailwind cards · live CBM preview · chips for enums ·
 *     friendly empty states (NEVER copy BS4 markup from forwarder.php)
 *
 * Auto-CBM preview is the legacy formula: (W × L × H) / 1,000,000 (cm³ → m³).
 */

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { adminUpdateForwarderDimensions } from "@/actions/admin/forwarders-edit";

export type EditItemRow = {
  itemId:        number;
  name:          string;
  tracking:      string;
  qty:           number;
  weightPerItem: number;
  weightAll:     number;
  cbmPerItem:    number;
  cbmAll:        number;
  crateFee:      number;
  crateType:     "1" | "2";   // '1' ไม่ตี · '2' ตีลัง (legacy enum)
};

type ProductType    = "1" | "2" | "3" | "4";
type RefPrice       = "1" | "2";
type WarehouseChina = "1" | "2";
type WarehouseTh    = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string; sub: string }[] = [
  { value: "1", label: "ทั่วไป",  sub: "Generic" },
  { value: "2", label: "มอก.",   sub: "TIS / มาตรฐานอุตสาหกรรม" },
  { value: "3", label: "อย.",    sub: "FDA · อาหาร/ยา/เครื่องสำอาง" },
  { value: "4", label: "พิเศษ",  sub: "Special goods · ติดต่อเซลส์" },
];

const REF_PRICE_OPTIONS: { value: RefPrice; label: string; sub: string }[] = [
  { value: "1", label: "kgs", sub: "ราคา = น้ำหนัก × เรท/กก." },
  { value: "2", label: "cbm", sub: "ราคา = CBM × เรท/cbm" },
];

// Match legacy optionWarehouse() (member/pcs-admin/include/function.php L1823-1833)
// + nameWarehouseChina() (L1049). Order matches the legacy dropdown.
const WAREHOUSE_CHINA_OPTIONS: { value: WarehouseChina; label: string }[] = [
  { value: "1", label: "กวางโจว" },
  { value: "2", label: "อี้อู" },
];
const WAREHOUSE_TH_OPTIONS: { value: WarehouseTh; label: string }[] = [
  { value: "1", label: "แสง" },
  { value: "2", label: "CTT" },
  { value: "3", label: "MK" },
  { value: "4", label: "MX" },
  { value: "5", label: "JMF" },
  { value: "6", label: "GOGO" },
  { value: "7", label: "Cargo Center" },
  { value: "8", label: "MOMO" },
];

// 2026-06-05 (ภูม flag · PCS-style summary): tiny row for the right-column
// summary block. Mirrors legacy update.php right-aligned label/value list.
function Summary({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <span className={`font-mono tabular-nums ${negative ? "text-red-600" : "text-foreground"}`}>
        {negative ? "−" : ""}฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </span>
    </p>
  );
}

// (W × L × H) / 1,000,000 (cm³ → m³) · 5-dp — the legacy CBM formula. Used to
// AUTO-FILL the now-editable CBM field as the admin types dimensions (Issue 3).
// Returns a string so it can seed the CBM <input> state directly.
function cbmFromDims(w: string, l: string, h: string): string {
  const wn = parseFloat(w) || 0;
  const ln = parseFloat(l) || 0;
  const hn = parseFloat(h) || 0;
  const v = (wn * ln * hn) / 1_000_000;
  return (Math.round(v * 100_000) / 100_000).toFixed(5);
}

export function AdminForwarderEditForm({
  fNo,
  idNumeric,
  weightInit,
  widthInit,
  lengthInit,
  heightInit,
  volumeInit,
  productTypeInit,
  refPriceInit,
  noteInit,
  itemsInit,
  // 2026-06-05 — legacy update.php parity props (all optional defaults)
  customRateInit         = "0",
  customRateKgInit       = 40,      // legacy default L1080
  customRateCbmInit      = 7500,    // legacy default L1084
  fDiscountInit          = 0,
  fTransportPriceChnThbInit = 0,
  priceOtherInit         = 0,
  fTransportPriceInit    = 0,
  fShippingServiceInit   = 0,
  fWarehouseChinaInit    = "1",
  fWarehouseNameInit     = "1",
}: {
  fNo:              string;
  idNumeric:        number;
  weightInit:       number;
  widthInit:        number;
  lengthInit:       number;
  heightInit:       number;
  volumeInit:       number;
  productTypeInit:  ProductType;
  refPriceInit:     RefPrice;
  noteInit:         string;
  itemsInit:        EditItemRow[];
  // 2026-06-05 — legacy update.php parity
  customRateInit?:           "0" | "1";
  customRateKgInit?:         number;
  customRateCbmInit?:        number;
  fDiscountInit?:            number;
  fTransportPriceChnThbInit?: number;
  priceOtherInit?:           number;
  fTransportPriceInit?:      number;
  fShippingServiceInit?:     number;
  fWarehouseChinaInit?:      WarehouseChina;
  fWarehouseNameInit?:       WarehouseTh;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [weight,      setWeight]      = useState<string>(weightInit ? String(weightInit) : "0");
  const [width,       setWidth]       = useState<string>(widthInit  ? String(widthInit)  : "0");
  const [length,      setLength]      = useState<string>(lengthInit ? String(lengthInit) : "0");
  const [height,      setHeight]      = useState<string>(heightInit ? String(heightInit) : "0");
  // Issue 3 (ภูม 2026-06-16 "แก้ให้สามารถแก้ไข CBM ได้ด้วย") — CBM is now an
  // EDITABLE field, not a read-only W×L×H derivation. Seed from the stored
  // fvolume; typing W/L/H auto-recomputes it (the convenience is kept), but
  // typing CBM directly overrides — last-edit-wins. It drives the by-volume
  // price leg, so a manual CBM is authoritative for billing too.
  const [cbm,         setCbm]         = useState<string>(volumeInit ? String(volumeInit) : "0");
  const [productType, setProductType] = useState<ProductType>(productTypeInit);
  const [refPrice,    setRefPrice]    = useState<RefPrice>(refPriceInit);
  const [note,        setNote]        = useState<string>(noteInit);
  const [items,       setItems]       = useState<EditItemRow[]>(itemsInit);

  // 2026-06-05 — legacy override block + warehouses + cost adders
  const [customRate,    setCustomRate]    = useState<"0" | "1">(customRateInit);
  const [customRateKg,  setCustomRateKg]  = useState<string>(String(customRateKgInit));
  const [customRateCbm, setCustomRateCbm] = useState<string>(String(customRateCbmInit));
  const [fDiscount,             setFDiscount]             = useState<string>(String(fDiscountInit));
  const [fTransportPriceChnThb, setFTransportPriceChnThb] = useState<string>(String(fTransportPriceChnThbInit));
  const [priceOther,            setPriceOther]            = useState<string>(String(priceOtherInit));
  const [fTransportPrice,       setFTransportPrice]       = useState<string>(String(fTransportPriceInit));
  const [fShippingService,      setFShippingService]      = useState<string>(String(fShippingServiceInit));
  const [fWarehouseChina, setFWarehouseChina] = useState<WarehouseChina>(fWarehouseChinaInit);
  const [fWarehouseName,  setFWarehouseName]  = useState<WarehouseTh>(fWarehouseNameInit);

  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Lane C — min-sell guardrail warning (shown when the resolved transport
  // price lands below the per-route sales floor · business_config).
  const [minSellWarn, setMinSellWarn] = useState<string | null>(null);

  // Numeric parse + CBM preview — same formula legacy uses:
  // (W × L × H) / 1,000,000 (cm³ → m³).
  const parsed = useMemo(() => {
    return {
      width:  parseFloat(width)  || 0,
      length: parseFloat(length) || 0,
      height: parseFloat(height) || 0,
      weight: parseFloat(weight) || 0,
    };
  }, [weight, width, length, height]);

  // CBM as a number (from the editable `cbm` state · 5-dp) — replaces the old
  // parsed.cbm. CBM is no longer a pure W×L×H derivation (Issue 3): it can be
  // typed directly, so the authoritative numeric reads off the `cbm` state.
  const cbmNum = useMemo(() => {
    const v = parseFloat(cbm) || 0;
    return Math.round(v * 100_000) / 100_000;
  }, [cbm]);

  // Per-item crate UI is intentionally dropped in this PCS-style one-card
  // layout (state preserved via `items` for future re-introduction). The
  // crateSummary still drives the read-only "ค่าตีลังไม้ (sum)" cell.

  const crateSummary = useMemo(() => {
    const cratedCount = items.filter((it) => it.crateType === "2").length;
    const totalFee = items
      .filter((it) => it.crateType === "2")
      .reduce((sum, it) => sum + (Number(it.crateFee) || 0), 0);
    return { cratedCount, totalFee };
  }, [items]);

  // ── Live calc preview (mirrors legacy calPrice.php L210-269) ───────────
  // Numbers parsed for the preview. Server still resolves the authoritative
  // rate (waterfall) — this is just a visual sanity-check for the admin.
  const preview = useMemo(() => {
    const w  = parseFloat(weight)                || 0;
    const v  = cbmNum;   // Issue 3 — by-volume leg uses the editable CBM
    const cr = customRate === "1";
    const rateKg  = parseFloat(customRateKg)  || 0;
    const rateCbm = parseFloat(customRateCbm) || 0;
    // Only honest when the override is on (we have a rate to multiply by).
    const showRates = cr;
    const priceByKg  = showRates ? w * rateKg     : 0;
    const priceByCbm = showRates ? v * rateCbm    : 0;
    // Legacy preview chooses the higher of the two when "ราคามากสุด" mode
    // is active (no comparison override per the user's submitted fields).
    const transport = showRates ? Math.max(priceByKg, priceByCbm) : 0;
    const adders =
      transport +
      (parseFloat(fShippingService)        || 0) +
      (parseFloat(fTransportPriceChnThb)   || 0) +
      crateSummary.totalFee +
      (parseFloat(priceOther)              || 0) +
      (parseFloat(fTransportPrice)         || 0);
    const grand = adders - (parseFloat(fDiscount) || 0);
    return {
      showRates,
      priceByKg,
      priceByCbm,
      transport,
      adders,
      grand,
    };
  }, [
    weight, cbmNum, customRate,
    customRateKg, customRateCbm, fShippingService, fTransportPriceChnThb,
    crateSummary.totalFee, priceOther, fTransportPrice, fDiscount,
  ]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setMinSellWarn(null);

    if (parsed.weight < 0 || parsed.width < 0 || parsed.length < 0 || parsed.height < 0) {
      setError("ค่าทุกช่องต้อง ≥ 0");
      return;
    }

    startTransition(async () => {
      const res = await adminUpdateForwarderDimensions({
        fNo:          fNo,
        weightKg:     parsed.weight,
        widthCm:      parsed.width,
        lengthCm:     parsed.length,
        heightCm:     parsed.height,
        volumeCbm:    cbmNum,      // Issue 3 — send the (possibly hand-typed) CBM
        productType,
        refPrice,
        note:         note.trim() || undefined,
        items:        items.map((it) => ({
          itemId:    it.itemId,
          crateType: it.crateType,
          crateFee:  Number(it.crateFee) || 0,
        })),
        // 2026-06-05 — legacy update.php override block + adders + warehouses
        customRate,
        customRateKg:          parseFloat(customRateKg)        || 0,
        customRateCbm:         parseFloat(customRateCbm)       || 0,
        fDiscount:             parseFloat(fDiscount)           || 0,
        fTransportPriceChnThb: parseFloat(fTransportPriceChnThb) || 0,
        priceOther:            parseFloat(priceOther)          || 0,
        fTransportPrice:       parseFloat(fTransportPrice)     || 0,
        fShippingService:      parseFloat(fShippingService)    || 0,
        fWarehouseChina,
        fWarehouseName,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      {
        const d = res.data;
        const basisTh = d?.basis === "cbm" ? "ปริมาตร (CBM)" : "น้ำหนัก (KG)";
        const priceTxt =
          d != null
            ? ` · ค่านำเข้าจีน-ไทย ฿${d.ftotalprice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` +
              ` (คิดตาม${basisTh} @ ฿${d.frefrate.toLocaleString("th-TH", { minimumFractionDigits: 2 })})` +
              ` · ราคารวม ฿${d.grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
            : "";
        setSuccess(
          `✓ บันทึกขนาด/น้ำหนักสำเร็จ — CBM = ${d?.cbm?.toFixed(5)} m³${priceTxt} — กำลังพากลับหน้ารายละเอียด...`,
        );
        // Lane C — surface the min-sell hard-warning when the resolved price
        // is below the sales floor. Keep it on-screen longer (no auto-redirect
        // while warning) so the pricer sees it before the bounce-back.
        if (d?.minSell && d.minSell.level === "below" && d.minSell.message) {
          setMinSellWarn(d.minSell.message);
        }
      }
      // If we tripped a min-sell warning, hold on the form (let the pricer read
      // it) instead of bouncing back; otherwise return to the detail page.
      if (!(res.data?.minSell && res.data.minSell.level === "below")) {
        setTimeout(() => {
          router.push(`/admin/forwarders/${fNo}`);
          router.refresh();
        }, 900);
      }
    });
  }

  // 2026-06-11 (ปอน · owner "ทำให้เหมือน excel เป็นแถวๆตารางๆ") — cell styles for the
  // horizontal input TABLE (header columns + one editable row · scrolls sideways),
  // mirroring the read-only รายการสินค้า table. Same inputs/handlers/calc as before;
  // only the layout changed from a wrapping grid to a table.
  const CELL_TH = "whitespace-nowrap px-2 py-2 text-center text-[10px] md:text-[11px] font-semibold text-muted";
  const CELL_NUM = "w-full min-w-[84px] rounded-md border border-border px-2 py-1.5 text-sm font-mono tabular-nums text-right outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200 disabled:opacity-60";
  const CELL_SEL = "w-full min-w-[120px] rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200 disabled:opacity-60";
  const CELL_RO = "w-full min-w-[88px] rounded-md border border-red-200 bg-red-50/30 px-2 py-1.5 text-sm font-mono tabular-nums text-right text-red-700";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* ─── Toast ─────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {success}
        </div>
      )}
      {minSellWarn && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p className="font-medium">{minSellWarn}</p>
          <p className="text-xs text-amber-700">
            บันทึกแล้ว — แต่ราคาต่ำกว่าราคาขายขั้นต่ำที่ตั้งไว้ (นโยบายฝ่ายขาย) · ปรับราคาขั้นต่ำได้ที่{" "}
            <Link href="/admin/settings/business-config" className="underline font-medium">ตั้งค่าระบบ (pricing.min_sell_floor)</Link>
          </p>
          <button
            type="button"
            onClick={() => { router.push(`/admin/forwarders/${fNo}`); router.refresh(); }}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
          >
            รับทราบ · กลับหน้ารายละเอียด →
          </button>
        </div>
      )}

      {/* ─── 📋 PCS-STYLE ONE-CARD LAYOUT (2026-06-05 ภูม flag — "ใหญ่ลายตา · เอาแบบนี้
            เลย ข้อมูลอะไรก็ขึ้นให้เหมือนไปเลย") · faithful port of pcs-admin's
            forwarder/update.php "กรอกรายละเอียดสินค้า" block (the screenshot).
            ALL fields in ONE card · 3 row grid · live calc + summary at bottom.
            Replaces what used to be 4 separate "DIMENSIONS / PRODUCT TYPE /
            REF PRICE / per-item-crate" sections + 4 more agent-port sections.
            Per-item crate UI deferred (state preserved through `items`). */}
      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
        {/* Header row: title left · 2 toggles right */}
        <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-foreground">📦 กรอกรายละเอียดสินค้า</h2>
          <div className="flex items-center gap-4 text-[11px]">
            <label className="flex cursor-pointer items-center gap-1.5 select-none">
              <input
                type="checkbox"
                checked={customRate === "1"}
                onChange={(e) => setCustomRate(e.target.checked ? "1" : "0")}
                disabled={pending}
                className="h-3.5 w-3.5 rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <span className={customRate === "1" ? "font-medium text-red-700" : "text-muted"}>
                คิดราคาแบบกำหนดเอง
              </span>
            </label>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-700 border border-primary-200 font-medium">item #1</span>
          </div>
        </div>

        {/* ── 📊 ตารางกรอกข้อมูล (แบบ Excel · หัวตารางเป็นคอลัมน์ + แถวกรอก 1 แถว ·
             เลื่อนแนวนอนได้) — owner 2026-06-11 "ทำให้เหมือน excel เป็นแถวๆตารางๆ" ·
             ให้เหมือนตาราง รายการสินค้า ด้านล่าง. input/handler/calc เหมือนเดิมทุกตัว. ── */}
        <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border mb-3">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 uppercase tracking-wide">
              <tr>
                <th className={CELL_TH}>โกดังต้นทาง (จีน)</th>
                <th className={CELL_TH}>โกดังที่รับ (ไทย)</th>
                <th className={CELL_TH}>ประเภทสินค้า</th>
                <th className={CELL_TH}>คิดเรทตาม</th>
                {customRate === "1" && <th className={CELL_TH}>เรท/กก. (฿)</th>}
                <th className={CELL_TH}>น้ำหนัก (Kg)</th>
                <th className={CELL_TH}>กว้าง (cm)</th>
                <th className={CELL_TH}>ยาว (cm)</th>
                <th className={CELL_TH}>สูง (cm)</th>
                <th className={`${CELL_TH} text-red-600`}>CBM (แก้ได้)</th>
                {customRate === "1" && <th className={CELL_TH}>เรท/CBM (฿)</th>}
                <th className={`${CELL_TH} text-red-600`}>ค่าขนส่งในไทย</th>
                <th className={CELL_TH}>ส่วนลด</th>
                <th className={CELL_TH}>ค่าจีน+ ภายหลัง</th>
                <th className={`${CELL_TH} text-red-600`}>ค่าตีลัง (รวม)</th>
                <th className={CELL_TH}>ค่าอื่นๆ</th>
                <th className={CELL_TH}>ค่าบริการ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border align-top [&>td]:px-1.5 [&>td]:py-1.5">
                <td>
                  <select value={fWarehouseChina} onChange={(e) => setFWarehouseChina(e.target.value as WarehouseChina)} disabled={pending} className={CELL_SEL}>
                    {WAREHOUSE_CHINA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  <select value={fWarehouseName} onChange={(e) => setFWarehouseName(e.target.value as WarehouseTh)} disabled={pending} className={CELL_SEL}>
                    {WAREHOUSE_TH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  <select value={productType} onChange={(e) => setProductType(e.target.value as ProductType)} disabled={pending} className={CELL_SEL}>
                    {PRODUCT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  <select value={refPrice} onChange={(e) => setRefPrice(e.target.value as RefPrice)} disabled={pending} className={CELL_SEL}>
                    {REF_PRICE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                {customRate === "1" && (
                  <td>
                    <input type="number" min={0} step="0.01" value={customRateKg} onChange={(e) => setCustomRateKg(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="40" />
                  </td>
                )}
                <td>
                  <input type="number" min={0} step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={width} onChange={(e) => { const v = e.target.value; setWidth(v); setCbm(cbmFromDims(v, length, height)); }} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={length} onChange={(e) => { const v = e.target.value; setLength(v); setCbm(cbmFromDims(width, v, height)); }} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={height} onChange={(e) => { const v = e.target.value; setHeight(v); setCbm(cbmFromDims(width, length, v)); }} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  {/* Issue 3 — CBM editable: type W/L/H to auto-fill, or type
                      CBM directly to override (last edit wins). */}
                  <input type="number" min={0} step="0.00001" value={cbm} onChange={(e) => setCbm(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00000" />
                </td>
                {customRate === "1" && (
                  <td>
                    <input type="number" min={0} step="0.01" value={customRateCbm} onChange={(e) => setCustomRateCbm(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="7500" />
                  </td>
                )}
                <td>
                  <input type="number" min={0} step="0.01" value={fTransportPrice} onChange={(e) => setFTransportPrice(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={fDiscount} onChange={(e) => setFDiscount(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={fTransportPriceChnThb} onChange={(e) => setFTransportPriceChnThb(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="text" readOnly value={crateSummary.totalFee.toFixed(2)} className={CELL_RO} />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={priceOther} onChange={(e) => setPriceOther(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
                <td>
                  <input type="number" min={0} step="0.01" value={fShippingService} onChange={(e) => setFShippingService(e.target.value)} disabled={pending} className={CELL_NUM} placeholder="0.00" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Info text (1 บรรทัด) ── */}
        <p className="text-[11px] text-muted mb-3 pl-1">
          ⚠ ควรกรอกข้อมูลเมื่อสินค้าถึงไทยเท่านั้น · ส่วนลด + ค่าขนส่งโปรโมจะถูกคำนวณอัตโนมัติตอนลูกค้าชำระ
        </p>

        {/* ── Bottom: 2-col grid · live calc breakdown LEFT · summary block RIGHT ── */}
        <div className="grid gap-4 sm:grid-cols-[1fr,260px] border-t border-border pt-3">
          {/* LEFT — calc breakdown */}
          <div className="space-y-1 text-xs font-mono tabular-nums">
            <p className="font-semibold text-foreground mb-1 font-sans not-italic">ราคานำเข้าจีน-ไทย:</p>
            <p>คิดตามน้ำหนัก {parsed.weight.toFixed(2)} × {(parseFloat(customRateKg) || 0).toFixed(2)} = <strong>฿{preview.priceByKg.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
            <p>คิดตามปริมาตร {cbmNum.toFixed(5)} × {(parseFloat(customRateCbm) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} = <strong>฿{preview.priceByCbm.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
            <p className="inline-flex items-center gap-1 rounded bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium mt-1">
              ระบบเลือก คิดตามราคามากสุด → ฿{preview.transport.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
            <div className="border-t border-border mt-2 pt-2 space-y-0.5">
              <p>รวมค่าใช้จ่าย: <strong className="text-foreground">฿{preview.adders.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
              <p>− ส่วนลด: <strong className="text-red-600">฿{(parseFloat(fDiscount) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
              <p className="text-[10px] text-muted italic">* กำไรสุทธิคำนวณตอนกดบันทึก (ต้นทุนจาก server-side rate waterfall)</p>
            </div>
          </div>
          {/* RIGHT — summary block */}
          <div className="rounded-lg border border-border bg-surface-alt/50 p-3 space-y-1 text-xs">
            <Summary label="ค่านำเข้าจีน-ไทย" value={preview.transport} />
            <Summary label="ค่าขนส่งจีน+ ภายหลัง" value={parseFloat(fTransportPriceChnThb) || 0} />
            <Summary label="ค่าบริการ" value={parseFloat(fShippingService) || 0} />
            <Summary label="ค่าตีลังไม้" value={crateSummary.totalFee} />
            <Summary label="ค่าอื่นๆ (CO)" value={parseFloat(priceOther) || 0} />
            <Summary label="ค่าขนส่งในไทย" value={parseFloat(fTransportPrice) || 0} />
            <Summary label="ส่วนลด" value={parseFloat(fDiscount) || 0} negative />
            <div className="border-t border-border pt-1.5 mt-1.5">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">ราคารวมสุทธิ:</span>
                <strong className="text-red-600 text-sm font-mono tabular-nums">
                  ฿{preview.grand.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 📝 ADMIN NOTE ────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-foreground">📝 หมายเหตุแอดมิน</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="หมายเหตุ — เห็นเฉพาะแอดมิน"
            disabled={pending}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
          />
          <p className="mt-0.5 text-right text-[10px] text-muted">{note.length}/2,000</p>
        </label>
      </section>

      {/* ─── STICKY ACTIONS ─────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={pending}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] text-muted font-mono tabular-nums">
              #{idNumeric} · {parsed.weight.toFixed(2)} kg · {cbmNum.toFixed(5)} cbm
            </span>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังบันทึก..." : "✓ บันทึกขนาด/น้ำหนัก"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
