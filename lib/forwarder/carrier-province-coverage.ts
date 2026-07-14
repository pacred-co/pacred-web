/**
 * carrier-province-coverage.ts — GENERATED. Do not hand-edit.
 *
 *   source : บริษัทขนส่ง_พื้นที่ขนส่ง(จังหวัด).xlsx  (sheet "main", owner-maintained)
 *   gen    : node scripts/gen-carrier-province-coverage.mjs --emit
 *
 * The per-province carrier coverage for ขนส่งเอกชน / ต่างจังหวัด delivery:
 * "which carriers actually serve this customer's province". PURE — no IO, no
 * server-only import — so it is importable from tests and from both the cart
 * and the admin forwarder carrier pickers.
 *
 * `code` = the legacy `tb_forwarder.fshipby` value (api-shipBy.php option id).
 * Every carrier in the workbook already has one → nothing new to store, and
 * NO migration is required.
 *
 * `provinceNotes` = a per-province delivery RESTRICTION typed into the sheet
 * ("ไม่เข้าวังน้ำเขียว / บัวลาย", "ส่งแค่บางเลน", "ไม่ไป เบตง") — show it to
 * staff next to the carrier so they don't book an out-of-area drop.
 * `notes` = carrier-level notes ("เริ่มต้น 30", "ไม่รับสาย", "ต้องแจ้งอำเภอก่อน").
 *
 * Selection only — this file has ZERO effect on the ค่าส่งไทย price engine.
 */

// The 77 canonical provinces live in ONE place (docs/conventions §13) —
// `lib/thai-provinces.ts`; the generator asserts parity with it before emitting.
import { isThaiProvince } from "@/lib/thai-provinces";

/** ภาคอีสาน — the 20 provinces "ภาคอีสานทุกจังหวัด" expands to. */
export const ISAAN_PROVINCES: readonly string[] = [
  "กาฬสินธุ์",
  "ขอนแก่น",
  "ชัยภูมิ",
  "นครพนม",
  "นครราชสีมา",
  "บึงกาฬ",
  "บุรีรัมย์",
  "มหาสารคาม",
  "มุกดาหาร",
  "ยโสธร",
  "ร้อยเอ็ด",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุบลราชธานี",
];

/** ภาคเหนือ — the 9 provinces "ภาคเหนือทุกจังหวัด" expands to. */
export const NORTH_PROVINCES: readonly string[] = [
  "เชียงราย",
  "เชียงใหม่",
  "น่าน",
  "พะเยา",
  "แพร่",
  "แม่ฮ่องสอน",
  "ลำปาง",
  "ลำพูน",
  "อุตรดิตถ์",
];

/** Typos / short names observed in the workbook OR in prod address data → canonical. */
export const PROVINCE_ALIASES: Readonly<Record<string, string>> = {
  "ศรีสระเกษ": "ศรีสะเกษ",
  "ศรีสะเกส": "ศรีสะเกษ",
  "เพชบูรณ์": "เพชรบูรณ์",
  "เพรชบุรี": "เพชรบุรี",
  "กาฬสิน": "กาฬสินธุ์",
  "นาราธิวาส": "นราธิวาส",
  "สุมุทรปราการ": "สมุทรปราการ",
  "สมุทรปราการ": "สมุทรปราการ",
  "โคราช": "นครราชสีมา",
  "อุบล": "อุบลราชธานี",
  "สุพรรณ": "สุพรรณบุรี",
  "หนองบัว": "หนองบัวลำภู",
  "อยุธยา": "พระนครศรีอยุธยา",
  "กรุงเทพ": "กรุงเทพมหานคร",
  "กทม": "กรุงเทพมหานคร",
  "อุดร": "อุดรธานี",
  "ปุมธานี": "ปทุมธานี",
  "สมุทปราการ": "สมุทรปราการ",
  "นคสวรรค์": "นครสวรรค์",
  "สุราษฏร์ธานี": "สุราษฎร์ธานี",
};

export type CarrierCoverage = {
  /** Carrier display name (verbatim from the workbook header). */
  name: string;
  /** Legacy `tb_forwarder.fshipby` code. */
  code: string;
  /** Latin slug (workbook sheet "ชีต2"). */
  slug: string;
  /** Canonical provinces served. */
  provinces: string[];
  /** province → delivery restriction note. */
  provinceNotes?: Record<string, string>;
  /** Carrier-level notes (pricing floor, "ไม่รับสาย", …). */
  notes?: string[];
};

export const CARRIER_PROVINCE_COVERAGE: CarrierCoverage[] = [
  {
    name: "Flash Express",
    code: "2",
    slug: "FlashExpress",
    provinces: ["กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"],
  },
  {
    name: "J&T Express",
    code: "24",
    slug: "JandTExpress",
    provinces: ["กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"],
  },
  {
    name: "ธนามัย ขนส่งด่วน",
    code: "13",
    slug: "Thanamaiexpressdelivery",
    provinces: ["กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ", "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "ศรีสะเกษ", "สกลนคร", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อำนาจเจริญ", "อุดรธานี", "อุบลราชธานี"],
  },
  {
    name: "จันทร์สว่างขนส่ง",
    code: "12",
    slug: "ChansawangTransport",
    provinces: ["กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ", "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "ศรีสะเกษ", "สกลนคร", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อำนาจเจริญ", "อุดรธานี", "อุบลราชธานี", "นครปฐม", "กาญจนบุรี", "ราชบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์", "ชลบุรี", "ฉะเชิงเทรา", "ระยอง", "จันทบุรี", "นครนายก", "ปราจีนบุรี", "สระแก้ว"],
  },
  {
    name: "บุญอนันต์ขนส่ง",
    code: "14",
    slug: "BoonananTransport",
    provinces: ["นครราชสีมา", "สุรินทร์", "บุรีรัมย์", "ศรีสะเกษ", "อุบลราชธานี", "ขอนแก่น", "มหาสารคาม", "ร้อยเอ็ด", "กาฬสินธุ์", "อุดรธานี", "หนองคาย", "ยโสธร", "อำนาจเจริญ", "มุกดาหาร", "นครพนม", "เลย", "สกลนคร", "หนองบัวลำภู"],
    notes: ["ไปทุกจังหวัดในอีสาน ยกเว้น บึงกาฬ ชัยภูมิ"],
  },
  {
    name: "SB สมใจขนส่ง",
    code: "7",
    slug: "SBSomjaiTransport",
    provinces: ["เพชรบูรณ์", "นครสวรรค์", "พิจิตร", "ชัยนาท", "พิษณุโลก", "สุโขทัย", "กำแพงเพชร", "ตาก", "แพร่", "อุตรดิตถ์", "น่าน", "ลำปาง", "ลำพูน", "เชียงใหม่", "พะเยา", "เชียงราย", "แม่ฮ่องสอน", "ขอนแก่น", "นครราชสีมา", "อุดรธานี"],
    notes: ["ภาคเหนือทุกจังหวัด ไม่ทุกอำเภอ อีสาน อุดร ขอนแก่น โคราช ค่าขนส่งแต่ละจังหวัดไม่เท่ากันขึ้นอยู่กับระยะทางจังหวัด"],
  },
  {
    name: "พี.เจ. ด่วนอีสาน ขนส่ง",
    code: "15",
    slug: "P_J_ExpressIsaanTransport",
    provinces: ["ศรีสะเกษ", "สุรินทร์", "บุรีรัมย์", "มุกดาหาร", "อำนาจเจริญ", "ยโสธร", "อุบลราชธานี", "ร้อยเอ็ด", "มหาสารคาม", "ขอนแก่น", "นครราชสีมา", "อุดรธานี", "หนองคาย", "หนองบัวลำภู", "กาฬสินธุ์", "บึงกาฬ", "นครพนม", "สกลนคร"],
    notes: ["ไม่รับสาย", "ลองเช็คอีกครั้ง ว่า มี เลย, ชัยภูมิ เพราะขาดไป 2 จังหวัดจะครบ ทั้งภาคอีสาน"],
  },
  {
    name: "มะม่วงขนส่ง",
    code: "16",
    slug: "MangoTransport",
    provinces: ["นครสวรรค์", "อุทัยธานี", "ชัยนาท", "สิงห์บุรี", "นนทบุรี", "พระนครศรีอยุธยา", "อ่างทอง", "สุพรรณบุรี", "กาญจนบุรี", "เพชรบุรี", "ระยอง", "ลพบุรี", "สระบุรี", "สมุทรสาคร", "จันทบุรี", "ตราด"],
  },
  {
    name: "เคพีเอ็น",
    code: "9",
    slug: "KPN",
    provinces: ["ปทุมธานี", "พระนครศรีอยุธยา", "อ่างทอง", "สิงห์บุรี", "สุพรรณบุรี", "ชัยนาท", "สระบุรี", "ชลบุรี", "ฉะเชิงเทรา", "สมุทรสาคร", "นครปฐม", "ราชบุรี", "กาญจนบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์"],
  },
  {
    name: "PL ขนส่งด่วน",
    code: "23",
    slug: "PLExpressDelivery",
    provinces: ["กำแพงเพชร", "พิษณุโลก", "สุโขทัย", "เลย", "อุตรดิตถ์", "พิจิตร", "เพชรบูรณ์", "ปทุมธานี", "กรุงเทพมหานคร", "นครปฐม", "สมุทรปราการ", "นนทบุรี"],
  },
  {
    name: "เฟิร์ส เอ็กเพรส ขนส่ง",
    code: "10",
    slug: "FirstExpressTransport",
    provinces: ["เพชรบุรี", "ประจวบคีรีขันธ์", "ชุมพร", "ระนอง", "สุราษฎร์ธานี", "กระบี่", "ภูเก็ต", "นครศรีธรรมราช", "ตรัง", "พัทลุง", "สงขลา"],
  },
  {
    name: "นิ่มซี่เส็งขนส่ง 1988",
    code: "21",
    slug: "NimSeeSengTransport1988",
    provinces: ["เชียงใหม่", "ลำพูน", "ลำปาง", "แพร่", "น่าน", "พะเยา", "เชียงราย", "แม่ฮ่องสอน", "อุตรดิตถ์"],
    notes: ["ไม่รับสาย"],
  },
  {
    name: "วันชนะ แอนด์ วันณิสา ขนส่ง",
    code: "17",
    slug: "WanchanaandWannisaTransport",
    provinces: ["ชัยภูมิ", "นครราชสีมา"],
    provinceNotes: {
      "นครราชสีมา": "ไม่เข้าวังน้ำเขียว / บัวลาย / ลำทะเมนชัย",
    },
  },
  {
    name: "สมพงษ์อุบลรัตน์ ขนส่ง",
    code: "18",
    slug: "SompongUbonratTransport",
    provinces: ["ขอนแก่น", "มหาสารคาม", "กาฬสินธุ์"],
  },
  {
    name: "ธนาไพศาล ขนส่ง",
    code: "22",
    slug: "ThanapaisarnTransport",
    provinces: ["สระแก้ว", "จันทบุรี"],
    provinceNotes: {
      "จันทบุรี": "ไม่เข้าสอยดาว",
    },
    notes: ["เริ่มต้น 30"],
  },
  {
    name: "J.K. เอ็กซ์เพรส",
    code: "3",
    slug: "J_K_Express",
    provinces: ["สุพรรณบุรี", "กาญจนบุรี"],
  },
  {
    name: "S & J ขนส่งด่วนสุพรรณบุรี",
    code: "6",
    slug: "SandJExpressDeliverySuphanburi",
    provinces: ["สุพรรณบุรี"],
    notes: ["เริ่มต้น 100"],
  },
  {
    name: "ตองสอง ขนส่ง",
    code: "20",
    slug: "TongSongTransport",
    provinces: ["นครราชสีมา"],
  },
  {
    name: "อาร์.ซี.อาร์ เพลส",
    code: "19",
    slug: "R_C_R_Place",
    provinces: ["นครปฐม"],
  },
  {
    name: "ทรัพย์ปรีชา",
    code: "27",
    slug: "SappreechaTransportPart",
    provinces: ["ปัตตานี", "ยะลา", "นราธิวาส"],
    notes: ["ต้องแจ้งอำเภอก่อน", "เพราะไปบางอำเภอ"],
  },
  {
    name: "พัฒนาเอ็กส์เพลส",
    code: "28",
    slug: "PattanaExpressPlace",
    provinces: ["นราธิวาส", "ปัตตานี", "ยะลา"],
    provinceNotes: {
      "นราธิวาส": "ไป สุไหงโก-ลก / ตัวเมือง",
      "ปัตตานี": "ไป ตัวเมือง / โคกโพ",
      "ยะลา": "ไป ตัวเมือง",
    },
  },
  {
    name: "หาดใหญ่ทัวร์",
    code: "29",
    slug: "HatYaiTransportTour",
    provinces: ["ปัตตานี", "นราธิวาส", "ยะลา"],
    provinceNotes: {
      "ปัตตานี": "ไป ตัวเมือง / ปะนาเระ",
      "นราธิวาส": "ไป เจาะไอร้อง / ตัวเมือง / สุไหงโก-ลก",
      "ยะลา": "ไม่ไป เบตง / แว้ง / พื้นที่สีแดง",
    },
    notes: ["แว้งอยู่นาราธิวาส"],
  },
  {
    name: "PM ชลบุรี ขนส่งด่วน",
    code: "26",
    slug: "PMChonburi",
    provinces: ["ชลบุรี"],
  },
  {
    name: "อาร์.ซี.เอ็กซเพรส",
    code: "31",
    slug: "RCExpress",
    provinces: ["สุพรรณบุรี", "นครปฐม", "พระนครศรีอยุธยา"],
    provinceNotes: {
      "สุพรรณบุรี": "ทุกอำเภอ",
      "นครปฐม": "ส่งแค่บางเลน",
      "พระนครศรีอยุธยา": "ส่งแค่ราชบัวหลวง",
    },
    notes: ["ลาดบัวหลวง"],
  },
  {
    name: "หาดใหญ่ โอ.พี. 2012",
    code: "30",
    slug: "HatYaiOP2012",
    provinces: ["สงขลา"],
  },
  {
    name: "สี่สหาย",
    code: "32",
    slug: "SiSahai",
    provinces: ["ประจวบคีรีขันธ์", "เพชรบุรี", "สุราษฎร์ธานี", "นครศรีธรรมราช", "สงขลา", "ชุมพร", "พัทลุง", "ตรัง"],
  },
  {
    name: "แพปลาสมบัติวัฒนา",
    code: "33",
    slug: "PaePlaSombatWattana",
    provinces: ["ปัตตานี"],
  },
  {
    name: "ทวีทรัพย์ระยอง ขนส่ง",
    code: "34",
    slug: "TaweeSapRayong",
    provinces: ["ระยอง"],
  },
];

/**
 * Normalise a raw address province string → canonical, or "" when unknown.
 *
 * Handles what prod actually stores (probed 2026-07-14):
 *   "จ.ชลบุรี" · "จังหวัดสมุทรปราการ" · "กทม." · "กรุงเทพฯมหานคร" · "เชียงราย\u200b"
 *
 * ⚠ The "จ." strip REQUIRES the dot — an optional-dot `^จ\.?` would eat the
 * leading จ of "จันทบุรี".
 */
export function canonicalProvince(raw: string | null | undefined): string {
  const t = String(raw ?? "")
    .replace(/[\u200b-\u200f\u2060\ufeff\u00a0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^จ\.\s*/, "")
    .replace(/^จังหวัด\s*/, "")
    .replace(/ฯ/g, "")   // กรุงเทพฯ · กรุงเทพฯมหานคร
    .replace(/\.+$/, "") // กทม.
    .trim();
  if (!t) return "";
  if (isThaiProvince(t)) return t;
  return PROVINCE_ALIASES[t] ?? "";
}

/** Every carrier that serves `province` (canonicalised on the way in). */
export function carriersForProvince(
  province: string | null | undefined,
): CarrierCoverage[] {
  const p = canonicalProvince(province);
  if (!p) return [];
  return CARRIER_PROVINCE_COVERAGE.filter((c) => c.provinces.includes(p));
}

/** The provinces one carrier serves (by name or by fshipby code). */
export function provincesForCarrier(
  nameOrCode: string,
): string[] {
  const hit = CARRIER_PROVINCE_COVERAGE.find(
    (c) => c.name === nameOrCode || c.code === nameOrCode,
  );
  return hit ? [...hit.provinces] : [];
}

/** The restriction note (if any) for this carrier in this province. */
export function carrierProvinceNote(
  nameOrCode: string,
  province: string | null | undefined,
): string {
  const p = canonicalProvince(province);
  const hit = CARRIER_PROVINCE_COVERAGE.find(
    (c) => c.name === nameOrCode || c.code === nameOrCode,
  );
  return (p && hit?.provinceNotes?.[p]) || "";
}
