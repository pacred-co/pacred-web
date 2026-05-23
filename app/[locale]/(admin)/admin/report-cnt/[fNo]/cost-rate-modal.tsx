"use client";

/**
 * <CostRateModal> — Wave 16 P0-1
 *
 * Modal for "ตั้งค่าต้นทุนตู้" — faithful port of report-cnt.php
 * L1278-1497 (the rate-settings modal). 4 inputs (ทั่วไป / มอก. /
 * อย./น้ำยา / พิเศษ) × 2 submit buttons:
 *   - บันทึก  → adminReportCntCustomRate()
 *   - คืนค่า → adminReportCntResetRate()
 *
 * Per legacy L1478 the modal "save" button only appears for warehouses
 * CTT/MK/JMF/GOGO/CargoCenter/MOMO (since their pricing is purely
 * rate × CBM). For warehouse 1 (แสง) + warehouse 4 (MX) the legacy
 * renders a red disabled banner — we surface the same `disabled` flag.
 *
 * Pure Tailwind + brand polish per AGENTS.md §0a — no Bootstrap-4
 * verbatim markup.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminReportCntCustomRate,
  adminReportCntResetRate,
} from "@/actions/admin/report-cnt-detail";

export type CostRateModalProps = {
  fCabinetNumber: string;
  warehouseLabel: string;       // "CTT" | "MK" | … (for the title)
  warehouseChinaLabel: string;  // "กวางโจว" | "อี้อู"
  transportLabel: string;       // "ทางรถ" | "ทางเรือ"
  /** When true, the form is rendered but the submit buttons are hidden +
   *  a red banner explains why (matches legacy L1486-1488). */
  disabled: boolean;
  defaults: {
    fProductsType1: number;
    fProductsType2: number;
    fProductsType3: number;
    fProductsType4: number;
  };
  /** Hide the trigger entirely if user can't open (e.g. cnt already paid). */
  hidden?: boolean;
};

export function CostRateModal({
  fCabinetNumber,
  warehouseLabel,
  warehouseChinaLabel,
  transportLabel,
  disabled,
  defaults,
  hidden,
}: CostRateModalProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

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
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function reset() {
    setErr(null);
    if (!confirm("คืนค่าเป็นแบบหลักและอัปเดตต้นทุนในตู้ทั้งหมด?")) return;
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
                {fCabinetNumber} · {transportLabel} · ราคาคิดตามปริมาตร (CBM)
              </p>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-red-600 dark:text-red-400">
                นำเข้าโดย: <span className="font-semibold">{warehouseLabel}</span>
                {" · "}จากเมือง: <span className="font-semibold">{warehouseChinaLabel}</span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="เรทราคา ทั่วไป (บาท)" value={p1} onChange={setP1} />
                <Field label="เรทราคา มอก. (บาท)"   value={p2} onChange={setP2} />
                <Field label="เรทราคา อย./น้ำยา (บาท)" value={p3} onChange={setP3} />
                <Field label="เรทราคา พิเศษ (บาท)"   value={p4} onChange={setP4} />
              </div>

              {err && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-700 dark:text-red-300">
                  {err}
                </div>
              )}

              {disabled && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-700 dark:text-red-300 space-y-1">
                  <p>ปรับต้นทุนแบบรวมไม่ได้สำหรับโกดังนี้</p>
                  <p className="opacity-80">
                    MX มีเรทแบบน้ำหนักด้วย / Sang คำนวณจาก กว้าง×ยาว×สูง โดยตรง — ต้องแก้ไขทีละรายการ
                  </p>
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
              {!disabled && (
                <>
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
                </>
              )}
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
