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
import { Trash2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSaveShopOrderItemsAndQuote } from "@/actions/admin/service-orders-shop-workflow";
import { ItemImageEditor } from "./item-image-editor";
import { adminDeleteOrderItem } from "@/actions/admin/service-orders-governance";
import { detectProviderFromUrl } from "@/lib/china-search/extract-product-id";

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

type RowState = { camount: string; cprice: string; cshippingchn: string };

export function ShopItemsEditor({
  hNo,
  hRate,
  hShippingService,
  hRateCostDefault,
  hRateCostInit,
  hCostAllInit,
  items,
  superAdmin,
}: {
  hNo:              string;
  hRate:            number;
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

  // Per-row editable state — keyed by tb_order.id. Refunded rows (crewallet
  // === '1') render their values read-only (legacy disabled input).
  const [rows, setRows] = useState<Record<number, RowState>>(() => {
    const init: Record<number, RowState> = {};
    for (const it of items) {
      init[it.id] = {
        camount:      String(it.crewallet === "1" ? 0 : it.camount),
        cprice:       String(it.cprice),
        cshippingchn: String(it.cshippingchn),
      };
    }
    return init;
  });
  const [hRateCost, setHRateCost] = useState<string>(
    String(hRateCostInit !== 0 ? hRateCostInit : hRateCostDefault),
  );
  const [hCostAll, setHCostAll] = useState<string>(String(hCostAllInit !== 0 ? hCostAllInit : ""));

  function patch(id: number, key: keyof RowState, value: string) {
    setRows((r) => ({ ...r, [id]: { ...r[id], [key]: value } }));
  }

  // Live derived totals (mirror update1Script.php).
  const calc = useMemo(() => {
    let sumQty = 0;
    let sumChn = 0;        // Σ round_up(cPrice × cAmount, 2)
    let sumShip = 0;       // Σ cShippingCHN
    const lineTotals: Record<number, number> = {};
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
    }
    const netThb = roundUp2((sumChn + sumShip) * hRate + hShippingService);
    const rateCost = Number(hRateCost) || 0;
    const costAll  = Number(hCostAll) || 0;
    const costAllTh = roundUp2(costAll * rateCost);
    const profit = (sumChn + sumShip) * hRate - rateCost * costAll;
    return { sumQty, sumChn, sumShip, netThb, lineTotals, costAll, costAllTh, profit };
  }, [items, rows, hRate, hShippingService, hRateCost, hCostAll]);

  function onSave() {
    setMsg(null);
    setErr(null);
    const payloadItems = items.map((it) => {
      const s = rows[it.id];
      return {
        id:           it.id,
        cAmount:      Number(s?.camount ?? 0) || 0,
        cPrice:       Number(s?.cprice ?? 0) || 0,
        cShippingCHN: Number(s?.cshippingchn ?? 0) || 0,
      };
    });
    if (!payloadItems.some((p) => p.cAmount > 0)) {
      setErr("กรอกจำนวนสินค้า (> 0) อย่างน้อย 1 รายการก่อนบันทึก");
      return;
    }
    startTransition(async () => {
      const res = await adminSaveShopOrderItemsAndQuote({
        hNo,
        items:     payloadItems,
        hRateCost: Number(hRateCost) || 0,
        hCostAll:  Number(hCostAll) || 0,
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
        setMsg(`ลบรายการแล้ว · ราคาสินค้ารวมใหม่ ¥${cny(res.data?.new_htotalpricechn ?? 0)}`);
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
          กรอกจำนวน · ¥ราคา/ชิ้น · ค่าขนส่งจีน — ราคารวมคำนวณสด
        </span>
      </div>

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
              <th className="px-2 py-2 text-right w-28">¥ ราคา/ชิ้น</th>
              <th className="px-2 py-2 text-right w-28">ค่าขนส่งจีน</th>
              <th className="px-2 py-2 text-right w-20">เพิ่ม/ลด</th>
              <th className="px-2 py-2 text-right w-28">ราคารวม (¥)</th>
              <th className="px-2 py-2 text-center w-24">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].map(([provider, shops]) => (
              <ProviderGroup key={provider} provider={provider}>
                {[...shops.entries()].map(([shop, shopItems]) => (
                  <ShopGroup key={`${provider}-${shop}`} shop={shop}>
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
                          </td>
                          <td className="px-2 py-2">
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
                            {refunded ? "0.00" : cny(calc.lineTotals[it.id] ?? 0)}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center gap-1">
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
              <td className="px-2 py-2 text-right font-mono tabular-nums">¥{cny(calc.sumShip)}</td>
              <td className="px-2 py-2 text-right text-muted">-</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">¥{cny(calc.sumChn + calc.sumShip)}</td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Live net + cost breakdown */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <Line label="อัตราแลกเปลี่ยน" value={`${cny(hRate)} บาท/หยวน`} />
          <Line label="ค่าขนส่งจีน" value={`¥${cny(calc.sumShip)}`} />
          <Line label="ราคาสินค้า (¥)" value={`¥${cny(calc.sumChn)}`} />
          <Line label="ราคารวมหยวนจีน" value={`¥${cny(calc.sumChn + calc.sumShip)}`} />
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
              อัตราแลกเปลี่ยนจริง (ต้นทุน) <span className="text-muted">· ตั้งต้น {cny(hRateCostDefault)}</span>
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
            <span className="text-xs font-medium">ราคาซื้อจริงทั้งหมด (หยวน)</span>
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
function ShopGroup({ shop, children }: { shop: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-surface-alt/40">
        <td colSpan={8} className="px-2 py-1 text-center text-[11px] font-medium text-muted">
          ชื่อร้าน : {shop}
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
