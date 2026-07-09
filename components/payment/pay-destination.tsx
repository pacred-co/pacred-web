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
 *             image at /images/payment/qr-{logistics,trading}.jpg. When a positive
 *             amount is known we decode that static QR client-side and re-render an
 *             AMOUNT-encoded QR (lib/qr/amount-qr.ts → lib/payment/emvco-amount.ts)
 *             so all 3 lanes present a scan-and-amount-pre-filled QR. On ANY decode/
 *             inject failure we degrade to the original static image (never a wrong
 *             amount); the account-number block (always shown) carries the destination.
 */

import { useEffect, useState } from "react";
import { OUTPUT_VAT_RATE, type PacredBankAccount } from "@/lib/payment/bank-accounts";
import { buildAmountQrFromStaticImage } from "@/lib/qr/amount-qr";

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
  // LOGISTICS / TRADING serve a static K-Shop image that may not be on disk yet.
  const [qrImgOk, setQrImgOk] = useState(true);
  // …and, when an amount is known, an amount-encoded QR decoded+rebuilt from it.
  const [genQr, setGenQr] = useState<string | null>(null);

  const isPromptPay = account.channel === "promptpay";
  const hasAmount = amountThb != null && amountThb > 0;

  // For the QR-image lanes with a positive amount: decode the static merchant QR
  // and re-render one that encodes the exact payable. Failure → null → static PNG.
  useEffect(() => {
    if (isPromptPay || !account.qrImagePath || !hasAmount) {
      setGenQr(null);
      return;
    }
    let alive = true;
    setGenQr(null);
    buildAmountQrFromStaticImage(account.qrImagePath, amountThb!).then((url) => {
      if (alive) setGenQr(url);
    });
    return () => {
      alive = false;
    };
  }, [isPromptPay, account.qrImagePath, hasAmount, amountThb]);

  const isGeneratedAmountQr = !isPromptPay && genQr != null;
  const qrToShow = isPromptPay
    ? (serviceQrDataUrl ?? null)
    : (genQr ?? (qrImgOk && account.qrImagePath ? account.qrImagePath : null));

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 p-4 text-left space-y-2 ${className ?? ""}`}
    >
      <p className="text-sm font-bold text-foreground">สแกน QR หรือโอนเข้าบัญชีบริษัท</p>

      {qrToShow && (
        <div className="flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrToShow}
            alt="QR ชำระเงิน บริษัท แพคเรด"
            className="w-36 h-36 rounded-lg border border-amber-300 bg-white object-contain"
            onError={() => setQrImgOk(false)}
          />
          {isGeneratedAmountQr && hasAmount && (
            <p className="text-xs font-medium text-emerald-700 text-center">
              สแกนจ่ายยอด ฿{fmtThb(amountThb!)} (ใส่ยอดอัตโนมัติ)
            </p>
          )}
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
