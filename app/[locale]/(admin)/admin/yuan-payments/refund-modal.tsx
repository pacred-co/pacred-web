"use client";

/**
 * Phase C QoL #4 (G-5 fix) — yuan refund slip-required modal.
 *
 * Replaces the bare "คืนเงิน" button in the row actions. Flow:
 *   1. Admin clicks "คืนเงิน + แนบสลิป"
 *   2. Modal opens — file picker for the bank-transfer slip + optional
 *      reason field + reminder of customer + amount
 *   3. On confirm: uploadYuanRefundSlip(file) → returns storage_path →
 *      adminMarkYuanPaymentRefunded({id, refund_slip_path, note})
 *   4. On success: refresh + close. On reject: surface error.
 *
 * Esc + backdrop click close (when no in-flight action). Cannot
 * confirm without a file.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadYuanRefundSlip,
  adminMarkYuanPaymentRefunded,
} from "@/actions/admin/yuan-payments";

type Props = {
  open: boolean;
  onClose: () => void;
  yuanPayment: {
    id:            string;
    yuan_amount:   number;
    thb_amount:    number;
    member_code:   string | null;
    customer_name: string;
    phone:         string | null;
    paid_via_wallet: boolean;
    status:        string;
  };
};

export function YuanRefundModal({ open, onClose, yuanPayment }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [note, setNote]     = useState("");
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  // Reset transient state on close. React 19 forbids synchronous setState
  // in an effect body; the writes feed only the next open of the modal,
  // so deferring to a microtask is invisible to users.
  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setErr(null);
      setNote("");
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  function fire() {
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("กรุณาเลือกไฟล์สลิปการคืนเงิน");
      return;
    }
    startTransition(async () => {
      const up = await uploadYuanRefundSlip(yuanPayment.id, file);
      if (!up.ok) {
        setErr(`อัพโหลดล้มเหลว: ${up.error}`);
        return;
      }
      const path = up.data?.storage_path;
      if (!path) {
        setErr("upload returned no path");
        return;
      }
      const mark = await adminMarkYuanPaymentRefunded({
        id:               yuanPayment.id,
        refund_slip_path: path,
        note:             note.trim() || undefined,
      });
      if (mark.ok) {
        router.refresh();
        onClose();
      } else {
        setErr(mark.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="คืนเงินฝากโอนหยวน — แนบสลิป"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h3 className="font-bold text-sm">คืนเงิน + แนบสลิป</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm text-muted hover:text-foreground disabled:opacity-50"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Customer + amount summary */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-1 text-xs">
            <p className="font-medium">{yuanPayment.customer_name}
              <span className="ml-2 font-mono text-muted">{yuanPayment.member_code ?? "—"}</span>
              {yuanPayment.phone && <span className="ml-2 text-muted">{yuanPayment.phone}</span>}
            </p>
            <p className="text-lg font-bold font-mono text-amber-900">
              ¥{Number(yuanPayment.yuan_amount).toFixed(2)} = ฿{Number(yuanPayment.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
            {yuanPayment.paid_via_wallet && (
              <p className="text-[10px] text-amber-800">
                ⚠️ ลูกค้าจ่ายผ่าน wallet → ระบบจะคืน wallet debit อัตโนมัติ
              </p>
            )}
          </div>

          {/* Slip upload */}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">
              สลิปการโอนคืน <span className="text-red-600">*</span>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              disabled={pending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileLabel(f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : null);
              }}
              className="block w-full text-xs file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white file:font-bold file:hover:bg-primary-700 file:cursor-pointer"
            />
            <span className="block text-[11px] text-muted">
              PDF / JPG / PNG ≤ 10 MB — เก็บใน slips/yuan-refunds/{yuanPayment.id.slice(0, 8)}…
            </span>
            {fileLabel && (
              <span className="block text-[11px] text-primary-700">📎 {fileLabel}</span>
            )}
          </label>

          {/* Optional note */}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">เหตุผล / หมายเหตุ (optional)</span>
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-xs"
              placeholder="เช่น ลูกค้าขอยกเลิก / โอนไม่ได้ปลายทาง"
              disabled={pending}
            />
          </label>

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {err}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface-alt/40 p-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={fire}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "✓ ยืนยันคืนเงิน + แนบสลิป"}
          </button>
        </div>
      </div>
    </div>
  );
}
