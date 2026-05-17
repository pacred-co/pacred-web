/**
 * Thai 13-digit tax-id / national-id validation (audit C-4).
 *
 * A Thai juristic tax ID and a Thai citizen ID are both 13 digits and share
 * the same mod-11 check-digit scheme: the 13th digit is a checksum over the
 * first 12. A bare `/^\d{13}$/` regex (used across the validators before this
 * helper) only catches a wrong *length* — it still admits `0000000000000` or
 * any typo'd 13-digit string. C-4 (`requestTaxInvoice` snapshots a customer-
 * typed `buyer_tax_id` into the immutable RD Code-86 row) wants a *malformed*
 * id rejected, so this adds the checksum on top of the format check.
 *
 * NOT a substitute for verifying the id belongs to the customer's own
 * `corporate.tax_id` — that ownership check is ภูม-domain (ADR-0006) and
 * intentionally left for the admin issue screen. This is the format gate.
 *
 * Pure (no IO) — safe to import anywhere, unit-tested in `thai-tax-id.test.ts`.
 */

import { z } from "zod";

/** 13 digits, nothing else. The shape gate — checksum is a separate step. */
export const THAI_TAX_ID_RE = /^\d{13}$/;

/**
 * Validates a Thai 13-digit tax id / national id: 13 digits AND a correct
 * mod-11 check digit.
 *
 * Algorithm (Revenue Department / DOPA standard):
 *   - digits d0..d12
 *   - sum = Σ d[i] × (13 − i)   for i = 0..11
 *   - expected check digit = (11 − (sum mod 11)) mod 10
 *   - valid ⇔ expected === d12
 *
 * @returns true only when `value` is exactly 13 digits with a valid checksum.
 */
export function isValidThaiTaxId(value: string): boolean {
  if (!THAI_TAX_ID_RE.test(value)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(value[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === Number(value[12]);
}

/**
 * Reusable Zod schema for a required Thai tax id — format + checksum, with a
 * Thai-language error message. Use `.optional()` / `.nullable()` at the call
 * site when the field is not mandatory.
 *
 *   buyer_tax_id: thaiTaxIdSchema,
 *   tax_id:       thaiTaxIdSchema.optional().nullable(),
 */
export const thaiTaxIdSchema = z
  .string()
  .trim()
  .regex(THAI_TAX_ID_RE, "เลขประจำตัวผู้เสียภาษี ต้อง 13 หลัก (ตัวเลขเท่านั้น)")
  .refine(isValidThaiTaxId, "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ตรวจสอบเลขหลักสุดท้าย)");
