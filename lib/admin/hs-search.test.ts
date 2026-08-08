/**
 * hs-search.test.ts — ล็อกการค้นหาคลังพิกัด (owner 2026-08-08)
 * เคสทั้งหมดมาจาก **คำที่พนักงานพิมพ์จริงในแชทถามพิกัด** (ห้ามกุ).
 */
import {
  normalizeHs, digitsOnly, expandSynonyms, editDistance, fuzzyBudget,
  matchHsRow, searchHsRows, type HsSearchable,
} from "./hs-search";

let pass = 0, fail = 0;
const eq = <T,>(got: T, want: T, label: string) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label} — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
};
/** ช่วยอ่านง่าย: เจอไหม (ไม่สนว่าชั้นไหน) */
const hit = (row: HsSearchable, q: string) => matchHsRow(row, q) !== null;

// ── แถวจริงจากคลัง (หลัง ingest แชท 2026-08-08) ──
const sticker: HsSearchable = {
  code: "3919.10.99", description: "สติกเกอร์", description_en: "Label Sticker",
  product_aliases: ["Label Sticker", "กระดาษสติ๊กเกอร์"],
};
const steering: HsSearchable = {
  code: "8708.94.95", description: "Steering Wheel/พวงมาลัยรถยนตร์",
  product_aliases: ["พวงมาลัยรถยนตร์"], hs_note: "อากร 30",
};
const solar: HsSearchable = {
  code: "8541.43.00.00", description: "Solar Panel/แผงโซลาร์เซลล์",
  product_aliases: ["แผงโซล่าเซลล์", "โซล่าเซลเปล่าๆไม่มีแบต"],
};
const pallet: HsSearchable = {
  code: "3923.10.20", description: "Pallets พาเลท", product_aliases: ["พาเรท"],
};
const closer: HsSearchable = {
  code: "8302.60.00.00", description: "โช้คอัพประตู (Door Closer)",
  product_aliases: ["โช้คอัพประตู (Door Closer)"],
};
const catLitter: HsSearchable = {
  code: "2508.10.00.00", description: "เบนทอไนต์/Bentonite cat litter",
  product_aliases: ["ทรายแมวภูเขาไฟ"],
};
const ALL = [sticker, steering, solar, pallet, closer, catLitter];

// ── normalize ──
eq(normalizeHs("สติ๊กเกอร์"), normalizeHs("สติกเกอร์"), "วรรณยุกต์ต่างกัน = คำเดียวกัน");
eq(normalizeHs("ตลับกุญเเจ"), normalizeHs("ตลับกุญแจ"), "เเ (สระเอ 2 ตัว) = แ");
eq(normalizeHs("Door  Closer"), "doorcloser", "ตัดช่องว่าง + ตัวพิมพ์เล็ก");
eq(normalizeHs("กระดาษทราย (กลมหลังสักหลาด)"), normalizeHs("กระดาษทรายกลมหลังสักหลาด"), "ตัดวงเล็บ + สระบน-ล่าง = คำเดียวกัน");
eq(normalizeHs(null), "", "null = ว่าง");
eq(digitsOnly("4202.29"), "420229", "ตัดจุดออกจากเลขพิกัด");

// ── เลขพิกัด: พิมพ์คนละรูปแบบต้องเจอ ──
eq(matchHsRow(solar, "8541.43")?.kind, "code", "พิมพ์มีจุด → เจอแถวที่เก็บแบบมีจุด");
eq(matchHsRow(solar, "85414300")?.kind, "code", "พิมพ์ติดกัน → เจอ");
eq(matchHsRow({ code: "42022900" }, "4202.29")?.kind, "code", "พิมพ์มีจุด → เจอแถวที่เก็บติดกัน");
eq(hit(solar, "9999.99"), false, "เลขที่ไม่ใช่ = ไม่เจอ");

// ── ① สะกดไทยหลายแบบ (เคสที่ owner ยกมาตอน 08-03) ──
eq(hit(sticker, "สติ๊ก"), true, "พิมพ์ 'สติ๊ก' ต้องเจอ 'สติกเกอร์'");
eq(hit(sticker, "สติกเกอร์"), true, "พิมพ์เต็มแบบไม่มีไม้ตรี");
eq(hit(sticker, "สติ้กเกอร์"), true, "สะกดแบบที่ 3");
eq(hit(closer, "โช๊คอัพ"), true, "โช๊ค (ไม้ตรี) ต้องเจอ โช้ค (ไม้โท)");
eq(hit(solar, "โซล่า"), true, "พิมพ์แค่บางส่วน 'โซล่า' → เจอ แผงโซลาร์เซลล์");

// ── ② พิมพ์ผิดจริง ──
eq(matchHsRow(steering, "พวงมาลัยรถยนต์")?.kind, "exact", "ตร/ต์ ต่างกัน → normalize แล้วเป็น prefix ของกันและกัน = ตรงคำ");
eq(hit(pallet, "พาเรท"), true, "พาเรท (สะกดผิดที่ใช้จริงในแชท) → เจอ Pallets");
eq(hit(pallet, "พาเลท"), true, "พาเลท → เจอ");
eq(hit(sticker, "สติกเกอรื"), true, "พิมพ์ผิดตัวท้าย (fuzzy)");
eq(matchHsRow(sticker, "สติกเกอรื")?.kind, "exact", "…สระที่พิมพ์เกินถูกตัดตอน normalize เลยกลายเป็นตรงคำ (ดีกว่าเดา)");

// ── ③ เรียกคนละคำ (คำพ้อง) ──
eq(hit(sticker, "ลาเบล"), true, "ลาเบล = สติกเกอร์");
eq(hit(sticker, "label"), true, "label (อังกฤษ) = สติกเกอร์");
eq(hit(catLitter, "cat litter"), true, "อังกฤษ 2 คำ");
eq(hit(catLitter, "ทรายแมว"), true, "ไทย → เจอแถวที่ description เป็นอังกฤษ");
eq(hit(catLitter, "เบนทอไนต์"), true, "ชื่อวัตถุดิบ");

// ── ④ ลำดับคำสลับ / หลายคำ ──
eq(hit(closer, "ประตู โช้คอัพ"), true, "สลับลำดับคำ ยังเจอ");
eq(hit(closer, "closer door"), true, "อังกฤษสลับลำดับ");
eq(hit(closer, "โช้คอัพ หน้าต่าง"), false, "มีคำที่ไม่เกี่ยวปน = ไม่เจอ (ไม่มั่ว)");

// ── ⑤ ต้องไม่กว้างเกินจนมั่ว ──
eq(fuzzyBudget("ท่อ"), 0, "คำสั้น 3 ตัว = ห้ามเดา (ไม่งั้นแมตช์ทุกอย่าง)");
eq(fuzzyBudget("สติกเกอร์"), 2, "คำยาว = ยอมพลาดได้ 2 ตัว");
eq(fuzzyBudget("พาเลท"), 1, "คำกลาง = 1 ตัว");
eq(hit(steering, "ทรายแมว"), false, "คำคนละเรื่อง = ไม่เจอ");
eq(hit(solar, "xyzzy"), false, "คำมั่ว = ไม่เจอ");

// ── ระยะแก้ไข ──
eq(editDistance("abc", "abc", 2), 0, "เหมือนกัน = 0");
eq(editDistance("abc", "abd", 2), 1, "ต่าง 1 ตัว");
eq(editDistance("abc", "xyz", 2), 3, "ต่างหมด = เกินเพดาน");
eq(editDistance("a", "abcdefgh", 2), 3, "ยาวต่างกันมาก = ตัดจบเร็ว");

// ── คำพ้อง ──
eq(expandSynonyms("pallet").includes(normalizeHs("พาเรท")), true, "อังกฤษ→ไทย ในกลุ่มเดียวกัน");
eq(expandSynonyms("คำที่ไม่มีในกลุ่ม"), [normalizeHs("คำที่ไม่มีในกลุ่ม")], "ไม่มีกลุ่ม = คืนตัวเอง");

// ── การเรียงผล: ตรงกว่าอยู่บน ──
{
  const res = searchHsRows(ALL, "สติกเกอร์");
  eq(res[0]?.code, "3919.10.99", "ค้นชื่อ → แถวที่ตรงอยู่บนสุด");
  eq(res.length, 1, "ไม่ลากแถวอื่นมาด้วย");
}
{
  const res = searchHsRows(ALL, "");
  eq(res.length, ALL.length, "คำค้นว่าง = คืนทุกแถว");
}
{
  const res = searchHsRows(ALL, "โซล่า");
  eq(res[0]?.code, "8541.43.00.00", "พิมพ์บางส่วน → เจอแถวถูก");
}


// ── การเรียง "ตรงสุด → ใกล้สุด" (owner 2026-08-08 "ตอนนี้ดูเรียงมาข้ามๆ งง") ──
{
  const rows: HsSearchable[] = [
    { code: "9999.99.99", description: "ฟิล์มกันรอยติดกระจกรถยนต์แบบสติกเกอร์พิเศษ" }, // ชื่อยาว คำที่พิมพ์เป็นส่วนน้อย
    { code: "4821.10.90", description: "กระดาษสติ๊กเกอร์" },                            // มีคำอยู่กลาง
    { code: "3919.10.99", description: "สติกเกอร์" },                                  // ตรงเป๊ะทั้งชื่อ
    { code: "3919.90.99", description: "สติกเกอร์ม้วนใหญ่" },                            // ขึ้นต้นตรง
  ];
  const order = searchHsRows(rows, "สติกเกอร์").map((r) => r.code);
  eq(order[0], "3919.10.99", "ตรงเป๊ะทั้งชื่อ = บนสุด");
  eq(order[1], "3919.90.99", "ขึ้นต้นด้วยคำที่พิมพ์ = ถัดมา");
  eq(order[3], "9999.99.99", "ชื่อยาวมาก คำที่พิมพ์เป็นส่วนน้อย = ล่างสุด");
  eq(
    searchHsRows(rows, "สติกเกอร์").every((r, i, a) => i === 0 || a[i - 1].match.score >= r.match.score || a[i - 1].match.rank < r.match.rank),
    true,
    "คะแนนความใกล้ไล่จากมาก→น้อย ไม่กระโดด",
  );
}
{
  // เลขพิกัด: พิมพ์ครบกว่า = ใกล้กว่า
  const rows: HsSearchable[] = [
    { code: "42022900", description: "กระเป๋า" },
    { code: "4202", description: "หมวดกระเป๋า" },
  ];
  eq(searchHsRows(rows, "4202")[0]?.code, "4202", "พิมพ์ 4202 → แถวที่เป็น 4202 พอดี อยู่บน");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} hs-search: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
