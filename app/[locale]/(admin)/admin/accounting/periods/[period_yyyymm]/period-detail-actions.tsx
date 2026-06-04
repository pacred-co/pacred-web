"use client";

/**
 * V-E9 — admin client for accounting period status flips.
 *
 * Status transitions:
 *   open     → mark-closing (soft warn) · close (skip closing) ·
 *   closing  → close
 *   closed   → reopen (SUPER ONLY, requires reason ≥10 chars)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminMarkPeriodClosing,
  adminClosePeriod,
  adminReopenPeriod,
} from "@/actions/admin/accounting-periods";
import { type AccountingPeriodStatus } from "@/lib/validators/accounting-period";
import { confirm } from "@/components/ui/confirm";

type Props = {
  period_yyyymm: string;
  status:        AccountingPeriodStatus;
  canWrite:      boolean;
  canReopen:     boolean;
};

export function PeriodDetailActions({ period_yyyymm, status, canWrite, canReopen }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [closingNotes,     setClosingNotes]     = useState("");

  const [showReopen,    setShowReopen]    = useState(false);
  const [reopenReason,  setReopenReason]  = useState("");

  function call(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setShowConfirmClose(false);
        setShowReopen(false);
        setClosingNotes("");
        setReopenReason("");
        router.refresh();
      } else {
        setErr(translateError(res.error ?? "unknown"));
      }
    });
  }

  // Read-only viewer (e.g. ops role) → just show status text.
  if (!canWrite) {
    return (
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 text-xs text-muted italic">
        คุณมีสิทธิ์ดูเท่านั้น (super หรือ accounting เท่านั้นที่ปิดงวด / เปิดงวดใหม่ได้)
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm">การดำเนินการ</h2>

      {/* ── OPEN status → mark-closing or close ─────────────────── */}
      {status === "open" && !showConfirmClose && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowConfirmClose(true)}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            🔒 ปิดงวดทันที
          </button>
          <button
            type="button"
            onClick={async () => { if (await confirm("ทำเครื่องหมายงวดบัญชีนี้เป็น “กำลังปิด”?")) call(() => adminMarkPeriodClosing({ period_yyyymm })); }}
            disabled={pending}
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm hover:bg-amber-50 disabled:opacity-50"
          >
            ⏳ ทำเครื่องหมายกำลังปิด (soft warn)
          </button>
        </div>
      )}

      {/* ── CLOSING status → close ──────────────────────────────── */}
      {status === "closing" && !showConfirmClose && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowConfirmClose(true)}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            🔒 ปิดงวด
          </button>
        </div>
      )}

      {/* ── Confirm close modal ─────────────────────────────────── */}
      {showConfirmClose && (
        <div className="rounded-lg border border-red-300 bg-white p-4 space-y-3">
          <p className="text-sm font-bold text-red-900">⚠️ ยืนยันปิดงวด {period_yyyymm}?</p>
          <p className="text-xs text-muted">
            ระบบจะสร้าง snapshot ตอนปิด (จำนวนแถว + ยอดรวม) สำหรับ 4 ตาราง: <strong>tax_invoices · freight_invoices · freight_invoice_payments · wallet_transactions</strong>
          </p>
          <p className="text-xs text-red-700 font-semibold">
            ⚠️ หลังจากนี้ DB trigger จะ <strong>บล็อก UPDATE/DELETE</strong> ทุกแถวในงวดนี้ทั้ง 4 ตารางข้างต้น —
            แก้ไขเอกสารย้อนหลังในงวดที่ปิดแล้วจะไม่ได้ ต้องเปิดงวดใหม่ (super-only) ก่อน
          </p>
          <div>
            <label className="text-xs font-medium block mb-1">หมายเหตุการปิดงวด (เลือกได้)</label>
            <textarea
              rows={3}
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              maxLength={2000}
              placeholder="เช่น ภพ.30 ตรงกัน · มีการปรับปรุง manual 2 รายการ ดูใน admin_audit_log..."
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => call(() => adminClosePeriod({
                period_yyyymm,
                closing_notes: closingNotes.trim() || undefined,
              }))}
              disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังปิด..." : "✓ ปิดงวดเลย"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmClose(false)}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* ── CLOSED status → reopen (super only) ─────────────────── */}
      {status === "closed" && !showReopen && (
        <>
          {canReopen ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowReopen(true)}
                disabled={pending}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                🔓 เปิดงวดใหม่ (super only · ฉุกเฉิน)
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted italic">
              งวดนี้ปิดแล้ว · เฉพาะ super เท่านั้นที่เปิดใหม่ได้
            </p>
          )}
        </>
      )}

      {/* ── Reopen modal (super only) ───────────────────────────── */}
      {showReopen && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-3">
          <p className="text-sm font-bold text-red-900">🔓 เปิดงวด {period_yyyymm} ใหม่ (rare + serious)</p>
          <p className="text-xs text-red-800">
            ⚠️ DB trigger จะ <strong>หยุดบล็อก</strong> ทุกแถวในงวดนี้ → admin จะสามารถแก้ไข tax_invoices / freight_invoices / payments / wallet_transactions ย้อนหลังได้อีกครั้ง
          </p>
          <p className="text-xs text-muted">
            เหตุผลจะถูกบันทึกใน admin_audit_log + แสดงในเส้นเวลาของงวดนี้ตลอดไป
          </p>
          <div>
            <label className="text-xs font-medium block mb-1">เหตุผล (≥10 ตัวอักษร)</label>
            <textarea
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              maxLength={500}
              placeholder="เช่น พบใบกำกับภาษีที่ออกผิด เลขผู้เสียภาษีลูกค้า ABC จำเป็นต้องแก้ไข + ออกใหม่..."
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            />
            <p className="text-[10px] text-muted mt-1">{reopenReason.length} / 500</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => call(() => adminReopenPeriod({
                period_yyyymm,
                reopened_reason: reopenReason,
              }))}
              disabled={pending || reopenReason.trim().length < 10}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✓ เปิดงวดใหม่
            </button>
            <button
              type="button"
              onClick={() => { setShowReopen(false); setReopenReason(""); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed")) return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("insert_failed")) return `บันทึกล้มเหลว: ${code}`;
  switch (code) {
    case "period_not_found":      return "ไม่พบงวด";
    case "period_already_exists": return "งวดนี้เปิดอยู่แล้ว";
    case "already_closing":       return "งวดนี้กำลังปิดอยู่แล้ว";
    case "already_closed":        return "งวดนี้ปิดแล้ว";
    case "period_not_closed":     return "งวดนี้ยังไม่ปิด (เปิดใหม่ได้เฉพาะงวดที่ปิดแล้ว)";
    default:                       return code;
  }
}
