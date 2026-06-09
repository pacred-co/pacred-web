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
import { Pencil, Coins } from "lucide-react";
import { setForwarderItemCost, setShopOrderItemCost } from "@/actions/admin/cargo-cost";
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
};

type EditorMode =
  | { kind: "forwarder"; itemId: number; costUnitThb: number | string | null }
  | { kind: "shop"; orderId: number; costUnitCny: number | string | null };

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

  // Draft state — strings so "" clears the column (the action maps "" → null).
  const [costUnit, setCostUnit] = useState<string>(
    costUnitInit != null && Number(costUnitInit) !== 0 ? String(costUnitInit) : "",
  );
  const [costRate, setCostRate] = useState<string>(
    init.costRateCny != null && Number(init.costRateCny) !== 0 ? String(init.costRateCny) : "",
  );
  const [declared, setDeclared] = useState<string>(
    init.declaredValueThb != null && Number(init.declaredValueThb) !== 0
      ? String(init.declaredValueThb)
      : "",
  );
  const [hsCode, setHsCode] = useState<string>(init.hsCode ?? "");

  function resetDraft() {
    setCostUnit(costUnitInit != null && Number(costUnitInit) !== 0 ? String(costUnitInit) : "");
    setCostRate(init.costRateCny != null && Number(init.costRateCny) !== 0 ? String(init.costRateCny) : "");
    setDeclared(
      init.declaredValueThb != null && Number(init.declaredValueThb) !== 0
        ? String(init.declaredValueThb)
        : "",
    );
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
          declaredValueThb: declared,
          hsCode: hsCode,
        });
      } else {
        res = await setShopOrderItemCost({
          orderId: String(mode.orderId),
          costUnitCny: costUnit,
          costRateCny: costRate,
          declaredValueThb: declared,
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
        // Read-only current values (also shown when the role can't edit — the
        // page renders <CargoCostLineSummary> in that case).
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          <SummaryRow label={`ต้นทุน/หน่วย (${costUnitSymbol})`} value={fmtNum(costUnitInit)} />
          <SummaryRow label="เรทหยวนต้นทุน" value={fmtNum(init.costRateCny, 4)} />
          <SummaryRow label="มูลค่าสำแดง ใบขน (฿)" value={fmtNum(init.declaredValueThb)} />
          <SummaryRow label="HS Code" value={init.hsCode?.trim() || "—"} mono />
        </dl>
      ) : (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="block text-[10px] text-muted">ต้นทุน/หน่วย ({costUnitSymbol})</span>
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
          </label>
          <label className="space-y-0.5">
            <span className="block text-[10px] text-muted">เรทหยวนต้นทุน</span>
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
          <label className="space-y-0.5">
            <span className="block text-[10px] text-muted">มูลค่าสำแดง ใบขน (฿)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </label>
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

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
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
}: {
  itemId: number;
  costUnitThb: number | string | null;
  costRateCny: number | string | null;
  declaredValueThb: number | string | null;
  hsCode: string | null;
  label?: string;
}) {
  return (
    <CostEditorBody
      mode={{ kind: "forwarder", itemId, costUnitThb }}
      init={{ costRateCny, declaredValueThb, hsCode }}
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
}: {
  orderId: number;
  costUnitCny: number | string | null;
  costRateCny: number | string | null;
  declaredValueThb: number | string | null;
  hsCode: string | null;
  label?: string;
}) {
  return (
    <CostEditorBody
      mode={{ kind: "shop", orderId, costUnitCny }}
      init={{ costRateCny, declaredValueThb, hsCode }}
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
