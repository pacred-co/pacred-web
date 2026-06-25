/**
 * Pure PromptPay EMVCo payload helpers — NO "server-only" so they're unit-testable.
 *
 * owner 2026-06-25 (PPAY): re-enable the dynamic amount-encoded PromptPay QR with
 * the company's PromptPay = the juristic tax ID `0105564077716` (13-digit). This
 * module ONLY composes + verifies the EMVCo payload string (promptpay-qr does the
 * heavy lifting + CRC). lib/promptpay.ts wraps it behind the
 * PROMPTPAY_DYNAMIC_ENABLED flag (default OFF → static QR · zero blast radius) so
 * the live swap only happens after the owner confirms ONE real scan hits the
 * right account (the bank-registration of the tax ID can't be checked in code).
 *
 * The decode helpers (parseEmvcoTlv / crc16 / verifyPromptPayPayload) prove the
 * generated payload is structurally correct WITHOUT needing a phone scan
 * (lib/promptpay-payload.test.ts).
 */

import generatePayload from "promptpay-qr";

/** Pacred (Thailand) Co., Ltd. juristic registration / tax ID — 13-digit PromptPay. */
export const DEFAULT_PROMPTPAY_ID = "0105564077716";

/**
 * Build the EMVCo PromptPay payload string for `id` (phone / 13-digit national-or-tax
 * ID / e-wallet — promptpay-qr auto-detects) + an optional THB amount. Empty `id`
 * → "". Amount ≤ 0 / non-finite → omitted (a static, amount-less QR).
 */
export function composePromptPayPayload(id: string, amountThb?: number): string {
  const target = (id ?? "").trim();
  if (target === "") return "";
  const amount =
    typeof amountThb === "number" && Number.isFinite(amountThb) && amountThb > 0
      ? Math.round(amountThb * 100) / 100
      : undefined;
  return generatePayload(target, amount != null ? { amount } : {});
}

/** Parse the TOP-LEVEL EMVCo TLV tags of a payload into { tag: value }. */
export function parseEmvcoTlv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || len < 0) break;
    out[tag] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/** CRC16-CCITT (init 0xFFFF · poly 0x1021) — the EMVCo tag-63 check value. */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let c = 0; c < input.length; c++) {
    crc ^= input.charCodeAt(c) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** True when the payload's trailing tag-63 CRC matches a re-computed CRC16 over the body. */
export function verifyPromptPayPayload(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4); // all but the 4-hex CRC value
  if (!body.endsWith("6304")) return false; // tag 63 (CRC) id+len header
  return crc16ccitt(body) === payload.slice(-4).toUpperCase();
}
