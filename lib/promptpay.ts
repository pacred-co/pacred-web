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
import { PACRED_BANK_ACCOUNTS } from "./payment/bank-accounts";

/** Public path of the static company payment QR (drop the K-Shop image here). */
export const STATIC_PAYMENT_QR_PATH = "/images/payment/pacred-qr.png";

// ── owner 2026-07-21 ("crop ภาพ qrcode ให้ด้วย") ──────────────────────────────
// The asset above is the FULL K-Shop poster: portrait, green background, header,
// card-scheme logos and the มาเนกิเนโกะ mascot — the scannable code is only the
// middle ~40% of it. On screen that's fine (it reads as the branded card), but on
// a printed document, where the QR gets a small fixed box, squeezing a portrait
// poster into it both distorts the image and shrinks the code far below the size
// a phone can read.
//
// So a QR-ONLY crop of the SAME poster lives beside it. It was cut from the
// original with the quiet zone kept intact (~5 modules of white) and verified by
// decoding both files: they yield a byte-identical EMVCo payload, i.e. the crop
// removed branding only — it never touched the code, and it CANNOT change where
// the money lands.
export const STATIC_PAYMENT_QR_CROP_PATH = "/images/payment/pacred-qr-crop.png";

type QrVariant = "poster" | "crop";

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

// Cache the data-urls so we read each asset off disk only once per server boot.
const cachedQrDataUrl: Partial<Record<QrVariant, string>> = {};

async function loadStaticQrDataUrl(variant: QrVariant = "poster"): Promise<string> {
  const hit = cachedQrDataUrl[variant];
  if (hit !== undefined) return hit;
  const file = variant === "crop" ? "pacred-qr-crop.png" : "pacred-qr.png";
  const publicPath = variant === "crop" ? STATIC_PAYMENT_QR_CROP_PATH : STATIC_PAYMENT_QR_PATH;
  try {
    const buf = await readFile(join(process.cwd(), "public", "images", "payment", file));
    cachedQrDataUrl[variant] = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // Image not placed yet — return the PUBLIC PATH (not "") so: (a) no empty
    // `<img src="">` page-re-download bug (CLAUDE_TECHNICAL.md), (b) the QR
    // appears the instant the owner drops the file (Next serves /public
    // statically — no restart). Until then the path 404s (small placeholder)
    // and the bank-account text beside it carries the payment info.
    cachedQrDataUrl[variant] = publicPath;
  }
  return cachedQrDataUrl[variant]!;
}

/**
 * Shared body of the two public builders. The DYNAMIC branch is variant-agnostic
 * — a generated QR is already tight (margin: 1), so only the STATIC fallbacks
 * differ (branded poster vs QR-only crop). Same account, same payload, either way.
 */
async function buildQrDataUrl(amountThb: number | undefined, variant: QrVariant): Promise<string> {
  // FLAG OFF (default) → static image · zero risk.
  if (!DYNAMIC_ENABLED) return loadStaticQrDataUrl(variant);
  // FLAG ON → real amount-encoded PromptPay QR for the company tax-ID.
  const payload = composePromptPayPayload(PROMPTPAY_ID, amountThb);
  if (!payload) return loadStaticQrDataUrl(variant); // missing id → degrade to static
  try {
    return await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 512 });
  } catch (err) {
    console.error("[promptpay] dynamic QR render failed → static fallback", { err: String(err) });
    return loadStaticQrDataUrl(variant);
  }
}

/**
 * Returns a `data:image/png;base64,…` URL of the STATIC company QR, safe to drop
 * into an <img src> (web) or an @react-pdf <Image src> (PDF). The `amountThb`
 * argument is accepted for call-site back-compat but IGNORED — the QR is static
 * and the customer types the amount. Returns "" if the asset isn't placed yet.
 */
export async function buildPromptPayQrDataUrl(amountThb?: number): Promise<string> {
  return buildQrDataUrl(amountThb, "poster");
}

/**
 * Same QR, same destination account — but the QR-ONLY crop instead of the full
 * K-Shop poster. Use this wherever the code has to sit in a small fixed box and
 * stay scannable: printed documents, PDFs, compact panels.
 *
 * 💰 Identical money routing to `buildPromptPayQrDataUrl` — the two differ only
 * in how much branding surrounds the code (proven: both files decode to the same
 * payload). Do NOT reach for `buildServicePromptPayQrDataUrl` as a "smaller QR"
 * substitute: that one points at a DIFFERENT account (SERVICE 204-1-55856-6).
 */
export async function buildCompactPaymentQrDataUrl(amountThb?: number): Promise<string> {
  return buildQrDataUrl(amountThb, "crop");
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

// ── owner 2026-07-02 (3-account SOT wiring) — the SERVICE lane ALWAYS gets a
// generated amount-QR ────────────────────────────────────────────────────────
// The owner's rule (money-critical): when the customer chooses ไม่รับเอกสาร the
// pay screen MUST **generate a PromptPay amount-QR for the exact total, paid into
// the SERVICE นิติ account** (204-1-55856-6 · PromptPay 0105564077716) — NOT a
// static K-Shop image. That is unconditional: the DYNAMIC_ENABLED env gate above
// applies only to the LEGACY generic helper (`buildPromptPayQrDataUrl`, which was
// briefly wrong-account-static). This helper is the CORRECT source for the SERVICE
// destination and reads the account's PromptPay id straight from the 3-account SOT
// (lib/payment/bank-accounts.ts), so it can never drift to another number.
//
// The generated payload is proven EMVCo-correct by lib/promptpay-payload.test.ts;
// it encodes the exact THB amount so the customer scans → the total is pre-filled →
// transfers → attaches slip (staff still verify the slip). No env flag can turn
// this into a static image.
const SERVICE_PROMPTPAY_ID = (PACRED_BANK_ACCOUNTS.service.promptPayId ?? DEFAULT_PROMPTPAY_ID).trim();

export async function buildServicePromptPayQrDataUrl(amountThb: number): Promise<string> {
  const payload = composePromptPayPayload(SERVICE_PROMPTPAY_ID, amountThb);
  if (!payload) return ""; // no id (should never happen — SOT is const) → caller degrades
  try {
    return await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 512 });
  } catch (err) {
    console.error("[promptpay] SERVICE amount-QR render failed", { err: String(err) });
    return "";
  }
}
