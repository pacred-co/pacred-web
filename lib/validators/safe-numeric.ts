/**
 * V-E5 — Safe-numeric Zod helpers (range-guard + int32-overflow rejection).
 *
 * Per PORT_PLAN V-E5: "legacy invoice sheets carry int32-overflow garbage
 * (`-2146826xxx`)". The legacy Excel sheets occasionally produce values
 * like `-2,146,826,265` (close to INT32_MIN = -2,147,483,648) when a
 * formula chains overflow — the resulting row gets typed back into our
 * system as a giant negative number that silently corrupts ledgers.
 *
 * This module exports composable Zod schemas every numeric INSERT/UPDATE
 * action should funnel through, instead of `z.number().min(0).max(X)` per
 * site. Each schema:
 *   - rejects any value ≤ INT32_OVERFLOW_THRESHOLD (= -1_000_000) with
 *     explicit error "int32_overflow_suspected — กรุณาตรวจค่าตัวเลขที่กรอก"
 *   - applies a sane upper bound per amount kind (THB, USD, qty, rate, …)
 *   - emits a Thai error string when out of range so the UI can surface it
 *
 * Use these schemas as drop-in replacements:
 *
 *   import { safeThbAmount, safeUsdAmount, safeQty, safeRate, safeDutyPct,
 *            safeHsCode, safeInt32Money } from "@/lib/validators/safe-numeric";
 *
 *   // Old:  z.number().min(0).max(999_999_999.99)
 *   // New:  safeThbAmount
 *
 * The pattern composes — when you need a different upper bound, build on
 * top with `.refine` rather than re-rolling the int32 guard.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Constants — sane upper bounds (per V-E5 spec)
// ────────────────────────────────────────────────────────────

/** Maximum THB amount accepted by any input: ~฿1 billion (numeric(14,2)). */
export const MAX_THB_AMOUNT = 999_999_999.99;

/** Maximum USD amount: ~$100M (numeric(14,2)). */
export const MAX_USD_AMOUNT = 99_999_999.99;

/** Maximum integer quantity/count: 10M (cartons, items, packs). */
export const MAX_QTY = 9_999_999;

/** Maximum exchange rate (THB per USD). Reasonable bound around ~33 current. */
export const MAX_EXCHANGE_RATE = 100;
/** Minimum exchange rate — sanity-floor; rates below this are obviously wrong. */
export const MIN_EXCHANGE_RATE = 10;

/** Maximum duty percentage. */
export const MAX_DUTY_PCT = 100;

/** Maximum WHT rate percentage. */
export const MAX_WHT_PCT = 50;

/** Maximum VAT rate percentage (Thai VAT cap ceiling for safety). */
export const MAX_VAT_PCT = 30;

/**
 * The "int32-overflow suspect" threshold — any number ≤ this is rejected
 * outright with the int32_overflow_suspected error. Negative numbers from
 * a real form input are extremely rare in the Pacred numeric input set
 * (all amounts/qtys/rates are non-negative), and the legacy garbage values
 * are all around -2.14 billion → setting the threshold at -1M catches any
 * int32 overflow with comfortable headroom.
 */
export const INT32_OVERFLOW_THRESHOLD = -1_000_000;

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * The int32-overflow guard. Applied as the FIRST refine on every safe-*
 * schema. Returns false (= reject) when n looks like int32 garbage.
 */
function notInt32Overflow(n: number): boolean {
  return n > INT32_OVERFLOW_THRESHOLD;
}

const INT32_OVERFLOW_MSG = "int32_overflow_suspected — กรุณาตรวจค่าตัวเลขที่กรอก";

/**
 * Compose a "safe numeric in range" Zod schema. Same shape across kinds.
 *
 * @param min            inclusive lower bound (≥0 for amounts)
 * @param max            inclusive upper bound
 * @param fieldNameTH    Thai field name used in the range error
 */
function safeBoundedNumber(min: number, max: number, fieldNameTH: string): z.ZodNumber {
  return z
    .number({ message: `${fieldNameTH} ต้องเป็นตัวเลข` })
    .refine(notInt32Overflow, { message: INT32_OVERFLOW_MSG })
    .refine((n) => n >= min, {
      message: `${fieldNameTH} อยู่นอกช่วงที่อนุญาต (${min.toLocaleString()} - ${max.toLocaleString()})`,
    })
    .refine((n) => n <= max, {
      message: `${fieldNameTH} อยู่นอกช่วงที่อนุญาต (${min.toLocaleString()} - ${max.toLocaleString()})`,
    }) as unknown as z.ZodNumber;
}

// ────────────────────────────────────────────────────────────
// Public schemas — drop-in replacements
// ────────────────────────────────────────────────────────────

/** Non-negative THB amount (≤ ~฿1B). int32-overflow rejected. */
export const safeThbAmount = safeBoundedNumber(0, MAX_THB_AMOUNT, "จำนวนเงิน (THB)");

/** Non-negative USD amount (≤ ~$100M). int32-overflow rejected. */
export const safeUsdAmount = safeBoundedNumber(0, MAX_USD_AMOUNT, "จำนวนเงิน (USD)");

/** Non-negative integer quantity/count (≤ 10M). int32-overflow rejected. */
export const safeQty = safeBoundedNumber(0, MAX_QTY, "จำนวน")
  .refine((n) => Number.isInteger(n), { message: "จำนวน ต้องเป็นจำนวนเต็ม" });

/** Non-negative decimal qty (≤ 10M) — for weights, CBM, fractional units. */
export const safeDecimalQty = safeBoundedNumber(0, MAX_QTY, "จำนวน");

/**
 * USD→THB exchange rate. Bounded [10, 100] THB/USD (currency reality check;
 * historic observed range 28-37; sanity floor 10 protects against missing-
 * decimal typos like 3.3 instead of 33; ceiling 100 protects against
 * catastrophic 10x or 100x typos).
 */
export const safeExchangeRate = safeBoundedNumber(
  MIN_EXCHANGE_RATE, MAX_EXCHANGE_RATE, "อัตราแลกเปลี่ยน",
);

/** Duty rate percentage [0, 100]. */
export const safeDutyPct = safeBoundedNumber(0, MAX_DUTY_PCT, "อัตราอากร (%)");

/** VAT rate percentage [0, 30] — Thai VAT is 7%, ceiling 30% protects from typos. */
export const safeVatPct = safeBoundedNumber(0, MAX_VAT_PCT, "อัตรา VAT (%)");

/** WHT rate percentage [0, 50] — Thai max WHT is 15%, ceiling 50% covers edge cases. */
export const safeWhtPct = safeBoundedNumber(0, MAX_WHT_PCT, "อัตราหัก ณ ที่จ่าย (%)");

/**
 * HS code (8-10 digits — Thai HS uses 8 or 11; we allow 8-10 as common in
 * Pacred's legacy data) + free-text "letters allowed" for legacy codes.
 * Trim + length-check; the FK to `hs_codes` is the authoritative match.
 */
export const safeHsCode = z
  .string()
  .trim()
  .min(4,  "HS code สั้นเกินไป (≥4 ตัว)")
  .max(20, "HS code ยาวเกินไป (≤20 ตัว)");

/**
 * Generic positive integer money (for legacy int32 satang stores — rare
 * in Pacred but used in a couple of admin-only counters). Rejects int32
 * overflow + clamps to ≤ 999M as a tighter integer cap.
 */
export const safeInt32Money = safeBoundedNumber(0, 999_999_999, "จำนวนเงิน")
  .refine((n) => Number.isInteger(n), { message: "จำนวนเงิน ต้องเป็นจำนวนเต็ม" });

// ────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────

/**
 * Pure helper to detect int32-overflow suspect values outside Zod (e.g.
 * when scanning a legacy import batch). Returns true when the value should
 * be rejected.
 */
export function isInt32OverflowSuspect(n: number): boolean {
  return Number.isFinite(n) && n <= INT32_OVERFLOW_THRESHOLD;
}

/**
 * Pure range-fail string used by action layers that bypass Zod for a
 * one-off check.
 */
export function rangeFailMessage(
  fieldNameTH: string,
  value: number,
  min: number,
  max: number,
): string {
  return `ตัวเลข ${fieldNameTH}=${value} อยู่นอกช่วงที่อนุญาต (${min.toLocaleString()} - ${max.toLocaleString()})`;
}
