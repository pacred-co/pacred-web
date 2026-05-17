"use client";

/**
 * V-E8 — admin actions for a single withdrawal: approve / reject / upload
 * slip + mark paid. Slip upload + mark-paid are stitched into a single
 * UX flow (upload first → on success, call markPaid with the returned path).
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminMarkWithdrawalPaid,
  uploadCommissionSlip,
} from "@/actions/admin/commissions";
import type { WithdrawalStatus } from "@/lib/validators/commission";

type Props = {
  id:            string;
  withdrawalNo:  string;
  status:        WithdrawalStatus;
  /** super gets the same buttons as accounting in V1 — both can approve/mark-paid. */
  isSuper:       boolean;
};

export function WithdrawalActionsClient({ id, status, isSuper }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  // Suppress unused-var warning — isSuper is reserved for future per-role
  // gating (V1.1 may split mark-paid super-only). Keep prop for API stability.
  void isSuper;

  function callApprove() {
    setErr(null);
    startTransition(async () => {
      const res = await adminApproveWithdrawal({ id });
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error ?? "unknown"));
    });
  }

  function callReject() {
    setErr(null);
    startTransition(async () => {
      const res = await adminRejectWithdrawal({ id, rejected_reason: rejectReason });
      if (res.ok) { setShowReject(false); router.refresh(); }
      else        setErr(translateError(res.error ?? "unknown"));
    });
  }

  function callUploadAndPay() {
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("กรุณาเลือกไฟล์สลิป"); return; }
    setUploadInfo(`กำลังอัพโหลด: ${file.name} (${Math.round(file.size / 1024)} KB)`);
    startTransition(async () => {
      const up = await uploadCommissionSlip(id, file);
      if (!up.ok) {
        setErr(translateError(up.error ?? "unknown"));
        setUploadInfo(null);
        return;
      }
      const path = up.data?.storage_path;
      if (!path) { setErr("upload returned no path"); setUploadInfo(null); return; }
      const mark = await adminMarkWithdrawalPaid({ id, slip_storage_path: path });
      if (mark.ok) {
        setUploadInfo(null);
        router.refresh();
      } else {
        setErr(translateError(mark.error ?? "unknown"));
        setUploadInfo(null);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm">การดำเนินการ</h2>

      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={callApprove}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ อนุมัติ
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowReject(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✗ ปฏิเสธ
            </button>
          </>
        )}

        {status === "approved" && (
          <div className="w-full space-y-2">
            <p className="text-xs text-muted">
              อนุมัติแล้ว — โอนเงินภายนอกแล้วอัพโหลดสลิปเพื่อปิดงาน
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                disabled={pending}
                className="text-xs file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white file:font-bold file:hover:bg-primary-700 file:cursor-pointer"
              />
              <button
                type="button"
                disabled={pending}
                onClick={callUploadAndPay}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {pending ? "กำลังบันทึก…" : "📥 อัพโหลดสลิป + บันทึกการจ่าย"}
              </button>
            </div>
            {uploadInfo && <p className="text-[10px] text-muted">{uploadInfo}</p>}
          </div>
        )}

        {status === "paid" && (
          <p className="text-xs text-green-700 italic">
            ✅ จ่ายแล้ว — ไม่มี action เพิ่มเติม
          </p>
        )}

        {status === "rejected" && (
          <p className="text-xs text-muted italic">
            ปฏิเสธแล้ว — accruals ที่ปลดถูกคืนสู่คลังพร้อมเบิกใหม่
          </p>
        )}
      </div>

      {showReject && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-bold text-red-900">เหตุผลที่ปฏิเสธ (≥3 ตัวอักษร)</p>
          <textarea
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
            placeholder="เช่น ยอดไม่ตรง, บัญชีไม่ถูกต้อง, ขอเอกสารเพิ่ม"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={callReject}
              disabled={pending || rejectReason.trim().length < 3}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✓ ยืนยันปฏิเสธ
            </button>
            <button
              type="button"
              onClick={() => { setShowReject(false); setRejectReason(""); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed")) return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("insert_failed")) return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("upload_failed")) return `อัพโหลดล้มเหลว: ${code}`;
  if (code.startsWith("bad_status"))    return `สถานะไม่ถูกต้อง: ${code}`;
  switch (code) {
    case "not_found":            return "ไม่พบคำขอ";
    case "no_file":              return "ไม่ได้แนบไฟล์สลิป";
    case "file_too_large":       return "ไฟล์ใหญ่เกิน 10 MB";
    case "bad_status_for_slip":  return "ไม่ใช่สถานะ approved — อัพโหลดสลิปไม่ได้";
    default:                     return code;
  }
}
