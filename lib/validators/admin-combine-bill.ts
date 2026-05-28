/**
 * Zod schemas for the faithful-port `forwarder-bill.php` combine-bill
 * mutation flows (D1 / ADR-0017).
 *
 * Legacy source (the SQL handlers being modelled):
 *   - `pcs-admin/forwarder-bill.php` L6-45   — `?page=add` POST handler
 *   - `pcs-admin/include/pages/forwarder-bill/deleteForwarder.php` — the
 *     jQuery-AJAX DELETE behind L319-351 of `forwarder-bill.php`
 *
 * Schema notes:
 *   - `forwarderIds` arrives from the legacy `<input name="ID">` as a
 *     comma-separated string (forwarder-bill.php L8 — `explode(",", …)`).
 *     The schema accepts EITHER the raw string OR a parsed number[] so
 *     the same validator covers a future JS multi-select page and the
 *     existing string-form pilot.
 *   - billid is a bigint in Postgres (migration 0081 L817) — we accept
 *     it as a positive integer; JS numbers stay safe well below the bigint
 *     ceiling at any plausible Pacred volume.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// CREATE — forwarder-bill.php L6-45 "?page=add" handler
// ────────────────────────────────────────────────────────────
//
//   $arrID = explode(",", $_POST['ID']);
//   INSERT INTO tb_bill (date, printStatus, adminID) VALUES (NOW(), '', '$adminID')
//   INSERT INTO tb_bill_item (billID, fID) VALUES … (one row per fID)

/**
 * Parse the legacy `<input name="ID">` payload into a clean number[].
 * Accepts "1,5,6" / "1, 5, 6" / "1" / "" — rejects non-numeric tokens.
 * Returns [] on empty input so the caller can decide whether that's OK.
 */
export function parseForwarderIdsCsv(raw: string): number[] {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => {
      const n = Number(t);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        throw new Error(`เลขที่ออเดอร์ไม่ถูกต้อง: "${t}"`);
      }
      return n;
    });
}

export const createCombineBillSchema = z.object({
  /** The forwarder IDs (`tb_forwarder.id`) to combine into one bill.
   *  Form callers pass the raw comma-separated string; programmatic
   *  callers pass a clean number[]. */
  forwarderIds: z
    .union([
      z.string(),
      z.array(z.number().int().positive()),
    ])
    .transform((v, ctx) => {
      try {
        const arr = Array.isArray(v) ? v : parseForwarderIdsCsv(v);
        if (arr.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "กรุณากรอกเลขที่ออเดอร์อย่างน้อย 1 รายการ",
          });
          return z.NEVER;
        }
        // Dedupe — legacy doesn't but a double-pasted ID would FK-fail
        // mid-bulk-insert without a clean error message.
        return Array.from(new Set(arr));
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: e instanceof Error ? e.message : "ID ไม่ถูกต้อง",
        });
        return z.NEVER;
      }
    }),
});
export type CreateCombineBillInput = z.input<typeof createCombineBillSchema>;
export type CreateCombineBillParsed = z.output<typeof createCombineBillSchema>;

// ────────────────────────────────────────────────────────────
// DELETE — include/pages/forwarder-bill/deleteForwarder.php
// ────────────────────────────────────────────────────────────
//
//   SELECT billID FROM tb_bill WHERE billID = ?
//   DELETE FROM tb_bill_item WHERE billID = ?
//   DELETE FROM tb_bill      WHERE billID = ?

export const deleteCombineBillSchema = z.object({
  billId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine(
      (n) => Number.isFinite(n) && Number.isInteger(n) && n > 0,
      { message: "billId ไม่ถูกต้อง" },
    ),
});
export type DeleteCombineBillInput = z.input<typeof deleteCombineBillSchema>;
