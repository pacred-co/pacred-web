"use client";

/**
 * Single-row driver-assign panel for /admin/forwarders/[fNo] detail page
 * (legacy tb_forwarder branch — the REAL rows).
 *
 * re-sweep adm-09 (2026-06-01): the [fNo] detail had a driver-assign form
 * (DriverAssignForm) wired ONLY on the dead rebuilt-`forwarders` (empty-UUID)
 * branch. Real rows render through `renderLegacyForwarderView` (tb_forwarder)
 * which had a payment panel + status/edit panels but NO way to dispatch a
 * driver — admin had to leave the detail, go to the list, tick the row, and
 * use the bulk-bar. That's the same single-row-work UX gap Wave 23 closed for
 * status. This panel closes it for driver assignment.
 *
 * Reuses the SAME faithful server action as the bulk-bar
 * (`bulkAssignDriver` · actions/admin/forwarders-bulk.ts) with `fids:[fId]` —
 * one canonical write path. A one-element batch is a valid legacy case
 * (`forwarder-driver.php` L55 loops `$arrID` of length ≥ 1). The action writes
 * the legacy `tb_forwarder_driver` (parent batch) + one `tb_forwarder_driver_item`
 * (child) and enforces the legacy gate per-row (fstatus='6' เตรียมส่ง ·
 * paydeposit<>1 · not already in an open batch — forwarder-driver.php L722/L719).
 *
 * Driver picker: reuses <DriverCombobox>. The combobox emits member_code +
 * profile_id; bulkAssignDriver wants the driver's `profiles.id` (UUID =
 * admin.profile_id), so we track the emitted profile_id.
 *
 * Layout mirrors TbForwarderActionPanel / TbForwarderPaymentPanel idiom
 * (rounded-2xl card · badge header · confirm dialog · useTransition).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkAssignDriver } from "@/actions/admin/forwarders-bulk";
import { DriverCombobox } from "./driver-combobox";
import { confirm } from "@/components/ui/confirm";

type EndTimeHours = 17 | 24 | 30;

const END_TIME_OPTIONS: ReadonlyArray<{ v: EndTimeHours; l: string }> = [
  { v: 17, l: "17 ชั่วโมง (ค่าเริ่มต้น)" },
  { v: 24, l: "24 ชั่วโมง" },
  { v: 30, l: "30 ชั่วโมง" },
];

/** Status of the most-recent driver-assignment item row for this forwarder. */
export type DriverAssignmentState = {
  /** fdistatus of the latest child item: "" = ยังไม่ขึ้นรถ · "1" = on truck · "2" = delivered · "3" = expired. */
  fdistatus: string;
  /** Parent batch id (tb_forwarder_driver.id). */
  batchId: number;
  /** Driver slug stamped on the parent (fdadminid · PR member_code). */
  driverCode: string | null;
  /** Parent batch creation time (fddate · ISO/legacy ts). */
  assignedAt: string | null;
  /** Whether the parent batch is still open (fdstatus IN '1'). */
  batchOpen: boolean;
};

type Props = {
  fId: number;                 // tb_forwarder.id (primary key · child fid)
  fNo: string;                 // display id for confirm/labels
  fstatus: string;             // current tb_forwarder.fstatus
  paydeposit: string;          // "" / "1" — "1" blocks assignment (ค้างมัดจำ)
  /** Latest assignment item for this forwarder (null = never assigned). */
  current: DriverAssignmentState | null;
};

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

const FDISTATUS_LABEL: Record<string, string> = {
  "":  "รอขึ้นรถ (มอบหมายแล้ว)",
  "1": "ขึ้นรถแล้ว",
  "2": "ส่งสำเร็จ",
  "3": "หมดเวลา / ยกเลิก",
};
const FDISTATUS_BADGE: Record<string, string> = {
  "":  "bg-amber-50 text-amber-700 border-amber-200",
  "1": "bg-blue-50 text-blue-700 border-blue-200",
  "2": "bg-green-50 text-green-700 border-green-200",
  "3": "bg-gray-50 text-gray-600 border-gray-200",
};

export function TbForwarderDriverAssignPanel(p: Props) {
  const router = useRouter();
  const [driverCode,    setDriverCode]    = useState("");
  const [driverProfile, setDriverProfile] = useState("");   // profiles.id (UUID) — what bulkAssignDriver needs
  const [driverDisplay, setDriverDisplay] = useState<string | null>(null);
  const [endTime,       setEndTime]       = useState<EndTimeHours>(17);
  const [pending,       startTransition]  = useTransition();
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState<string | null>(null);

  // Legacy gate (forwarder-driver.php L719/L722): assignable only when the
  // forwarder is at fstatus='6' (เตรียมส่ง) AND not deposit-blocked AND not
  // already in an open driver batch. The server action re-checks all of this
  // per-row (so this is purely a UX pre-gate — never the security boundary).
  const isReadyStatus = p.fstatus === "6";
  const isDepositBlocked = (p.paydeposit ?? "").trim() === "1";
  const hasOpenBatch = p.current?.batchOpen === true && (p.current.fdistatus === "" || p.current.fdistatus === "1");
  const canAssign = isReadyStatus && !isDepositBlocked && !hasOpenBatch;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!driverProfile) {
      setError("กรุณาเลือกคนขับก่อน");
      return;
    }

    const driverLabel = driverDisplay ?? driverCode;
    if (!(await confirm(
      `มอบหมายงานขนส่ง #${p.fNo} ให้คนขับ:\n\n${driverLabel}\n\nรับงานภายใน ${endTime} ชม. — ยืนยัน?`,
    ))) return;

    startTransition(async () => {
      // Reuse the bulk action with a single-element batch (fids:[fId]).
      const result = await bulkAssignDriver([String(p.fId)], driverProfile, endTime);
      if (!result.ok || !result.data) {
        setError(result.ok ? "มอบหมายไม่สำเร็จ" : (result.error ?? "มอบหมายไม่สำเร็จ"));
        return;
      }
      // bulkAssignDriver returns { succeeded, failed }. With one input id the
      // row is either in succeeded or carries a per-row reason in failed.
      const failedRow = result.data.failed.find((f) => f.fNo === String(p.fId));
      if (failedRow) {
        setError(failedRow.error);
        return;
      }
      if (result.data.succeeded.length === 0) {
        setError("ไม่มีรายการที่มอบหมายสำเร็จ");
        return;
      }
      setSuccess(`มอบหมายสำเร็จ — คนขับได้รับการแจ้งเตือนแล้ว (#${p.fNo})`);
      setDriverCode("");
      setDriverProfile("");
      setDriverDisplay(null);
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-sky-100 text-sky-800 px-2.5 py-0.5 text-[11px] font-semibold">
          มอบหมายคนขับ
        </span>
        <h3 className="text-sm font-semibold tracking-wide">🚚 คนขับ (Driver assignment)</h3>
      </div>

      {/* Current assignment status (if any) */}
      {p.current && (
        <div className="rounded-lg border border-border bg-white dark:bg-surface p-2.5 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">สถานะการมอบหมายล่าสุด</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 ${FDISTATUS_BADGE[p.current.fdistatus] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
              {FDISTATUS_LABEL[p.current.fdistatus] ?? `สถานะ ${p.current.fdistatus}`}
            </span>
          </div>
          {p.current.driverCode && (
            <p className="text-muted">
              คนขับ: <span className="font-mono text-foreground">{p.current.driverCode}</span>
              {p.current.assignedAt && (
                <> · มอบหมาย {new Date(p.current.assignedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</>
              )}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          ✓ {success}
        </div>
      )}

      {canAssign ? (
        <form onSubmit={onSubmit} className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              เลือกคนขับ <span className="text-red-500">*</span>
            </label>
            <DriverCombobox
              value={driverCode}
              onChange={(code, display, profileId) => {
                setDriverCode(code);
                setDriverDisplay(display);
                setDriverProfile(profileId ?? "");
              }}
              disabled={pending}
            />
            <p className="mt-1 text-[11px] text-muted">เฉพาะ profile ที่มี role driver + active เท่านั้น</p>
          </div>

          <div>
            <label htmlFor={`tdap_endtime_${p.fId}`} className="block text-xs font-medium text-muted mb-1">
              เวลารับงาน (คนขับต้องรับภายใน)
            </label>
            <select
              id={`tdap_endtime_${p.fId}`}
              value={endTime}
              onChange={(e) => setEndTime(Number(e.target.value) as EndTimeHours)}
              disabled={pending}
              className={INPUT_CLS}
            >
              {END_TIME_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={pending || !driverProfile}
            className="w-full rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "กำลังมอบหมาย..." : "📦 มอบหมายคนขับ"}
          </button>
        </form>
      ) : (
        // Not eligible — explain why (faithful to the legacy gate). The most
        // common reason is "not yet at status 6 (เตรียมส่ง)".
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {hasOpenBatch
            ? "⚠️ มีรอบจัดส่งที่เปิดอยู่แล้ว — ปิดของเดิม (ส่งสำเร็จ / หมดเวลา) ก่อนมอบหมายใหม่"
            : isDepositBlocked
              ? "⚠️ ลูกค้าค้างชำระเงินมัดจำ — รอชำระก่อนจึงจะมอบหมายคนขับได้"
              : "ℹ️ มอบหมายคนขับได้เมื่อสถานะเป็น \"เตรียมส่ง\" (6) เท่านั้น — สถานะปัจจุบันยังไม่ถึง"}
        </p>
      )}

      <p className="text-[11px] text-muted text-center leading-relaxed">
        มอบหมายแล้วจะสร้างรอบจัดส่งใน
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">tb_forwarder_driver</code>
        + รายการใน
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">tb_forwarder_driver_item</code>
        พร้อมแจ้งเตือนคนขับอัตโนมัติ
      </p>
    </div>
  );
}
