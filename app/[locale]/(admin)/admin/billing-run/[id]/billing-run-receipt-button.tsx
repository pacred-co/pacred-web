"use client";

/**
 * "ออก/พิมพ์ใบเสร็จ" one-click button on the bill detail header (ภูม 2026-07-10).
 *
 * Enabled ONLY when the bill is รับชำระแล้ว (status='paid' · slip verified). Click:
 *   - bill already has a receipt → opens it (print) in a new tab.
 *   - bill has NO receipt yet     → issues it (synced to the bill's frozen totals +
 *     buyer identity), then opens it. No navigating to the receipt page first.
 *
 * Fixes the PR086 mess: the receipt always follows the bill's identity
 * (บุคคล↔นิติ) + a bill whose auto-issue failed can be issued on demand.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { ensureBillingRunReceipt } from "@/actions/admin/billing-run";

export function BillingRunReceiptButton({
  invoiceId,
  status,
}: {
  invoiceId: number;
  status: "issued" | "paid" | "cancelled";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const paid = status === "paid";

  function onClick() {
    if (!paid) return;
    setErr(null);
    start(async () => {
      const res = await ensureBillingRunReceipt({ invoiceId });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const data = res.data;
      if (!data) {
        setErr("ไม่พบข้อมูลใบเสร็จ");
        return;
      }
      // Open the receipt (print/detail) in a new tab.
      window.open(`/admin/accounting/forwarder-invoice/${data.receiptId}`, "_blank", "noopener,noreferrer");
      if (data.created) {
        // A fresh receipt was minted → refresh so any bill-side receipt state updates.
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={!paid || pending}
        title={paid ? "ออก/พิมพ์ใบเสร็จของใบวางบิลนี้" : "ต้องรับชำระ (ตรวจสลิป + ยืนยันการชำระ) ก่อน"}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
          paid
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-border bg-surface-alt text-muted cursor-not-allowed opacity-70"
        }`}
      >
        <ReceiptText className="h-4 w-4" />
        {pending ? "กำลังออกใบเสร็จ..." : "ออก/พิมพ์ใบเสร็จ"}
      </button>
      {!paid && (
        <span className="text-[10px] text-muted">รับชำระก่อนถึงจะออกใบเสร็จได้</span>
      )}
      {err && (
        <span className="max-w-[220px] text-right text-[11px] text-rose-600">{err}</span>
      )}
    </div>
  );
}
