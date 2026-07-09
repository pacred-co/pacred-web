/**
 * lib/payment/emvco-amount.ts — inject a THB amount into an EMVCo QR payload.
 *
 * Owner 2026-07-09 (amount-QR for all 3 lanes): the LOGISTICS/TRADING lanes serve
 * a STATIC K-Shop / Thai-QR merchant image with NO amount (the customer types it).
 * To present a scan-and-the-amount-is-pre-filled QR on every lane, we decode the
 * static QR's EMVCo payload client-side (lib/qr/amount-qr.ts), inject the exact
 * payable here, and re-render a fresh QR — falling back to the static PNG on ANY
 * failure (a mis-inject must NEVER show a wrong amount).
 *
 * PURE + browser-safe (no "server-only") so it's unit-testable with tsx and
 * importable from a "use client" module. The heavy CRC lives in
 * lib/promptpay-payload.ts (reused here so there's ONE CRC implementation).
 *
 * EMVCo TLV rules used (verified against promptpay-qr's own static↔dynamic diff):
 *   - top-level tags = 2-digit id + 2-digit len + value
 *   - tag 00 = "01" (payload format), tag 01 = "11" STATIC / "12" DYNAMIC(amount)
 *   - tag 53 = transaction currency ("764" = THB)
 *   - tag 54 = transaction amount (formatted "0.00"), sits immediately AFTER 53
 *   - tag 63 = CRC16-CCITT over "everything up to and including 6304"
 */

import { crc16ccitt } from "../promptpay-payload";

/** Format a top-level EMVCo TLV element (id + 2-digit length + value). */
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, "0") + value;
}

/**
 * Return a NEW EMVCo payload string identical to `payload` but with `amountThb`
 * encoded as a dynamic transaction amount (tag 54), currency forced to THB
 * (tag 53 = "764"), the point-of-initiation flag set to dynamic (tag 01 = "12"),
 * and the CRC (tag 63) recomputed. Returns `null` on ANY malformed input or a
 * non-positive/non-finite amount — the caller then keeps the static image.
 *
 * The 54 element is inserted immediately after 53 (or, if the source has no 53,
 * a 53="764" is appended and 54 follows it) — byte-for-byte matching what a
 * dynamic PromptPay QR would look like for the same merchant.
 */
export function injectAmountIntoEmvco(payload: string, amountThb: number): string | null {
  if (typeof payload !== "string" || !payload.startsWith("000201")) return null;
  if (!(typeof amountThb === "number" && Number.isFinite(amountThb) && amountThb > 0)) return null;

  // ── Parse the top-level TLV, preserving order. Bail on ANY malformation. ──
  const pairs: Array<[string, string]> = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || len < 0) return null;
    const val = payload.slice(i + 4, i + 4 + len);
    if (val.length !== len) return null; // truncated / declared length overruns
    pairs.push([tag, val]);
    i += 4 + len;
  }
  if (i !== payload.length) return null; // trailing garbage

  // ── Drop the old CRC (63) and any existing amount (54) — we set both fresh. ──
  const out = pairs.filter(([t]) => t !== "63" && t !== "54");

  // ── Point-of-initiation → dynamic (amount present). ──
  const p01 = out.find(([t]) => t === "01");
  if (p01) {
    p01[1] = "12";
  } else {
    const idx00 = out.findIndex(([t]) => t === "00");
    out.splice(idx00 >= 0 ? idx00 + 1 : 0, 0, ["01", "12"]);
  }

  // ── Ensure THB currency (53="764"), then insert the amount (54) right after. ──
  let idx53 = out.findIndex(([t]) => t === "53");
  if (idx53 === -1) {
    out.push(["53", "764"]);
    idx53 = out.length - 1;
  } else {
    out[idx53][1] = "764";
  }
  const amt = (Math.round(amountThb * 100) / 100).toFixed(2);
  out.splice(idx53 + 1, 0, ["54", amt]);

  // ── Rebuild + recompute CRC over body + the tag-63 header "6304". ──
  const body = out.map(([t, v]) => tlv(t, v)).join("") + "6304";
  return body + crc16ccitt(body);
}
