"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminApproveRefund,
  adminRejectRefund,
  adminMarkRefundPaid,
} from "@/actions/admin/refunds";
import type { RefundStatus } from "@/lib/validators/refund";

type Props = {
  id:     string;
  status: RefundStatus;
};

export function RefundActions({ id, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function onApprove() {
    if (!confirm("ยืนยันอนุมัติคำขอคืนเงินนี้? (ยังไม่ตัดเงิน)")) return;
    setError(null);
    startTransition(async () => {
      const res = await adminApproveRefund({ id });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onMarkPaid() {
    if (!confirm("ยืนยันจ่ายเงินคืน? จะเครดิตเข้ากระเป๋าหลักของลูกค้าทันที — ขั้นตอนนี้กลับไม่ได้")) return;
    setError(null);
    startTransition(async () => {
      const res = await adminMarkRefundPaid({ id });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onReject() {
    setError(null);
    if (rejectReason.trim().length < 5) {
      setError("กรุณาระบุเหตุผลปฏิเสธอย่างน้อย 5 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await adminRejectRefund({ id, rejected_reason: rejectReason.trim() });
      if (res.ok) {
        setRejectOpen(false);
        setRejectReason("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={pending}
              className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              ✓ อนุมัติ (Approve)
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen((v) => !v)}
              disabled={pending}
              className="rounded-lg border border-red-300 bg-white text-red-700 px-4 py-2 text-sm font-bold hover:bg-red-50 disabled:opacity-50"
            >
              ✗ ปฏิเสธ (Reject)
            </button>
          </>
        )}
        {status === "approved" && (
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={pending}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            💸 จ่ายเงินคืน (Mark paid + เครดิต wallet)
          </button>
        )}
      </div>

      {rejectOpen && status === "pending" && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2">
          <label className="block text-xs font-medium text-red-900">
            เหตุผลปฏิเสธ (≥5 ตัวอักษร)<span className="text-red-600 ml-0.5">*</span>
          </label>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
            placeholder="เช่น ออเดอร์นี้ชำระเรียบร้อยแล้ว ไม่พบเหตุผลให้คืนเงิน"
            required
            minLength={5}
            maxLength={500}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setRejectOpen(false); setRejectReason(""); setError(null); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={pending || rejectReason.trim().length < 5}
              className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-red-700 disabled:opacity-50"
            >
              ยืนยันปฏิเสธ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
