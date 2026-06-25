/**
 * Payment-QR helper — STATIC company QR (2026-06-08, owner directive).
 *
 * ⚠️ The company's own PromptPay (bound to the corporate bank account) is NOT
 * ready at the bank yet, and the interim dynamic PromptPay was generated from
 * an env `PROMPTPAY_ID` that pointed at the WRONG number (ก๊อต's personal id).
 * To remove ALL risk of a customer scanning the wrong destination, this module
 * no longer generates a dynamic amount-encoded PromptPay QR. Instead every
 * payment surface serves ONE static merchant QR — the K-Shop / Thai-QR-Payment
 * card for the corporate account:
 *
 *   บัญชี : 225-2-91144-0 · บจก. แพคเรด (ประเทศไทย) · ธนาคารกสิกรไทย   (see site.ts BANK)
 *
 * The customer scans it, **types the amount themselves**, transfers, and
 * attaches the slip — staff verify the slip in the back-office regardless, so
 * an amount-encoded QR bought us nothing. Cashback may still be applied as a
 * discount; the displayed "amount due" is then the remainder (the QR is the
 * same static image either way).
 *
 * The image is a static public asset; place the K-Shop QR at:
 *   public/images/payment/pacred-qr.png
 * Until that file exists, the helpers return "" and callers degrade to the
 * bank-account text (they already render the account number alongside the QR).
 *
 * server-only: callers are Server Actions / RSC / PDF renderers.
 */

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import { composePromptPayPayload, DEFAULT_PROMPTPAY_ID } from "./promptpay-payload";

/** Public path of the static company payment QR (drop the K-Shop image here). */
export const STATIC_PAYMENT_QR_PATH = "/images/payment/pacred-qr.png";

// ── owner 2026-06-25 (PPAY) — dynamic amount-QR re-enablement, FLAG-GATED ──
// Company PromptPay = the juristic tax ID `0105564077716` (env-overridable).
// DYNAMIC stays OFF by default → every surface keeps serving the static QR (zero
// blast radius). Flip PROMPTPAY_DYNAMIC_ENABLED=true ONLY after ONE real scan
// confirms the QR lands on the right account (the tax-ID's bank registration
// can't be verified in code — lib/promptpay-payload.test.ts proves the payload
// is EMVCo-correct). When ON, buildPromptPayQrDataUrl(amount) returns a real
// amount-encoded PromptPay QR; OFF → the static image as before.
const PROMPTPAY_ID = (process.env.PROMPTPAY_ID ?? DEFAULT_PROMPTPAY_ID).trim();
const DYNAMIC_ENABLED = process.env.PROMPTPAY_DYNAMIC_ENABLED === "true";

export type PromptPayErrorCode = "promptpay_not_configured" | "promptpay_invalid_amount";

/** Retained for back-compat with callers that catch it; no longer thrown. */
export class PromptPayConfigError extends Error {
  readonly code: PromptPayErrorCode;
  constructor(code: PromptPayErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PromptPayConfigError";
    this.code = code;
  }
}

/**
 * Payment is ALWAYS available now — it's a static QR + the corporate bank
 * account (site.ts BANK), not an env-gated dynamic id. (Kept so existing
 * callers that gate UI on it keep showing the pay affordance.)
 */
export function isPromptPayConfigured(): boolean {
  return true;
}

// Cache the data-url so we read the asset off disk only once per server boot.
let cachedQrDataUrl: string | null = null;

async function loadStaticQrDataUrl(): Promise<string> {
  if (cachedQrDataUrl !== null) return cachedQrDataUrl;
  try {
    const buf = await readFile(join(process.cwd(), "public", "images", "payment", "pacred-qr.png"));
    cachedQrDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // Image not placed yet — return the PUBLIC PATH (not "") so: (a) no empty
    // `<img src="">` page-re-download bug (CLAUDE_TECHNICAL.md), (b) the QR
    // appears the instant the owner drops the file (Next serves /public
    // statically — no restart). Until then the path 404s (small placeholder)
    // and the bank-account text beside it carries the payment info.
    cachedQrDataUrl = STATIC_PAYMENT_QR_PATH;
  }
  return cachedQrDataUrl;
}

/**
 * Returns a `data:image/png;base64,…` URL of the STATIC company QR, safe to drop
 * into an <img src> (web) or an @react-pdf <Image src> (PDF). The `amountThb`
 * argument is accepted for call-site back-compat but IGNORED — the QR is static
 * and the customer types the amount. Returns "" if the asset isn't placed yet.
 */
export async function buildPromptPayQrDataUrl(amountThb?: number): Promise<string> {
  // FLAG OFF (default) → static image · zero risk.
  if (!DYNAMIC_ENABLED) return loadStaticQrDataUrl();
  // FLAG ON → real amount-encoded PromptPay QR for the company tax-ID.
  const payload = composePromptPayPayload(PROMPTPAY_ID, amountThb);
  if (!payload) return loadStaticQrDataUrl(); // missing id → degrade to static
  try {
    return await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 512 });
  } catch (err) {
    console.error("[promptpay] dynamic QR render failed → static fallback", { err: String(err) });
    return loadStaticQrDataUrl();
  }
}

/**
 * Legacy payload builder — retained as a no-op stub for any stray caller. The
 * static QR has no EMVCo payload string; returns "" (callers render the image
 * via buildPromptPayQrDataUrl, not the raw payload).
 */
export function buildPromptPayPayload(amountThb?: number): string {
  if (!DYNAMIC_ENABLED) return ""; // static mode has no EMVCo payload
  return composePromptPayPayload(PROMPTPAY_ID, amountThb);
}
