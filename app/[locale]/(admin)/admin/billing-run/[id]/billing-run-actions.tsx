"use client";

/**
 * Mark-paid + cancel client island for /admin/billing-run/[id].
 *
 * Per AGENTS.md §0e — only renders the action panels when the underlying
 * server action can actually do something (status='issued'). Paid/cancelled
 * invoices show an info banner instead so staff don't see a "บันทึก" button
 * that no-ops.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markBillingRunPaid,
  cancelBillingRunInvoice,
  sendBillingRunNotification,
} from "@/actions/admin/billing-run";

type Props = {
  invoiceId: number;
  docNo: string;
  status: "issued" | "paid" | "cancelled";
  totalThb: number;
  customerId: string;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BillingRunActions({ invoiceId, docNo, status, totalThb, customerId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [paymentMethod, setPaymentMethod] =
    useState<"bank_transfer" | "cheque" | "wallet" | "other">("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAt, setPaidAt] = useState(isoToday());

  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  if (status === "paid") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
        <p className="text-sm text-emerald-800 font-medium">
          ✓ ใบวางบิลนี้ได้รับชำระแล้ว · ดูประวัติด้านบน
        </p>
      </section>
    );
  }
  if (status === "cancelled") {
    return (
      <section className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
        <p className="text-sm text-stone-700 font-medium">
          ✕ ใบวางบิลนี้ถูกยกเลิกแล้ว
        </p>
      </section>
    );
  }

  function onMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!confirm(`ยืนยันบันทึกการรับชำระ ${docNo} จำนวน ฿${thbFmt(totalThb)}?`)) return;

    startTransition(async () => {
      const res = await markBillingRunPaid({
        invoiceId,
        paymentMethod,
        paymentReference: paymentRef,
        paidAt,
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✓ บันทึกการรับชำระแล้ว" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  function onSendNotification() {
    setMsg(null);
    startTransition(async () => {
      const res = await sendBillingRunNotification({
        invoiceId,
        channel: "both",
      });
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: res.data?.sent
            ? `✓ ส่งเตือนลูกค้าแล้ว (${res.data.channel})`
            : `📝 ${res.data?.channel} (ลูกค้าไม่มี LINE/email)`,
        });
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  function onCancel() {
    if (cancelReason.trim().length < 3) {
      setMsg({ kind: "err", text: "เหตุผลยกเลิกต้องอย่างน้อย 3 ตัวอักษร" });
      return;
    }
    startTransition(async () => {
      const res = await cancelBillingRunInvoice({
        invoiceId,
        cancelReason: cancelReason.trim(),
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✕ ยกเลิกใบวางบิลแล้ว" });
        setShowCancelDialog(false);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  // status === "issued"
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm">ดำเนินการ</h3>

      {msg && (
        <div className={`rounded-lg p-2.5 text-sm border ${msg.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Mark paid */}
      <form onSubmit={onMarkPaid} className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
        <h4 className="font-medium text-sm text-emerald-800">✓ บันทึกการรับชำระ</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label>
            <span className="block text-xs font-medium text-muted mb-1">วิธีการชำระ</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className={inputCls}
            >
              <option value="bank_transfer">โอนเงินผ่านธนาคาร</option>
              <option value="cheque">เช็ค</option>
              <option value="wallet">หักจาก wallet</option>
              <option value="other">อื่นๆ</option>
            </select>
          </label>
          <label>
            <span className="block text-xs font-medium text-muted mb-1">วันที่รับชำระ</span>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className="block text-xs font-medium text-muted mb-1">หมายเลขอ้างอิง</span>
            <input
              type="text"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="เลขอ้างอิงการโอน / เช็ค"
              className={inputCls}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : `บันทึกการรับชำระ ฿${thbFmt(totalThb)}`}
        </button>
      </form>

      {/* Send notification to customer (LINE/email) */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-2">
        <h4 className="font-medium text-sm text-blue-800">📨 แจ้งเตือนลูกค้า</h4>
        <p className="text-xs text-muted">
          ส่งแจ้งเตือนผ่าน LINE OA (ถ้าลูกค้าผูกแล้ว) หรือ Email · เนื้อหาจะปรับเป็น &quot;เลยกำหนด&quot; โดยอัตโนมัติถ้าครบกำหนดแล้ว
        </p>
        <button
          type="button"
          onClick={onSendNotification}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "กำลังส่ง..." : "📨 ส่งแจ้งเตือน"}
        </button>
      </div>

      {/* Cancel */}
      {!showCancelDialog ? (
        <button
          type="button"
          onClick={() => setShowCancelDialog(true)}
          className="text-xs text-red-600 hover:text-red-700 hover:underline underline-offset-2"
        >
          🗑 ยกเลิกใบวางบิลนี้
        </button>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 space-y-3">
          <h4 className="font-medium text-sm text-red-800">✕ ยกเลิกใบวางบิล</h4>
          <p className="text-xs text-muted">
            ลูกค้า {customerId} จะไม่ต้องจ่ายเงินตามใบนี้ · รายการฝากนำเข้าทั้งหมดที่ถูกผูกจะกลับมาออกใบใหม่ได้
          </p>
          <label>
            <span className="block text-xs font-medium text-muted mb-1">เหตุผลยกเลิก <span className="text-red-500">*</span></span>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              required
              className={inputCls}
              placeholder="เช่น 'ลูกค้าขอแก้ไขรายการ', 'ออกเลขผิด', 'ต้องรวมกับใบอื่น'"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending || cancelReason.trim().length < 3}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}
              className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
