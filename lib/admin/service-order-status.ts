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
// `next` = the "ให้พนักงานทำอะไรต่อ" hint (self-explaining-row standard §0g · owner
// 2026-06-22). `act:true` = this status needs a staff action NOW (render the hint
// emphasised so a queue is scannable at a glance). Shown under the status pill on
// every list/detail that reads this SOT.
export const HSTATUS_CFG: Record<string, { label: string; chip: string; next: string; act: boolean }> = {
  // owner 2026-07-15 — "แสบตาแบบ PCS" (mirrors FSTATUS_CFG · LOUD solid chip · state-encoding).
  "1":  { label: "รอดำเนินการ",      chip: "bg-amber-500 text-white border border-amber-600 font-bold",         next: "ตรวจ/เปิดราคา",        act: true  },
  "2":  { label: "รอชำระเงิน",        chip: "bg-red-600 text-white border border-red-700 font-bold",             next: "รอลูกค้าชำระ/ตรวจสลิป", act: true  },
  "3":  { label: "สั่งสินค้า",         chip: "bg-blue-600 text-white border border-blue-700 font-bold",           next: "สั่งซื้อจากจีน",        act: true  },
  "4":  { label: "รอร้านจีนจัดส่ง",   chip: "bg-indigo-500 text-white border border-indigo-600 font-bold",       next: "รอร้านส่งเข้าโกดังจีน",  act: false },
  "40": { label: "ถึงโกดังจีน",        chip: "bg-teal-500 text-white border border-teal-600 font-bold",           next: "รอเปิดฝากนำเข้า",       act: true  },
  "5":  { label: "สำเร็จ",            chip: "bg-emerald-600 text-white border border-emerald-700 font-bold",     next: "เสร็จสิ้น — ตามต่อที่ฝากนำเข้า", act: false },
  "6":  { label: "ยกเลิก",            chip: "bg-gray-500 text-white border border-gray-600 font-bold",           next: "—",                    act: false },
};

export function hstatusBadge(hstatus: string): { label: string; chip: string; next: string; act: boolean } {
  return HSTATUS_CFG[hstatus] ?? { label: hstatus, chip: "bg-gray-100 text-gray-600 border border-gray-300", next: "", act: false };
}
