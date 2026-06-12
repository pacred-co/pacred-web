"use client";

/**
 * Client action bar for the freight invoice detail page.
 *
 * REUSES existing money/document actions ONLY — introduces no new write path:
 *   - adminIssueFreightInvoice   (draft → issued, reserves serial)
 *   - adminCancelFreightInvoice  (issued/draft → cancelled, with reason)
 *   - recordFreightPayment       (append a payment to an issued invoice)
 *
 * §0f confirm-before-mutate: every mutate is gated by a confirm dialog
 * (useConfirmDialogs) before firing. Record-payment uses a small modal form
 * (PacredDialog) + an explicit confirm step.
 */

import { useState, useRef, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useConfirmDialogs, PacredDialog, DialogFooter } from "@/components/ui/pacred-dialog";
import { adminIssueFreightInvoice, adminCancelFreightInvoice } from "@/actions/admin/freight-invoices";
import { recordFreightPayment } from "@/actions/admin/freight-invoice-payments";
import { FREIGHT_PAYMENT_METHODS, FREIGHT_PAYMENT_METHOD_LABEL, type FreightPaymentMethod } from "@/lib/validators/freight-payment";

function thb(n: number): string {
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function FreightInvoiceActions({
  invoiceId,
  status,
  invoiceNo,
  hasLines,
  outstanding,
}: {
  invoiceId: string;
  status: string;
  invoiceNo: string | null;
  hasLines: boolean;
  outstanding: number;
}) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "issue" | "cancel" | "pay">(null);

  // Record-payment modal
  const payDialogRef = useRef<HTMLDialogElement>(null);
  const [payMethod, setPayMethod] = useState<FreightPaymentMethod>("bank_transfer");
  const [payAmount, setPayAmount] = useState<string>(outstanding > 0 ? String(outstanding) : "");
  const [payRef, setPayRef] = useState<string>("");

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function onIssue() {
    if (!hasLines) {
      await alert("ออกใบแจ้งหนี้ไม่ได้ — ใบแจ้งหนี้นี้ยังไม่มีรายการสินค้า\nกรุณาเพิ่มรายการจากหน้างานขนส่งก่อน");
      return;
    }
    const ok = await confirm(
      "ยืนยันออกใบแจ้งหนี้?\n\nระบบจะออกเลขที่เอกสารและตรึงมูลค่า/ภาษีทั้งหมด — แก้ไขรายการไม่ได้อีก",
    );
    if (!ok) return;
    setBusy("issue");
    const res = await adminIssueFreightInvoice({ id: invoiceId });
    setBusy(null);
    if (!res.ok) {
      await alert(`ออกใบแจ้งหนี้ไม่สำเร็จ: ${res.error}`);
      return;
    }
    await alert(`ออกใบแจ้งหนี้สำเร็จ — เลขที่ ${res.data?.invoice_no ?? ""}`);
    refresh();
  }

  async function onCancel() {
    const reason = window.prompt("ยกเลิกใบแจ้งหนี้ — กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร):");
    if (reason == null) return; // user cancelled prompt
    if (reason.trim().length < 3) {
      await alert("เหตุผลสั้นเกินไป — กรุณาระบุอย่างน้อย 3 ตัวอักษร");
      return;
    }
    const ok = await confirm(
      `ยืนยันยกเลิกใบแจ้งหนี้ ${invoiceNo ?? "(ร่าง)"}?\n\nเหตุผล: ${reason.trim()}\n\nหลังยกเลิกสามารถออกใบใหม่สำหรับงานขนส่งนี้ได้`,
    );
    if (!ok) return;
    setBusy("cancel");
    const res = await adminCancelFreightInvoice({ id: invoiceId, cancellation_reason: reason.trim() });
    setBusy(null);
    if (!res.ok) {
      await alert(`ยกเลิกไม่สำเร็จ: ${res.error}`);
      return;
    }
    await alert("ยกเลิกใบแจ้งหนี้แล้ว");
    refresh();
  }

  function openPay() {
    setPayAmount(outstanding > 0 ? String(outstanding) : "");
    setPayMethod("bank_transfer");
    setPayRef("");
    payDialogRef.current?.showModal();
  }

  async function onSubmitPay(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      await alert("กรุณากรอกจำนวนเงินที่ถูกต้อง (มากกว่า 0)");
      return;
    }
    const ok = await confirm(
      `ยืนยันบันทึกการชำระเงิน?\n\nวิธี: ${FREIGHT_PAYMENT_METHOD_LABEL[payMethod]}\nจำนวน: ${thb(amount)}${payMethod === "wallet" ? "\n\n(ตัดจาก Wallet ลูกค้าทันที)" : ""}`,
    );
    if (!ok) return;
    setBusy("pay");
    const res = await recordFreightPayment({
      freight_invoice_id: invoiceId,
      method: payMethod,
      amount_thb: amount,
      bank_ref: payMethod === "bank_transfer" && payRef.trim() ? payRef.trim() : null,
    });
    setBusy(null);
    if (!res.ok) {
      await alert(`บันทึกการชำระไม่สำเร็จ: ${res.error}`);
      return;
    }
    payDialogRef.current?.close();
    await alert(
      `บันทึกการชำระแล้ว — ชำระรวม ${thb(res.data?.paid_thb ?? 0)} / ${thb(res.data?.total_thb ?? 0)} (${res.data?.payment_status ?? ""})`,
    );
    refresh();
  }

  const disabled = busy !== null || pending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <button
          type="button"
          onClick={onIssue}
          disabled={disabled}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy === "issue" ? "กำลังออกใบ…" : "ออกใบแจ้งหนี้"}
        </button>
      )}

      {status === "issued" && (
        <button
          type="button"
          onClick={openPay}
          disabled={disabled}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          บันทึกการชำระเงิน
        </button>
      )}

      {status !== "cancelled" && (
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === "cancel" ? "กำลังยกเลิก…" : "ยกเลิกใบแจ้งหนี้"}
        </button>
      )}

      {/* Record-payment modal */}
      <PacredDialog dialogRef={payDialogRef} title="บันทึกการชำระเงิน">
        <form onSubmit={onSubmitPay} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">วิธีชำระ</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as FreightPaymentMethod)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {FREIGHT_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{FREIGHT_PAYMENT_METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              จำนวนเงิน (THB) · คงค้าง {thb(outstanding)}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="0.00"
            />
          </div>
          {payMethod === "bank_transfer" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">เลขอ้างอิงธนาคาร (ถ้ามี)</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="bank ref / slip no."
              />
            </div>
          )}
          <DialogFooter
            onCancel={() => payDialogRef.current?.close()}
            pending={busy === "pay"}
            submitLabel="บันทึกการชำระ"
            pendingLabel="กำลังบันทึก…"
          />
        </form>
      </PacredDialog>

      {dialogs}
    </div>
  );
}
