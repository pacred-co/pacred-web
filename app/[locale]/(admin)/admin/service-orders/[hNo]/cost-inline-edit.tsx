"use client";

/**
 * Always-visible COST editor for the shop-order /edit page (any status).
 *
 * [[cost-editable-sell-locked]] — ต้นทุน (เรทต้นทุน + ราคาซื้อจริง) แก้ได้ทุก
 * สถานะแม้ลูกค้าจ่ายแล้ว เพราะกระทบแค่ margin/บัญชี · ราคาขาย (SELL) ล็อก.
 * Before this, the cost trio was editable ONLY at status 1/2/6 (inside
 * ShopItemsEditor). This card surfaces it for status 3/4/5/40 too.
 *
 * Writes via `adminUpdateOrderCost` which touches ONLY hratecost/hcostall/
 * hcostallth — never a SELL driver. The card shows the live ราคาซื้อจริง(บาท)
 * = round_up(hCostAll × hRateCost, 2) preview so the operator sees the THB
 * cost before saving. confirm-before-mutate (§0f).
 *
 * Visibility is gated at the data layer by the PARENT (canViewCost) — this
 * component is only mounted for cost-authority roles, so the cost numbers are
 * never sent to a role that can't see them (§0e).
 */

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Coins, Save, Pencil } from "lucide-react";
import { adminUpdateOrderCost } from "@/actions/admin/service-orders-header-edits";
// mig 0248 · owner 2026-07-13 — foreign-currency orders display + edit the cost
// pair in the ORDER's currency; the stored ¥ semantics are converted back
// client-side before the (unchanged) action call.
import { foreignToYuan, yuanToForeign } from "@/lib/forwarder/usd-order-pricing";

// round_up(x,2) — CEIL to 2dp (legacy round_up · satang-safe).
function roundUp2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const eps = 1e-9 * Math.max(1, Math.abs(v * 100));
  const r = Math.ceil(v * 100 - eps) / 100;
  return r === 0 ? 0 : r;
}
function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Foreign-currency amounts — en-US 2dp (matches the items editor's fmtCur).
function fcur(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt disabled:text-muted";

export function CostInlineEdit({
  hNo,
  hRateCost,
  hCostAll,
  hRateCostDefault,
  cur,
  yuanPerUnit,
}: {
  hNo: string;
  hRateCost: number;
  hCostAll: number;
  hRateCostDefault: number;
  /** mig 0248 — the order's foreign currency (with `yuanPerUnit`) → the cost
   *  pair displays/edits in {cur}; omitted → plain ¥ path (byte-identical). */
  cur?: string;
  yuanPerUnit?: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Division guard: only treat as foreign when the FIXED ratio is usable.
  const foreign = !!cur && Number.isFinite(yuanPerUnit) && (yuanPerUnit ?? 0) > 0;
  const ypu = foreign ? (yuanPerUnit as number) : 0;

  // Seed rate from the order's saved cost rate, else the tb_settings default.
  // Foreign order → display the pair in {cur} (rate = stored ¥-rate × ypu ·
  // cost = stored ¥ ÷ ypu); the THB product is identical either way.
  const [rateCost, setRateCost] = useState<string>(() => {
    const baseYuanRate = hRateCost !== 0 ? hRateCost : hRateCostDefault;
    return foreign ? (baseYuanRate * ypu).toFixed(4) : String(baseYuanRate);
  });
  const [costAll, setCostAll] = useState<string>(() => {
    if (hCostAll === 0) return "";
    return foreign ? String(yuanToForeign(hCostAll, ypu)) : String(hCostAll);
  });

  const previewTh = useMemo(
    () => roundUp2((Number(costAll) || 0) * (Number(rateCost) || 0)),
    [costAll, rateCost],
  );
  const savedTh = roundUp2(hCostAll * hRateCost);

  function onSave() {
    setMsg(null);
    setErr(null);
    const rc = Number(rateCost) || 0;
    const ca = Number(costAll) || 0;
    // Foreign → convert the typed {cur} pair back to the stored ¥ semantics
    // (rate ÷ ypu · cost × ypu) BEFORE the action call — action math unchanged.
    const rcSend = foreign ? rc / ypu : rc;
    const caSend = foreign ? foreignToYuan(ca, ypu) : ca;
    // Pre-check the server's ¥-rate cap (max 20) in {cur} terms.
    if (foreign && rcSend > 20) {
      setErr(`เรทต้นทุนสูงเกินไป — สูงสุด ~${(20 * ypu).toFixed(2)} บาท/${cur}`);
      return;
    }
    if (!confirm(
      `บันทึกต้นทุน (ไม่กระทบราคาขาย/ยอดที่ลูกค้าจ่าย)?\n\n` +
      `เรทต้นทุน: ${rc}${foreign ? ` บาท/${cur}` : ""}\n` +
      `ราคาซื้อจริง: ${foreign ? `${ca.toLocaleString("th-TH")} ${cur}` : `¥${ca.toLocaleString("th-TH")}`}\n` +
      `= ฿${thb(previewTh)} (ต้นทุนบาท)`,
    )) return;
    startTransition(async () => {
      const res = await adminUpdateOrderCost({ h_no: hNo, h_rate_cost: rcSend, h_cost_all: caSend });
      if (res.ok) {
        setMsg(`✅ บันทึกต้นทุนแล้ว · ต้นทุน ฿${thb(res.data?.h_cost_all_th ?? 0)} (ราคาขายไม่เปลี่ยน)`);
        setEditing(false);
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-sm flex items-center gap-1.5">
          <Coins className="h-4 w-4 text-amber-600" /> ต้นทุน (เรทต้นทุน + ราคาซื้อจริง)
        </h3>
        {!editing && (
          <button
            type="button"
            onClick={() => { setEditing(true); setErr(null); setMsg(null); }}
            className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
          >
            <Pencil className="h-3 w-3" /> แก้ไข
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        แก้ได้ทุกสถานะ (แม้ลูกค้าชำระแล้ว) — กระทบเฉพาะกำไร/บัญชี · <b>ไม่กระทบราคาขายหรือยอดที่ลูกค้าต้องจ่าย</b>
      </p>

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {!editing ? (
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div className="flex justify-between gap-2 sm:block">
            <span className="text-xs text-muted">เรทต้นทุน{foreign ? ` (บาท/${cur})` : ""}</span>
            <span className="font-mono tabular-nums sm:block">
              {foreign ? fcur(hRateCost * ypu) : thb(hRateCost)}
            </span>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <span className="text-xs text-muted">ราคาซื้อจริง</span>
            <span className="font-mono tabular-nums sm:block">
              {foreign ? `${fcur(yuanToForeign(hCostAll, ypu))} ${cur}` : `¥${thb(hCostAll)}`}
            </span>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <span className="text-xs text-muted">ต้นทุน (บาท)</span>
            <span className="font-mono tabular-nums font-semibold sm:block">฿{thb(savedTh)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium">
                เรทต้นทุน{foreign ? ` (บาท/${cur})` : ""}{" "}
                <span className="text-muted">
                  · ตั้งต้น {foreign ? (hRateCostDefault * ypu).toFixed(4) : thb(hRateCostDefault)}
                </span>
              </span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={rateCost}
                onChange={(e) => setRateCost(e.target.value)}
                disabled={pending}
                className={inputCls}
                placeholder="0.00"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">ราคาซื้อจริงทั้งหมด ({foreign ? cur : "หยวน"})</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={costAll}
                onChange={(e) => setCostAll(e.target.value)}
                disabled={pending}
                className={inputCls}
                placeholder="0.00"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm border-t border-amber-200 pt-2">
            <span className="text-xs text-muted">ต้นทุน (บาท) = เรทต้นทุน × ราคาซื้อจริง</span>
            <span className="font-mono tabular-nums font-semibold">฿{thb(previewTh)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {pending ? "กำลังบันทึก..." : "บันทึกต้นทุน"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setErr(null); }}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
