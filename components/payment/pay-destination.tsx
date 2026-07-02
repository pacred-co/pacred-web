"use client";

/**
 * <PayDestination> — the ONE customer-facing "where to pay" block (2026-06-30).
 *
 * Owner directive ("ฝังรากฐานเก็บเงิน ห้ามผิด"): every CARGO pay surface must show
 * the CORRECT destination account for its doc-mode. The destination is resolved
 * by `resolvePaymentAccount()` (lib/payment/bank-accounts.ts — the 3-account SOT)
 * and passed in here. This component is DISPLAY-ONLY: it renders the account
 * (bank · type · number · name) + the right QR + a TRADING VAT note. It NEVER
 * records / verifies / settles a payment — the slip-upload + verify flow stays
 * exactly as it was on each surface.
 *
 *   SERVICE   (PromptPay นิติ 0105564077716 · 204-1-55856-6) → a GENERATED
 *             amount-QR (exact total encoded) built server-side via
 *             buildServicePromptPayQrDataUrl / getForwarderPaymentQr, passed in
 *             via `serviceQrDataUrl`. Never a static K-Shop image (owner rule).
 *   LOGISTICS (225-2-91144-0) / TRADING (232-1-07669-9) → a static Thai-QR/K-Shop
 *             PNG at /images/payment/qr-{logistics,trading}.png. The PNGs are not
 *             on disk yet → onError hides the <img> and the account-number block
 *             (always shown) carries the destination.
 *
 * The amount is NOT encoded in the LOGISTICS/TRADING QR (static merchant QR) — the
 * customer types it themselves, same as the existing static company QR. The
 * `amountThb` prop is shown as the "โอนยอด" hint only.
 */

import { useState } from "react";
import { OUTPUT_VAT_RATE, type PacredBankAccount } from "@/lib/payment/bank-accounts";

const fmtThb = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PayDestination({
  account,
  amountThb,
  /** Pre-built PromptPay QR data-url for the SERVICE lane (resolved server-side
   *  via lib/promptpay.ts buildPromptPayQrDataUrl). Ignored for the QR-PNG lanes. */
  serviceQrDataUrl,
  className,
}: {
  account: PacredBankAccount;
  amountThb?: number;
  serviceQrDataUrl?: string | null;
  className?: string;
}) {
  // LOGISTICS / TRADING serve a static K-Shop PNG that may not be on disk yet.
  const [qrImgOk, setQrImgOk] = useState(true);

  const isPromptPay = account.channel === "promptpay";
  const qrToShow = isPromptPay
    ? (serviceQrDataUrl ?? null)
    : (qrImgOk && account.qrImagePath ? account.qrImagePath : null);

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 p-4 text-left space-y-2 ${className ?? ""}`}
    >
      <p className="text-sm font-bold text-foreground">สแกน QR หรือโอนเข้าบัญชีบริษัท</p>

      {qrToShow && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrToShow}
            alt="QR ชำระเงิน บริษัท แพคเรด"
            className="w-36 h-36 rounded-lg border border-amber-300 bg-white object-contain"
            onError={() => setQrImgOk(false)}
          />
        </div>
      )}

      <p className="text-sm text-foreground">
        โอนเข้าบัญชี:{" "}
        <span className="font-semibold">{account.bankName}</span> {account.accountType}{" "}
        <span className="font-mono font-bold">{account.accountNo}</span> ({account.accountName})
      </p>

      {isPromptPay && account.promptPayId && (
        <p className="text-xs text-muted">
          PromptPay (นิติบุคคล): <span className="font-mono">{account.promptPayId}</span>
        </p>
      )}

      {amountThb != null && amountThb > 0 && (
        <p className="text-xs text-muted">
          โอนยอด <b>฿{fmtThb(amountThb)}</b> แล้วแนบสลิป (ทีมงานตรวจสอบ)
        </p>
      )}

      {account.issuesTaxInvoice && (
        <p className="text-xs font-medium text-rose-700">
          ออกใบกำกับภาษี · บวก VAT {Math.round(OUTPUT_VAT_RATE * 100)}%
        </p>
      )}
    </div>
  );
}
