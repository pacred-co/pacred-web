"use client";

/**
 * Editable per-item price table — THE missing core of the shop-order
 * detail page (legacy `pcs-admin/include/pages/shops/update/update1.php`).
 *
 * Faithful to legacy WORKFLOW (fields/columns/formula/save), Pacred UI
 * (clean Tailwind, NOT Bootstrap markup) per AGENTS.md §0a.
 *
 * Live-calc mirrors `update1Script.php`:
 *   per-line  = round_up((cAmount × cPrice) + cShippingCHN, 2)
 *   Σ CHN     = Σ round_up(cPrice × cAmount, 2)         (header hTotalPriceCHN)
 *   Σ shipCHN = Σ cShippingCHN                          (header hShippingCHN)
 *   net THB   = round_up(((ΣCHN + ΣshipCHN) × hRate) + hShippingService, 2)
 *   กำไรสุทธิ  = ((ΣCHN + ΣshipCHN) × hRate) − (hRateCost × hCostAll)
 *
 * On save → `adminSaveShopOrderItemsAndQuote` (the legacy update2 port):
 * UPDATEs every line + recomputes header totals + flips hStatus 1→2 +
 * hDatePayment NOW+5d + 4-CH notify. Status 1 + 2 only (1=quote, 2=re-save
 * before customer pays).
 *
 * The delete / refund per-row buttons call the existing governance +
 * refund actions (adminDeleteOrderItem / adminRefundShopOrderItem).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw, Save, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSaveShopOrderItemsAndQuote } from "@/actions/admin/service-orders-shop-workflow";
import {
  adminUpdateOrderItemCrate,
  adminUpdateShopItemsCrate,
} from "@/actions/admin/service-orders-header-edits";
import { ItemImageEditor } from "./item-image-editor";
import { adminDeleteOrderItem } from "@/actions/admin/service-orders-governance";
import { detectProviderFromUrl } from "@/lib/china-search/extract-product-id";
import {
  deriveOrderCurrencyInfo,
  foreignToYuan,
  yuanToForeign,
  effRateFromForeignRate,
} from "@/lib/forwarder/usd-order-pricing";

// round_up(x, 2) — CEIL to 2dp (matches legacy round_up + lib roundUp).
function roundUp2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const eps = 1e-9 * Math.max(1, Math.abs(v * 100));
  const r = Math.ceil(v * 100 - eps) / 100;
  return r === 0 ? 0 : r;
}
function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cny(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type EditorItem = {
  id:           number;
  provider:     string | null;
  cnameshop:    string | null;
  ctitle:       string | null;
  curl:         string | null;
  cimages:      string | null;   // RAW stored value — editable via <ItemImageEditor>
  coverUrl:     string | null;   // resolved cimages → displayable URL
  ccolor:       string | null;
  csize:        string | null;
  cdetails:     string | null;
  cnote:        string | null;
  camount:      number;
  cprice:       number;
  cshippingchn: number;
  cpriceupdate: number;
  crewallet:    string | null;   // '1' = full-refunded (locked)
  // mig 0248 — the ORIGINAL currency + amount the price was entered in ('' / 0 for
  // a plain ¥ row). `cprice` above stays the ¥-equivalent that pricing runs on.
  inputCurrency: string | null;
  inputPrice:    number;
  // fix #4 — per-line ตีลังไม้ flag (tb_order.hcrate · '1'=ตีลัง · '2'/null=ไม่ตีลัง).
  hcrate:        string | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  "1": "1688",
  "2": "Taobao",
  "3": "Tmall",
  "4": "Pacred Shops",
  "5": "Nice",
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt disabled:text-muted";

type RowState = {
  camount: string;
  cprice: string;
  cshippingchn: string;
  cpriceUsd: string;
  /** Foreign orders — the editable {cur} view of ค่าขนส่งจีน (stored ¥ =
   *  round2($ × yuanPerUnit), same pattern as cpriceUsd ↔ cprice). */
  cshipUsd: string;
};

export function ShopItemsEditor({
  hNo,
  hRate,
  husdRate = 0,
  hShippingService,
  hRateCostDefault,
  hRateCostInit,
  hCostAllInit,
  items,
  superAdmin,
}: {
  hNo:              string;
  hRate:            number;
  /** mig 0252 — the operator's TYPED บาท/{cur} rate (stored verbatim); 0 = derive. */
  husdRate?:        number;
  hShippingService: number;
  hRateCostDefault: number;
  hRateCostInit:    number;
  hCostAllInit:     number;
  items:            EditorItem[];
  superAdmin:       boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // mig 0248 — when EVERY priced line was opened in ONE foreign currency (USD/…),
  // surface it as the order's real currency (owner P22353: "ข้างในควรขึ้นเป็น US
  // Dollar + อัตราเรท US · ปรับเรท 5.1 ไม่ได้ เกิน 20 ต้องเป็น USD"). The supplier
  // ¥/foreign ratio (yuanPerUnit) is FIXED from the ORIGINAL rows and never drifts
  // as staff edit the $ price or the บาท/{cur} rate; the ¥-equivalent `cprice`
  // stays exactly what pricing runs on.
  // The detection + FIXED ratio live in the SHARED helper (usd-order-pricing)
  // so every surface (this editor · /edit summary · read-only detail) derives
  // the exact same yuanPerUnit — never re-invented per surface (drift).
  const orderCurInfo = useMemo(() => deriveOrderCurrencyInfo(items, hRate), [items, hRate]);
  const fmtCur = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Per-row editable state — keyed by tb_order.id. Refunded rows (crewallet
  // === '1') render their values read-only (legacy disabled input). For a
  // foreign order, `cpriceUsd` is the editable $ view; `cprice` stays the ¥
  // source of truth (= round2($ × yuanPerUnit)).
  const [rows, setRows] = useState<Record<number, RowState>>(() => {
    const init: Record<number, RowState> = {};
    for (const it of items) {
      let cpriceUsd = "";
      let cshipUsd = "";
      if (orderCurInfo) {
        const orig = Number(it.inputPrice) || 0;
        cpriceUsd = String(orig > 0 ? orig : yuanToForeign(Number(it.cprice) || 0, orderCurInfo.yuanPerUnit));
        // ค่าขนส่งจีน entered in {cur} too (owner 2026-07-13 "ทุกช่องเป็นสกุลหลัก") —
        // seed the view from the stored ¥ ÷ yuanPerUnit.
        cshipUsd = String(yuanToForeign(Number(it.cshippingchn) || 0, orderCurInfo.yuanPerUnit));
      }
      init[it.id] = {
        camount:      String(it.crewallet === "1" ? 0 : it.camount),
        cprice:       String(it.cprice),
        cshippingchn: String(it.cshippingchn),
        cpriceUsd,
        cshipUsd,
      };
    }
    return init;
  });
  // COST pair — foreign orders DISPLAY + EDIT in {cur} (rate = บาท/{cur} ·
  // cost = {cur}); onSave converts back to the stored ¥-based hratecost
  // (÷ yuanPerUnit) + hcostall ¥ (× yuanPerUnit) so storage semantics are
  // unchanged. Note the THB previews/profit use the displayed PAIR product,
  // which is identical either way: (¥rate×ypu) × (¥cost÷ypu) = ¥rate × ¥cost.
  const [hRateCost, setHRateCost] = useState<string>(() => {
    const baseYuanRate = hRateCostInit !== 0 ? hRateCostInit : hRateCostDefault;
    return orderCurInfo
      ? (baseYuanRate * orderCurInfo.yuanPerUnit).toFixed(4)
      : String(baseYuanRate);
  });
  const [hCostAll, setHCostAll] = useState<string>(() => {
    if (hCostAllInit === 0) return "";
    return orderCurInfo
      ? String(yuanToForeign(hCostAllInit, orderCurInfo.yuanPerUnit))
      : String(hCostAllInit);
  });
  // Editable บาท/{cur} rate (foreign orders only · >20 allowed · default = the
  // order's opened rate). effRate feeds the ¥→฿ net calc + is saved as hrate.
  const [bahtPerCur, setBahtPerCur] = useState<string>(
    // mig 0252 — show the operator's TYPED rate verbatim when stored (no 2dp-hrate
    // round-trip drift, e.g. 35 → 35.006); fall back to the derived value.
    orderCurInfo
      ? (husdRate > 0 ? String(husdRate) : orderCurInfo.bahtPerUnit.toFixed(4))
      : "",
  );
  const effRate = orderCurInfo
    ? effRateFromForeignRate(Number(bahtPerCur) || 0, orderCurInfo.yuanPerUnit)
    : hRate;

  function patch(id: number, key: keyof RowState, value: string) {
    setRows((r) => ({ ...r, [id]: { ...r[id], [key]: value } }));
  }
  // Foreign-order price edit: the operator types $ / piece; store the ¥-equiv
  // (round2($ × yuanPerUnit)) as the source of truth + keep the typed $ view.
  function patchForeignPrice(id: number, usdStr: string) {
    const usd = Number(usdStr) || 0;
    const yuan = orderCurInfo ? foreignToYuan(usd, orderCurInfo.yuanPerUnit) : usd;
    setRows((r) => ({ ...r, [id]: { ...r[id], cpriceUsd: usdStr, cprice: String(yuan) } }));
  }
  // Foreign-order ค่าขนส่งจีน edit: typed in {cur} → store the ¥-equiv
  // (round2($ × yuanPerUnit)) as the source of truth + keep the typed view.
  function patchForeignShip(id: number, shipStr: string) {
    const f = Number(shipStr) || 0;
    const yuan = orderCurInfo ? foreignToYuan(f, orderCurInfo.yuanPerUnit) : f;
    setRows((r) => ({ ...r, [id]: { ...r[id], cshipUsd: shipStr, cshippingchn: String(yuan) } }));
  }

  // Live derived totals (mirror update1Script.php).
  const calc = useMemo(() => {
    let sumQty = 0;
    let sumChn = 0;         // Σ round_up(cPrice × cAmount, 2)
    let sumShip = 0;        // Σ cShippingCHN
    let sumForeign = 0;     // Σ ($ / piece × qty) — foreign orders only
    let sumShipForeign = 0; // Σ ship ({cur}) — foreign orders only
    const lineTotals: Record<number, number> = {};
    const lineTotalsForeign: Record<number, number> = {};
    for (const it of items) {
      const s = rows[it.id];
      const amount = Number(s?.camount ?? 0) || 0;
      const price  = Number(s?.cprice ?? 0) || 0;
      const ship   = Number(s?.cshippingchn ?? 0) || 0;
      const line   = roundUp2(amount * price + ship);
      lineTotals[it.id] = line;
      sumQty += amount;
      sumChn = roundUp2(sumChn + roundUp2(price * amount));
      sumShip = roundUp2(sumShip + ship);
      if (orderCurInfo) {
        const usd = Number(s?.cpriceUsd ?? 0) || 0;
        const shipUsd = Number(s?.cshipUsd ?? 0) || 0;
        // Mirror the ¥ line formula (qty × price + ship) so the column footer Σ
        // reconciles with the per-line cells.
        lineTotalsForeign[it.id] = roundUp2(amount * usd + shipUsd);
        sumForeign += usd * amount;
        sumShipForeign += shipUsd;
      }
    }
    // Foreign orders → net via effRate (= บาท/{cur} ÷ yuanPerUnit) so ฿ tracks the
    // operator's $ rate; ¥ orders → effRate === hRate (byte-identical to before).
    const netThb = roundUp2((sumChn + sumShip) * effRate + hShippingService);
    // Foreign orders: rateCost/costAll are the DISPLAYED {cur} pair — the THB
    // product is identical to the stored ¥ pair ((r×ypu)×(c÷ypu) = r×c), so the
    // preview + profit math is unchanged either way.
    const rateCost = Number(hRateCost) || 0;
    const costAll  = Number(hCostAll) || 0;
    const costAllTh = roundUp2(costAll * rateCost);
    const profit = (sumChn + sumShip) * effRate - rateCost * costAll;
    return {
      sumQty, sumChn, sumShip, sumForeign, sumShipForeign, netThb,
      lineTotals, lineTotalsForeign, costAll, costAllTh, profit,
    };
  }, [items, rows, effRate, orderCurInfo, hShippingService, hRateCost, hCostAll]);

  function onSave() {
    setMsg(null);
    setErr(null);
    const cur = orderCurInfo?.cur ?? "";
    const payloadItems = items.map((it) => {
      const s = rows[it.id];
      const base = {
        id:           it.id,
        cAmount:      Number(s?.camount ?? 0) || 0,
        cPrice:       Number(s?.cprice ?? 0) || 0,
        cShippingCHN: Number(s?.cshippingchn ?? 0) || 0,
      };
      // Foreign order → preserve the ORIGINAL currency + $ amount alongside the
      // ¥-equivalent so the order pages keep rendering the real currency.
      if (orderCurInfo) {
        return { ...base, inputPrice: Number(s?.cpriceUsd ?? 0) || 0, inputCurrency: cur };
      }
      return base;
    });
    if (!payloadItems.some((p) => p.cAmount > 0)) {
      setErr("กรอกจำนวนสินค้า (> 0) อย่างน้อย 1 รายการก่อนบันทึก");
      return;
    }
    // Foreign order → the cost pair was typed in {cur} (rate = บาท/{cur} ·
    // cost = {cur}); convert CLIENT-SIDE back to the stored ¥ semantics
    // (hratecost = บาท/¥ = typed ÷ ypu · hcostall = ¥ = round2(typed × ypu))
    // so the action's math + storage stay byte-identical. ypu > 0 is
    // guaranteed whenever orderCurInfo is non-null (deriveYuanPerUnit guard).
    const typedRateCost = Number(hRateCost) || 0;
    const typedCostAll  = Number(hCostAll) || 0;
    startTransition(async () => {
      const res = await adminSaveShopOrderItemsAndQuote({
        hNo,
        items:     payloadItems,
        hRateCost: orderCurInfo ? typedRateCost / orderCurInfo.yuanPerUnit : typedRateCost,
        hCostAll:  orderCurInfo ? foreignToYuan(typedCostAll, orderCurInfo.yuanPerUnit) : typedCostAll,
        // Foreign order → save the effective ¥→฿ rate (= บาท/{cur} ÷ ¥perUnit).
        ...(orderCurInfo ? { hRate: effRate } : {}),
        // mig 0252 — also persist the TYPED บาท/{cur} rate verbatim (display SOT).
        ...(orderCurInfo && Number(bahtPerCur) > 0 ? { husdRate: Number(bahtPerCur) } : {}),
      });
      if (res.ok) {
        const dl = res.data?.hdatepayment
          ? new Date(res.data.hdatepayment).toLocaleDateString("th-TH")
          : "+5 วัน";
        setMsg(
          `บันทึก ${res.data?.rows_updated ?? 0} รายการ + ตั้งราคา ฿${thb(res.data?.htotalpriceuser ?? 0)} → ` +
            `"รอชำระเงิน" · ลูกค้าได้รับแจ้งเตือนให้ชำระภายใน ${dl}`,
        );
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function onDelete(id: number) {
    if (!confirm("ลบรายการสินค้านี้? (ออเดอร์ต้องเหลืออย่างน้อย 1 รายการ)")) return;
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await adminDeleteOrderItem({ h_no: hNo, tb_order_id: id });
      if (res.ok) {
        const newChn = res.data?.new_htotalpricechn ?? 0;
        setMsg(
          orderCurInfo
            ? `ลบรายการแล้ว · ราคาสินค้ารวมใหม่ ${fmtCur(yuanToForeign(newChn, orderCurInfo.yuanPerUnit))} ${orderCurInfo.cur}`
            : `ลบรายการแล้ว · ราคาสินค้ารวมใหม่ ¥${cny(newChn)}`,
        );
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // fix #4 — per-ITEM / per-SHOP ตีลังไม้ toggle (writes ONLY tb_order.hcrate ·
  // no money moves). Confirm-before-write (§0f). router.refresh re-reads the
  // authoritative hcrate (no optimistic drift · consistent with onDelete).
  const [cratePending, startCrate] = useTransition();

  function toggleItemCrate(it: EditorItem) {
    const next = it.hcrate === "1" ? "2" : "1";
    if (!confirm(next === "1" ? "ตั้งรายการนี้เป็น “ตีลังไม้”?" : "ยกเลิก “ตีลังไม้” รายการนี้?")) return;
    setMsg(null);
    setErr(null);
    startCrate(async () => {
      const res = await adminUpdateOrderItemCrate({ h_no: hNo, tb_order_id: it.id, hcrate: next });
      if (res.ok) {
        setMsg(next === "1" ? "ตั้งตีลังไม้รายการแล้ว" : "ยกเลิกตีลังไม้รายการแล้ว");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function toggleShopCrate(shop: string, shopItems: EditorItem[]) {
    const allCrated = shopItems.length > 0 && shopItems.every((i) => i.hcrate === "1");
    const next = allCrated ? "2" : "1";
    if (
      !confirm(
        next === "1"
          ? `ตั้ง “ตีลังไม้” ทั้งร้าน "${shop}" (${shopItems.length} รายการ)?`
          : `ยกเลิก “ตีลังไม้” ทั้งร้าน "${shop}"?`,
      )
    ) {
      return;
    }
    setMsg(null);
    setErr(null);
    startCrate(async () => {
      const res = await adminUpdateShopItemsCrate({ h_no: hNo, cnameshop: shop, hcrate: next });
      if (res.ok) {
        setMsg(`อัปเดตตีลังไม้ทั้งร้าน (${res.data?.rows_updated ?? 0} รายการ)`);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // Group items by provider → shop (legacy update1.php layout).
  const grouped = useMemo(() => {
    const byProvider = new Map<string, Map<string, EditorItem[]>>();
    for (const it of items) {
      // Derive the displayed platform from the authoritative curl link — the
      // stored cprovider is sometimes mis-stored (a 1688 link tagged Taobao).
      // Fall back to the stored code only when the URL is missing/unrecognized.
      const p = detectProviderFromUrl(it.curl) ?? it.provider ?? "—";
      const shop = it.cnameshop ?? "—";
      if (!byProvider.has(p)) byProvider.set(p, new Map());
      const shops = byProvider.get(p)!;
      if (!shops.has(shop)) shops.set(shop, []);
      shops.get(shop)!.push(it);
    }
    return byProvider;
  }, [items]);

  let rowNo = 0;

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-sm">
          รายการสินค้า — ตั้งราคาต่อรายการ ({items.length})
        </h3>
        <span className="text-[11px] text-muted">
          {orderCurInfo
            ? `กรอกจำนวน · ${orderCurInfo.cur} ราคา/ชิ้น · ค่าขนส่งจีน (${orderCurInfo.cur}) — ราคารวมคำนวณสด`
            : "กรอกจำนวน · ¥ราคา/ชิ้น · ค่าขนส่งจีน — ราคารวมคำนวณสด"}
        </span>
      </div>

      {/* mig 0248 · owner 2026-07-13 "โชว์แค่สกุลหลัก ไม่ต้องแปลงเป็นหยวน" —
          order opened in a foreign currency → the WHOLE form works in that
          currency (no ¥ shown anywhere). */}
      {orderCurInfo && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>🌐 ออเดอร์นี้เปิดราคาเป็น <strong>{orderCurInfo.cur}</strong> · ยอดสินค้า <strong>{fmtCur(calc.sumForeign)} {orderCurInfo.cur}</strong></span>
          <span className="text-sky-600">อัตรา <strong>{fmtCur(Number(bahtPerCur) || 0)}</strong> บาท/{orderCurInfo.cur} (แก้ได้)</span>
          <span className="text-sky-500">(ทุกช่องราคากรอกเป็น {orderCurInfo.cur})</span>
        </div>
      )}

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
        <table className="w-full min-w-[820px] text-xs">
          <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-left w-10">ลำดับ</th>
              <th className="px-2 py-2 text-left">ข้อมูลสินค้า</th>
              <th className="px-2 py-2 text-right w-24">จำนวน</th>
              <th className="px-2 py-2 text-right w-28">
                {orderCurInfo ? `${orderCurInfo.cur} ราคา/ชิ้น` : "¥ ราคา/ชิ้น"}
              </th>
              <th className="px-2 py-2 text-right w-28">
                {orderCurInfo ? `ค่าขนส่งจีน (${orderCurInfo.cur})` : "ค่าขนส่งจีน"}
              </th>
              <th className="px-2 py-2 text-right w-20">เพิ่ม/ลด</th>
              <th className="px-2 py-2 text-right w-28">
                {orderCurInfo ? `ราคารวม (${orderCurInfo.cur})` : "ราคารวม (¥)"}
              </th>
              <th className="px-2 py-2 text-center w-24">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].map(([provider, shops]) => (
              <ProviderGroup key={provider} provider={provider}>
                {[...shops.entries()].map(([shop, shopItems]) => (
                  <ShopGroup
                    key={`${provider}-${shop}`}
                    shop={shop}
                    crated={shopItems.length > 0 && shopItems.every((i) => i.hcrate === "1")}
                    crateBusy={cratePending}
                    onToggleCrate={() => toggleShopCrate(shop, shopItems)}
                  >
                    {shopItems.map((it) => {
                      rowNo += 1;
                      const s = rows[it.id];
                      const refunded = it.crewallet === "1";
                      return (
                        <tr
                          key={it.id}
                          className={`border-t border-border align-top ${refunded ? "bg-red-50/40" : "hover:bg-surface-alt/30"}`}
                        >
                          <td className="px-2 py-2 text-muted">{rowNo}</td>
                          <td className="px-2 py-2">
                            <div className="flex gap-2">
                              {/* Repairable product image — a broken/missing cover
                                  shows the neutral placeholder + an amber "แก้รูป"
                                  button (tb_order.cimages used to be write-once). */}
                              <ItemImageEditor
                                tbOrderId={it.id}
                                cimages={it.cimages}
                                coverUrl={it.coverUrl}
                                ctitle={it.ctitle}
                              />
                              <div className="min-w-0">
                                {refunded && it.cnote ? (
                                  <p className="mb-1 inline-block rounded bg-red-600 px-1.5 py-0.5 text-[11px] text-white">
                                    {it.cnote}
                                  </p>
                                ) : null}
                                {it.curl ? (
                                  <a
                                    href={it.curl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block truncate text-primary-600 hover:underline max-w-[260px]"
                                    title={it.ctitle ?? it.curl}
                                  >
                                    {it.ctitle || it.curl}
                                  </a>
                                ) : (
                                  <span className="block truncate max-w-[260px]" title={it.ctitle ?? ""}>
                                    {it.ctitle || "—"}
                                  </span>
                                )}
                                {(it.ccolor || it.csize) && (
                                  <p className="text-[11px] text-muted">
                                    {it.ccolor}
                                    {it.ccolor && it.csize ? " · " : ""}
                                    {it.csize}
                                  </p>
                                )}
                                {it.cdetails && (
                                  <p className="text-[11px] text-muted">หมายเหตุ: {it.cdetails}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              disabled={refunded}
                              value={s?.camount ?? ""}
                              onChange={(e) => patch(it.id, "camount", e.target.value)}
                              className={inputCls}
                            />
                          </td>
                          <td className="px-2 py-2">
                            {/* mig 0248 · owner P22353 — a foreign order edits price/piece
                                in its OWN currency ($); the ¥ source-of-truth `cprice` is
                                stored silently as round2($ × yuanPerUnit). A plain ¥
                                order keeps the ¥ input unchanged. */}
                            {orderCurInfo ? (
                              /* owner 2026-07-13 — NO ≈¥ sub-label: the foreign
                                 order shows only its own currency (the ¥-equiv
                                 `cprice` is still stored + priced silently). */
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                disabled={refunded}
                                value={s?.cpriceUsd ?? ""}
                                onChange={(e) => patchForeignPrice(it.id, e.target.value)}
                                className={inputCls}
                                title={`ราคา/ชิ้น (${orderCurInfo.cur})`}
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                disabled={refunded}
                                value={s?.cprice ?? ""}
                                onChange={(e) => patch(it.id, "cprice", e.target.value)}
                                className={inputCls}
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {orderCurInfo ? (
                              /* Foreign order → ค่าขนส่งจีน typed in {cur}; the ¥
                                 source of truth is stored as round2($ × ypu)
                                 (same pattern as the price input above). */
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                disabled={refunded}
                                value={s?.cshipUsd ?? ""}
                                onChange={(e) => patchForeignShip(it.id, e.target.value)}
                                className={inputCls}
                                title={`ค่าขนส่งจีน (${orderCurInfo.cur})`}
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                disabled={refunded}
                                value={s?.cshippingchn ?? ""}
                                onChange={(e) => patch(it.id, "cshippingchn", e.target.value)}
                                className={inputCls}
                              />
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {it.cpriceupdate > 0 ? (
                              <span className="text-green-600">+{cny(it.cpriceupdate)}</span>
                            ) : it.cpriceupdate < 0 ? (
                              <span className="text-red-600">{cny(it.cpriceupdate)}</span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">
                            {refunded
                              ? "0.00"
                              : orderCurInfo
                                ? fmtCur(calc.lineTotalsForeign[it.id] ?? 0)
                                : cny(calc.lineTotals[it.id] ?? 0)}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center gap-1">
                              {/* fix #4 — per-item ตีลังไม้ toggle (amber when on). */}
                              <button
                                type="button"
                                onClick={() => toggleItemCrate(it)}
                                disabled={pending || cratePending || refunded}
                                title={it.hcrate === "1" ? "ตีลังไม้ (กดเพื่อยกเลิก)" : "ตั้งตีลังไม้รายการนี้"}
                                className={`rounded-md border p-1.5 disabled:opacity-50 ${
                                  it.hcrate === "1"
                                    ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                                    : "border-border text-muted hover:bg-surface-alt"
                                }`}
                              >
                                <Package className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete(it.id)}
                                disabled={pending}
                                title="ลบรายการ"
                                className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </ShopGroup>
                ))}
              </ProviderGroup>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-muted">
                  ไม่พบสินค้าในออเดอร์
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-surface-alt/60 text-xs font-semibold">
            <tr className="border-t-2 border-border">
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right">รวม</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{calc.sumQty}</td>
              <td className="px-2 py-2 text-right text-muted">-</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {orderCurInfo
                  ? `${fmtCur(calc.sumShipForeign)} ${orderCurInfo.cur}`
                  : `¥${cny(calc.sumShip)}`}
              </td>
              <td className="px-2 py-2 text-right text-muted">-</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {orderCurInfo
                  ? `${fmtCur(calc.sumForeign + calc.sumShipForeign)} ${orderCurInfo.cur}`
                  : `¥${cny(calc.sumChn + calc.sumShip)}`}
              </td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Live net + cost breakdown */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          {/* mig 0248 · owner P22353 — foreign order → EDITABLE อัตราเรท บาท/{cur}
              (default = the order's opened rate · >20 allowed). The ¥→฿ rate the
              system actually uses = บาท/{cur} ÷ ¥perUnit (effRate); ¥ pricing on
              cprice is unchanged. A plain ¥ order keeps the read-only ¥ rate. */}
          {orderCurInfo ? (
            /* owner 2026-07-13 — NO "≈ ¥… บาท/หยวน" hint: the foreign order shows
               only its own currency (effRate still feeds the ¥→฿ calc silently). */
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted">อัตราแลกเปลี่ยน (บาท/{orderCurInfo.cur})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={bahtPerCur}
                onChange={(e) => setBahtPerCur(e.target.value)}
                className={`${inputCls} max-w-[140px]`}
                title={`อัตราแลกเปลี่ยน บาท/${orderCurInfo.cur} — แก้ได้`}
              />
            </label>
          ) : (
            <Line label="อัตราแลกเปลี่ยน" value={`${cny(hRate)} บาท/หยวน`} />
          )}
          <Line
            label="ค่าขนส่งจีน"
            value={orderCurInfo
              ? `${fmtCur(calc.sumShipForeign)} ${orderCurInfo.cur}`
              : `¥${cny(calc.sumShip)}`}
          />
          {orderCurInfo ? (
            <>
              <Line label={`ราคาสินค้า (${orderCurInfo.cur})`} value={`${fmtCur(calc.sumForeign)} ${orderCurInfo.cur}`} />
              <Line label={`ราคารวม (${orderCurInfo.cur})`} value={`${fmtCur(calc.sumForeign + calc.sumShipForeign)} ${orderCurInfo.cur}`} />
            </>
          ) : (
            <>
              <Line label="ราคาสินค้า (¥)" value={`¥${cny(calc.sumChn)}`} />
              <Line label="ราคารวมหยวนจีน" value={`¥${cny(calc.sumChn + calc.sumShip)}`} />
            </>
          )}
          {hShippingService > 0 && (
            <Line label="ค่าบริการฝากสั่ง" value={`฿${thb(hShippingService)}`} />
          )}
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold">
            <span>ราคารวมสุทธิ</span>
            <span className="font-mono text-primary-600 tabular-nums">฿{thb(calc.netThb)}</span>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              อัตราแลกเปลี่ยนจริง (ต้นทุน){orderCurInfo ? ` บาท/${orderCurInfo.cur}` : ""}{" "}
              <span className="text-muted">
                · ตั้งต้น{" "}
                {orderCurInfo
                  ? (hRateCostDefault * orderCurInfo.yuanPerUnit).toFixed(4)
                  : cny(hRateCostDefault)}
              </span>
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={hRateCost}
              onChange={(e) => setHRateCost(e.target.value)}
              className={inputCls}
              placeholder="0.00"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              ราคาซื้อจริงทั้งหมด ({orderCurInfo ? orderCurInfo.cur : "หยวน"})
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={hCostAll}
              onChange={(e) => setHCostAll(e.target.value)}
              className={inputCls}
              placeholder="0.00"
            />
          </label>
          <Line label="ราคาซื้อจริง (บาท)" value={`฿${thb(calc.costAllTh)}`} />
          {calc.costAll !== 0 && (
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>กำไรสุทธิ</span>
              <span className={`font-mono tabular-nums ${calc.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                ฿{thb(calc.profit)}
              </span>
            </div>
          )}
          <p className="text-[11px] text-muted">*เพิ่ม/ลด เงิน คำนวณกำไรในรายการฝากนำเข้าสินค้า</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" onClick={onSave} disabled={pending} className="gap-1.5">
          <Save className="h-4 w-4" />
          {pending ? "กำลังบันทึก..." : "บันทึก + เปลี่ยนเป็นรอชำระเงิน"}
        </Button>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        ✅ UPDATE tb_order (จำนวน/ราคา/ค่าส่งจีน) · recompute hTotalPriceCHN/hShippingCHN ·
        UPDATE tb_header_order: hStatus=2 · hRateCost · hCostAll · hCostAllTH · hCount · hDate2 ·
        hDatePayment=NOW+5d · hTotalPriceUser · 4-CH NOTIFY
      </p>
      <RotateHint superAdmin={superAdmin} />
    </div>
  );
}

function ProviderGroup({ provider, children }: { provider: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-primary-50/60 dark:bg-primary-950/20">
        <td colSpan={8} className="px-2 py-1.5 text-center text-xs font-bold text-primary-700">
          {PROVIDER_LABEL[provider] ?? provider}
        </td>
      </tr>
      {children}
    </>
  );
}
function ShopGroup({
  shop,
  children,
  crated,
  crateBusy,
  onToggleCrate,
}: {
  shop: string;
  children: React.ReactNode;
  crated: boolean;
  crateBusy: boolean;
  onToggleCrate: () => void;
}) {
  return (
    <>
      <tr className="bg-surface-alt/40">
        <td colSpan={8} className="px-2 py-1">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-[11px] font-medium text-muted">ชื่อร้าน : {shop}</span>
            {/* fix #4 — per-shop ตีลังไม้ toggle (sets hcrate on every item of the shop). */}
            <button
              type="button"
              onClick={onToggleCrate}
              disabled={crateBusy}
              className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-50 ${
                crated
                  ? "border-amber-300 bg-amber-100 text-amber-800"
                  : "border-border text-muted hover:bg-surface-alt"
              }`}
            >
              🪵 {crated ? "ตีลังไม้ทั้งร้าน ✓ (กดเพื่อยกเลิก)" : "ตั้งตีลังไม้ทั้งร้าน"}
            </button>
          </div>
        </td>
      </tr>
      {children}
    </>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
// Tiny hint so per-item refund discoverability lives near the table (the
// dedicated refund panel renders separately for status 3/4/5).
function RotateHint({ superAdmin }: { superAdmin: boolean }) {
  if (!superAdmin) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] text-muted">
      <RotateCcw className="h-3 w-3" /> คืนเงินรายรายการ ดูแผงด้านล่าง (เฉพาะออเดอร์ที่ชำระแล้ว)
    </p>
  );
}
