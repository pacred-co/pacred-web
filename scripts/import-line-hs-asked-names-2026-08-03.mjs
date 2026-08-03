// ════════════════════════════════════════════════════════════════════
// import-line-hs-asked-names — เติม "ชื่อที่คนถาม" (ไม่ใช่ชื่อที่ทีมตอบ)
// ════════════════════════════════════════════════════════════════════
// owner 2026-08-03: "พิมพ์ชื่อที่เคยๆ ถามไปในกลุ่มก็ยังไม่เจอเลยครับ"
//
// 🔴 ROOT: รอบแรกผมเก็บแต่ **ชื่อที่ทีม DOC ตอบ** (ชื่อทางการที่ใช้ยิงใบขน)
// แต่เวลาเซล/CS ค้นในระบบ เขาพิมพ์ **คำที่ตัวเองถาม** ซึ่งมักคนละคำ:
//   ถาม "รถตัดหญ้า"      → ตอบ "อุปกรณ์เครื่องตัดหญ้า"
//   ถาม "เกียร์มอเตอร์"   → ตอบ "มอเตอร์เกียร์"
//   ถาม "จักรยานขาไถ"    → ตอบ "จักรยานยิม" (เลี่ยง มอก.)
// ⇒ พิมพ์คำที่ถาม แล้วไม่เจอ = สรุปว่าระบบไม่มี แล้วไปถามในไลน์ซ้ำอีกรอบ.
// สคริปต์นี้ผูก "คำที่ถาม" เข้ากับพิกัดเดียวกัน (src:'line-asked') → ค้นเจอทั้งคู่.
//
// + เติมพิกัดที่ตกจากรอบแรก 1 ตัว (4009.21 สายไฮดรอลิค).
//
//   node --env-file=.env.local scripts/import-line-hs-asked-names-2026-08-03.mjs [--apply]
//
// เขียนเฉพาะ product_aliases (+ insert พิกัดที่ขาด) — ไม่แตะอากร/ไม่แตะเงิน.
// Idempotent: dedupe ด้วยชื่อ normalize แล้ว (ตัดวรรณยุกต์/วงเล็บ/ช่องว่าง).
// ════════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// พิกัด → คำที่คนถามจริงในแชท (สะกดตามที่พิมพ์มา รวมที่สะกดแปลก)
const ASKED = {
  "8536.90":    ["ลิมิตสวิทต์", "ลิมิตสวิทช์", "ลิมิตสวิตช์"],
  "8708.94.95": ["พวงมาลัยรถยนตร์"],
  "8479.89.69": ["swing gate", "เครื่องกันทางเดิน"],
  "3923.30":    ["แพ็จเกจขวด", "แพ็คเกจขวด"],
  "4819.50.00": ["หลอดลูกแบด", "หลอดแบด"],
  "8450.90":    ["เครื่องซักและอบแห้ง", "เครื่องซักผ้า", "เครื่องอบแห้ง"],
  "3925.10.00": ["ถังผสมสารเคมี"],
  "8433.19.90": ["รถตัดหญ้า", "เครื่องตัดหญ้า"],
  "8501.10.99": ["เกียร์มอเตอร์"],
  "7616.99.90": ["ปลอกอลูมิเนียมร่องคู่"],
  "3926.90":    ["ปลอกคอแมว", "ปลอกคอสัตว์เลี้ยง"],
  "9506.91.00": ["จักรยานขาไถ"],
  "8210.00.00": ["เครื่องชงกาแฟ"],
  "9620.00":    ["ชุดหูฟังไร้สายบลูทูธ", "ฟิล์มกันรอยโทรศัพท์มือถือ", "เคสโทรศัพท์มือถือ",
                 "หัวชาร์จมือถือ", "สายชาร์จ", "ที่ชาร์จแบตในรถ", "ไม้เซลฟี่", "ขาตั้งกล้อง",
                 "เมาส์แบบมีสาย", "เลนส์ฟิล์มป้องกัน"],
  "8523.52.00": ["การ์ดคำศัพท์เพื่อการเรียนรู้สำหรับเด็ก", "การ์ดคำศัพท์"],
  "3919.10.99": ["สติ๊กเกอร์", "สติ๊กเกอร์ติดป้าย", "สติ๊กเกอร์คาดกล่องเบเกอรี่", "label sticker"],
  "8205.59.00": ["คีมหนีบแหวนลูกสูบ", "เครื่องมือถอดชิ้นส่วน", "เครื่องมือซ่อมรถยนต์",
                 "เครื่องแยกหัวบอลส้อมคู่ขยาย"],
  "8301.60":    ["ตลับกุญเเจ", "ไส้กุญเเจ", "ตลับกุญแจ", "ไส้กุญแจ"],
  "7326.90":    ["แผ่นรับล็อค สเตนเลส", "ชั้นวางจ่ายสายไฟ"],
  "8302.41":    ["มือจับประตู"],
  "3926.90.99": ["พลาสติกรับล็อค"],
  "8518.90.10": ["โครงลำโพง", "ตู้ลำโพง", "พาวเวอร์แอมป์"],
  "9102.21.00": ["กล่องของขวัญพร้อมนาฬิกา", "นาฬิกา"],
  "8504.31":    ["ac single-phase 3 เฟสชาร์จ", "แท่นชาร์จ"],
  "8539.29.20": ["ตัวอักษรไฟซ่อนหลัง สแตนเลส"],
  "7308.30.90": ["หน้าต่างบานเลื่อน"],
  "2712.90":    ["จาระบี"],
  "9617.00.10": ["กระบอกน้ำ", "กระติกน้ำ"],
  "3405.900":   ["น้ำยาทำความสะอาดลูกสนุกเกอร์", "น้ำยาล้างลูกสนุกเกอร์"],
  "8516.40.10": ["เตารีดผ้าปูโต๊ะบิลเลียด"],
  "6805.20.00": ["กระดาษทรายกลมหลังสักหลาด"],
  "9001.90.90": ["fiber optic splicer sleeve"],
  "8536.70.90": ["lc/upc quad adapter", "ตัวต่อเปลี่ยนหัวสายใยแก้วนำแสง"],
  "8544.20.11": ["lc/upc pigtails", "สายกระจายสายใยแก้วนำแสงสำเร็จรูป"],
  "4202.92.90": ["กระเป๋า"],
  "8207.90.00": ["ชิ้นส่วนถอดสับเปลี่ยนได้"],
  "3302":       ["ตลับใส่เครื่องสำอาง"],
  "2520.20.90": ["ปูนฉาบ", "self leveling mortar"],
  "3403.19.90": ["ethoxyquin"],
  "8708.80":    ["โช๊คอัพ", "โช้คอัพ"],
  "5607.50.90": ["ม้วนสลิงpe", "สลิง pe"],
  "3923.21.19": ["ถุงสุญญากาศ"],
  "4821.10.90": ["ป้ายฉลาก"],
  "8714.10":    ["อะไหล่รถจักรยานยนต์", "อุปกรณ์ตกแต่งรถจักรยานยนต์"],
  "8427.90.00": ["อุปกรณ์ยกและเทถัง"],
  "7323.99.90": ["ถาดรองน้ำชาไม้ไผ่"],
  "8422.30":    ["เครื่องอัดแบบแมนนวล", "เครื่องผสมระบบลม", "เครื่องย้ำและปิดผนึกฝาอลูมิเนียม"],
};

// พิกัดที่ตกจากรอบแรก
const MISSING = [
  { code: "4009.21", th: "สายไฮดรอลิค", en: "HYDRAULIC HOSES", duty: 3, fe: 0 },
];

const clean = (v) => (v ?? "").toString().trim();
const digitsOf = (v) => clean(v).replace(/[^0-9]/g, "");
const hs8Of = (raw) => { const d = digitsOf(raw); return d ? d.slice(0, 8).padEnd(8, "0") : null; };
const TH_MARKS = /[ัิ-ฺ็-๎]/g;
const norm = (v) => clean(v).toLowerCase().replace(/เเ/g, "แ")
  .replace(TH_MARKS, "").replace(/[\s.\-_/,()[\]{}"'·]/g, "");

async function fetchAll(t, sel) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(t).select(sel).range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const hs = await fetchAll("hs_codes", "code, hs8_key, description, description_en, product_aliases");
const byKey = new Map();
for (const r of hs) { if (r.hs8_key) (byKey.get(r.hs8_key) ?? byKey.set(r.hs8_key, []).get(r.hs8_key)).push(r); }
const targetFor = (raw) => {
  const c = byKey.get(hs8Of(raw)) ?? [];
  return c.find((x) => digitsOf(x.code) === digitsOf(raw)) ?? c[0] ?? null;
};

const ops = [];
let added = 0, dup = 0, miss = 0;
for (const [code, names] of Object.entries(ASKED)) {
  const t = targetFor(code);
  if (!t) { miss++; console.log(`  ⚠ ไม่พบพิกัด ${code} — ข้าม (${names[0]})`); continue; }
  const existing = Array.isArray(t.product_aliases) ? t.product_aliases : [];
  const seen = new Set([clean(t.description), clean(t.description_en),
    ...existing.flatMap((a) => [clean(a.th), clean(a.en)])].filter(Boolean).map(norm));
  const add = [];
  for (const nm of names) {
    const k = norm(nm);
    if (!k || seen.has(k)) { dup++; continue; }
    seen.add(k);
    add.push({ th: nm, en: null, src: "line-asked" });
  }
  if (add.length) { ops.push({ code: t.code, aliases: [...existing, ...add], n: add.length, sample: add.map((a) => a.th) }); added += add.length; }
}

const inserts = [];
for (const m of MISSING) {
  if (targetFor(m.code)) continue;
  inserts.push({
    code: m.code, description: m.th, description_en: m.en,
    default_duty_pct: m.duty, form_e_duty_pct: m.fe, duty_confirmed: true,
    is_active: true, source: "LINE", provenance: "curated", product_aliases: [],
  });
}

for (const o of ops.slice(0, 12)) console.log(`  ✎ ${o.code} +${o.n}: ${o.sample.slice(0, 4).join(" · ")}`);
if (ops.length > 12) console.log(`  … +${ops.length - 12} พิกัด`);
console.log(`\nจะเติมชื่อที่คนถาม ${added} ชื่อ ลง ${ops.length} พิกัด · ซ้ำข้าม ${dup} · หาพิกัดไม่เจอ ${miss} · insert ${inserts.length}`);

if (!APPLY) { console.log("\nDRY-RUN — รันซ้ำด้วย --apply"); process.exit(0); }

fs.writeFileSync(`/tmp/backup-asked-${Date.now()}.json`,
  JSON.stringify(ops.map((o) => ({ code: o.code, before: hs.find((r) => r.code === o.code)?.product_aliases ?? [] }))));

let ok = 0, bad = 0;
for (const o of ops) {
  const { error } = await db.from("hs_codes").update({ product_aliases: o.aliases }).eq("code", o.code);
  if (error) { bad++; console.error(`  ✗ ${o.code}: ${error.message}`); } else ok++;
}
for (const r of inserts) {
  const { error } = await db.from("hs_codes").insert(r);
  if (error) { bad++; console.error(`  ✗ ${r.code}: ${error.message}`); } else ok++;
}
console.log(`APPLIED: ${ok} · failed=${bad}`);
