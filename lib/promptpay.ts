/**
 * PromptPay QR helpers.
 *
 * - Generate an EMVCo PromptPay payload (the QR string banking apps scan).
 * - Encode it as a PNG data URL using `qrcode`.
 *
 * Used by /wallet/deposit (amount-specific QR for top-up) and could be
 * reused for any THB collection flow (e.g. import_top_up in Phase D).
 *
 * The target PromptPay ID is configured via env (PROMPTPAY_ID); when
 * absent we throw — this fails loud rather than rendering a QR pointing
 * at the wrong account.
 */

import "server-only";
import promptpay from "promptpay-qr";
import QRCode from "qrcode";

/** Returns the EMVCo payload string (not a QR image yet). */
export function buildPromptPayPayload(amountThb: number): string {
  const target = process.env.PROMPTPAY_ID;
  if (!target) {
    throw new Error(
      "PROMPTPAY_ID is not configured — set it in .env.local (phone or tax ID)",
    );
  }
  if (!Number.isFinite(amountThb) || amountThb <= 0) {
    throw new Error(`PromptPay amount must be > 0, got ${amountThb}`);
  }
  return promptpay(target, { amount: amountThb });
}

/** Returns a `data:image/png;base64,...` URL safe to drop into <img src>. */
export async function buildPromptPayQrDataUrl(amountThb: number): Promise<string> {
  const payload = buildPromptPayPayload(amountThb);
  return QRCode.toDataURL(payload, { margin: 1, scale: 6 });
}
