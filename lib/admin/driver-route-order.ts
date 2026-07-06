/**
 * ลำดับส่ง (delivery route order) — the SINGLE SOURCE OF TRUTH for the
 * BKK + ปริมณฑล district driving-route sequence.
 *
 * Faithful port of legacy `$arrPositF` (pcs-admin/forwarder-driver.php L725):
 * the districts laid out in DRIVING-ROUTE order (โกดัง สมุทรสาคร → ใกล้ → ไกล).
 * A stop's ลำดับส่ง = its district's index here; a stop list SORTED by it lets a
 * driver run one efficient near→far loop instead of zig-zagging. A district not
 * in the list defaults to 69 (sorts to the end) — exactly like legacy
 * `else echo '69'`.
 *
 * WHY a shared lib (AGENTS §fix-at-root): this was a private const inside the
 * `/admin/drivers/new` create-batch-form client island. Two surfaces now need
 * the SAME route order — the batch-create picker AND the route-ordered delivery
 * address STICKER sheet (`/admin/drivers/[id]/stickers`). Instead of copying the
 * 68-district array into a second file (drift the moment someone tweaks the
 * route), both import from here.
 *
 * Pure data + a pure function — safe to import from BOTH server components and
 * "use client" components.
 */

/** BKK + ปริมณฑล districts in driving-route order (near warehouse → far). */
export const DISTRICT_ROUTE_ORDER: readonly string[] = [
  "หนองแขม", "บางแค", "ภาษีเจริญ", "ธนบุรี", "บางกอกใหญ่", "บางกอกน้อย", "คลองสาน", "สัมพันธวงศ์",
  "ป้อมปราบศัตรูพ่าย", "พระนคร", "สาทร", "ปทุมวัน", "ราชเทวี", "ดุสิต", "พญาไท", "ดินแดง", "ห้วยขวาง",
  "วัฒนา", "คลองเตย", "พระโขนง", "ยานนาวา", "บางคอแหลม", "บางรัก", "ทวีวัฒนา", "ตลิ่งชัน", "บางใหญ่",
  "ไทรน้อย", "บางบัวทอง", "เมืองนนทบุรี", "ปากเกร็ด", "บางกรวย", "จตุจักร", "บางพลัด", "บางซื่อ",
  "หลักสี่", "ดอนเมือง", "สายไหม", "บางเขน", "ลาดพร้าว", "วังทองหลาง", "สวนหลวง", "บางกะปิ", "สะพานสูง",
  "บึงกุ่ม", "คันนายาว", "มีนบุรี", "คลองสามวา", "บางบอน", "จอมทอง", "บางขุนเทียน", "ราษฎร์บูรณะ",
  "ทุ่งครุ", "พระประแดง", "พระสมุทรเจดีย์", "เมืองสมุทรปราการ", "บางนา", "ลาดกระบัง", "ประเวศ", "หนองจอก",
  "บางเสาธง", "บางบ่อ", "บางพลี", "เมืองปทุมธานี", "กระทุ่มแบน", "เมืองสมุทรสาคร", "พุทธมณฑล", "สามพราน",
];

/** Legacy default index for a district not on the route (sorts LAST). */
export const DISTRICT_ORDER_NOT_FOUND = 69;

const routeOrderMap = new Map(DISTRICT_ROUTE_ORDER.map((d, i) => [d, i]));

/**
 * The ลำดับส่ง index for a district — lower = deliver earlier (closer to the
 * warehouse). Unknown / empty district → {@link DISTRICT_ORDER_NOT_FOUND}.
 */
export function routeOrderOf(district: string | null | undefined): number {
  const d = (district ?? "").trim();
  return routeOrderMap.has(d) ? routeOrderMap.get(d)! : DISTRICT_ORDER_NOT_FOUND;
}
