"use client";

/**
 * <CargoCostLineEditor> — per-line COST + DECLARED capture (P2 · the `pricing`
 * role's write surface · docs/research/tax-invoice-platform-build-plan-2026-06-09.md).
 *
 * THE 3-NUMBER MODEL: a CARGO import has THREE distinct prices that must NEVER
 * be conflated —
 *   SELLING  (CS → invoice + VAT)        · captured elsewhere (tb_order.cprice /
 *                                          forwarder header / quote flow)
 *   COST     (Pricing → PEAK stock-in)   · ↙ THIS editor
 *   DECLARED / มูลค่าสำแดง (Docs → ใบขน) · ↙ THIS editor
 *
 * ⚠️ ISOLATION FROM THE MONEY PATH (critical · AGENTS.md §0e):
 *   This control is a SEPARATE editor that calls ONLY the cost action
 *   (setForwarderItemCost / setShopOrderItemCost). It does NOT touch, share
 *   state with, or submit through the selling-price / quote-save flow
 *   (adminSaveShopOrderItemsAndQuote) or any forwarder pricing/payment flow.
 *   Saving COST/DECLARED here:
 *     - does NOT recompute the customer's selling price
 *     - does NOT change order/forwarder status
 *     - does NOT notify the customer
 *   It writes ONLY the per-line cost+declared columns added by migration 0158.
 *
 * Confirm-before-mutate (AGENTS.md §0f) via the repo's shared `useConfirmDialogs`.
 * Role-gating is enforced by the SERVER action (super/accounting/pricing) AND
 * by the page (it renders this editor only for those roles; everyone else sees
 * a read-only summary).
 *
 * Pattern mirrors the proven inline editors in
 * `app/[locale]/(admin)/admin/forwarders/[fNo]/forwarder-inline-edits.tsx`
 * (toggle-to-edit · useTransition · router.refresh on ok). Server actions take
 * a flat Record<string, string> (the cargo-cost Zod schema coerces) — note the
 * id key (itemId / orderId) is sent as a string.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Coins, Receipt } from "lucide-react";
import {
  setForwarderItemCost,
  setShopOrderItemCost,
  setForwarderImportDuty,
} from "@/actions/admin/cargo-cost";
import { computeImportDutyVat, dutyThbFromPct } from "@/lib/forwarder/import-duty-vat";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type ActionResult = { ok: true; data?: unknown } | { ok: false; error?: string };

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const textInputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const btnSave =
  "rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50";
const btnCancel =
  "rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50";

function fmtNum(v: number | string | null | undefined, digits = 2): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Common cost-line shape (current values prefill the inputs). */
type CostLineInit = {
  costRateCny: number | string | null;
  declaredValueThb: number | string | null;
  hsCode: string | null;
  /**
   * AUTO-FILL seeds (GAP 1 · audit 2026-06-11). When the stored value is
   * null/0, the editor seeds from these so the per-line cost-sheet renders
   * pre-filled from the order data above (ไม่ต้องพิมพ์เลข). A small
   * "ออโต้ — แก้ได้" chip flags the field while it still matches the auto
   * value; once staff edits, the chip drops (override mode).
   * Stored value still wins — these are display-only fallbacks; nothing
   * persists until Save.
   */
  autoCostUnit?: number | null;
  autoCostRate?: number | null;
  autoDeclared?: number | null;
  /**
   * Declared customs-FX (mig 0179) — the ใบขน declared value is
   * declared_amount_ccy × declared_fx_rate. Stored values prefill; `fxRates` is
   * the monthly central setting (business_config customs.fx_rates) used for the
   * per-currency default rate. The declared amount defaults from the real cost
   * (autoDeclared THB ÷ rate) and is editable DOWN (engineer-down).
   */
  declaredCurrency?: string | null;
  declaredFxRate?: number | string | null;
  declaredAmountCcy?: number | string | null;
  fxRates?: Record<string, number>;
};

/** Coerce to a finite non-negative number (0 on junk). */
function n0(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type EditorMode =
  | { kind: "forwarder"; itemId: number; costUnitThb: number | string | null }
  | { kind: "shop"; orderId: number; costUnitCny: number | string | null };

/** value is "stored as empty" — null, undefined, "" or 0. */
function isEmptyStored(v: number | string | null | undefined): boolean {
  if (v == null || v === "") return true;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

/** Format a number for an <input type=number> default value (no trailing zeros). */
function autoFmt(n: number, digits: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Number(n.toFixed(digits)).toString();
}

/**
 * Shared toggle-to-edit cost editor. The `mode` discriminant carries the
 * line id + the cost-unit value/currency; everything else is identical.
 */
function CostEditorBody({
  mode,
  init,
  label,
}: {
  mode: EditorMode;
  init: CostLineInit;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  // cost unit currency + initial value depend on the line kind.
  const costUnitIsCny = mode.kind === "shop";
  const costUnitInit = mode.kind === "shop" ? mode.costUnitCny : mode.costUnitThb;
  const costUnitSymbol = costUnitIsCny ? "¥" : "฿";

  // AUTO-FILL seeds (GAP 1) — when the stored column is empty, prefill the draft
  // from the order data computed above. These are display-only suggestions;
  // nothing persists until Save. A per-field chip flags the value while it still
  // equals the auto seed (the moment staff edits, it becomes their override).
  const autoCostUnitStr = init.autoCostUnit != null ? autoFmt(init.autoCostUnit, 2) : "";
  const autoCostRateStr = init.autoCostRate != null ? autoFmt(init.autoCostRate, 4) : "";
  const seed = (stored: number | string | null | undefined, autoStr: string) =>
    isEmptyStored(stored) ? autoStr : String(stored);

  // Draft state — strings so "" clears the column (the action maps "" → null).
  const [costUnit, setCostUnit] = useState<string>(seed(costUnitInit, autoCostUnitStr));
  const [costRate, setCostRate] = useState<string>(seed(init.costRateCny, autoCostRateStr));
  const [hsCode, setHsCode] = useState<string>(init.hsCode ?? "");

  // ── Declared customs-FX (mig 0179) — declared THB = amount(ccy) × customs rate.
  const fxRates = init.fxRates ?? {};
  const currencyOptions = (() => {
    const keys = Object.keys(fxRates).filter((k) => k !== "pending" && n0(fxRates[k]) > 0);
    return keys.length ? keys : ["USD", "CNY"];
  })();
  const autoDeclaredThb = init.autoDeclared ?? 0;
  const rateForCcy = (ccy: string) => n0(fxRates[ccy]);
  const initCcy = (init.declaredCurrency ?? "").trim().toUpperCase() || currencyOptions[0] || "USD";
  const initRate = !isEmptyStored(init.declaredFxRate)
    ? String(init.declaredFxRate)
    : (rateForCcy(initCcy) > 0 ? autoFmt(rateForCcy(initCcy), 4) : "");
  const initAmt = !isEmptyStored(init.declaredAmountCcy)
    ? String(init.declaredAmountCcy)
    : (autoDeclaredThb > 0 && n0(initRate) > 0 ? autoFmt(autoDeclaredThb / n0(initRate), 4) : "");
  const [declCcy, setDeclCcy] = useState<string>(initCcy);
  const [declRate, setDeclRate] = useState<string>(initRate);
  const [declAmt, setDeclAmt] = useState<string>(initAmt);
  // The authoritative declared THB the line stores = amount × rate.
  const declaredThbComputed = Math.round(n0(declAmt) * n0(declRate) * 100) / 100;

  // Switching currency re-defaults the rate (to the month's setting) + the
  // amount (the real cost re-expressed at the new rate · engineer-down anew).
  function onDeclCcyChange(next: string) {
    setDeclCcy(next);
    const r = rateForCcy(next);
    setDeclRate(r > 0 ? autoFmt(r, 4) : "");
    setDeclAmt(autoDeclaredThb > 0 && r > 0 ? autoFmt(autoDeclaredThb / r, 4) : "");
  }

  // A field is "on auto" when the stored column is empty, an auto seed exists,
  // and the draft still equals that seed (staff hasn't overridden it).
  const costUnitOnAuto = isEmptyStored(costUnitInit) && autoCostUnitStr !== "" && costUnit === autoCostUnitStr;
  const costRateOnAuto = isEmptyStored(init.costRateCny) && autoCostRateStr !== "" && costRate === autoCostRateStr;
  const declaredOnAuto = isEmptyStored(init.declaredAmountCcy) && initAmt !== "" && declAmt === initAmt;
  const anyOnAuto = costUnitOnAuto || costRateOnAuto || declaredOnAuto;

  function resetDraft() {
    setCostUnit(seed(costUnitInit, autoCostUnitStr));
    setCostRate(seed(init.costRateCny, autoCostRateStr));
    setDeclCcy(initCcy);
    setDeclRate(initRate);
    setDeclAmt(initAmt);
    setHsCode(init.hsCode ?? "");
  }

  async function onSave() {
    setErr(null);
    const ok = await confirm(
      "บันทึกต้นทุน + มูลค่าสำแดง (ใบขน) ของรายการนี้?\n" +
        "⚠️ ข้อมูลภายในเท่านั้น — ไม่กระทบราคาขายลูกค้า · ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือนลูกค้า",
    );
    if (!ok) return;

    startTransition(async () => {
      let res: ActionResult;
      if (mode.kind === "forwarder") {
        res = await setForwarderItemCost({
          itemId: String(mode.itemId),
          costUnitThb: costUnit,
          costRateCny: costRate,
          declaredValueThb: String(declaredThbComputed || ""),
          declaredCurrency: declCcy,
          declaredFxRate: declRate,
          declaredAmountCcy: declAmt,
          hsCode: hsCode,
        });
      } else {
        res = await setShopOrderItemCost({
          orderId: String(mode.orderId),
          costUnitCny: costUnit,
          costRateCny: costRate,
          declaredValueThb: String(declaredThbComputed || ""),
          declaredCurrency: declCcy,
          declaredFxRate: declRate,
          declaredAmountCcy: declAmt,
          hsCode: hsCode,
        });
      }
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 p-2.5">
      {dialogs}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
          <Coins className="h-3.5 w-3.5" /> ต้นทุน (Pricing){label ? ` · ${label}` : ""}
          {anyOnAuto && <AutoChip />}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 hover:underline"
          >
            <Pencil className="h-3 w-3" /> แก้ไข
          </button>
        )}
      </div>

      {err && (
        <div className="mt-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">
          ⚠ {err}
        </div>
      )}

      {!editing ? (
        // Read-only view. Shows the STORED value when present, else the AUTO seed
        // (marked) so Pricing sees the suggested cost/declared without entering
        // edit mode. Auto values are NOT yet saved — "แก้ไข" → "บันทึก" persists.
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          <SummaryRow
            label={`ต้นทุน/หน่วย (${costUnitSymbol})`}
            value={fmtNum(seed(costUnitInit, autoCostUnitStr) || null)}
            auto={costUnitOnAuto}
          />
          <SummaryRow
            label="เรทหยวนต้นทุน"
            value={fmtNum(seed(init.costRateCny, autoCostRateStr) || null, 4)}
            auto={costRateOnAuto}
          />
          <SummaryRow
            label="มูลค่าสำแดง ใบขน (฿)"
            value={
              declaredThbComputed > 0
                ? `${fmtNum(declaredThbComputed)}  (${fmtNum(n0(declAmt) || null, 2)} ${declCcy} × ${fmtNum(n0(declRate) || null, 4)})`
                : "—"
            }
            auto={declaredOnAuto}
          />
          <SummaryRow label="HS Code" value={init.hsCode?.trim() || "—"} mono />
        </dl>
      ) : (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              ต้นทุน/หน่วย ({costUnitSymbol}){costUnitOnAuto && <AutoChip />}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={costUnit}
              onChange={(e) => setCostUnit(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
            {/* SHOP cost-unit auto = ราคาซื้อจริงทั้งหมด (hcostall) ÷ Σqty — the
                confirmed real cost averaged per unit. Editable per line. */}
            {costUnitOnAuto && costUnitIsCny && (
              <span className="block text-[9px] text-sky-600">
                เฉลี่ยจากราคาซื้อจริงทั้งหมด (จาก Pricing) ÷ จำนวน — แก้ต่อรายการได้
              </span>
            )}
          </label>
          <label className="space-y-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              เรทหยวนต้นทุน{costRateOnAuto && <AutoChip />}
            </span>
            <input
              type="number"
              min={0}
              step="0.0001"
              inputMode="decimal"
              value={costRate}
              onChange={(e) => setCostRate(e.target.value)}
              placeholder="0.0000"
              className={inputCls}
            />
          </label>
          {/* มูลค่าสำแดง ใบขน — declared in a chosen currency × the customs monthly
              FX rate (mig 0179). Amount defaults from the real cost, edit DOWN. */}
          <div className="sm:col-span-2 rounded-lg border border-blue-200 bg-blue-50/40 dark:bg-blue-950/10 p-2">
            <span className="flex items-center gap-1 text-[10px] font-medium text-blue-800">
              มูลค่าสำแดง ใบขน{declaredOnAuto && <AutoChip />}
            </span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <label className="space-y-0.5">
                <span className="block text-[9px] text-muted">สกุล</span>
                <select
                  value={declCcy}
                  onChange={(e) => onDeclCcyChange(e.target.value)}
                  className={inputCls + " text-left"}
                >
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="block text-[9px] text-muted">เรทศุลกากร</span>
                <input
                  type="number" min={0} step="0.0001" inputMode="decimal"
                  value={declRate}
                  onChange={(e) => setDeclRate(e.target.value)}
                  placeholder="0.0000"
                  className={inputCls}
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[9px] text-muted">มูลค่า ({declCcy})</span>
                <input
                  type="number" min={0} step="0.01" inputMode="decimal"
                  value={declAmt}
                  onChange={(e) => setDeclAmt(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </label>
            </div>
            <p className="mt-1 text-[10px] text-blue-900 text-right">
              = มูลค่าสำแดง <b>฿{fmtNum(declaredThbComputed || null)}</b>
              <span className="text-blue-700/70"> ({declCcy} × เรทกรมศุล · แก้ลงได้)</span>
            </p>
          </div>
          <label className="space-y-0.5">
            <span className="block text-[10px] text-muted">HS Code</span>
            <input
              type="text"
              maxLength={40}
              value={hsCode}
              onChange={(e) => setHsCode(e.target.value)}
              placeholder="เช่น 8471.30.20"
              className={textInputCls}
            />
          </label>
          <div className="sm:col-span-2">
            {anyOnAuto && (
              <p className="mb-1 inline-flex items-center gap-1 text-[10px] text-sky-700">
                <AutoChip /> ค่าที่ขึ้น <b>ออโต้</b> เติมจากข้อมูลออเดอร์ — แก้ได้ · จะบันทึกเมื่อกด “บันทึกต้นทุน”
              </p>
            )}
            <p className="mb-1.5 text-[10px] text-emerald-800/80">
              ภายในเท่านั้น — ต้นทุน (PEAK) + มูลค่าสำแดง (ใบขน) · ไม่กระทบราคาขาย/สถานะ/การแจ้งเตือน · เว้นว่าง = ล้างค่า
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave} onClick={onSave}>
                {pending ? "กำลังบันทึก…" : "บันทึกต้นทุน"}
              </button>
              <button
                type="button"
                disabled={pending}
                className={btnCancel}
                onClick={() => {
                  resetDraft();
                  setErr(null);
                  setEditing(false);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  auto,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** true → the value shown is the auto seed (not yet saved). */
  auto?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`flex items-center gap-1 ${mono ? "font-mono tabular-nums" : "tabular-nums"}`}>
        {auto && <AutoChip />}
        {value}
      </dd>
    </div>
  );
}

/** Tiny "ออโต้ — แก้ได้" badge marking a field seeded from the order data (GAP 1). */
function AutoChip() {
  return (
    <span
      title="เติมอัตโนมัติจากข้อมูลออเดอร์ — แก้ไขได้ · ยังไม่บันทึกจนกดบันทึก"
      className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-px text-[9px] font-semibold leading-none text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
    >
      ออโต้
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Public components
// ──────────────────────────────────────────────────────────────

/** Forwarder import line (tb_forwarder_item) — COST in THB. */
export function ForwarderItemCostEditor({
  itemId,
  costUnitThb,
  costRateCny,
  declaredValueThb,
  hsCode,
  label = "",
  autoCostUnit = null,
  autoCostRate = null,
  autoDeclared = null,
  declaredCurrency = null,
  declaredFxRate = null,
  declaredAmountCcy = null,
  fxRates,
}: {
  itemId: number;
  costUnitThb: number | string | null;
  costRateCny: number | string | null;
  declaredValueThb: number | string | null;
  hsCode: string | null;
  label?: string;
  /** GAP 1 auto-fill seeds (used only when the stored column is empty). */
  autoCostUnit?: number | null;
  autoCostRate?: number | null;
  autoDeclared?: number | null;
  /** Declared customs-FX (mig 0179). */
  declaredCurrency?: string | null;
  declaredFxRate?: number | string | null;
  declaredAmountCcy?: number | string | null;
  fxRates?: Record<string, number>;
}) {
  return (
    <CostEditorBody
      mode={{ kind: "forwarder", itemId, costUnitThb }}
      init={{ costRateCny, declaredValueThb, hsCode, autoCostUnit, autoCostRate, autoDeclared, declaredCurrency, declaredFxRate, declaredAmountCcy, fxRates }}
      label={label}
    />
  );
}

/** Shop-order line (tb_order) — COST in CNY ¥. */
export function ShopOrderItemCostEditor({
  orderId,
  costUnitCny,
  costRateCny,
  declaredValueThb,
  hsCode,
  label = "",
  autoCostUnit = null,
  autoCostRate = null,
  autoDeclared = null,
  declaredCurrency = null,
  declaredFxRate = null,
  declaredAmountCcy = null,
  fxRates,
}: {
  orderId: number;
  costUnitCny: number | string | null;
  costRateCny: number | string | null;
  declaredValueThb: number | string | null;
  hsCode: string | null;
  label?: string;
  /** GAP 1 auto-fill seeds (used only when the stored column is empty). */
  autoCostUnit?: number | null;
  autoCostRate?: number | null;
  autoDeclared?: number | null;
  /** Declared customs-FX (mig 0179). */
  declaredCurrency?: string | null;
  declaredFxRate?: number | string | null;
  declaredAmountCcy?: number | string | null;
  fxRates?: Record<string, number>;
}) {
  return (
    <CostEditorBody
      mode={{ kind: "shop", orderId, costUnitCny }}
      init={{ costRateCny, declaredValueThb, hsCode, autoCostUnit, autoCostRate, autoDeclared, declaredCurrency, declaredFxRate, declaredAmountCcy, fxRates }}
      label={label}
    />
  );
}

/**
 * Read-only summary for roles that may NOT capture cost (everyone except
 * super/accounting/pricing). Renders the same numbers without any edit affordance.
 * (A server component could render this too, but keeping it here colocates the
 * label set with the editor so they never drift.)
 */
export function CargoCostLineSummary({
  costUnit,
  costUnitIsCny,
  costRateCny,
  declaredValueThb,
  hsCode,
}: {
  costUnit: number | string | null;
  costUnitIsCny: boolean;
  costRateCny: number | string | null;
  declaredValueThb: number | string | null;
  hsCode: string | null;
}) {
  const symbol = costUnitIsCny ? "¥" : "฿";
  return (
    <div className="rounded-lg border border-border bg-surface-alt/30 p-2.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
        <Coins className="h-3.5 w-3.5" /> ต้นทุน (Pricing) · อ่านอย่างเดียว
      </span>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <SummaryRow label={`ต้นทุน/หน่วย (${symbol})`} value={fmtNum(costUnit)} />
        <SummaryRow label="เรทหยวนต้นทุน" value={fmtNum(costRateCny, 4)} />
        <SummaryRow label="มูลค่าสำแดง ใบขน (฿)" value={fmtNum(declaredValueThb)} />
        <SummaryRow label="HS Code" value={hsCode?.trim() || "—"} mono />
      </dl>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Forwarder HEADER · อากรขาเข้า (import duty) + VAT-inclusive roll-up
// D-G2 (mig 0178). The xlsx SELL-block the owner reconciled in Excel, now
// in-app: ราคาขายสุทธิ (+อากร) → รวมราคาก่อน Vat → +VAT 7% → ราคารวม Vat
// (lib/forwarder/import-duty-vat.ts). ⚠️ COST-SHEET ONLY — writes import_duty_*
// via setForwarderImportDuty; does NOT change the customer's binding charge.
// ──────────────────────────────────────────────────────────────
export function ForwarderImportDutyEditor({
  id,
  sellNet,
  importDutyPct,
  importDutyThb,
  vatRatePct = 7,
}: {
  id: number;
  /** ราคาขายสุทธิ — the forwarder NET selling total (base for the roll-up). */
  sellNet: number;
  importDutyPct: number | string | null;
  importDutyThb: number | string | null;
  vatRatePct?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  const [pct, setPct] = useState<string>(
    importDutyPct != null && Number(importDutyPct) !== 0 ? String(importDutyPct) : "",
  );
  const [thb, setThb] = useState<string>(
    importDutyThb != null && Number(importDutyThb) !== 0 ? String(importDutyThb) : "",
  );

  // Live roll-up: draft baht while editing, else the saved value.
  const dutyThbNum = editing ? parseFloat(thb) || 0 : Number(importDutyThb ?? 0);
  const roll = computeImportDutyVat({ sellNet, importDutyThb: dutyThbNum, vatRatePct });

  function resetDraft() {
    setPct(importDutyPct != null && Number(importDutyPct) !== 0 ? String(importDutyPct) : "");
    setThb(importDutyThb != null && Number(importDutyThb) !== 0 ? String(importDutyThb) : "");
  }

  // Typing a % seeds the baht from %×sell-net (mirrors the xlsx อากร(%)→อากร(บาท)
  // columns). Baht stays editable + authoritative — staff confirms/overrides.
  function onPctChange(v: string) {
    setPct(v);
    const p = parseFloat(v);
    if (Number.isFinite(p) && p > 0) setThb(String(dutyThbFromPct(sellNet, p)));
  }

  async function onSave() {
    setErr(null);
    const ok = await confirm(
      "บันทึกอากรขาเข้าของรายการนี้?\n" +
        "⚠️ ข้อมูลภายใน (cost-sheet/ใบกำกับ) เท่านั้น — ไม่กระทบราคาที่ลูกค้าจ่าย · ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือน",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await setForwarderImportDuty({
        id: String(id),
        importDutyPct: pct,
        importDutyThb: thb,
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-2.5">
      {dialogs}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
          <Receipt className="h-3.5 w-3.5" /> อากรขาเข้า + ราคารวม VAT (ใบกำกับ)
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-0.5 text-[11px] text-amber-700 hover:underline"
          >
            <Pencil className="h-3 w-3" /> แก้ไข
          </button>
        )}
      </div>

      {err && (
        <div className="mt-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">⚠ {err}</div>
      )}

      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="block text-[10px] text-muted">อากรขาเข้า (%)</span>
            <input
              type="number"
              min={0}
              step="0.0001"
              inputMode="decimal"
              value={pct}
              onChange={(e) => onPctChange(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </label>
          <label className="space-y-0.5">
            <span className="block text-[10px] text-muted">อากรขาเข้า (บาท)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={thb}
              onChange={(e) => setThb(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </label>
        </div>
      )}

      {/* The roll-up — the figure the owner used Excel for (always visible) */}
      <dl className="mt-2 space-y-0.5 rounded-md bg-white/60 dark:bg-surface/40 px-2.5 py-1.5 text-[11px]">
        <SummaryRow label="ราคาขายสุทธิ (฿)" value={fmtNum(roll.sellNet)} />
        <SummaryRow label="อากรขาเข้า (฿)" value={fmtNum(roll.importDutyThb)} />
        <SummaryRow label="รวมราคาก่อน VAT (฿)" value={fmtNum(roll.preVatTotal)} />
        <SummaryRow label={`VAT ${roll.vatRatePct}% (฿)`} value={fmtNum(roll.vatAmount)} />
        <div className="flex items-baseline justify-between gap-2 border-t border-amber-200 pt-0.5 font-bold text-amber-900">
          <dt>ราคารวม VAT (฿)</dt>
          <dd className="tabular-nums">{fmtNum(roll.vatInclusiveTotal)}</dd>
        </div>
      </dl>

      {editing && (
        <div className="mt-2">
          <p className="mb-1.5 text-[10px] text-amber-800/80">
            ภายในเท่านั้น — ฐานอากรอ้างอิงนโยบาย/HS (กรอกเอง · ไม่กระทบราคาที่ลูกค้าจ่าย) · เว้นว่าง = 0
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} className={btnSave} onClick={onSave}>
              {pending ? "กำลังบันทึก…" : "บันทึกอากร"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={btnCancel}
              onClick={() => {
                resetDraft();
                setErr(null);
                setEditing(false);
              }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
