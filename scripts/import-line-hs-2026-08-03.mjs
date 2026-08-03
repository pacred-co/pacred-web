// ════════════════════════════════════════════════════════════════════
// import-line-hs-2026-08-03 — อัพพิกัดจากแชท LINE "ถามพิกัด" 2 กลุ่ม
// ════════════════════════════════════════════════════════════════════
// Owner 2026-08-03: "มีไฟล์เพิ่มมาให้ พิกัด ชื่อไทย ชื่ออังกฤษ เอาไปอัพเพิ่มเข้าระบบ"
// Source = [LINE]ถามพิกัด PCS.txt + [LINE]ถามพิกัด Pacred.txt (ก.ค.–ส.ค. 2026)
// — คำตอบของทีม DOC (Win/Gring/Pasit) ต่อคำถามพิกัดจริงหน้างาน. สกัดมือทีละ
// รายการ (แชทฟอร์แมตหลวมเกินกว่าจะ parse อัตโนมัติแล้วเชื่อได้).
//
// กติกาเขียน (ตาราง SOT เดียว hs_codes · mig 0285):
//   • จับคู่แถวเดิมด้วย hs8_key (exact-digit ก่อน · padded ตาม) —
//   • เจอแถวเดิม: เติมชื่อสินค้าเป็น product_aliases (src:'line' · dedupe) ·
//     อากรจากทีม DOC = คำตอบที่ยืนยันแล้ว → เติมเฉพาะแถวที่ยังไม่ยืนยัน
//     (duty_confirmed=false → set + confirm) · แถวที่ยืนยันแล้วแต่เลขต่าง →
//     ไม่ทับ แค่ append hs_note ให้ทีมเห็นว่าแชทตอบต่างจากคลัง
//   • ไม่เจอ: INSERT แถวใหม่ (source='LINE' · duty_confirmed ตามว่ามีอากรไหม)
//
//   node --env-file=.env.local scripts/import-line-hs-2026-08-03.mjs           # dry-run
//   node --env-file=.env.local scripts/import-line-hs-2026-08-03.mjs --apply
//
// Idempotent: alias dedupe + duty เติมเฉพาะยังไม่ยืนยัน + note append เช็ค includes.
// ════════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── entries สกัดจากแชท (code · th · en · duty% · fe% · note · aliases เพิ่มเติม) ──
const E = [
  // ── [LINE]ถามพิกัด PCS ──
  { code: "8536.90",    th: "คอนเนคเตอร์", en: "CONNECTOR", aliases: [{ th: "ลิมิตสวิทช์" }] },
  { code: "8708.94.95", th: "พวงมาลัยรถยนต์", en: "STEERING WHEEL", duty: 30 },
  { code: "8479.8969",  th: "เครื่องกั้นทางเดิน", en: "SWING GATE", duty: 0 },
  { code: "8427.9000",  th: "อุปกรณ์อเนกประสงค์สำหรับยกและเทถัง", en: "DRUM LIFTER AND TILTER", duty: 5, fe: 0 },
  { code: "903289",     th: "กล่องควบคุม", en: "CONTROLLER", duty: 10, fe: 0,
    note: "จอยสติ๊ก ติด มอก. → เลี่ยงชื่อเป็น Controller-กล่องควบคุม", aliases: [{ th: "จอยสติ๊ก" }] },
  { code: "87082999",   th: "ส่วนประกอบรถ (กรอบไฟเลี้ยว/อะไหล่)", en: "CAR ACCESSORIES", duty: 30, fe: 0 },
  { code: "7323.99.90", th: "ถาด (ถาดรองน้ำชาไม้ไผ่)", en: "TRAY", duty: 20, fe: 0 },
  { code: "392330",     th: "ขวดพลาสติก", en: "PLASTIC BOTTLES", duty: 20, fe: 0, aliases: [{ th: "แพ็คเกจขวด" }] },
  { code: "842230",     th: "เครื่องอัดแบบแมนนวล", en: "MANUAL PRESS MACHINE",
    aliases: [{ th: "เครื่องย้ำและปิดผนึกฝาอลูมิเนียม", en: "CAP CRIMPING AND SEALING MACHINES" }, { th: "เครื่องผสมระบบลม", en: "MIXER" }] },
  { code: "7323.93",    th: "ไม้พายสแตนเลส", en: "MIXING PADDLE", duty: 20, fe: 0 },
  { code: "85049090",   th: "ตัวจ่ายไฟ", en: "POWER SUPPLY", duty: 0, note: "สินค้าติดใบอนุญาต (เคสแบตรถ shuttle car)" },
  { code: "4819.50.00", th: "หลอดบรรจุลูกแบด", en: "PAPER TUBES", duty: 10,
    note: "⚠️ กระดาษ/ของทำจากกระดาษ บางชนิดเริ่มโดน สมอ. ประกาศใหม่ (07/2026) — เช็คพิกัดใหม่ทุกครั้ง" },
  { code: "621132",     th: "เสื้อเซฟตี้", en: "SAFETY VEST", duty: 30, fe: 0 },
  { code: "845090",     th: "ส่วนประกอบเครื่องซักผ้า/อบแห้ง", en: "PARTS OF WASHING/DRYING MACHINE", duty: 10, fe: 0,
    note: "ถ้าเข้าเป็นเครื่อง (ทั้งเครื่อง) ติดใบอนุญาต" },
  { code: "871680",     th: "รถเข็นพื้นเหล็ก", en: "TROLLEY", duty: 0 },
  { code: "8714.10",    th: "อะไหล่และอุปกรณ์ตกแต่งรถจักรยานยนต์", en: "VEHICLES SPARE PARTS AND ACCESSORIES", duty: 30 },
  { code: "3925.10.00", th: "ถังสำหรับผสม (สารเคมี)", en: "MIXING TANK", duty: 30, fe: 0 },
  { code: "4811.1090",  th: "กระดาษคราฟ", en: "KRAFT PAPER", duty: 3 },
  // ── [LINE]ถามพิกัด Pacred ──
  { code: "8501.32.25", th: "มอเตอร์", en: "MOTOR", duty: 0 },
  { code: "3919.10.99", th: "สติกเกอร์", en: "LABEL STICKER", duty: 5, fe: 0, aliases: [{ th: "สติ๊กเกอร์ติดป้ายไซส์เสื้อผ้า" }] },
  { code: "841340",     th: "ปั๊มคอนกรีต", en: "CONCRETE TRANSFER PUMP", duty: 0 },
  { code: "66019900",   th: "ร่ม (ชุดของขวัญ)", en: "UMBRELLA GIFTSET", duty: 20, fe: 0, aliases: [{ th: "ร่มแคปซูล" }] },
  { code: "854420",     th: "สายเคเบิ้ล", en: "CABLE", duty: 10, fe: 5 },
  { code: "39269099",   th: "รางถ่าน / แท่นยึด", en: "HOLDER BRACKET", duty: 10, fe: 0,
    aliases: [{ th: "แท่นยึดแบตเตอรี่แบบ 2 ช่อง" }, { th: "ถุงพลาสติก (สำหรับบรรจุของ)", en: "POUCHES" },
              { th: "อุปกรณ์เชื่อมต่อ (Fiber Optic Adapter)", en: "CONTACTOR", note: "เสี่ยงโดน มอก." }] },
  { code: "7506.20.00", th: "แถบนิกเกิล", en: "NICKEL-PLATED STRIP COIL", duty: 0 },
  { code: "9029.20",    th: "หน้าจอแสดงผล", en: "DISPLAY", duty: 10, fe: 0 },
  { code: "850421.19",  th: "ตัวจ่ายไฟ", en: "POWER SUPPLY", duty: 10, fe: 0, note: "เลี่ยงเข้า power supply (เคสแท่นชาร์จ/แผงวงจรแบตลิเธียม)" },
  { code: "90303390",   th: "เครื่องทดสอบแบตเตอรี่", en: "BATTERY TESTER", duty: 0, note: "เลี่ยงเข้า (เคสแบตเตอรี่ลิเธียม)" },
  { code: "9030.90.90", th: "ส่วนประกอบเครื่องทดสอบแบตเตอรี่", en: "BATTERY TESTER PART", duty: 0 },
  { code: "730890",     th: "ชั้นวางสินค้า", en: "STORAGE RACKS", duty: 0, aliases: [{ th: "ชั้นวางเหล็ก" }] },
  { code: "6805.3000",  th: "ใยขัดสังเคราะห์", en: "SCOURING PAD", duty: 10, fe: 0 },
  { code: "9001.9090",  th: "ปลอกหุ้มรอยต่อสาย", en: "FIBER OPTIC SPLICER SLEEVE", duty: 0 },
  { code: "8544.20.11", th: "สายเคเบิล", en: "CABLE", duty: 10, fe: 5,
    note: "LC/UPC Pigtails ต้องเลี่ยงชื่อเป็น CABLE (ชื่อสายกระจายใยแก้ว ✗)" },
  { code: "9001.10.90", th: "เส้นใยนำแสงดิบ", en: "RAW FIBER OPTIC CABLE", duty: 0 },
  { code: "8536.70.90", th: "หัวต่อเปลี่ยนหัวสายใยแก้วนำแสง", en: "LC/UPC QUAD ADAPTER", note: "DOC ยืนยันใช้ได้ (07/2026)" },
  { code: "8501.1099",  th: "มอเตอร์เกียร์", en: "PLASTIC GEAR MOTOR", duty: 10, fe: 5 },
  { code: "8473.50.90", th: "ส่วนประกอบเครื่องรับเงิน/เครื่องรับธนบัตร", en: "BANKNOTE READER PARTS", duty: 0,
    aliases: [{ th: "ช่องรับเงิน", en: "BANKNOTE READER" }, { th: "กล่องเหรียญ", en: "PLASTIC HOPPER DISPENSER" },
              { th: "โมดูลนับจำนวนแบบอนาล็อก", en: "ANALOG COUNTER MODULE" }] },
  { code: "7320.2019",  th: "สปริง", en: "SPRING", duty: 10 },
  { code: "6805.2000",  th: "กระดาษทราย (กลมหลังสักหลาด)", en: "SANDING DISC", duty: 10, fe: 0 },
  { code: "8433.19.90", th: "อุปกรณ์เครื่องตัดหญ้า", en: "MOWERS ACCESSORIES", duty: 10, fe: 0 },
  { code: "7616.9990",  th: "ปลอกเก็บสายร่องคู่ (อลูมิเนียม)", en: "DOUBLE BARREL FERRULE SLEEVES", duty: 10, fe: 0, note: "ออกใบขน+ใบกำกับได้" },
  { code: "3916.90.91", th: "เส้นพลาสติก PA-CF สำหรับปริ้น 3 มิติ", en: "3D PRINTING FILAMENT", duty: 5, fe: 0, note: "ออกใบกำกับภาษีได้" },
  { code: "85043113",   th: "โมดูลแปลงไฟ (DC-DC)", en: "POWER CONVERTER MODULE", duty: 10, fe: 0 },
  { code: "8462.90",    th: "เครื่องปั๊มโลโก้ / แม่พิมพ์โลโก้", en: "LOGO STAMPING MACHINE / MOLD", duty: 5, fe: 0 },
  { code: "8460.90",    th: "เครื่องขัดเงา", en: "POLISHING MACHINE", duty: 0 },
  { code: "8438.90",    th: "เครื่องทำซีเรียลนัมเบอร์", en: "SERIAL NUMBER MACHINE", duty: 0 },
  { code: "845430",     th: "เครื่องหล่อแท่งโลหะ / เครื่องหลอมโลหะ", en: "INGOT CASTING / MELTING MACHINE", duty: 0 },
  { code: "854330",     th: "เครื่องแยกรีไฟน์ (silver refining)", en: "REFINING MACHINE", duty: 0 },
  { code: "84132090",   th: "เครื่องปั๊มสุญญากาศ", en: "VACUUM PUMP", duty: 10, fe: 0 },
  { code: "3302",       th: "สารที่มีกลิ่นหอม", en: "MIXTURES OF ODORIFEROUS", duty: 5, fe: 0, aliases: [{ th: "ตลับใส่เครื่องสำอาง (เลี่ยง)" }] },
  { code: "3405900",    th: "น้ำยาทำความสะอาดลูกสนุกเกอร์", en: "BALL CLEANER", duty: 10, fe: 0 },
  { code: "847989",     th: "เครื่องล้างลูกสนุกเกอร์", en: "BALL WASHING MACHINE", duty: 10, fe: 0 },
  { code: "8516.40.10", th: "เครื่องรีดอุตสาหกรรม (เตารีดผ้าปูโต๊ะบิลเลียด)", en: "INDUSTRIAL STEAM IRON", duty: 20, fe: 5 },
  { code: "9609.90.99", th: "ชอล์คฝนหัวคิว", en: "SNOOKER CHALK", duty: 10, fe: 0 },
  { code: "58063999",   th: "ริบบิ้นโบว์ผูกผม", en: "HAIR RIBBON", duty: 5, fe: 0 },
  { code: "85235200",   th: "การ์ดอักษร/การ์ดคำศัพท์เด็ก", en: "ART SMART CARD", duty: 0 },
  { code: "82079000",   th: "ชิ้นส่วนถอดสับเปลี่ยนได้", en: "USED DEAGOSTINI PARTS", duty: 10, fe: 0 },
  { code: "392640",     th: "หุ่นจำลองพลาสติก / แบบจำลองพลาสติก", en: "PLASTIC DISPLAY / PLASTIC ARTIFICIAL", duty: 10, fe: 0,
    note: "อาหารจำลอง (ทุเรียน/เค้ก) ออกเป็นอาหารไม่ได้ — ใช้แบบจำลองพลาสติก",
    aliases: [{ th: "ทุเรียนจำลอง" }, { th: "ถั่วฝักยาวจำลอง" }, { th: "เค้กจำลอง" }] },
  { code: "42029290",   th: "กระเป๋า", en: "BAG", duty: 20, fe: 0, note: "ออกฟอร์มอีได้" },
  { code: "2520.20.90", th: "ยิปซัมสำเร็จรูป", en: "PREPARED GYPSUM-BASED SELF-LEVELLING COMPOUND", duty: 0 },
  { code: "3403.1990",  th: "สารหล่อลื่น", en: "PREPARED LUBRICATING OIL", duty: 3, fe: 0,
    note: "ETHOXYQUIN 95% เสี่ยง DG → แนะนำเลี่ยงเป็นสารหล่อลื่น" },
  { code: "820559",     th: "เครื่องมือช่าง / เครื่องมือบำรุงรักษารถยนต์", en: "HAND TOOLS", duty: 10, fe: 0,
    aliases: [{ th: "เครื่องมือบูชสนับมือพวงมาลัยรถยนต์" }, { th: "เครื่องมือถอดแยกชิ้นส่วนซีลน้ำมันแบริ่ง" },
              { th: "เครื่องมือสายเคเบิล" }, { th: "ตัวปรับเบรกบูสเตอร์" }, { th: "ชุดเครื่องมือตัดแถบยาง" },
              { th: "ชุดเครื่องมือเจาะกระจกรถยนต์" }, { th: "ลูกสูบแหวนร่องทำความสะอาด", en: "PISTON RING GROOVE CLEANER" }] },
  { code: "820130",     th: "เล็บคราดเหล็ก (การเกษตร)", en: "RAKE TINES" },
  { code: "820320",     th: "คีมก้ามปู / คีมหนีบแหวนลูกสูบ", en: "PLIERS", duty: 10, fe: 0 },
  { code: "732690",     th: "ของทำด้วยเหล็ก (ชั้นวางจ่ายสายไฟ/แผ่นรับล็อค)", en: "ARTICLES OF IRON/STEEL", duty: 10, fe: 0,
    aliases: [{ th: "ปลอกสปริงสแตนเลส", en: "SPRING SLEEVES" }] },
  { code: "846711",     th: "ยางซ็อกเก็ตหัวนิวเมติกไฟฟ้าขนาดเล็ก", en: "PNEUMATIC TOOLS" },
  { code: "840721",     th: "เครื่องยนต์ติดท้ายเรือ", en: "OUTBOARD MOTOR", duty: 10, fe: 0 },
  { code: "890311",     th: "เรือยางเป่าลม", en: "INFLATABLE BOAT", duty: 0 },
  { code: "250620",     th: "หินควอตไซต์ (ปูนฉาบขยายตัวผง)", en: "QUARTZITE" },
  { code: "830160",     th: "ตลับกุญแจ / ไส้กุญแจ", en: "LOCK CASE / LOCK CYLINDER" },
  { code: "830241",     th: "มือจับประตู", en: "DOOR HANDLE" },
  { code: "9620.00",    th: "อุปกรณ์เสริมโทรศัพท์มือถือ (ไม้เซลฟี่/ขาตั้งกล้อง)", en: "MOBILE PHONE ACCESSORIES", duty: 20, fe: 0 },
  { code: "7117.90.99", th: "เครื่องประดับ (พวงกุญแจจี้ DIY)", en: "IMITATION JEWELLERY ACCESSORIES", duty: 0 },
  { code: "2712.90",    th: "ปิโตรเลียมเจลลี (จาระบี)", en: "PETROLEUM JELLY" },
  { code: "9617.00.10", th: "กระติกสูญญากาศ / กระบอกน้ำ", en: "VACUUM FLASKS", duty: 10, fe: 0 },
  { code: "8518.90.10", th: "ส่วนประกอบลำโพง (ตู้/โครง Basket)", en: "SPEAKER PARTS", duty: 7, fe: 0,
    note: "พาวเวอร์แอมป์ ติดมอก. แนะนำเลี่ยง" },
  { code: "7308.90.99", th: "บาร์แขวน", en: "FLYING BAR", duty: 10, fe: 0 },
  { code: "8204.11.00", th: "เครื่องมือถอดฝาครอบปั๊มน้ำมัน", en: "FUEL PUMP RING WRENCH", duty: 10, fe: 0 },
  { code: "8206.00.00", th: "อุปกรณ์ซ่อมรถยนต์ (ชุดเครื่องมือ)", en: "AUTOMOTIVE REPAIR TOOLS", duty: 0 },
  { code: "7308.3090",  th: "บานเลื่อนเหล็ก (หน้าต่างบานเลื่อน)", en: "STEEL FRAMES", duty: 10, fe: 0 },
  { code: "850431",     th: "คอนเวอร์เตอร์", en: "POWER CONVERTER MODULE", duty: 10, fe: 5,
    note: "AC single-phase ชาร์จ เสี่ยงมอก. → แนะนำเลี่ยงเป็นคอนเวอร์เตอร์" },
  { code: "9102.21.00", th: "นาฬิกาของชำร่วย", en: "WATCHES", duty: 5, fe: 0 },
  { code: "5607.5090",  th: "ม้วนสลิง PE", en: "PE ROLL", duty: 5, fe: 5 },
  { code: "3923.21.19", th: "ถุงสูญญากาศ", en: "VACUUM BAG", duty: 0 },
  { code: "85392920",   th: "ส่วนประกอบโคมไฟ (ตัวอักษรไฟซ่อนหลังสแตนเลส)", en: "LAMP ACCESSORY", duty: 10, fe: 0 },
  { code: "4821.10.90", th: "ป้าย/ป้ายฉลาก", en: "TAGS", duty: 10, fe: 0 },
  { code: "9506.91.00", th: "จักรยานยิม", en: "EXERCISE BIKE", duty: 10, fe: 0,
    note: "จักรยานขาไถ ติดมอก. → แนะนำเลี่ยงเป็นจักรยานยิม" },
  { code: "8210.0000", th: "เครื่องสกัดกาแฟด้วยมือ", en: "MANUAL ESPRESSO HAND PRESS", duty: 10, fe: 0,
    note: "เครื่องชงกาแฟไฟฟ้า เสี่ยงมอก.+กสทช. → แนะนำเลี่ยงเป็นแบบมือ" },
  { code: "8465.92.00", th: "เครื่องจักรงานไม้", en: "WOODWORKING MACHINE", note: "DOC ยืนยันใช้ได้ (07/2026)" },
  { code: "321410",     th: "ยาแนวซิลิโคน", en: "SILICONE SEALANT", duty: 10, fe: 0 },
  { code: "870880",     th: "โช้คอัพรถยนต์", en: "CAR SHOCK ABSORBER", duty: 30, fe: 0 },
];

const clean = (v) => (v ?? "").toString().trim();
const digitsOf = (v) => clean(v).replace(/[^0-9]/g, "");
const hs8Of = (raw) => { const d = digitsOf(raw); return d ? d.slice(0, 8).padEnd(8, "0") : null; };
const fmtCode = (raw) => {
  const d = digitsOf(raw);
  if (d.length === 8)  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  if (d.length === 6)  return `${d.slice(0, 4)}.${d.slice(4, 6)}`;
  if (d.length === 10) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.${d.slice(8, 10)}`;
  return clean(raw);
};

async function fetchAll(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const hs = await fetchAll("hs_codes",
  "code, hs8_key, description, description_en, product_aliases, default_duty_pct, form_e_duty_pct, duty_confirmed, hs_note");
const byKey = new Map();
for (const r of hs) {
  if (!r.hs8_key) continue;
  (byKey.get(r.hs8_key) ?? byKey.set(r.hs8_key, []).get(r.hs8_key)).push(r);
}

let updated = 0, inserted = 0, aliasAdded = 0, dutyFilled = 0, dutyDiff = 0, unchanged = 0, failed = 0;
const ops = [];

for (const e of E) {
  const key = hs8Of(e.code);
  const cands = byKey.get(key) ?? [];
  const target = cands.find((c) => digitsOf(c.code) === digitsOf(e.code)) ?? cands[0] ?? null;

  const names = [{ th: e.th, en: e.en, note: e.note ? undefined : undefined }, ...(e.aliases ?? [])];

  if (target) {
    const existing = Array.isArray(target.product_aliases) ? target.product_aliases : [];
    const seen = new Set(
      [clean(target.description), clean(target.description_en),
       ...existing.flatMap((a) => [clean(a.th), clean(a.en)])].filter(Boolean).map((x) => x.toLowerCase()),
    );
    const add = [];
    for (const n of names) {
      const th = clean(n.th), en = clean(n.en);
      const label = th || en;
      if (!label) continue;
      const keys = [th.toLowerCase(), en.toLowerCase()].filter(Boolean);
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      const a = { th: th || null, en: en || null, src: "line" };
      if (clean(n.note)) a.note = clean(n.note);
      add.push(a);
    }

    const patch = {};
    if (add.length > 0) { patch.product_aliases = [...existing, ...add]; aliasAdded += add.length; }

    if (e.duty !== undefined) {
      const curDuty = Number(target.default_duty_pct);
      if (!target.duty_confirmed) {
        // DOC team answered = confirmed rate
        patch.default_duty_pct = e.duty;
        if (e.fe !== undefined) patch.form_e_duty_pct = e.fe;
        patch.duty_confirmed = true;
        patch.provenance = "curated";
        dutyFilled++;
      } else if (curDuty !== e.duty) {
        // ยืนยันไว้แล้วแต่แชทตอบต่าง — ห้ามทับเงียบ ให้ทีมเห็น
        const tag = `LINE 07-08/2026: DOC ตอบอากร ${e.duty}%${e.fe !== undefined ? ` FE ${e.fe}%` : ""} (คลังเก็บ ${curDuty}%)`;
        if (!clean(target.hs_note).includes(tag)) {
          patch.hs_note = [clean(target.hs_note), tag].filter(Boolean).join(" · ");
          dutyDiff++;
        }
      }
    }
    if (e.note && !clean(target.hs_note).includes(e.note)) {
      patch.hs_note = [patch.hs_note ?? clean(target.hs_note), e.note].filter(Boolean).join(" · ");
    }

    if (Object.keys(patch).length === 0) { unchanged++; continue; }
    ops.push({ kind: "update", code: target.code, patch, label: e.th || e.en });
  } else {
    const row = {
      code: fmtCode(e.code),
      description: e.th || e.en,
      description_en: e.en || null,
      default_duty_pct: e.duty ?? 0,
      form_e_duty_pct: e.fe ?? 0,
      duty_confirmed: e.duty !== undefined,
      hs_note: e.note ?? null,
      is_active: true,
      source: "LINE",
      provenance: e.duty !== undefined ? "curated" : "doc_bot",
      product_aliases: (e.aliases ?? []).map((a) => ({ th: clean(a.th) || null, en: clean(a.en) || null, src: "line", ...(clean(a.note) ? { note: clean(a.note) } : {}) })),
    };
    ops.push({ kind: "insert", code: row.code, row, label: e.th || e.en });
  }
}

for (const o of ops.slice(0, 15)) console.log(`  ${o.kind === "insert" ? "＋" : "✎"} ${o.code} — ${o.label}${o.kind === "update" ? ` [${Object.keys(o.patch).join(",")}]` : ""}`);
if (ops.length > 15) console.log(`  … +${ops.length - 15} รายการ`);
console.log(`\nentries=${E.length} · update=${ops.filter(o => o.kind === "update").length} · insert=${ops.filter(o => o.kind === "insert").length} · unchanged=${unchanged}`);
console.log(`ชื่อสินค้าที่จะเพิ่ม=${aliasAdded} · อากรที่จะยืนยัน=${dutyFilled} · แชทตอบต่างจากคลัง(note)=${dutyDiff}`);

if (!APPLY) { console.log("\nDRY-RUN — รันซ้ำด้วย --apply เพื่อเขียนจริง"); process.exit(0); }

const backup = ops.filter((o) => o.kind === "update").map((o) => hs.find((r) => r.code === o.code));
const bfile = `/tmp/backup-line-hs-${Date.now()}.json`;
fs.writeFileSync(bfile, JSON.stringify(backup));
console.log("backup:", bfile);

for (const o of ops) {
  if (o.kind === "update") {
    const { error } = await db.from("hs_codes").update(o.patch).eq("code", o.code);
    if (error) { failed++; console.error(`  ✗ ${o.code}: ${error.message}`); } else updated++;
  } else {
    const { error } = await db.from("hs_codes").insert(o.row);
    if (error) { failed++; console.error(`  ✗ ${o.code}: ${error.message}`); } else inserted++;
  }
}
console.log(`APPLIED: updated=${updated} · inserted=${inserted} · failed=${failed}`);
