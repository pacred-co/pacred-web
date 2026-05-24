/**
 * Faithful 1:1 transcription of the legacy cart-side eligibility
 * endpoints — `api-shipBy.php` and `checkPCSMaoMao.php` — converted
 * from server-on-every-AJAX into pure server helpers that the Cart
 * Server Component calls once per address at render time. The Client
 * Component then filters by selected address (no AJAX).
 *
 * Sources:
 *   - `member/include/pages/cart/api-shipBy.php`     (ship-by switch)
 *   - `member/include/pages/cart/checkPCSMaoMao.php` (maomao gate)
 *   - `member/include/function.php` L3-9             (BKK ZIP set)
 *
 * The BKK ZIP allowlist already lives at `lib/bkk-zip.ts`; this file
 * adds the per-province carrier filter and the maomao gate that
 * sits on top of it.
 *
 * Scope notes (FLAGGED — kept identical to the legacy):
 *   1. The `userID==='PCSFAM'` "all options" branch (api-shipBy.php
 *      L533-707) is reproduced — that account sees every carrier
 *      regardless of ZIP.
 *   2. The `user-vip-maomao.json` override list (checkPCSMaoMao.php
 *      L26-32) is NOT migrated to a Pacred table — the legacy JSON
 *      file is empty by default. The shape is in place so that file
 *      can later be loaded via env / config.
 *   3. The `user-shipby-freedom.json` override (api-shipBy.php L7) is
 *      not migrated for the same reason. The carrier list is the
 *      strict ZIP-based one for everyone except PCSFAM.
 *   4. The Pathum Thani ZIP array is empty in the canonical
 *      `function.php` (the api-shipBy.php copy has `12000` — a
 *      stale local) so it stays empty here, matching `lib/bkk-zip.ts`.
 *   5. The carrier `id` values + Thai labels are copied verbatim;
 *      every one matches `SHIPPING_METHODS` in `lib/freight/shipping-methods.ts`.
 *
 * The functions are pure — no DB, no env. They take the address
 * row's ZIP / province / amphoe (district) and return the same
 * arrays the PHP echoed as `<option>` markup.
 */

import { isFreeShippingZip } from "@/lib/bkk-zip";

// ────────────────────────────────────────────────────────────
// Regional province sets — verbatim from api-shipBy.php L50-53
// ────────────────────────────────────────────────────────────

// Note — the legacy `api-shipBy.php` declares `$south` + `$central`
// but never reads them (the variables are dead). Only `$north` (NORTH)
// and `$northeast` (NORTHEAST) participate in the rules.
const NORTH = [
  "เชียงราย", "เชียงใหม่", "น่าน", "พะเยา", "แพร่", "แม่ฮ่องสอน", "ลำปาง",
  "ลำพูน", "อุตรดิตถ์",
];
const NORTHEAST = [
  "กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ",
  "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย",
  "สกลนคร", "สุรินทร์", "ศรีสะเกษ", "หนองคาย", "หนองบัวลำภู", "อุดรธานี",
  "อุบลราชธานี", "อำนาจเจริญ",
];

// ────────────────────────────────────────────────────────────
// Carrier (id, name) ports — id matches SHIPPING_METHODS code +
// label matches what the legacy <option> rendered.
// ────────────────────────────────────────────────────────────

export type ShipByOption = {
  id: string;
  name: string;
};

const FLASH: ShipByOption = { id: "2", name: "Flash Express" };

// ────────────────────────────────────────────────────────────
// PCSFAM (api-shipBy.php L533-707) — the "all options" list
// ────────────────────────────────────────────────────────────

const PCSFAM_ALL_OPTIONS: ShipByOption[] = [
  FLASH,
  { id: "3",  name: "J.K. เอ็กซ์เพรส" },
  { id: "5",  name: "Nim Express" },
  { id: "21", name: "นิ่มซี่เส็งขนส่ง 1988" },
  { id: "6",  name: "S & J ขนส่งด่วนสุพรรณบุรี" },
  { id: "7",  name: "SB สมใจขนส่ง" },
  { id: "9",  name: "เคพีเอ็น (2017)" },
  { id: "10", name: "เฟิร์ส เอ็กเพรส ขนส่ง" },
  { id: "12", name: "จันทร์สว่างขนส่ง" },
  { id: "13", name: "ธนามัย ขนส่งด่วน" },
  { id: "14", name: "บุญอนันต์ขนส่ง" },
  { id: "15", name: "พี.เจ. ด่วนอีสาน ขนส่ง" },
  { id: "16", name: "มะม่วงขนส่ง" },
  { id: "17", name: "วันชนะ แอนด์ วันณิสา ขนส่ง" },
  { id: "18", name: "สมพงษ์อุบลรัตน์ ขนส่ง" },
  { id: "19", name: "อาร์.ซี.อาร์ เพลส" },
  { id: "20", name: "ตองสอง ขนส่ง" },
  { id: "22", name: "ธนาไพศาล ขนส่ง" },
  { id: "23", name: "PL ขนส่งด่วน" },
  { id: "24", name: "J&T Express" },
  { id: "25", name: "มังกรทองขนส่ง 2019" },
  { id: "26", name: "PM ชลบุรี ขนส่งด่วน" },
  { id: "27", name: "ทรัพย์ปรีชา" },
  { id: "28", name: "พัฒนาเอ็กซ์เพลส" },
  { id: "29", name: "หาดใหญ่ทัวร์" },
  { id: "30", name: "หาดใหญ่ โอ.พี. 2012" },
  { id: "31", name: "อาร์.ซี.เอ็กซเพรส" },
  { id: "32", name: "สี่สหาย" },
  { id: "33", name: "แพปลา​สมบัติ​วัฒนา" },
  { id: "34", name: "ทวีทรัพย์ระยอง" },
  { id: "35", name: "ศิริสมบูรณ์" },
  { id: "36", name: "นิวสอง อัศวินขนส่ง" },
  { id: "37", name: "โชคสถาพรขนส่ง" },
  { id: "38", name: "ทรัพย์สมบูรณ์ถาวร" },
  { id: "39", name: "MNB Transport" },
  { id: "40", name: "หจก.โชคพูลทรัพย์ขนส่ง 2014" },
  { id: "41", name: "สิรินครขนส่ง" },
  { id: "42", name: "พาณิชย์การขนส่ง KSD" },
  { id: "43", name: "นวรรณขนส่ง" },
  { id: "44", name: "กุญชรมณี ขนส่ง" },
  { id: "45", name: "เอ็มพอร์ท โลจิสติกส์" },
];

// ────────────────────────────────────────────────────────────
// Province-keyed rule table — direct transcription of the
// `in_array($nameProvince, $XYZ)` branches in api-shipBy.php
// L54-524. Each rule's `extraAmphoe` constrains by district when
// the legacy used the `&&` amphoe combo; `excludeAmphoe` enacts
// the `!in_array($nameAmphoe, …)` negative checks.
// ────────────────────────────────────────────────────────────

type ProvinceRule = {
  id:             string;
  name:           string;
  provinces:      string[];
  includeAmphoe?: string[]; // when set, address.amphoe MUST match (AND)
  excludeAmphoe?: string[]; // when set, address.amphoe MUST NOT match
};

const PROVINCE_RULES: ProvinceRule[] = [
  // 13 — ธนามัย ขนส่งด่วน (northeast)
  { id: "13", name: "ธนามัย ขนส่งด่วน",
    provinces: [...NORTHEAST] },
  // 16 — มะม่วงขนส่ง
  { id: "16", name: "มะม่วงขนส่ง",
    provinces: [
      "นครสวรรค์", "อุทัยธานี", "ชัยนาท", "สิงห์บุรี", "นนทบุรี", "อยุธยา",
      "อ่างทอง", "สุพรรณบุรี", "กาญจนบุรี", "เพชรบุรี", "ระยอง", "ลพบุรี",
      "สระบุรี", "สมุทรสาคร", "จันทบุรี", "ตราด",
    ] },
  // 7 — SB สมใจขนส่ง (northeast + extra list)
  { id: "7", name: "SB สมใจขนส่ง",
    provinces: [
      ...NORTHEAST,
      "เพชรบูรณ์", "นครสวรรค์", "พิจิตร", "ชัยนาท", "พิษณุโลก", "สุโขทัย",
      "กำแพงเพชร", "ตาก", "อุดรธานี", "ขอนแก่น",
    ] },
  // 9 — เคพีเอ็น
  { id: "9", name: "เคพีเอ็น",
    provinces: [
      "ปทุมธานี", "อยุธยา", "อ่างทอง", "สิงห์บุรี", "สุพรรณบุรี", "ชัยนาท",
      "สระบุรี", "ชลบุรี", "ฉะเชิงเทรา", "สมุทรสาคร", "นครปฐม", "ราชบุรี",
      "กาญจนบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์",
    ] },
  // 12 — จันทร์สว่างขนส่ง (northeast + east)
  { id: "12", name: "จันทร์สว่างขนส่ง",
    provinces: [
      ...NORTHEAST,
      "นครปฐม", "กาญจนบุรี", "ราชบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์",
      "ชลบุรี", "ฉะเชิงเทรา", "ระยอง", "จันทบุรี", "นครนายก", "ปราจีนบุรี",
      "สระแก้ว",
    ] },
  // 14 — บุญอนันต์ขนส่ง (subset of NE — listed explicitly in legacy)
  { id: "14", name: "บุญอนันต์ขนส่ง",
    provinces: [
      "กาฬสินธุ์", "ขอนแก่น", "นครพนม", "นครราชสีมา", "บุรีรัมย์", "มหาสารคาม",
      "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "สกลนคร", "สุรินทร์", "ศรีสะเกษ",
      "หนองคาย", "หนองบัวลำภู", "อุดรธานี", "อุบลราชธานี", "อำนาจเจริญ",
    ] },
  // 10 — เฟิร์ส เอ็กเพรส (south)
  { id: "10", name: "เฟิร์ส เอ็กเพรส ขนส่ง",
    provinces: [
      "เพชรบุรี", "ประจวบคีรีขันธ์", "ชุมพร", "ระนอง", "สุราษฎร์ธานี",
      "กระบี่", "ภูเก็ต", "นครศรีธรรมราช", "ตรัง", "พัทลุง", "สงขลา",
    ] },
  // 15 — พี.เจ. ด่วนอีสาน ขนส่ง (sic: legacy has empty strings)
  { id: "15", name: "พี.เจ. ด่วนอีสาน ขนส่ง",
    provinces: [
      "กาฬสินธุ์", "ขอนแก่น", "", "นครราชสีมา", "นครพนม", "บึงกาฬ", "บุรีรัมย์",
      "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "", "ศรีสระเกษ", "สกลนคร",
      "สุรินทร์", "หนองคาย", "หนองบัว", "อำนาจเจริญ", "อุดรธานี", "อุบลราชธานี",
    ] },
  // 21 — นิ่มซี่เส็งขนส่ง 1988 (north)
  { id: "21", name: "นิ่มซี่เส็งขนส่ง 1988",
    provinces: [...NORTH] },
  // 23 — PL ขนส่งด่วน
  { id: "23", name: "PL ขนส่งด่วน",
    provinces: [
      "กรุงเทพมหานคร", "กำแพงเพชร", "นครปฐม", "นนทบุรี", "ปทุมธานี",
      "พิจิตร", "พิษณุโลก", "พิษณุโลก", "เพชบูรณ์", "เลย", "สุโขทัย",
      "สมุทรปราการ", "อุตรดิตถ์",
    ] },
  // 17 — วันชนะ แอนด์ วันณิสา ขนส่ง (chaiyaphum + korat-w/o-3-amphoes)
  { id: "17", name: "วันชนะ แอนด์ วันณิสา ขนส่ง",
    provinces: ["ชัยภูมิ", "นครราชสีมา"],
    excludeAmphoe: ["วังน้ำเขียว", "บัวลาย", "ลำทะเมนชัย"] },
  // 18 — สมพงษ์อุบลรัตน์ ขนส่ง (1st block) + J.K.Express block (legacy
  // L216-227 — re-adds id=18 for สุพรรณบุรี/กาญจนบุรี under variable
  // $J_K_Express — kept verbatim because legacy emits it).
  { id: "18", name: "สมพงษ์อุบลรัตน์ ขนส่ง",
    provinces: ["ขอนแก่น", "มหาสารคาม", "กาฬสินธุ์"] },
  { id: "18", name: "สมพงษ์อุบลรัตน์ ขนส่ง",
    provinces: ["สุพรรณบุรี", "กาญจนบุรี"] },
  // 22 — ธนาไพศาล (สระแก้ว / จันทบุรี minus สอยดาว)
  { id: "22", name: "ธนาไพศาล ขนส่ง",
    provinces: ["สระแก้ว", "จันทบุรี"],
    excludeAmphoe: ["สอยดาว"] },
  // 6 — S & J ขนส่งด่วนสุพรรณบุรี
  { id: "6", name: "S & J ขนส่งด่วนสุพรรณบุรี",
    provinces: ["สุพรรณบุรี", "กาญจนบุรี"] },
  // 20 — ตองสอง ขนส่ง (สระบุรี/อยุธยา OR korat-allowlist-amphoe)
  { id: "20", name: "ตองสอง ขนส่ง",
    provinces: ["สระบุรี", "อยุธยา"] },
  { id: "20", name: "ตองสอง ขนส่ง",
    provinces: ["นครราชสีมา"],
    includeAmphoe: [
      "โคราช", "เมืองนครราชสีมา", "โชคชัย", "ขามทะเลสอ", "สีคิ้ว", "สูงเนิน",
      "ปากช่อง", "ด่านขุนทด",
    ] },
  // 19 — อาร์.ซี.อาร์ เพลส (นครปฐม)
  { id: "19", name: "อาร์.ซี.อาร์ เพลส",
    provinces: ["นครปฐม"] },
  // 27 — ทรัพย์ปรีชา (3 deep-south provinces)
  { id: "27", name: "ทรัพย์ปรีชา",
    provinces: ["ปัตตานี", "ยะลา", "นราธิวาส"] },
  // 26 — PM ชลบุรี
  { id: "26", name: "PM ชลบุรี ขนส่งด่วน",
    provinces: ["ชลบุรี"] },
  // 28 — พัฒนาเอ็กซ์เพลส (deep south w/ amphoe allowlist)
  { id: "28", name: "พัฒนาเอ็กซ์เพลส",
    provinces: ["ปัตตานี", "ยะลา", "นราธิวาส"],
    includeAmphoe: [
      "สุไหงโก-ลก", "เมืองนราธิวาส", "โคกโพธิ์", "เมืองปัตตานี", "เมืองยะลา",
    ] },
  // 29 — หาดใหญ่ทัวร์ (deep south w/ amphoe allowlist)
  { id: "29", name: "หาดใหญ่ทัวร์",
    provinces: ["ปัตตานี", "ยะลา", "นราธิวาส"],
    includeAmphoe: [
      "เมืองปัตตานี", "ปะนาเระ", "เจาะไอร้อง", "เมืองนราธิวาส", "สุไหงโก-ลก",
      "เมืองยะลา", "ยะหา", "กรงปินัง", "รามัน", "บันนังสตา", "กาบัง", "ธารโต",
    ] },
  // 30 — หาดใหญ่ โอ.พี. 2012
  { id: "30", name: "หาดใหญ่ โอ.พี. 2012",
    provinces: ["สงขลา"] },
  // 31 — อาร์.ซี.เอ็กซเพรส (สุพรรณบุรี + amphoe allowlist)
  { id: "31", name: "อาร์.ซี.เอ็กซเพรส",
    provinces: ["สุพรรณบุรี"],
    includeAmphoe: ["บางเลน", "ลาดบัวหลวง"] },
  // 32 — สี่สหาย (south, sic spelling เพรชบุรี kept verbatim)
  { id: "32", name: "สี่สหาย",
    provinces: [
      "ประจวบคีรีขันธ์", "เพรชบุรี", "สุราษฎร์ธานี", "นครศรีธรรมราช", "สงขลา",
      "ชุมพร", "พัทลุง", "ตรัง",
    ] },
  // 33 — แพปลาสมบัติวัฒนา
  { id: "33", name: "แพปลา​สมบัติ​วัฒนา",
    provinces: ["ปัตตานี"] },
  // 34 — ทวีทรัพย์ระยอง
  { id: "34", name: "ทวีทรัพย์ระยอง ขนส่ง",
    provinces: ["ระยอง"] },
  // 35 — ศิริสมบูรณ์
  { id: "35", name: "ศิริสมบูรณ์",
    provinces: ["ตาก"] },
  // 36 — นิวสอง อัศวินขนส่ง
  { id: "36", name: "นิวสอง อัศวินขนส่ง",
    provinces: ["ระยอง"] },
  // 37 — โชคสถาพรขนส่ง
  { id: "37", name: "โชคสถาพรขนส่ง",
    provinces: ["พังงา"] },
  // 38 — ทรัพย์สมบูรณ์ถาวร
  { id: "38", name: "ทรัพย์สมบูรณ์ถาวร",
    provinces: [
      "เพชรบุรี", "ประจวบคีรีขันธ์", "สกลนคร", "นครพนม", "กาฬสินธุ์",
      "อุดรธานี", "มหาสารคาม", "มุกดาหาร",
    ] },
  // 39 — MNB Transport
  { id: "39", name: "MNB Transport",
    provinces: ["เชียงราย"] },
  // 40 — โชคพูลทรัพย์ขนส่ง 2014
  { id: "40", name: "หจก.โชคพูลทรัพย์ขนส่ง 2014",
    provinces: ["เชียงราย"] },
  // 41 — สิรินครขนส่ง (full NE)
  { id: "41", name: "สิรินครขนส่ง",
    provinces: [
      "อุบลราชธานี", "ศรีสะเกษ", "สุรินทร์", "บุรีรัมย์", "ยโสธร", "อำนาจเจริญ",
      "นครราชสีมา", "ขอนแก่น", "กาฬสินธุ์", "มหาสารคาม", "ร้อยเอ็ด", "ชัยภูมิ",
      "สกลนคร", "นครพนม", "มุกดาหาร", "อุดรธานี", "หนองบัวลำภู", "เลย",
      "บึงกาฬ", "หนองคาย",
    ] },
  // 42 — พาณิชย์การขนส่ง KSD
  { id: "42", name: "พาณิชย์การขนส่ง KSD",
    provinces: [
      "พิษณุโลก", "พิจิตร", "สุโขทัย", "กำแพงเพชร", "อุตรดิตถ์", "แพร่",
      "เพชรบูรณ์", "ตาก", "น่าน", "ลำพูน", "เลย", "เชียงใหม่",
    ] },
  // 43 — นวรรณขนส่ง
  { id: "43", name: "นวรรณขนส่ง",
    provinces: ["สระแก้ว"] },
  // 44 — กุญชรมณี ขนส่ง
  { id: "44", name: "กุญชรมณี ขนส่ง",
    provinces: ["เชียงใหม่", "ขอนแก่น", "ลำปาง"] },
  // 45 — เอ็มพอร์ท โลจิสติกส์
  { id: "45", name: "เอ็มพอร์ท โลจิสติกส์",
    provinces: [
      "เชียงใหม่", "เชียงราย", "ลำพูน", "ลำปาง", "แพร่", "น่าน", "พะเยา",
      "แม่ฮ่องสอน",
    ] },
];

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export type ShipByContext = {
  /** ZIP code from `tb_address.addresszipcode`. */
  zip:      string | null | undefined;
  /** Province from `tb_address.addressprovince`. */
  province: string | null | undefined;
  /** Amphoe (district) from `tb_address.addressdistrict`. */
  amphoe:   string | null | undefined;
  /** Member code (legacy `$userID`) — `PCSFAM` sees all options. */
  userID:   string | null | undefined;
};

/**
 * Compute the carrier options list for an address. Mirrors
 * `api-shipBy.php` exactly:
 *
 *   - If userID === 'PCSFAM' → full all-options list.
 *   - Else if ZIP is in the BKK metro allowlist → Flash + every
 *     "maomao" carrier (the legacy returns ONLY Flash because the
 *     maomao branch hides the dropdown — preserved here as Flash-only).
 *   - Else → Flash + every province/amphoe-matching carrier from
 *     `PROVINCE_RULES`.
 *
 * The shape mirrors the PHP `$shipByOption` array (id + name).
 */
export function getShipByOptionsForAddress(
  ctx: ShipByContext,
): ShipByOption[] {
  // PCSFAM — all options (api-shipBy.php L533-707).
  if (ctx.userID === "PCSFAM") {
    return [...PCSFAM_ALL_OPTIONS];
  }

  const zip      = (ctx.zip      ?? "").trim();
  const province = (ctx.province ?? "").trim();
  const amphoe   = (ctx.amphoe   ?? "").trim();

  // ZIP-in-BKK metro: maomao zone — legacy returns Flash only
  // (api-shipBy.php L530-532 — the `} else {` branch fires when the
  // ZIP is in the allowlist; it sets `$optionShipBy` to just Flash).
  if (isFreeShippingZip(zip)) {
    return [FLASH];
  }

  // ZIP outside BKK metro: the legacy `if(!in_array($zipcode, $arrZIPCode))`
  // branch — start with Flash, append every PROVINCE_RULES match.
  const seen = new Set<string>([FLASH.id]);
  const out: ShipByOption[] = [FLASH];
  for (const rule of PROVINCE_RULES) {
    if (!rule.provinces.includes(province)) continue;
    if (rule.includeAmphoe && !rule.includeAmphoe.includes(amphoe)) continue;
    if (rule.excludeAmphoe && rule.excludeAmphoe.includes(amphoe)) continue;
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({ id: rule.id, name: rule.name });
  }
  return out;
}

/**
 * Maomao (PCS เหมาๆ) eligibility — `checkPCSMaoMao.php`:
 *
 *   - addressID === 'PCS' (warehouse pickup) → NOT eligible (proF=2).
 *   - ZIP in the BKK metro allowlist → eligible (proF=1).
 *   - Otherwise → not eligible (proF=2).
 *
 * The legacy `user-vip-maomao.json` override is left as a hook
 * (FLAG #2 above) — the file is empty in the production checkout.
 */
export function isMaomaoEligibleForAddress(args: {
  addressID: string | null | undefined;
  zip:       string | null | undefined;
}): boolean {
  if (!args.addressID || args.addressID === "PCS") return false;
  return isFreeShippingZip(args.zip);
}
