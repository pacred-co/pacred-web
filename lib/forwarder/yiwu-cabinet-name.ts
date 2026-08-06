/**
 * yiwu-cabinet-name.ts — SOT ชื่อตู้อี้อู (owner 2026-08-07)
 *
 * "รี เลขตู้ของทางอี้อูใหม่ ... YW(Yiwu) + S(SEA)/E(EK Truck) + YY-MM-DD +
 *  -N (N = ลำดับตู้ที่ปิดในวันนั้น) แบบเดียวกับทางกวางโจว"
 *
 * ⚠️ SUPERSEDES กติกา 2026-07-20 ("ใช้เลขตู้ TTW verbatim") — owner กลับคำเอง
 * เพราะเลขปน 3 รูปแบบ (GZS…T ยุคแรก · YWS…T · SEA0625-8211YW/YWYY13164 verbatim)
 * ทำให้ ตามของ/ตามตู้/เก็บเงิน/หาสถานะ กันไม่เจอ + เรทต้นทุน TTW ใน
 * tb_cost_container ค้างใต้ชื่อเก่าแล้วจับคู่ไม่เจอเงียบๆ (เจอจริง GZS260707-6T).
 *
 * แพทเทิร์น: `YW` + โหมด (`S`=เรือ · `E`=รถ EK · `A`=แอร์) + `YYMMDD` (วันปิดตู้ พ.ศ.—
 * ตามเลขปีย่อ 26xx ที่ใช้ทั้งระบบ เช่น 260717) + `-N` (ตู้ที่ N ของวันนั้น).
 * ตัวอย่าง: `YWS260717-1` — สอดคล้อง `resolveTransportMode` (YWS=เรือ) +
 * `monthFromCabinetName` ของรายงานกำไรตู้ (^(?:GZ|YW)[A-Z]\d{6}) โดยอัตโนมัติ.
 *
 * data-fix ที่ rekey ของเดิมทั้งหมด = `scripts/rekey-yiwu-cabinets-2026-08-07.mjs`
 * (applied prod · 30 แถว/6 ตู้ · Σเงินยันก่อน-หลังเท่ากันเป๊ะ).
 */

/** ชื่อตู้อี้อูตามแพทเทิร์นใหม่ เช่น YWS260717-1 */
export const YIWU_CABINET_RX = /^YW[SEA]\d{6}-\d+$/;

export function isYiwuCabinetName(v: string | null | undefined): boolean {
  return YIWU_CABINET_RX.test((v ?? "").trim().toUpperCase());
}

/** ประกอบชื่อตู้ใหม่ — โยนเมื่อ input ผิดรูป (fail-loud ดีกว่าผลิตชื่อเพี้ยน) */
export function buildYiwuCabinetName(
  mode: "S" | "E" | "A",
  yymmdd: string,
  seq: number,
): string {
  if (!/^\d{6}$/.test(yymmdd)) throw new Error(`yymmdd ผิดรูป: "${yymmdd}"`);
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) throw new Error(`seq ผิดรูป: ${seq}`);
  return `YW${mode}${yymmdd}-${seq}`;
}

/**
 * แปลงชื่อยุคเก่าที่ derive ได้ → แพทเทิร์นใหม่ · derive ไม่ได้ = คืน null (ห้ามเดา).
 *
 * - ชื่อใหม่อยู่แล้ว → คืนตัวเอง (normalize case)
 * - ยุค T-suffix `GZS260707-6T` / `YWS260722-10T` → วันที่อยู่ในชื่อ · เลขท้ายเดิมเป็น
 *   ลำดับสะสมทั้งปี (ไม่ใช่ต่อวัน) จึงตัดทิ้ง → ตู้แรกของวัน = `-1`
 *   (ทุกตู้ยุคนั้นปิดวันละใบ — ยืนยันจาก prod ก่อนเขียนกติกานี้)
 * - verbatim (`SEA0625-8211YW` · `YWYY13164` · `0717-7072 YW SEA`) → **null**
 *   (ไม่มีปี/วันครบในชื่อ — ต้องระบุชื่อใหม่เอง ห้ามให้โค้ดกุ)
 */
export function normalizeLegacyYiwuName(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "") return null;
  if (YIWU_CABINET_RX.test(v)) return v;
  const t = /^(?:GZ|YW)([SEA])(\d{6})-\d+T$/.exec(v);
  if (t) return `YW${t[1]}${t[2]}-1`;
  return null;
}
