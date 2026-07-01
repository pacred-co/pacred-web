"use client";

/**
 * AP disbursement DETAIL — the write controls (Slice 2).
 * Spec §4.2 + §5: confirm-before-mutate (§0f) on every state flip.
 *
 *   requested → [อนุมัติ]  → approved
 *   approved  → [บันทึกการโอน + แนบสลิป]  → transferred   (the money-OUT REGISTER)
 *   requested|approved → [ยกเลิก]  → rejected
 *   receipt-chase axis: a plain <select>, independent of the transfer axis.
 *
 * The "โอนแล้ว" button is gated approved-only + slip-required + an
 * optimistic disable so a double-click can't double-register (the server
 * atomic-claim guard is the real backstop). READS the transfer_status the
 * server rendered — never a client guess.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm, alert as uiAlert } from "@/components/ui/confirm";
import {
  approveApRequest,
  markApTransferred,
  rejectApRequest,
  updateApReceiptStatus,
} from "@/actions/admin/ap-disbursement";
import {
  AP_RECEIPT_STATUS,
  type ApTransferStatus,
  type ApReceiptStatus,
} from "@/lib/admin/ap-disbursement";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ApDetailActions({
  id,
  transferStatus,
  receiptStatus,
  netAmount,
  itemLabel,
}: {
  id: string;
  transferStatus: ApTransferStatus;
  receiptStatus: ApReceiptStatus;
  netAmount: number;
  itemLabel: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [slip, setSlip] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  function fail(msg: string) {
    setErr(msg);
  }

  // ── อนุมัติ (requested → approved) ──
  function onApprove() {
    setErr(null);
    startTransition(async () => {
      const ok = await confirm(
        `อนุมัติการเบิก "${itemLabel}" (สุทธิ ฿${fmt2(netAmount)})?\n\nการอนุมัติเป็นการบันทึกเจตนา — ยังไม่ตัดจ่ายเงิน.`,
        { title: "อนุมัติการเบิก", confirmLabel: "อนุมัติ" },
      );
      if (!ok) return;
      const res = await approveApRequest({ id });
      if (res.ok) router.refresh();
      else fail(res.error);
    });
  }

  // ── ยกเลิก (requested|approved → rejected) ──
  function onReject() {
    setErr(null);
    startTransition(async () => {
      const ok = await confirm(`ยกเลิกรายการเบิก "${itemLabel}"?`, {
        title: "ยกเลิกการเบิก",
        confirmLabel: "ยกเลิกรายการ",
      });
      if (!ok) return;
      const res = await rejectApRequest({ id });
      if (res.ok) router.refresh();
      else fail(res.error);
    });
  }

  // ── โอนแล้ว (approved → transferred · the money-OUT REGISTER) ──
  function onTransfer() {
    setErr(null);
    if (!slip) {
      fail("กรุณาแนบสลิปการโอนก่อนบันทึก");
      return;
    }
    startTransition(async () => {
      const ok = await confirm(
        `บันทึกการโอน "${itemLabel}" (สุทธิ ฿${fmt2(netAmount)}) เป็น "โอนแล้ว"?\n\n` +
          `⚠️ นี่คือการ "บันทึกว่าโอนออกนอกระบบแล้ว" (register) — เงินโอนออกทางธนาคารจริงแล้ว สลิปคือหลักฐาน. ` +
          `ระบบไม่ได้ตัดเงินในแอป.`,
        { title: "บันทึกการโอน (โอนแล้ว)", confirmLabel: "บันทึกการโอน" },
      );
      if (!ok) return;
      const res = await markApTransferred({ id }, slip);
      if (res.ok) {
        setSlip(null);
        router.refresh();
      } else {
        fail(res.error);
      }
    });
  }

  // ── receipt-chase axis (independent · non-money) ──
  function onReceiptStatus(next: ApReceiptStatus) {
    if (next === receiptStatus) return;
    setErr(null);
    startTransition(async () => {
      const res = await updateApReceiptStatus({ id, receipt_status: next });
      if (res.ok) router.refresh();
      else {
        fail(res.error);
        await uiAlert(res.error, { title: "อัปเดตสถานะใบเสร็จไม่สำเร็จ" });
      }
    });
  }

  const isRequested = transferStatus === "requested";
  const isApproved = transferStatus === "approved";
  const canReject = isRequested || isApproved;

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">ดำเนินการ</h2>

      {err && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[13px] font-medium text-rose-700">
          ⚠️ {err}
        </div>
      )}

      {/* transfer axis controls */}
      <div className="flex flex-wrap items-start gap-3">
        {isRequested && (
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "✓ อนุมัติการเบิก"}
          </button>
        )}

        {isApproved && (
          <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-sm font-bold text-emerald-800">บันทึกการโอน (โอนแล้ว)</p>
            <p className="mt-0.5 text-[12px] text-gray-600">
              เงินโอนออกทางธนาคารจริงแล้ว — แนบสลิปเป็นหลักฐาน แล้วกดบันทึก (register · ไม่ตัดเงินในแอป)
            </p>
            <label className="mt-2 block">
              <span className="text-[12px] font-medium text-foreground">หลักฐานการโอน (สลิป)</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-primary-700"
              />
            </label>
            <button
              type="button"
              onClick={onTransfer}
              disabled={pending || !slip}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก…" : "✓ บันทึกการโอน (โอนแล้ว)"}
            </button>
          </div>
        )}

        {transferStatus === "transferred" && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[13px] font-medium text-green-700">
            ✓ บันทึกการโอนแล้ว (transferred)
          </div>
        )}
        {transferStatus === "customer_paid" && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[13px] font-medium text-teal-700">
            ลูกค้าชำระเอง — ไม่มีการจ่ายออกจาก Pacred
          </div>
        )}
        {transferStatus === "rejected" && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] font-medium text-gray-500">
            รายการถูกยกเลิก
          </div>
        )}

        {canReject && (
          <button
            type="button"
            onClick={onReject}
            disabled={pending}
            className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            ยกเลิกรายการ
          </button>
        )}
      </div>

      {/* receipt-chase axis (independent) */}
      <div className="mt-4 flex items-center gap-3 border-t border-black/5 pt-3">
        <label className="text-[13px] text-gray-600" htmlFor="ap-receipt-status">
          สถานะการตามใบเสร็จ:
        </label>
        <select
          id="ap-receipt-status"
          value={receiptStatus}
          disabled={pending}
          onChange={(e) => onReceiptStatus(e.target.value as ApReceiptStatus)}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {(Object.keys(AP_RECEIPT_STATUS) as ApReceiptStatus[]).map((k) => (
            <option key={k} value={k}>
              {AP_RECEIPT_STATUS[k].label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
