"use client";

/**
 * PublicBillPayBlock — the customer pay affordance on the login-free public
 * ใบวางบิล (`/b/[token]`). G5: shows WHERE to pay the exact bill total (via the
 * 3-account SOT destination + amount-QR) and lets the customer attach their
 * transfer slip.
 *
 * MONEY: the upload calls customerUploadBillingRunSlip, which only STAGES a
 * pending slip (never settles). This component is display + upload only.
 * `print:hidden` — never in the printout/PDF.
 */

import { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, Loader2 } from "lucide-react";
import type { PacredBankAccount } from "@/lib/payment/bank-accounts";
import { PayDestination } from "@/components/payment/pay-destination";
import { customerUploadBillingRunSlip } from "@/actions/public-bill";

export default function PublicBillPayBlock({
  token,
  account,
  amountThb,
  serviceQrDataUrl,
  initialSlipStatus,
}: {
  token: string;
  account: PacredBankAccount;
  /** The frozen bill total the customer owes (net_payable). */
  amountThb: number;
  serviceQrDataUrl: string | null;
  initialSlipStatus: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Show the pending-state UX if a slip already exists (staff reviewing) or the
  // customer just uploaded one.
  const [sent, setSent] = useState(initialSlipStatus === "pending");

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("slip", file);
      const res = await customerUploadBillingRunSlip(fd);
      if (res.ok) {
        setSent(true);
      } else {
        setError(res.error);
      }
    } catch {
      setError("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="no-print print:hidden mx-auto max-w-5xl px-2 pb-8 sm:px-4">
      <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
        <h2 className="text-base font-bold text-foreground">ชำระเงินใบวางบิลนี้</h2>

        {/* WHERE to pay — destination account + amount-QR (LOGISTICS lane = static
            K-Shop PNG; SERVICE lane = generated amount-QR). Amount = net_payable. */}
        <PayDestination account={account} amountThb={amountThb} serviceQrDataUrl={serviceQrDataUrl} />

        {sent ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">ส่งสลิปแล้ว รอทีมงานตรวจ</p>
              <p className="text-xs text-emerald-700">
                แนบสลิปเพิ่มได้ถ้าโอนใหม่ — ทีมงานจะตรวจสอบและยืนยันการชำระ
              </p>
            </div>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-base font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
          <span>{busy ? "กำลังส่งสลิป…" : sent ? "แนบสลิปเพิ่ม" : "แนบสลิปการโอน"}</span>
        </button>
        <p className="text-center text-xs text-muted">รูปภาพหรือ PDF · ไม่เกิน 5 MB</p>

        {error ? <p className="text-center text-sm font-medium text-rose-700">{error}</p> : null}
      </div>
    </div>
  );
}
