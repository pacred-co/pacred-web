/**
 * Preset slip-rejection reasons (owner 2026-06-27 · "ห้ามพิมพ์ · กดเลือก").
 *
 * The owner's standing rule: categorical input must be CLICK-SELECT, never
 * free-typed, so the data stays systematic (you can group/report on it). A
 * rejected slip's reason was a free-text textarea → every admin phrased it
 * differently → un-analysable. These preset lists make the common reasons a
 * one-tap choice; a single "อื่นๆ (ระบุ)" escape hatch covers the rare case
 * (the only place typing is still allowed).
 *
 * The chosen string is persisted verbatim onto `tb_wallet_hs.note` /
 * `tb_payment` note by the existing reject actions — so the presets BECOME the
 * canonical reason vocabulary. Keep them short + stable (changing a label
 * fragments historical grouping).
 */

/** Deposit / customer-slip payment (type 1/4/8) rejection reasons. */
export const SLIP_REJECT_REASONS_DEPOSIT = [
  "ยอดในสลิปไม่ตรงกับรายการ",
  "สลิปไม่ชัด / อ่านไม่ออก",
  "สลิปซ้ำ (เคยใช้แล้ว)",
  "ไม่พบยอดเข้าบัญชีบริษัท",
  "ผิดธนาคาร / ผิดบัญชีปลายทาง",
  "วันที่ / เวลาในสลิปไม่ตรง",
] as const;

/** Customer-withdraw (type 3) rejection reasons. */
export const SLIP_REJECT_REASONS_WITHDRAW = [
  "เอกสารบัญชีไม่ครบ",
  "เลขบัญชีไม่ตรงกับชื่อลูกค้า",
  "ลูกค้าขอยกเลิกการถอน",
  "จำนวนเงินไม่ถูกต้อง",
] as const;

/** Yuan-transfer / โอนหยวน (tb_payment) rejection reasons. */
export const SLIP_REJECT_REASONS_YUAN = [
  "ยอดในสลิปไม่ตรงกับรายการ",
  "สลิปไม่ชัด / อ่านไม่ออก",
  "สลิปซ้ำ (เคยใช้แล้ว)",
  "ไม่พบยอดเข้าบัญชีบริษัท",
  "เรทหยวนไม่ตรง",
] as const;

/** The single typing-allowed escape hatch — picking it reveals a text input. */
export const REJECT_REASON_OTHER = "อื่นๆ (ระบุ)";

export type SlipRejectKind = "deposit" | "withdraw" | "yuan";

export function rejectReasonsFor(kind: SlipRejectKind): readonly string[] {
  if (kind === "withdraw") return SLIP_REJECT_REASONS_WITHDRAW;
  if (kind === "yuan") return SLIP_REJECT_REASONS_YUAN;
  return SLIP_REJECT_REASONS_DEPOSIT;
}
