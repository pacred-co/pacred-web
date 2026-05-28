/**
 * Zod schemas for the faithful-port `forwarder-import-warehouse.php`
 * warehouse-scan mutation flows (D1 / ADR-0017).
 *
 * Legacy source (the SQL handlers being modelled):
 *   - `pcs-admin/forwarder-import-warehouse.php` L3-37   — `updateIm` POST
 *     handler (re-link a scan to a forwarder)
 *   - `pcs-admin/include/pages/forwarder/deleteForwarderImport.php` — the
 *     jQuery-AJAX DELETE behind L513-543 of `forwarder-import-warehouse.php`
 *   - `pcs-admin/include/pages/forwarder/getListForwarderIm.php` — the
 *     "ค้นหารายการที่ต้องการเชื่อม" modal AJAX endpoint that powers the
 *     `searchForwarderIm()` opener at L545-554 of
 *     `forwarder-import-warehouse.php`. The modal lets warehouse staff
 *     search `tb_forwarder` by `fIDorCO` or `fTrackingCHN` and pick the
 *     parent the orphan scan should attach to.
 *
 * Schema notes:
 *   - `scanId` is `tb_forwarder_import2.id` (bigint, migration 0081 L2121).
 *   - `fid`    is `tb_forwarder.id`         (bigint, migration 0081 L1599).
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// RELINK — forwarder-import-warehouse.php L3-37 updateIm
// ────────────────────────────────────────────────────────────
//
//   SELECT fAmount FROM tb_forwarder WHERE ID = $fID AND fStatus < 5
//   SELECT fiPallet FROM tb_forwarder_import2 WHERE ID = $ID
//   SELECT fID, fi2Amount FROM tb_forwarder_import2 WHERE fID = $fID
//     ↳ if already linked → return error 'eRe' (รายการนี้ถูกเชื่อมไปแล้ว)
//   UPDATE tb_forwarder_import2 SET fID = $fID WHERE ID = $ID
//   UPDATE tb_forwarder SET fStatus = 4, fDateStatus4 = NOW(),
//                           adminIDUpdate = $adminID, fPallet = $fiPallet
//                       WHERE ID = $fID

export const relinkScanSchema = z.object({
  scanId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine(
      (n) => Number.isFinite(n) && Number.isInteger(n) && n > 0,
      { message: "scanId ไม่ถูกต้อง" },
    ),
  fid: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine(
      (n) => Number.isFinite(n) && Number.isInteger(n) && n > 0,
      { message: "เลขที่ออเดอร์ (fID) ไม่ถูกต้อง" },
    ),
});
export type RelinkScanInput = z.input<typeof relinkScanSchema>;

// ────────────────────────────────────────────────────────────
// DELETE — include/pages/forwarder/deleteForwarderImport.php
// ────────────────────────────────────────────────────────────
//
//   SELECT ID FROM tb_forwarder_import2 WHERE ID = $ID
//   DELETE FROM tb_forwarder_import2 WHERE ID = $ID

export const deleteScanSchema = z.object({
  scanId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine(
      (n) => Number.isFinite(n) && Number.isInteger(n) && n > 0,
      { message: "scanId ไม่ถูกต้อง" },
    ),
});
export type DeleteScanInput = z.input<typeof deleteScanSchema>;

// ────────────────────────────────────────────────────────────
// SEARCH — include/pages/forwarder/getListForwarderIm.php
// ────────────────────────────────────────────────────────────
//
// The modal's search-box accepts a free-text query and runs a LIKE-
// match against fIDorCO + fTrackingCHN (forwarder-import-warehouse.php
// L86 of getListForwarderIm.php). The legacy also branches on a `keyType`
// dropdown (all / tracking / id-co / cabinet / close-date / order-no /
// member-code) — the pilot exposes only the default ("all") branch which
// matches the same two columns; the additional key-types lift onto the
// dropdown in a follow-up.

export const searchForwarderSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "กรุณากรอกคำค้นหา")
    .max(80, "คำค้นหายาวเกินไป"),
  limit: z.number().int().positive().max(50).optional().default(20),
});
export type SearchForwarderInput = z.input<typeof searchForwarderSchema>;
