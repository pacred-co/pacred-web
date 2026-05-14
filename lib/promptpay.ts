/**
 * PromptPay QR helpers.
 *
 * - Generate an EMVCo PromptPay payload (the QR string banking apps scan).
 * - Encode it as a PNG data URL using `qrcode`.
 *
 * Used by /wallet/deposit (amount-specific QR for top-up) and could be
 * reused for any THB collection flow (e.g. import_top_up in Phase D).
 *
 * The target PromptPay ID is configured via env (PROMPTPAY_ID). When
 * absent we throw a `PromptPayConfigError` with a stable error code so
 * callers can degrade to a friendly notice instead of leaking the raw
 * server message to customers (per OWASP audit A05 P1, 2026-05-16).
 */

import "server-only";
import promptpay from "promptpay-qr";
import QRCode from "qrcode";

/**
 * Stable error codes for the PromptPay helpers. Server actions catch and
 * forward these as `ActionResult.error`; the UI maps them to localised
 * messages via i18n keys.
 */
export type PromptPayErrorCode = "promptpay_not_configured" | "promptpay_invalid_amount";

export class PromptPayConfigError extends Error {
  readonly code: PromptPayErrorCode;
  constructor(code: PromptPayErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PromptPayConfigError";
    this.code = code;
  }
}

/** Cheap proactive check — server actions can gate UI affordances without invoking the throw path. */
export function isPromptPayConfigured(): boolean {
  return Boolean(process.env.PROMPTPAY_ID);
}

/** Returns the EMVCo payload string (not a QR image yet). */
export function buildPromptPayPayload(amountThb: number): string {
  const target = process.env.PROMPTPAY_ID;
  if (!target) {
    throw new PromptPayConfigError("promptpay_not_configured");
  }
  if (!Number.isFinite(amountThb) || amountThb <= 0) {
    throw new PromptPayConfigError("promptpay_invalid_amount", `amount must be > 0, got ${amountThb}`);
  }
  return promptpay(target, { amount: amountThb });
}

/** Returns a `data:image/png;base64,...` URL safe to drop into <img src>. */
export async function buildPromptPayQrDataUrl(amountThb: number): Promise<string> {
  const payload = buildPromptPayPayload(amountThb);
  return QRCode.toDataURL(payload, { margin: 1, scale: 6 });
}
