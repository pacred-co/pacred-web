/**
 * Packing-list format dispatcher (pure · no network).
 *
 * The warehouse packing reconcile (actions/admin/momo-packing-reconcile.ts) accepts an
 * .xlsx upload; two warehouses send DIFFERENT shapes:
 *  - อี้อู / Yiwu — a WPS/Excel workbook WITH sharedStrings, sheet `收货`, Chinese headers.
 *  - แต้ม / MOMO — an export using INLINE strings (SheetJS chokes → needs manual unzip).
 *
 * Both parsers emit the SAME `MomoPackingParse`, so the reconcile stays unchanged — this
 * dispatcher just picks the right one by DETECTING the format (Yiwu first, since the Yiwu
 * detector reads cleanly via SheetJS and a MOMO file simply lacks the 收货 sheet / headers).
 */

import { parseMomoPackingXlsx, type MomoPackingParse } from "@/lib/admin/momo-packing-xlsx-parser";
import { isYiwuPackingWorkbook, parseYiwuPackingXlsx } from "@/lib/admin/yiwu-packing-xlsx-parser";

export type PackingFormat = "yiwu" | "momo";

/** Detect the warehouse format from the raw .xlsx bytes. */
export function detectPackingFormat(buf: Uint8Array | Buffer): PackingFormat {
  return isYiwuPackingWorkbook(buf) ? "yiwu" : "momo";
}

/** Parse a packing .xlsx from EITHER warehouse into the shared MomoPackingParse shape. */
export function parsePackingXlsx(buf: Uint8Array | Buffer): MomoPackingParse {
  return detectPackingFormat(buf) === "yiwu"
    ? parseYiwuPackingXlsx(buf)
    : parseMomoPackingXlsx(buf);
}
