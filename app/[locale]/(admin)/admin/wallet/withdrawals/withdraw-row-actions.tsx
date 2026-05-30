"use client";

/**
 * Inline approve/reject row-actions for the pending-withdraw queue
 * (/admin/wallet/withdrawals). P1-26 (ADR-0018 D-2 rule 1 + rule 3 ¶3-4).
 *
 *   ✓ ยืนยันจ่ายเงิน  → adminApproveWithdraw (status 1→2 · NO balance change)
 *   ✗ ปฏิเสธ + คืนเงิน → adminRejectWithdraw  (status 1→3 · refund the hold)
 *
 * On success we router.refresh() so the row leaves the pending list.
 * The full detail (slip · similar-tx warning · bank fields) lives on
 * /admin/wallet/[id]; this is the fast queue-clear surface.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { adminApproveWithdraw, adminRejectWithdraw } from "@/actions/admin/wallet-hs";

export function WithdrawRowActions({ id }: { id: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await adminApproveWithdraw({ id });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function reject() {
    setError(null);
    if (reason.trim().length > 0 && reason.trim().length < 3) {
      setError("เหตุผลต้องมีอย่างน้อย 3 ตัวอักษร (หรือเว้นว่างไว้)");
      return;
    }
    startTransition(async () => {
      const res = await adminRejectWithdraw({ id, reason: reason.trim() || undefined });
      if (res.ok) {
        router.refresh();
        setMode("idle");
        setReason("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-1.5 min-w-[180px]">
      {error && <div className="text-[10px] text-red-700">{error}</div>}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            จ่ายเงิน
          </button>
          <button
            type="button"
            onClick={() => { setMode("reject"); setError(null); }}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-red-500 bg-white px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ + คืนเงิน
          </button>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-1.5 rounded-lg border border-red-300 bg-red-50 p-2">
          <p className="text-[10px] font-bold text-red-900">
            เหตุผล (ตัวเลือก) · เมื่อปฏิเสธ ระบบจะคืนเงินเข้ากระเป๋าลูกค้าอัตโนมัติ
          </p>
          <textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1 text-[11px]"
            placeholder="เช่น เอกสารบัญชีไม่ครบ / เลขบัญชีไม่ตรงชื่อ"
            autoFocus
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังปฏิเสธ…" : "✓ ยืนยัน + คืนเงิน"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("idle"); setReason(""); setError(null); }}
              disabled={pending}
              className="rounded-md border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
