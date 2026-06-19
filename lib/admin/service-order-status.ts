/**
 * Shop-order (ฝากสั่งซื้อ · tb_header_order.hstatus) → VIVID badge config.
 *
 * The SOT for hstatus chips, mirroring lib/admin/forwarder-status.ts FSTATUS_CFG
 * (solid -400/-500 weights · owner 2026-06-19 "เอาสีสันชัดๆแบบ report-cnt · อย่าให้
 * คนงงสับสน"). Use this everywhere a shop-order status is shown so the list, the
 * detail, and the dashboard all read 1:1 — no faded -50/-100 chips, no per-file drift.
 *
 * hstatus: 1 รอดำเนินการ · 2 รอชำระเงิน · 3 สั่งสินค้า · 4 รอร้านจีนจัดส่ง ·
 *          40 ถึงโกดังจีน (mig 0185) · 5 สำเร็จ · 6 ยกเลิก
 */
export const HSTATUS_CFG: Record<string, { label: string; chip: string }> = {
  "1":  { label: "รอดำเนินการ",      chip: "bg-amber-400 text-amber-950 border border-amber-600" },
  "2":  { label: "รอชำระเงิน",        chip: "bg-red-500 text-red-50 border border-red-700" },
  "3":  { label: "สั่งสินค้า",         chip: "bg-blue-500 text-blue-50 border border-blue-700" },
  "4":  { label: "รอร้านจีนจัดส่ง",   chip: "bg-indigo-500 text-indigo-50 border border-indigo-700" },
  "40": { label: "ถึงโกดังจีน",        chip: "bg-teal-500 text-teal-50 border border-teal-700" },
  "5":  { label: "สำเร็จ",            chip: "bg-emerald-500 text-emerald-50 border border-emerald-700" },
  "6":  { label: "ยกเลิก",            chip: "bg-gray-400 text-gray-950 border border-gray-600" },
};

export function hstatusBadge(hstatus: string): { label: string; chip: string } {
  return HSTATUS_CFG[hstatus] ?? { label: hstatus, chip: "bg-gray-300 text-gray-900 border border-gray-400" };
}
