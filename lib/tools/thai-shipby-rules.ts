/**
 * เช็คบริษัทขนส่งไทย ที่ให้บริการตามจังหวัด/อำเภอ — faithful port of legacy
 * `pcs-admin/check-shipby.php` (L57-574).
 *
 * The legacy page reads the จังหวัด/อำเภอ from a zip via the jquery.Thailand
 * raw_database.json, then walks a long chain of hardcoded
 * `if (in_array($province, [...])) → add carrier {id,name}` rules. Flash
 * Express (id 2) is ALWAYS available. We reproduce every rule 1:1 (incl. the
 * few province+amphoe combined conditions).
 *
 * Pure / no DB — the only input is {province, amphoe} (the caller resolves
 * those from a zip using the same raw_database the legacy used).
 */

export type ShipByCarrier = { id: string; name: string };

// ── Region constants (legacy L74-77) ────────────────────────────────────────
const SOUTH = [
  "กระบี่", "ชุมพร", "ตรัง", "นครศรีธรรมราช", "นราธิวาส", "ปัตตานี", "พังงา",
  "พัทลุง", "ภูเก็ต", "ระนอง", "สตูล", "สงขลา", "สุราษฎร์ธานี", "ยะลา",
];
const NORTH = [
  "เชียงราย", "เชียงใหม่", "น่าน", "พะเยา", "แพร่", "แม่ฮ่องสอน", "ลำปาง",
  "ลำพูน", "อุตรดิตถ์",
];
const CENTRAL = [
  "กรุงเทพมหานคร", "กำแพงเพชร", "ชัยนาท", "นครนายก", "นครปฐม", "นครสวรรค์",
  "นนทบุรี", "ปทุมธานี", "พระนครศรีอยุธยา", "พิจิตร", "พิษณุโลก", "เพชรบูรณ์",
  "ลพบุรี", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สิงห์บุรี", "สุโขทัย",
  "สุพรรณบุรี", "สระบุรี", "อ่างทอง", "อุทัยธานี",
];
const NORTHEAST = [
  "กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ", "บุรีรัมย์",
  "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "สกลนคร", "สุรินทร์",
  "ศรีสะเกษ", "หนองคาย", "หนองบัวลำภู", "อุดรธานี", "อุบลราชธานี", "อำนาจเจริญ",
];

// Region constants exposed read-only so the UI can show "ภาคต้นทาง" context.
export const THAI_REGIONS = { SOUTH, NORTH, CENTRAL, NORTHEAST } as const;

const has = (arr: readonly string[], v: string) => arr.includes(v);

/**
 * Resolve the list of carriers that serve a given {province, amphoe}.
 * Faithful 1:1 walk of the legacy if-chain (L68-562). Flash Express is the
 * base option (always present), exactly like the legacy `$shipByOption`.
 */
export function resolveShipByCarriers(province: string, amphoe: string): ShipByCarrier[] {
  const out: ShipByCarrier[] = [{ id: "2", name: "Flash Express" }];
  const push = (id: string, name: string) => out.push({ id, name });

  // ธนามัย ขนส่งด่วน (id 13) — ภาคอีสาน
  if (has(NORTHEAST, province)) push("13", "ธนามัย ขนส่งด่วน");

  // มะม่วงขนส่ง (16)
  const mango = ["นครสวรรค์", "อุทัยธานี", "ชัยนาท", "สิงห์บุรี", "นนทบุรี", "อยุธยา", "อ่างทอง", "สุพรรณบุรี", "กาญจนบุรี", "เพชรบุรี", "ระยอง", "ลพบุรี", "สระบุรี", "สมุทรสาคร", "จันทบุรี", "ตราด"];
  if (has(mango, province)) push("16", "มะม่วงขนส่ง");

  // SB สมใจขนส่ง (7) — อีสาน + จังหวัดเพิ่ม
  const sbSomjai = [...NORTHEAST, "เพชรบูรณ์", "นครสวรรค์", "พิจิตร", "ชัยนาท", "พิษณุโลก", "สุโขทัย", "กำแพงเพชร", "ตาก", "อุดรธานี", "ขอนแก่น"];
  if (has(sbSomjai, province)) push("7", "SB สมใจขนส่ง");

  // เคพีเอ็น (9)
  const kpn = ["ปทุมธานี", "อยุธยา", "อ่างทอง", "สิงห์บุรี", "สุพรรณบุรี", "ชัยนาท", "สระบุรี", "ชลบุรี", "ฉะเชิงเทรา", "สมุทรสาคร", "นครปฐม", "ราชบุรี", "กาญจนบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์"];
  if (has(kpn, province)) push("9", "เคพีเอ็น");

  // จันทร์สว่างขนส่ง (12) — อีสาน + เพิ่ม
  const chansawang = [...NORTHEAST, "นครปฐม", "กาญจนบุรี", "ราชบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์", "ชลบุรี", "ฉะเชิงเทรา", "ระยอง", "จันทบุรี", "นครนายก", "ปราจีนบุรี", "สระแก้ว"];
  if (has(chansawang, province)) push("12", "จันทร์สว่างขนส่ง");

  // บุญอนันต์ขนส่ง (14)
  const boonanan = ["กาฬสินธุ์", "ขอนแก่น", "นครพนม", "นครราชสีมา", "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "สกลนคร", "สุรินทร์", "ศรีสะเกษ", "หนองคาย", "หนองบัวลำภู", "อุดรธานี", "อุบลราชธานี", "อำนาจเจริญ"];
  if (has(boonanan, province)) push("14", "บุญอนันต์ขนส่ง");

  // เฟิร์ส เอ็กเพรส ขนส่ง (10)
  const firstExpress = ["เพชรบุรี", "ประจวบคีรีขันธ์", "ชุมพร", "ระนอง", "สุราษฎร์ธานี", "กระบี่", "ภูเก็ต", "นครศรีธรรมราช", "ตรัง", "พัทลุง", "สงขลา"];
  if (has(firstExpress, province)) push("10", "เฟิร์ส เอ็กเพรส ขนส่ง");

  // พี.เจ. ด่วนอีสาน ขนส่ง (15)
  const pjIsaan = ["กาฬสินธุ์", "ขอนแก่น", "", "นครราชสีมา", "นครพนม", "บึงกาฬ", "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "", "ศรีสระเกษ", "สกลนคร", "สุรินทร์", "หนองคาย", "หนองบัว", "อำนาจเจริญ", "อุดรธานี", "อุบลราชธานี"];
  if (has(pjIsaan, province)) push("15", "พี.เจ. ด่วนอีสาน ขนส่ง");

  // นิ่มซี่เส็งขนส่ง 1988 (21) — ภาคเหนือ
  if (has(NORTH, province)) push("21", "นิ่มซี่เส็งขนส่ง 1988");

  // PL ขนส่งด่วน (23)
  const plExpress = ["กรุงเทพมหานคร", "กำแพงเพชร", "นครปฐม", "นนทบุรี", "ปทุมธานี", "พิจิตร", "พิษณุโลก", "พิษณุโลก", "เพชบูรณ์", "เลย", "สุโขทัย", "สมุทรปราการ", "อุตรดิตถ์"];
  if (has(plExpress, province)) push("23", "PL ขนส่งด่วน");

  // วันชนะ แอนด์ วันณิสา ขนส่ง (17) — province in [ชัยภูมิ,นครราชสีมา] AND amphoe NOT in [วังน้ำเขียว,บัวลาย,ลำทะเมนชัย]
  const wanchana = ["ชัยภูมิ", "นครราชสีมา"];
  const wanchanaExcludeAmphoe = ["วังน้ำเขียว", "บัวลาย", "ลำทะเมนชัย"];
  if (has(wanchana, province) && !has(wanchanaExcludeAmphoe, amphoe)) push("17", "วันชนะ แอนด์ วันณิสา ขนส่ง");

  // สมพงษ์อุบลรัตน์ ขนส่ง (18)
  const sompong = ["ขอนแก่น", "มหาสารคาม", "กาฬสินธุ์"];
  if (has(sompong, province)) push("18", "สมพงษ์อุบลรัตน์ ขนส่ง");

  // ธนาไพศาล ขนส่ง (22) — province in [สระแก้ว,จันทบุรี] AND amphoe NOT สอยดาว
  const thanapaisarn = ["สระแก้ว", "จันทบุรี"];
  if (has(thanapaisarn, province) && !has(["สอยดาว"], amphoe)) push("22", "ธนาไพศาล ขนส่ง");

  // J.K. เอ็กซ์เพรส → legacy bug: this rule pushes id 18 / สมพงษ์อุบลรัตน์ again
  // for [สุพรรณบุรี,กาญจนบุรี]. Ported faithfully (the legacy displays a dup).
  const jk = ["สุพรรณบุรี", "กาญจนบุรี"];
  if (has(jk, province)) push("18", "สมพงษ์อุบลรัตน์ ขนส่ง");

  // S & J ขนส่งด่วนสุพรรณบุรี (6)
  const sandj = ["สุพรรณบุรี", "กาญจนบุรี"];
  if (has(sandj, province)) push("6", "S & J ขนส่งด่วนสุพรรณบุรี");

  // ตองสอง ขนส่ง (20) — [สระบุรี,อยุธยา] OR (นครราชสีมา with specific amphoe)
  const tongSong = ["สระบุรี", "อยุธยา"];
  const tongSongKoratAmphoe = ["โคราช", "เมืองนครราชสีมา", "โชคชัย", "ขามทะเลสอ", "สีคิ้ว", "สูงเนิน", "ปากช่อง", "ด่านขุนทด"];
  if (has(tongSong, province) || (has(["นครราชสีมา"], province) && has(tongSongKoratAmphoe, amphoe))) push("20", "ตองสอง ขนส่ง");

  // อาร์.ซี.อาร์ เพลส (19)
  if (has(["นครปฐม"], province)) push("19", "อาร์.ซี.อาร์ เพลส");

  // PM ชลบุรี ขนส่งด่วน (26)
  if (has(["ชลบุรี"], province)) push("26", "PM ชลบุรี ขนส่งด่วน");

  // ทรัพย์ปรีชา (27)
  const sappreecha = ["ปัตตานี", "ยะลา", "นราธิวาส"];
  if (has(sappreecha, province)) push("27", "ทรัพย์ปรีชา");

  // พัฒนาเอ็กซ์เพลส (28) — province in 3 จว.ใต้ AND amphoe in list
  const pattanaProvince = ["ปัตตานี", "ยะลา", "นราธิวาส"];
  const pattanaAmphoe = ["สุไหงโก-ลก", "เมืองนราธิวาส", "โคกโพธิ์", "เมืองปัตตานี", "เมืองยะลา"];
  if (has(pattanaProvince, province) && has(pattanaAmphoe, amphoe)) push("28", "พัฒนาเอ็กซ์เพลส");

  // หาดใหญ่ทัวร์ (29) — province in 3 จว.ใต้ AND amphoe in list
  const hatyaiTourProvince = ["ปัตตานี", "ยะลา", "นราธิวาส"];
  const hatyaiTourAmphoe = ["เมืองปัตตานี", "ปะนาเระ", "เจาะไอร้อง", "เมืองนราธิวาส", "สุไหงโก-ลก", "เมืองยะลา", "ยะหา", "กรงปินัง", "รามัน", "บันนังสตา", "กาบัง", "ธารโต"];
  if (has(hatyaiTourProvince, province) && has(hatyaiTourAmphoe, amphoe)) push("29", "หาดใหญ่ทัวร์");

  // หาดใหญ่ โอ.พี. 2012 (30)
  const hatyaiOp = ["สงขลา"];
  if (has(hatyaiOp, province)) push("30", "หาดใหญ่ โอ.พี. 2012");

  // อาร์.ซี.เอ็กซเพรส (31) — province สุพรรณบุรี OR amphoe in [บางเลน,ลาดบัวหลวง]
  if (has(["สุพรรณบุรี"], province) || has(["บางเลน", "ลาดบัวหลวง"], amphoe)) push("31", "อาร์.ซี.เอ็กซเพรส");

  // สี่สหาย (32) — legacy faithfully checks $hatyaiOp (สงขลา) here, not $comrade4.
  if (has(hatyaiOp, province)) push("32", "สี่สหาย");

  // แพปลา​สมบัติ​วัฒนา (33)
  if (has(["ปัตตานี"], province)) push("33", "แพปลา​สมบัติ​วัฒนา");

  // ทวีทรัพย์ระยอง ขนส่ง (34)
  if (has(["ระยอง"], province)) push("34", "ทวีทรัพย์ระยอง ขนส่ง");

  // ศิริสมบูรณ์ (35)
  if (has(["ตาก"], province)) push("35", "ศิริสมบูรณ์");

  // นิวสอง อัศวินขนส่ง (36)
  if (has(["ระยอง"], province)) push("36", "นิวสอง อัศวินขนส่ง");

  // โชคสถาพรขนส่ง (37)
  if (has(["พังงา"], province)) push("37", "โชคสถาพรขนส่ง");

  // ทรัพย์สมบูรณ์ถาวร (38)
  const sapsomboon = ["เพชรบุรี", "ประจวบคีรีขันธ์", "สกลนคร", "นครพนม", "กาฬสินธุ์", "อุดรธานี", "มหาสารคาม", "มุกดาหาร"];
  if (has(sapsomboon, province)) push("38", "ทรัพย์สมบูรณ์ถาวร");

  // MNB Transport (39)
  if (has(["เชียงราย"], province)) push("39", "MNB Transport");

  // หจก.โชคพูลทรัพย์ขนส่ง 2014 (40)
  if (has(["เชียงราย"], province)) push("40", "หจก.โชคพูลทรัพย์ขนส่ง 2014");

  // สิรินครขนส่ง (41)
  const sirinakorn = ["อุบลราชธานี", "ศรีสะเกษ", "สุรินทร์", "บุรีรัมย์", "ยโสธร", "อำนาจเจริญ", "นครราชสีมา", "ขอนแก่น", "กาฬสินธุ์", "มหาสารคาม", "ร้อยเอ็ด", "ชัยภูมิ", "สกลนคร", "นครพนม", "มุกดาหาร", "อุดรธานี", "หนองบัวลำภู", "เลย", "บึงกาฬ", "หนองคาย"];
  if (has(sirinakorn, province)) push("41", "สิรินครขนส่ง");

  // พาณิชย์การขนส่ง KSD (42)
  const paanit = ["พิษณุโลก", "พิจิตร", "สุโขทัย", "กำแพงเพชร", "อุตรดิตถ์", "แพร่", "เพชรบูรณ์", "ตาก", "น่าน", "ลำพูน", "เลย", "เชียงใหม่"];
  if (has(paanit, province)) push("42", "พาณิชย์การขนส่ง KSD");

  // นวรรณขนส่ง (43)
  if (has(["สระแก้ว"], province)) push("43", "นวรรณขนส่ง");

  // กุญชรมณี ขนส่ง (44)
  const kuncharamani = ["เชียงใหม่", "ขอนแก่น", "ลำปาง"];
  if (has(kuncharamani, province)) push("44", "กุญชรมณี ขนส่ง");

  // เอ็มพอร์ท โลจิสติกส์ (45)
  const mport = ["เชียงใหม่", "เชียงราย", "ลำพูน", "ลำปาง", "แพร่", "น่าน", "พะเยา", "แม่ฮ่องสอน"];
  if (has(mport, province)) push("45", "เอ็มพอร์ท โลจิสติกส์");

  // ซี.เอ็น.ทรานสปอร์ต (46)
  const cn = ["ชลบุรี", "ระยอง"];
  if (has(cn, province)) push("46", "ซี.เอ็น.ทรานสปอร์ต");

  return out;
}

/**
 * Full carrier list shown in the legacy "หมายเหตุ" panel (L582-621), kept as
 * a static reference of every carrier the system knows about.
 */
export const ALL_SHIPBY_CARRIERS: readonly string[] = [
  "Flash Express", "J&T Express", "ธนามัย ขนส่งด่วน", "จันทร์สว่างขนส่ง",
  "บุญอนันต์ขนส่ง", "SB สมใจขนส่ง", "พี.เจ. ด่วนอีสาน ขนส่ง", "มะม่วงขนส่ง",
  "เคพีเอ็น", "PL ขนส่งด่วน", "เฟิร์ส เอ็กเพรส ขนส่ง", "นิ่มซี่เส็งขนส่ง 1988",
  "วันชนะ แอนด์ วันณิสา ขนส่ง", "สมพงษ์อุบลรัตน์ ขนส่ง", "ธนาไพศาล ขนส่ง",
  "J.K. เอ็กซ์เพรส", "S & J ขนส่งด่วนสุพรรณบุรี", "ตองสอง ขนส่ง",
  "อาร์.ซี.อาร์ เพลส", "ทรัพย์ปรีชา", "พัฒนาเอ็กส์เพลส", "หาดใหญ่ทัวร์",
  "PM ชลบุรี ขนส่งด่วน", "หาดใหญ่ โอ.พี. 2012", "อาร์.ซี.เอ็กซเพรส", "สี่สหาย",
  "แพปลา​สมบัติ​วัฒนา", "ทวีทรัพย์ระยอง ขนส่ง", "ศิริสมบูรณ์", "นิวสอง อัศวินขนส่ง",
  "โชคสถาพรขนส่ง", "ทรัพย์สมบูรณ์ถาวร", "MNB Transport", "หจก.โชคพูลทรัพย์ขนส่ง 2014",
  "สิรินครขนส่ง", "พาณิชย์การขนส่ง KSD", "นวรรณขนส่ง", "กุญชรมณี ขนส่ง",
  "เอ็มพอร์ท โลจิสติกส์", "ซี.เอ็น.ทรานสปอร์ต",
];

export type ProvinceLookup = { province: string; amphoe: string; district: string } | null;

/**
 * Resolve {province, amphoe} from a 5-digit zip using the same
 * jquery.Thailand raw_database the legacy used (returns the FIRST match, like
 * legacy array_search). Reads the JSON from /public on demand (server-only).
 */
export async function lookupProvinceByZip(zip: string): Promise<ProvinceLookup> {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  const zipNum = Number(trimmed);

  // Lazy import so this heavy file/module isn't pulled into client bundles.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(
    process.cwd(),
    "public",
    "legacy",
    "pcs",
    "assets",
    "plugins",
    "jquery.Thailand.js",
    "database",
    "raw_database",
    "raw_database.json",
  );
  try {
    const raw = await fs.readFile(file, "utf8");
    const rows = JSON.parse(raw) as Array<{
      district: string;
      amphoe: string;
      province: string;
      zipcode: number;
    }>;
    const hit = rows.find((r) => r.zipcode === zipNum);
    if (!hit) return null;
    return { province: hit.province, amphoe: hit.amphoe, district: hit.district };
  } catch (err) {
    console.error("[thai-shipby] raw_database read failed", err);
    return null;
  }
}
