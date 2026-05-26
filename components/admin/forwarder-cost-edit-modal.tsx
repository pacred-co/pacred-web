"use client";

/**
 * Reusable inline cost-edit modal — Wave 16 P0-3 (2026-05-25).
 *
 * Faithful port of `pcs-admin/include/pages/report-cnt/editForm.php` (the AJAX
 * cost-edit modal). The legacy modal opens from 3 trigger functions:
 *
 *   editCost(ID)                      → admin types both fields manually
 *   editCost2(ID, sheetCost)          → pre-fills cost from S-sheet but
 *                                       admin can still edit
 *   editCostSheet(ID)                 → admin edits fCostTotalPriceSheet
 *                                       (separate column, sang-sheet path)
 *
 * Modes 1+2 mutate `fcosttotalprice` + `fproductstype2` via
 *   `adminUpdateForwarderCost`.
 * Mode 3 mutates `fcosttotalpricesheet` via
 *   `adminUpdateForwarderCostSheet`.
 *
 * Per docs/learnings/pacred-design-philosophy.md + AGENTS.md §0a:
 *   - Legacy = workflow source (same 2 columns updated · same role gate
 *     · same product-type enum 1/2/3/4)
 *   - Pacred = UI source (Tailwind modal · Lucide icons · cleaner layout ·
 *     pre-fill hint chip for Mode 2 · live "ราคา/cbm" preview when ปริมาตร
 *     is known · NEVER BS4 markup)
 *
 * Designed to be embedded from ANY admin row that exposes cost editing —
 * `/admin/forwarders/`, `/admin/report-cnt/[fNo]`, `/admin/accounting/forwarder`,
 * `/admin/forwarders/container-cost-check`. The parent passes the forwarder
 * snapshot + open/close handlers.
 *
 * Headless behaviour:
 *   - Esc closes
 *   - Backdrop click closes
 *   - Submit while pending is no-op (form button disabled)
 *   - On success, calls onSaved() THEN onClose() — parent typically calls
 *     router.refresh() inside onSaved() to re-fetch server data
 */

import { useEffect, useState, useTransition } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import {
  adminUpdateForwarderCost,
  adminUpdateForwarderCostSheet,
} from "@/actions/admin/forwarder-cost";

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export type ForwarderCostEditMode = "editCost" | "editCost2" | "editCostSheet";

export type ForwarderCostEditTarget = {
  /** tb_forwarder.id (numeric — used for the UPDATE) */
  fid:                  number;
  /** Public-facing PR id (tb_forwarder.fidorco or numeric fallback) — shown in header */
  fNo:                  string;
  /** Live cost (tb_forwarder.fcosttotalprice) — pre-fills Mode 1 + 2 input */
  fCostTotalPrice:      number;
  /** Sheet cost (tb_forwarder.fcosttotalpricesheet) — pre-fills Mode 3 input */
  fCostTotalPriceSheet: number;
  /** Secondary product type used for cost calc (NOT customer billing) */
  fProductsType2:       string | null;
  /** Volume in cbm — shown in header for context */
  fVolume:              number;
  /** Weight in kg — shown in header for context */
  fWeight:              number;
  /** Optional: tracking number for header context */
  fTrackingCHN?:        string | null;
};

type Props = {
  mode:        ForwarderCostEditMode;
  forwarder:   ForwarderCostEditTarget;
  /**
   * Mode 2 only — cost value lifted from the S-sheet (typically
   * `forwarder.fCostTotalPriceSheet` at the moment the modal was opened, but
   * the caller may pass a different value e.g. computed from group context).
   */
  sheetCost?:  number;
  onClose:     () => void;
  /** Fired after a successful UPDATE — parent should refresh data. */
  onSaved:     () => void;
};

// ────────────────────────────────────────────────────────────
// Product-type enum — same shape as forwarders-edit/edit-form.tsx so the
// chip styling matches across the admin surface.
// ────────────────────────────────────────────────────────────

const PRODUCT_TYPE_2_OPTIONS: {
  value: "1" | "2" | "3" | "4";
  label: string;
  sub:   string;
}[] = [
  { value: "1", label: "ทั่วไป", sub: "Generic" },
  { value: "2", label: "มอก.",  sub: "TIS · มาตรฐานอุตสาหกรรม" },
  { value: "3", label: "อย.",   sub: "FDA · อาหาร/ยา" },
  { value: "4", label: "พิเศษ", sub: "Special goods" },
];

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function ForwarderCostEditModal({
  mode,
  forwarder,
  sheetCost,
  onClose,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);

  // Initial cost value depends on the mode.
  const initialCostInput = (() => {
    if (mode === "editCostSheet") return forwarder.fCostTotalPriceSheet;
    if (mode === "editCost2" && typeof sheetCost === "number") return sheetCost;
    return forwarder.fCostTotalPrice;
  })();

  const [costInput, setCostInput] = useState<string>(
    Number.isFinite(initialCostInput) ? String(initialCostInput) : "0",
  );

  // Mode 1 + 2 — secondary product type. Initial = whatever's in DB
  // (may be null → "" placeholder).
  const [productType2, setProductType2] = useState<string>(
    forwarder.fProductsType2 ?? "",
  );

  // ─── Esc close ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ─── Lock body scroll while open ────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ─── Derived metrics for header context ────────────────────
  const cbmNumber = Number(forwarder.fVolume);
  const weightKg  = Number(forwarder.fWeight);
  const costNumber = Number(costInput);
  const showCostPerCbm =
    Number.isFinite(cbmNumber) && cbmNumber > 0 && Number.isFinite(costNumber) && costNumber > 0;
  const costPerCbm = showCostPerCbm ? costNumber / cbmNumber : 0;

  // ─── Submit ────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const value = Number(costInput);
    if (!Number.isFinite(value) || value < 0) {
      setError("ราคาต้นทุนต้องเป็นตัวเลข ≥ 0");
      return;
    }

    startTransition(async () => {
      if (mode === "editCostSheet") {
        const res = await adminUpdateForwarderCostSheet({
          fid:                  forwarder.fid,
          fCostTotalPriceSheet: value,
        });
        if (res.ok) {
          onSaved();
          onClose();
        } else {
          setError(res.error);
        }
        return;
      }

      // Mode 1 + 2 — same action.
      const pt2 = productType2 === "" ? null : (productType2 as "1" | "2" | "3" | "4");
      const res = await adminUpdateForwarderCost({
        fid:             forwarder.fid,
        fCostTotalPrice: value,
        fProductsType2:  pt2,
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  // ─── Mode 2 helper: "ใช้ค่าจาก Sheet" — pre-fill cost from sheetCost prop
  function applySheetValue() {
    if (typeof sheetCost === "number" && Number.isFinite(sheetCost)) {
      setCostInput(String(sheetCost));
    }
  }

  // ─── Header copy ───────────────────────────────────────────
  const headerTitle =
    mode === "editCostSheet"
      ? "แก้ไขราคาต้นทุน (Sheet)"
      : "แก้ไขราคาต้นทุน";
  const headerSub =
    mode === "editCostSheet"
      ? "อัปเดต fCostTotalPriceSheet · ต้นทุนตาม Google Sheet ของคู่ค้า (แสง)"
      : "อัปเดต fCostTotalPrice · ต้นทุนจริงที่ PCS จ่ายให้คู่ค้า";

  const costLabel =
    mode === "editCostSheet" ? "ต้นทุนจาก Sheet (THB)" : "ต้นทุนจริง (THB)";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-edit-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-primary-600 uppercase">
              Admin · ต้นทุน
            </p>
            <h2
              id="cost-edit-modal-title"
              className="mt-0.5 text-base font-bold"
            >
              {headerTitle}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">{headerSub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Context strip — fNo · CBM · weight · tracking */}
        <div className="border-b border-border bg-surface-alt/40 px-5 py-3 text-xs">
          <p className="font-mono font-semibold text-primary-700">
            PR{forwarder.fNo}
          </p>
          <p className="mt-1 text-muted">
            ปริมาตร <span className="font-mono text-foreground">{cbmNumber.toFixed(3)} cbm</span>
            <span className="mx-2 text-border">·</span>
            น้ำหนัก <span className="font-mono text-foreground">{weightKg.toFixed(2)} kg</span>
          </p>
          {forwarder.fTrackingCHN && (
            <p className="mt-0.5 text-muted">
              tracking <span className="font-mono text-foreground">{forwarder.fTrackingCHN}</span>
            </p>
          )}
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4" autoComplete="off">
          {/* Cost input */}
          <div className="space-y-1.5">
            <label htmlFor="cost-input" className="block text-xs font-medium">
              {costLabel}
              <span className="ml-1 text-red-500">*</span>
            </label>
            <input
              id="cost-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              autoFocus
              disabled={pending}
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              className="w-full rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 text-right font-mono text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50"
            />
            {showCostPerCbm && (
              <p className="text-[11px] text-muted text-right">
                ≈ <span className="font-mono text-foreground">
                  {costPerCbm.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span> ฿/cbm
              </p>
            )}
          </div>

          {/* Mode 2 — Sheet-hint + apply button */}
          {mode === "editCost2" && typeof sheetCost === "number" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="text-blue-900">
                  <span className="font-medium">ราคาจาก Sheet (แสง):</span>{" "}
                  <span className="font-mono">
                    ฿{sheetCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={applySheetValue}
                  disabled={pending || String(sheetCost) === costInput}
                  className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  ใช้ค่านี้
                </button>
              </div>
            </div>
          )}

          {/* Mode 1 + 2 — fProductsType2 chips */}
          {mode !== "editCostSheet" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium">
                ประเภทสินค้า 2
                <span className="ml-1 text-[10px] font-normal text-muted">
                  (ที่คิดเงิน · ไม่เกี่ยวกับเก็บเงินลูกค้า)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {/* "ว่าง" — clear column */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setProductType2("")}
                  className={[
                    "rounded-lg border px-2 py-1.5 text-[11px] text-left transition",
                    productType2 === ""
                      ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                      : "border-border hover:border-primary-300 hover:bg-surface-alt",
                  ].join(" ")}
                >
                  <span className="block text-[10px] text-muted">—</span>
                  <span className="block">ว่าง · ไม่ระบุ</span>
                </button>
                {PRODUCT_TYPE_2_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={pending}
                    onClick={() => setProductType2(opt.value)}
                    className={[
                      "rounded-lg border px-2 py-1.5 text-[11px] text-left transition",
                      productType2 === opt.value
                        ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                        : "border-border hover:border-primary-300 hover:bg-surface-alt",
                    ].join(" ")}
                  >
                    <span className="block text-[10px] text-muted">{opt.value}</span>
                    <span className="block font-semibold">{opt.label}</span>
                    <span className="block text-[10px] text-muted">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || costInput === ""}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
