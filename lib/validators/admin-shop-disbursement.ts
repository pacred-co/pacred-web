/**
 * Zod schemas for the faithful-port admin-PUSH "เบิกจ่ายค่าสินค้า"
 * (shop-affiliate disbursement) create flow — re-sweep A2 #23, D1 /
 * ADR-0017.
 *
 * Legacy source: `pcs-admin/report-shops-profit-pay.php` L4-62 — the
 * `$_POST['save']` create handler. The legacy form carries:
 *   - ID            comma-separated tb_header_order.ID list (then
 *                   trailing-comma-trimmed + exploded), but resolved to
 *                   hNo[] in getListShop.php; we standardize on the
 *                   tb_header_order.ID numeric list as the canonical
 *                   identifier and re-resolve to hNo server-side.
 *   - amount        the SUM(priceUser) batch amount (numeric). The
 *                   server RECOMPUTES this from the order list (never
 *                   trusts the client number) — the field is accepted
 *                   for parity but ignored for the actual INSERT.
 *   - title         free-text batch title (e.g. "บิลวันที่ 2-3 ธันวา 64")
 *   - accListOption the chosen tb_account_pcs.ID (resolves the receiving
 *                   bank name/account); optional — when absent the bank
 *                   fields are blank (legacy only fills them when the
 *                   select is present).
 *
 * `tb_header_order.ID` is a bigint in Postgres (migration 0081); we
 * accept positive integers. Title is varchar(300) NOT NULL.
 */

import { z } from "zod";

/** Create-batch input. `orderIds` = the selected tb_header_order.ID
 *  numeric primary keys (the checkbox column carried `IDshop` =
 *  ho.ID — report-shops-profit-pay.php L237 / getListShop.php
 *  `WHERE ID IN (...)`). */
export const createShopDisbursementSchema = z.object({
  /** Selected tb_header_order.ID values (the table checkbox column). */
  orderIds: z
    .array(z.number().int().positive())
    .min(1, "กรุณาเลือกอย่างน้อย 1 รายการ"),
  /** Batch title — varchar(300) NOT NULL (legacy `title`). */
  title: z
    .string()
    .trim()
    .min(1, "กรุณากรอกชื่อเรื่องที่เบิกเงิน")
    .max(300, "ชื่อเรื่องยาวเกินไป (สูงสุด 300 ตัวอักษร)"),
  /** Chosen receiving-bank account id (tb_account_pcs.ID). Optional —
   *  when omitted the bank name/account columns are written blank,
   *  matching the legacy behaviour when no `accListOption` is posted. */
  accountId: z.number().int().positive().optional(),
});

export type CreateShopDisbursementInput = z.infer<typeof createShopDisbursementSchema>;

/** B2 (2026-06-22) — pay-out completion: flip a tb_shop_pay_h batch
 *  status '1' (รอดำเนินการ) → '2' (จ่ายแล้ว) with a transfer-slip. Mirrors the
 *  proven `payoutPaidSchema` on sales-payouts. The slip File is passed
 *  separately (FormData), not in this schema. */
export const markShopDisbursementPaidSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type MarkShopDisbursementPaidInput = z.infer<typeof markShopDisbursementPaidSchema>;

/** A YYYY-MM-DD - YYYY-MM-DD range string OR explicit start/end. The
 *  eligibility + history queries filter on the SETTLED WALLET date
 *  (tb_wallet_hs.date) — see shop-disbursement-calc.ts. */
export const dateRangeSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").optional(),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").optional(),
  })
  .optional();

export type DateRangeInput = z.infer<typeof dateRangeSchema>;
