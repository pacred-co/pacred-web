/**
 * ป้ายกำกับของ "ลูกค้าที่ใช้ใบขน" (customs_importer_lead) — SOT ตัวเดียว.
 *
 * เดิม STATUS_LABEL / TRANSPORT_LABEL / MATCH_LABEL ถูกประกาศไว้ในไฟล์ client
 * (`customs-lead-client.tsx`) ตัวเดียว พอจะเอาไปใช้ฝั่ง export CSV ด้วย ถ้าก๊อป
 * ไปอีกชุด = วันหนึ่งจอกับไฟล์ CSV จะเรียกสถานะเดียวกันคนละชื่อ (§0e drift).
 * ย้ายมาอยู่ที่นี่ที่เดียว → ทั้งจอและ CSV อ่านชุดเดียวกัน.
 *
 * ไฟล์นี้เป็น plain module (ไม่มี "use client" / "server-only") — import ได้ทั้ง
 * client component และ server action.
 */

/** สถานะการโทรตาม (ตรงกับ <option> ในฟอร์มกรองของหน้า). */
export const CUSTOMS_LEAD_STATUS_LABEL: Record<string, string> = {
  new: "ยังไม่โทร",
  called: "โทรแล้ว",
  interested: "สนใจ",
  converted: "เปิดใบขนแล้ว",
  not_interested: "ไม่สนใจ",
  our_own: "เครือเรา",
};

/** สีชิปสถานะบนจอ (UI เท่านั้น — CSV ไม่ใช้). */
export const CUSTOMS_LEAD_STATUS_CHIP: Record<string, string> = {
  new: "bg-rose-500 text-white border-rose-600",
  called: "bg-amber-500 text-white border-amber-600",
  interested: "bg-blue-600 text-white border-blue-700",
  converted: "bg-emerald-600 text-white border-emerald-700",
  not_interested: "bg-gray-400 text-white border-gray-500",
  our_own: "bg-purple-500 text-white border-purple-600",
};

/** ทางขนส่งบนจอ (มี emoji). */
export const CUSTOMS_LEAD_TRANSPORT_LABEL: Record<string, string> = {
  road: "🚚 รถ",
  sea: "🚢 เรือ",
  air: "✈️ แอร์",
};

/** ทางขนส่งแบบข้อความล้วน — สำหรับ CSV (emoji ใน Excel = กรอง/เรียงยาก). */
export const CUSTOMS_LEAD_TRANSPORT_TEXT: Record<string, string> = {
  road: "รถ",
  sea: "เรือ",
  air: "แอร์",
};

/**
 * ที่มาของการจับคู่กับลูกค้าในระบบ — เซลใช้ตัดสินว่าจะเชื่อเบอร์เลยไหม
 * ('name_fuzzy' = ชื่อคล้ายเฉยๆ ต้องเช็คก่อนโทร).
 */
export const CUSTOMS_LEAD_MATCH_LABEL: Record<string, { text: string; cls: string }> = {
  tax:          { text: "ชนเลขนิติ",   cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  name_corp:    { text: "ชนชื่อนิติ",   cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  name_user:    { text: "ชนชื่อลูกค้า", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  lead_freight: { text: "จากไฟล์ booking เฟรท", cls: "border-cyan-300 bg-cyan-50 text-cyan-700" },
  name_fuzzy:   { text: "⚠ ชื่อคล้าย — เช็คก่อนโทร", cls: "border-amber-400 bg-amber-50 text-amber-800" },
};

export const customsLeadStatusLabel = (s: string | null | undefined): string =>
  CUSTOMS_LEAD_STATUS_LABEL[(s ?? "").trim()] ?? (s ?? "").trim();
