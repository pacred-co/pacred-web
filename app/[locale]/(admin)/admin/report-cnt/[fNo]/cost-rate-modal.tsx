"use client";

/**
 * <CostRateModal> — Wave 16 P0-1 + Follow-up C (dual-mode)
 *
 * Modal for "ตั้งค่าต้นทุนตู้" — Pacred upgrade on top of report-cnt.php
 * L1278-1497 (the rate-settings modal). 4 inputs (ทั่วไป / มอก. /
 * อย./น้ำยา / พิเศษ) × 2 submit buttons:
 *   - บันทึก  → adminReportCntCustomRate()
 *   - คืนค่า → adminReportCntResetRate()
 *
 * Wave 16 Follow-up C — dual mode:
 *   Legacy only allowed bulk-update for warehouses CTT/MK/JMF/GOGO/
 *   CargoCenter/MOMO (rate × CBM). MX + Sang fell under a red "ปรับ
 *   ต้นทุนไม่ได้" banner. ภูม decision: let admin pick CBM or Weight
 *   per container — for ALL carriers — and edit the 4 rates regardless.
 *   The mode is persisted by updating `tb_forwarder.frefprice` across
 *   every row in the container (legacy comment: '1'=น้ำหนัก, '2'=ปริมาตร).
 *
 * Pure Tailwind + brand polish per AGENTS.md §0a — no Bootstrap-4
 * verbatim markup.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import {
  adminReportCntCustomRate,
  adminReportCntResetRate,
} from "@/actions/admin/report-cnt-detail";

export type CostRateMode = "cbm" | "weight";

export type CostRateModalProps = {
  fCabinetNumber: string;
  warehouseLabel: string;       // "CTT" | "MK" | … (for the title)
  warehouseChinaLabel: string;  // "กวางโจว" | "อี้อู"
  transportLabel: string;       // "ทางรถ" | "ทางเรือ"
  defaults: {
    fProductsType1: number;
    fProductsType2: number;
    fProductsType3: number;
    fProductsType4: number;
  };
  /** Container's current mode derived from majority of rows' frefprice.
   *  '1' → weight; '' / '2' → cbm. */
  currentMode: CostRateMode;
  /** True iff rows have inconsistent frefprice values (a mixed-mode
   *  container). Saving will normalise all rows to the picked mode. */
  mixedMode?: boolean;
  /** Hide the trigger entirely if user can't open (e.g. cnt already paid). */
  hidden?: boolean;
};

export function CostRateModal({
  fCabinetNumber,
  warehouseLabel,
  warehouseChinaLabel,
  transportLabel,
  defaults,
  currentMode,
  mixedMode,
  hidden,
}: CostRateModalProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const [mode, setMode] = useState<CostRateMode>(currentMode);
  const [p1, setP1] = useState(String(defaults.fProductsType1));
  const [p2, setP2] = useState(String(defaults.fProductsType2));
  const [p3, setP3] = useState(String(defaults.fProductsType3));
  const [p4, setP4] = useState(String(defaults.fProductsType4));

  const [err, setErr] = useState<string | null>(null);

  if (hidden) return null;

  function save() {
    setErr(null);
    start(async () => {
      const res = await adminReportCntCustomRate({
        fCabinetNumber,
        fProductsType1: p1,
        fProductsType2: p2,
        fProductsType3: p3,
        fProductsType4: p4,
        mode,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  async function reset() {
    setErr(null);
    if (!(await confirm("คืนค่าเป็นแบบหลักและอัปเดตต้นทุนในตู้ทั้งหมด?"))) return;
    start(async () => {
      const res = await adminReportCntResetRate(fCabinetNumber);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const unit = mode === "weight" ? "kg" : "CBM";
  const subtitleMode =
    mode === "weight" ? "ราคาคิดตามน้ำหนัก (kg)" : "ราคาคิดตามปริมาตร (CBM)";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-alt"
        title="ตั้งค่าต้นทุนตู้"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        ตั้งค่าต้นทุนตู้
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3 text-white">
              <h3 className="text-base font-semibold">
                แก้ไขเรทต้นทุนสำหรับตู้นี้
              </h3>
              <p className="mt-0.5 text-xs opacity-90">
                {fCabinetNumber} · {transportLabel} · {subtitleMode}
              </p>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-red-600 dark:text-red-400">
                นำเข้าโดย: <span className="font-semibold">{warehouseLabel}</span>
                {" · "}จากเมือง: <span className="font-semibold">{warehouseChinaLabel}</span>
              </p>

              {/* Mode toggle — segmented control */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted">เลือกวิธีคำนวณต้นทุน</label>
                <div
                  role="tablist"
                  aria-label="cost calculation mode"
                  className="inline-flex w-full rounded-md border border-border bg-surface-alt/60 p-1"
                >
                  <ModeButton
                    active={mode === "cbm"}
                    onClick={() => setMode("cbm")}
                    label="คิดตามปริมาตร (CBM)"
                    iconChar="📦"
                  />
                  <ModeButton
                    active={mode === "weight"}
                    onClick={() => setMode("weight")}
                    label="คิดตามน้ำหนัก (Weight)"
                    iconChar="⚖️"
                  />
                </div>
                {mixedMode && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    ⚠ ตู้นี้มีรายการที่คิดต้นทุนปนกัน — เมื่อบันทึกแล้วจะเปลี่ยนทุกแถวเป็นแบบเดียวกัน
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={`เรทราคา ทั่วไป (บาท/${unit})`} value={p1} onChange={setP1} />
                <Field label={`เรทราคา มอก. (บาท/${unit})`}   value={p2} onChange={setP2} />
                <Field label={`เรทราคา อย./น้ำยา (บาท/${unit})`} value={p3} onChange={setP3} />
                <Field label={`เรทราคา พิเศษ (บาท/${unit})`}   value={p4} onChange={setP4} />
              </div>

              {err && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-700 dark:text-red-300">
                  {err}
                </div>
              )}
            </div>

            <div className="border-t border-border bg-surface-alt/50 px-4 py-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={reset}
                className="rounded-md border border-sky-500 bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 disabled:opacity-50"
              >
                คืนค่าเป็นแบบหลัก
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {pending ? "กำลังบันทึก…" : "บันทึกและอัปเดตต้นทุนในตู้ทั้งหมด"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="หน่วยเป็นบาทไทย"
      />
    </label>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  iconChar,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  iconChar: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-white dark:bg-surface text-primary-700 shadow-sm border border-primary-200"
          : "text-muted hover:text-foreground hover:bg-white/60 dark:hover:bg-surface/60"
      }`}
    >
      <span aria-hidden="true">{iconChar}</span>
      <span>{label}</span>
    </button>
  );
}
