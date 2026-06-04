/**
 * Shipping method registry — faithful port of legacy `nameShipBy()`
 * (`member/include/function.php` line 91, switch on `$fShipBy`).
 *
 * The legacy PCS Cargo system stores the chosen Thai-domestic carrier on
 * `tb_forwarder.fShipBy` / `tb_header_order.hShipBy` as a string that is
 * EITHER a numeric id ("1".."47") OR one of four special tokens
 * (`PCS`, `F`, `PCSF`, `PCSE`). The mapping below is the single source of
 * truth for code → display name + ETA + transport-type classification.
 *
 * Why a helper (not a DB table) — for parity with legacy we keep this as
 * a config array. Legacy `nameShipBy()` is a hard-coded `switch` (no DB
 * lookup) and the codes are referenced literally in templates, exports,
 * and admin tooling. A DB table would break the 1:1 port.
 *
 * Sources:
 *   - `member/include/function.php`               → `nameShipBy()` (full mapping)
 *   - `member/include/pages/cart/api-shipBy.php`  → carrier list shown to customers,
 *                                                   ZIP-code-based eligibility
 *   - `member/include/pages/forwarder/getShipBy.php` → forwarder picker (same list)
 *
 * G4 scope: this file is the pure helper only. Province/ZIP eligibility
 * filtering (the bulk of `api-shipBy.php`) lives in `actions/forwarder.ts`
 * (G3) where it can query the address row.
 */

/** Legacy single-letter cargo-type code (PCS API "Shipment Report"). */
export type LegacyCargoCode = "A" | "M" | "X" | "O" | "Z";

/** Transport mode classification — mirrors legacy `nameTransportType()`. */
export type ShippingMethodType = "truck" | "sea" | "air";

export type ShippingMethod = {
  /** The legacy `fShipBy` token. Numeric "1".."47" OR one of PCS/F/PCSF/PCSE. */
  code: string;
  /** English-friendly display name (latin script). */
  name: string;
  /** Thai display label — what legacy `nameShipBy()` returns and customers see. */
  nameTh: string;
  /** Transport mode classification. The legacy carrier list is all domestic
   * trucking + DHL air; no sea-freight last-mile carriers exist in the list. */
  type: ShippingMethodType;
  /** Typical ETA in days from THB warehouse to recipient. Conservative
   * defaults — legacy stores no ETA; these come from PCS staff convention
   * (3-day for nationwide express, 5-day for regional, 1-day for PCS pickup). */
  etaDays: number;
  /** Optional Thai-language description (regional coverage hint). */
  description?: string;
};

/**
 * Canonical shipping-method registry — mirrors legacy `nameShipBy()`
 * 1:1. The order matches the legacy switch (1..47 then PCS / F / PCSF / PCSE).
 *
 * Type classification:
 *  - DHL (1) = international air-courier → "air"
 *  - All other numeric codes = Thai-domestic ground carriers → "truck"
 *  - PCS / F / PCSF / PCSE = PCS own logistics → "truck"
 *
 * Note: legacy has NO "sea" last-mile carrier in `nameShipBy()`. Sea-freight
 * applies upstream (China→TH leg, `nameTransportType()` "2"). The "sea" union
 * member is kept for type symmetry should a sea-last-mile carrier be added.
 */
export const SHIPPING_METHODS: readonly ShippingMethod[] = [
  { code: "1",    name: "DHL Express",                    nameTh: "DHL Express",                    type: "air",   etaDays: 2 },
  { code: "2",    name: "Flash Express",                  nameTh: "Flash Express",                  type: "truck", etaDays: 3 },
  { code: "3",    name: "J.K. Express",                   nameTh: "J.K. เอ็กซ์เพรส",                type: "truck", etaDays: 3 },
  { code: "4",    name: "Kerry Express",                  nameTh: "Kerry Express",                  type: "truck", etaDays: 3 },
  { code: "5",    name: "Nim Express",                    nameTh: "Nim Express",                    type: "truck", etaDays: 3 },
  { code: "6",    name: "S & J Express Suphanburi",       nameTh: "S & J ขนส่งด่วนสุพรรณบุรี",       type: "truck", etaDays: 4, description: "สุพรรณบุรี · กาญจนบุรี" },
  { code: "7",    name: "SB Somjai Transport",            nameTh: "SB สมใจขนส่ง",                    type: "truck", etaDays: 5, description: "ภาคเหนือ · ภาคอีสาน" },
  { code: "8",    name: "SCG Express",                    nameTh: "SCG Express",                    type: "truck", etaDays: 3 },
  { code: "9",    name: "KPN",                            nameTh: "เคพีเอ็น",                        type: "truck", etaDays: 4, description: "ปทุมธานี · ภาคกลาง · ภาคตะวันออก" },
  { code: "10",   name: "First Express Transport",        nameTh: "เฟิร์ส เอ็กเพรส ขนส่ง",          type: "truck", etaDays: 5, description: "ภาคใต้" },
  { code: "11",   name: "Thailand Post",                  nameTh: "ไปรษณีย์ไทย",                    type: "truck", etaDays: 4 },
  { code: "12",   name: "Chansawang Transport",           nameTh: "จันทร์สว่างขนส่ง",                type: "truck", etaDays: 5, description: "ภาคอีสาน · ภาคตะวันออก" },
  { code: "13",   name: "Thanamai Express",               nameTh: "ธนามัย ขนส่งด่วน",                type: "truck", etaDays: 4, description: "ภาคอีสาน" },
  { code: "14",   name: "Boonanan Transport",             nameTh: "บุญอนันต์ขนส่ง",                  type: "truck", etaDays: 5, description: "ภาคอีสาน" },
  { code: "15",   name: "P.J. Express Isaan",             nameTh: "พี.เจ. ด่วนอีสาน ขนส่ง",          type: "truck", etaDays: 5, description: "ภาคอีสาน" },
  { code: "16",   name: "Mango Transport",                nameTh: "มะม่วงขนส่ง",                     type: "truck", etaDays: 4, description: "ภาคกลาง · ภาคตะวันออก" },
  { code: "17",   name: "Wanchana & Wannisa Transport",   nameTh: "วันชนะ แอนด์ วันณิสา ขนส่ง",      type: "truck", etaDays: 5, description: "ชัยภูมิ · นครราชสีมา" },
  { code: "18",   name: "Sompong Ubonrat Transport",      nameTh: "สมพงษ์อุบลรัตน์ ขนส่ง",          type: "truck", etaDays: 5, description: "ขอนแก่น · มหาสารคาม · กาฬสินธุ์" },
  { code: "19",   name: "R.C.R. Place",                   nameTh: "อาร์.ซี.อาร์ เพลส",              type: "truck", etaDays: 4, description: "นครปฐม" },
  { code: "20",   name: "Tong-Song Transport",            nameTh: "ตองสอง ขนส่ง",                   type: "truck", etaDays: 4, description: "สระบุรี · อยุธยา · บางส่วนของนครราชสีมา" },
  { code: "21",   name: "Nim See Seng Transport 1988",    nameTh: "นิ่มซี่เส็งขนส่ง 1988",          type: "truck", etaDays: 4, description: "ภาคเหนือ" },
  { code: "22",   name: "Thanapaisarn Transport",         nameTh: "ธนาไพศาล ขนส่ง",                 type: "truck", etaDays: 4, description: "สระแก้ว · จันทบุรี" },
  { code: "23",   name: "PL Express",                     nameTh: "PL ขนส่งด่วน",                   type: "truck", etaDays: 4, description: "ภาคกลาง · ภาคเหนือตอนล่าง" },
  { code: "24",   name: "J&T Express",                    nameTh: "J&T Express",                    type: "truck", etaDays: 3 },
  { code: "25",   name: "Mangkorn Thong Transport 2019",  nameTh: "มังกรทองขนส่ง 2019",             type: "truck", etaDays: 5 },
  { code: "26",   name: "PM Chonburi Express",            nameTh: "PM ชลบุรี ขนส่งด่วน",           type: "truck", etaDays: 4, description: "ชลบุรี" },
  { code: "27",   name: "Sappreecha Transport",           nameTh: "ทรัพย์ปรีชา",                    type: "truck", etaDays: 5, description: "ปัตตานี · ยะลา · นราธิวาส" },
  { code: "28",   name: "Pattana Express",                nameTh: "พัฒนาเอ็กซ์เพลส",                type: "truck", etaDays: 5, description: "ภาคใต้ชายแดน" },
  { code: "29",   name: "Hat Yai Tour Transport",         nameTh: "หาดใหญ่ทัวร์",                   type: "truck", etaDays: 5, description: "ภาคใต้" },
  { code: "30",   name: "Hat Yai O.P. 2012",              nameTh: "หาดใหญ่ โอ.พี. 2012",            type: "truck", etaDays: 5, description: "สงขลา" },
  { code: "31",   name: "R.C. Express",                   nameTh: "อาร์.ซี.เอ็กซเพรส",              type: "truck", etaDays: 4, description: "สุพรรณบุรี (บางเลน · ลาดบัวหลวง)" },
  { code: "32",   name: "Four Friends Transport",         nameTh: "สี่สหาย",                        type: "truck", etaDays: 5, description: "ภาคใต้ตอนบน" },
  { code: "33",   name: "Phae Pla Sombat Watthana",       nameTh: "แพปลา​สมบัติ​วัฒนา",              type: "truck", etaDays: 5, description: "ปัตตานี" },
  { code: "34",   name: "Thaweesap Rayong Transport",     nameTh: "ทวีทรัพย์ระยอง ขนส่ง",           type: "truck", etaDays: 4, description: "ระยอง" },
  { code: "35",   name: "Sirisomboon Transport",          nameTh: "ศิริสมบูรณ์",                    type: "truck", etaDays: 4, description: "ตาก" },
  { code: "36",   name: "New Song Assawin Transport",     nameTh: "นิวสอง อัศวินขนส่ง",             type: "truck", etaDays: 4, description: "ระยอง" },
  { code: "37",   name: "Choksataporn Transport",         nameTh: "โชคสถาพรขนส่ง",                  type: "truck", etaDays: 5, description: "พังงา" },
  { code: "38",   name: "Sapsomboonthavorn Transport",    nameTh: "ทรัพย์สมบูรณ์ถาวร",              type: "truck", etaDays: 5, description: "ภาคใต้ · ภาคอีสาน" },
  { code: "39",   name: "MNB Transport",                  nameTh: "MNB Transport",                  type: "truck", etaDays: 5, description: "เชียงราย" },
  { code: "40",   name: "Chokpoonsap Transport 2014",     nameTh: "หจก.โชคพูลทรัพย์ขนส่ง 2014",     type: "truck", etaDays: 5, description: "เชียงราย" },
  { code: "41",   name: "Sirinakorn Transport",           nameTh: "สิรินครขนส่ง",                   type: "truck", etaDays: 5, description: "ภาคอีสาน" },
  { code: "42",   name: "Paanit KSD Transport",           nameTh: "พาณิชย์การขนส่ง KSD",            type: "truck", etaDays: 5, description: "ภาคเหนือ" },
  { code: "43",   name: "Nawan Transport",                nameTh: "นวรรณขนส่ง",                     type: "truck", etaDays: 5, description: "สระแก้ว" },
  { code: "44",   name: "Kuncharamani Transport",         nameTh: "กุญชรมณี ขนส่ง",                 type: "truck", etaDays: 5, description: "เชียงใหม่ · ขอนแก่น · ลำปาง" },
  { code: "45",   name: "MPort Logistics",                nameTh: "บริษัท เอ็มพอร์ท โลจิสติกส์ จำกัด", type: "truck", etaDays: 5, description: "ภาคเหนือ" },
  { code: "46",   name: "C.N. Transport",                 nameTh: "ซี.เอ็น.ทรานสปอร์ต",             type: "truck", etaDays: 4, description: "ชลบุรี · ระยอง" },
  { code: "47",   name: "Phuket Laem Thong Transport",    nameTh: "ภูเก็ตแหลมทองขนส่ง",             type: "truck", etaDays: 5, description: "ภูเก็ต · พังงา" },
  { code: "PCS",  name: "Pacred Warehouse Pickup",        nameTh: "รับเองโกดัง Pacred (สมุทรสาคร)", type: "truck", etaDays: 1, description: "รับด้วยตนเองที่โกดัง Pacred สมุทรสาคร" },
  { code: "F",    name: "Auto-assigned by Pacred",        nameTh: "บริษัทจัดหาให้อัตโนมัติ",        type: "truck", etaDays: 4 },
  { code: "PCSF", name: "Pacred Mao Mao (bulk)",          nameTh: "Pacred เหมาเหมา",                type: "truck", etaDays: 3, description: "Pacred เหมาส่งทั้งคันรถ" },
  { code: "PCSE", name: "Pacred Express",                 nameTh: "Pacred Express",                 type: "truck", etaDays: 2, description: "บริการขนส่งของ Pacred Express" },
];

/** Fast index by code — built once at module load. */
const SHIPPING_METHOD_INDEX: ReadonlyMap<string, ShippingMethod> = new Map(
  SHIPPING_METHODS.map((m) => [m.code, m]),
);

/**
 * Get the list of shipping methods, optionally narrowed by cargo type.
 *
 * The legacy `nameShipBy()` lookup does NOT filter by cargo type — the
 * carrier-vs-cargo rules live in admin/ops (e.g. controlled goods can't
 * use express). For faithful parity we accept the `cargoType` filter
 * but currently return the full list for every cargo (matches legacy).
 *
 * The filter parameter is kept for forward compatibility: when admin
 * wires per-carrier cargo restrictions in Phase G, this is the seam.
 */
export function getShippingMethods(
  filter?: { cargoType?: LegacyCargoCode },
): ShippingMethod[] {
  // No-op filter — legacy `nameShipBy()` has no cargo-type restriction.
  // Reference the param so strict noUnusedParameters stays happy and
  // the filter shape is locked in the type signature.
  void filter?.cargoType;
  return [...SHIPPING_METHODS];
}

/**
 * Look up a single shipping method by its legacy code. Returns `null`
 * for an unknown code (matches the legacy `default: 'ไม่พบข้อมูล'` path,
 * which the caller can map to its own "not found" copy).
 *
 * Codes are case-sensitive — legacy stores them verbatim ("PCS" ≠ "pcs").
 */
export function getShippingMethodByCode(code: string): ShippingMethod | null {
  if (!code) return null;
  return SHIPPING_METHOD_INDEX.get(code) ?? null;
}

/**
 * Convenience — Thai display name for a shipping code. Mirrors the legacy
 * `nameShipBy()` return contract: returns the Thai label for a known code
 * and the legacy "ไม่พบข้อมูล" fallback for an unknown code.
 */
export function nameShipBy(code: string | null | undefined): string {
  if (!code) return "ไม่พบข้อมูล";
  return SHIPPING_METHOD_INDEX.get(code)?.nameTh ?? "ไม่พบข้อมูล";
}
