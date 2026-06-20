/**
 * Shop-order (ฝากสั่งซื้อ · tb_header_order.hstatus) → VIVID badge config.
 *
 * The SOT for hstatus chips, mirroring lib/admin/forwarder-status.ts FSTATUS_CFG.
 * Use this everywhere a shop-order status is shown so the list, the detail, and
 * the dashboard all read 1:1 — no per-file drift.
 *
 * Color tuning history (keep the hue, the WEIGHT changed twice):
 *  - 2026-06-19 owner "เอาสีสันชัดๆ · อย่าให้คนงงสับสน" → SOLID -400/-500.
 *  - 2026-06-20 owner "ใช้สีเดิม แต่เบาโทนหน่อย มันแสบตาเกินไป หรี่ลงมา" → SOFT
 *    pill = light tint bg-{hue}-100 + dark readable text-{hue}-800 + border-{hue}-300.
 *    Still a clearly colored, state-encoding pill (NOT an invisible /30 tint — the
 *    dark text + border keep it readable at a glance), just not eye-searing.
 *
 * hstatus: 1 รอดำเนินการ · 2 รอชำระเงิน · 3 สั่งสินค้า · 4 รอร้านจีนจัดส่ง ·
 *          40 ถึงโกดังจีน (mig 0185) · 5 สำเร็จ · 6 ยกเลิก
 */
export const HSTATUS_CFG: Record<string, { label: string; chip: string }> = {
  "1":  { label: "รอดำเนินการ",      chip: "bg-amber-100 text-amber-800 border border-amber-300" },
  "2":  { label: "รอชำระเงิน",        chip: "bg-red-100 text-red-700 border border-red-300" },
  "3":  { label: "สั่งสินค้า",         chip: "bg-blue-100 text-blue-700 border border-blue-300" },
  "4":  { label: "รอร้านจีนจัดส่ง",   chip: "bg-indigo-100 text-indigo-700 border border-indigo-300" },
  "40": { label: "ถึงโกดังจีน",        chip: "bg-teal-100 text-teal-800 border border-teal-300" },
  "5":  { label: "สำเร็จ",            chip: "bg-emerald-100 text-emerald-700 border border-emerald-300" },
  "6":  { label: "ยกเลิก",            chip: "bg-gray-100 text-gray-600 border border-gray-300" },
};

export function hstatusBadge(hstatus: string): { label: string; chip: string } {
  return HSTATUS_CFG[hstatus] ?? { label: hstatus, chip: "bg-gray-100 text-gray-600 border border-gray-300" };
}
