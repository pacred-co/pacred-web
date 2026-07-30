/**
 * momo-invoice-doc-meta.ts — เมทาดาทาของ "ใบวางบิล MOMO" ที่แกะได้จากตัวเอกสารเอง
 * (owner 2026-07-29: "ใบวางบิล momo ที่อัพเข้าไป ทำประวัติเก็บไว้").
 *
 * ประวัติการอัพใบ (mig 0283 `momo_invoice_upload`) ต้องเก็บ **วันที่ของใบ** และ
 * **ผู้วางบิล** ไว้ในแถวประวัติ ไม่งั้นบัญชีต้องกดเปิดทุกใบเพื่อดูว่าใบไหนของรอบไหน.
 * ทั้ง 2 ค่าไม่มีใน `ParsedMomoInvoice` (parser สนใจแต่ตัวเลขบนเส้นเงิน) → แกะที่นี่.
 *
 * PURE — ไม่มี I/O · ไม่แตะ DB/เงิน. ค่าที่คืนเป็น **ข้อมูลอ้างอิงบนแถวประวัติ**
 * เท่านั้น ไม่ถูกใช้ตัดสินอะไรบนเส้นทางเงิน (ถ้าอ่านไม่ออก = null ไม่เดา §0f).
 */

/** ผู้วางบิลเจ้าเดียวที่ MOMO ส่งใบมาให้เราตอนนี้ (ฮุย ไท่ต๋า) — ป้ายที่โชว์บนประวัติ. */
export const MOMO_SUPPLIER_LABEL = "ฮุย ไท่ต๋า (HUI TAI DA)";

/** เลขที่ใบ MOMO: `INV-YYYYMMDD-NNNN` (แพทเทินเดียวกับ momo-doc-name.ts). */
const INV_NO_RE = /^INV-(\d{4})(\d{2})(\d{2})-\d{4}$/i;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * วันที่ของใบ จากเลขที่ใบ (`INV-20260708-0002` → `"2026-07-08"`).
 *
 * MOMO ฝังวันที่ออกใบไว้ในเลขที่เอกสารเอง → ไม่ต้องพึ่งการอ่านบรรทัด "วันที่" บน PDF
 * (ซึ่งเป็นวันไทย/รูปแบบไม่นิ่ง). ตรวจว่าเป็นวันจริงด้วยการ round-trip — `20260231`
 * (31 ก.พ.) ต้องคืน null ไม่ใช่เลื่อนเป็น 3 มี.ค. เงียบๆ.
 *
 * คืน `YYYY-MM-DD` (ใส่คอลัมน์ `date` ได้ตรงๆ) หรือ null เมื่ออ่านไม่ได้/ไม่ใช่วันจริง.
 */
export function invoiceDateFromNo(invoiceNo: string | null | undefined): string | null {
  const m = String(invoiceNo ?? "").trim().match(INV_NO_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // ช่วงปีกันเลขขยะ (ใบจริงอยู่ยุค 2020s · ปี 0001/9999 = อ่านผิดแน่)
  if (y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // round-trip: วันที่ไม่มีจริง (31 ก.พ.) จะเลื่อนเดือน → ปฏิเสธ
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/**
 * ผู้วางบิล จากข้อความบนใบ — ตอนนี้ MOMO = ฮุย ไท่ต๋า เจ้าเดียว.
 *
 * ตรวจจากชื่อที่พิมพ์บนหัวใบ (ไทยหรืออังกฤษ). เจอ = คืนป้ายมาตรฐานตัวเดียว
 * (ไม่คืนสตริงดิบ เพื่อไม่ให้ประวัติมีชื่อเจ้าเดียวกันสะกดต่างกันหลายแบบ) ·
 * ไม่เจอ = null (**ไม่เดา** — วันหนึ่งอาจมีเจ้าที่ 2 เข้ามา แล้วป้ายผิดจะหลอกบัญชี).
 */
export function supplierFromInvoiceText(text: string | null | undefined): string | null {
  const t = String(text ?? "");
  if (!t) return null;
  if (/ฮุย/.test(t) || /ไท่\s*ต๋า/.test(t)) return MOMO_SUPPLIER_LABEL;
  if (/HUI\s*TAI\s*DA/i.test(t)) return MOMO_SUPPLIER_LABEL;
  return null;
}
