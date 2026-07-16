import { z } from "zod";

/**
 * Yiwu (อี้อู) delivery-note (ใบส่งของ) → create box-split forwarder rows.
 *
 * The Yiwu warehouse sends a delivery-note IMAGE when goods arrive at the China
 * warehouse. Staff OCR-read it (staff corrects) into a grid, then commit → this
 * schema. Each shipment = one 单号 (Bill No) + one customer (PR read straight off
 * the note's "Customer ID" column) + N rows (box-groups) that have DIFFERENT dims →
 * so they must become N box-split tb_forwarder rows (<单号>-i/N), each priced by its
 * own max(weight, volumetric) — the owner's rule. Money-safe: no price/status write
 * happens client-side; the create action re-validates + prices server-side.
 */

// One box-group row off the ใบส่งของ (Pack + WEIGHT + L/W/H + CBM).
export const yiwuDeliveryRowSchema = z.object({
  boxCount: z.coerce.number().int().min(1).max(9999),   // Pack (件数) — boxes in this group
  weightKg: z.coerce.number().min(0).max(1_000_000),    // WEIGHT (总重量) — this row's total kg
  lengthCm: z.coerce.number().min(0).max(2000),         // LENGTH (长)
  widthCm: z.coerce.number().min(0).max(2000),          // WIDTH (宽)
  heightCm: z.coerce.number().min(0).max(2000),         // HEIGHT (高)
  cbm: z.coerce.number().min(0).max(10_000),            // CBM (材积) — this row's total cbm
  productType: z.string().max(200).optional(),          // Description / 品名 (display only)
});
export type YiwuDeliveryRow = z.infer<typeof yiwuDeliveryRowSchema>;

export const yiwuDeliveryNoteSchema = z.object({
  orderNo: z.string().trim().min(1).max(40),            // 单号 / Bill No → tb_forwarder.ftrackingchn base
  memberCode: z.string().trim().regex(/^PR\d+$/i, "รหัสลูกค้าต้องเป็น PR + ตัวเลข"), // Customer ID off the note
  arrivalDate: z.string().trim().max(20).optional(),    // yyyy-mm-dd (else today) → fdatestatus2
  imageUrl: z.string().trim().max(500).optional(),      // stored ใบส่งของ image → shown from ถึงโกดังจีน
  packingId: z.string().trim().max(60).optional(),      // "เลขที่ตู้/Packing ID" ต้นทาง on the note (SEA…YW) — REFERENCE ONLY, stored to fnote; the real shipping container (fcabinetnumber) comes from the packing list (upload-2)
  rows: z.array(yiwuDeliveryRowSchema).min(1, "ต้องมีอย่างน้อย 1 แถว").max(200),
});
export type YiwuDeliveryNoteInput = z.infer<typeof yiwuDeliveryNoteSchema>;

// Bulk = many shipments (one delivery note can list several 单号 for a customer).
export const yiwuDeliveryNoteBulkSchema = z
  .array(yiwuDeliveryNoteSchema)
  .min(1, "ไม่มีรายการให้เพิ่ม")
  .max(300, "เพิ่มได้สูงสุด 300 ออเดอร์ต่อครั้ง");
