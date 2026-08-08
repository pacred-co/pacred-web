/**
 * parse-hs-line-chats-2026-08-08.mjs — แกะพิกัด+ชื่อสินค้า+อากร จากแชท LINE "ถามพิกัด"
 *
 * owner 2026-08-08: *"อัพเดทแพทให้ทีครับ พิกัด ตอนนี้คลัง HS CODE กำลังจะให้พนักงาน
 * มาใช้จริงกันแล้ว … เรื่องชื่อ อ่านดีๆ นะครับ บางทีน้องมาหาคำมันอาจจะกำกวม หาไม่เจอ
 * หรืออาจจะพิมพ์ผิดเลยหาไม่เจอ หรือในไฟล์นายเอามาไม่หมด — เอามาให้ครบทุกซอกมุมนะครับ"*
 *
 * รูปแบบแชทที่เจอจริง (ปนกันมาก · ต้องรับให้ครบ):
 *   "Steering Wheel/พวงมาลัยรถยนตร์ \n 8708.94.95 \n อากร 30 เปอเซน"   ← ชื่อ**ก่อน**เลข
 *   "8536.90"                                                        ← เลขลอย ชื่ออยู่ข้อความก่อนหน้า
 *   "จอยสติ๊ก ติด มอก เลี่ยงเป็น \n 903289 \n Controller-กล่องควบคุม"    ← ชื่อ**หลัง**เลข
 *   "4011700000  \n ( ชนิดที่ใช้กับยานบก…) \n ยางรถเทรลเลอร์"
 *   อากร: "อากร 30" · "อากร30" · "อากร 3%" · "อากร 30 เปอเซน" · "อากร10 เปอเซน"
 *   ฟอร์มอี: "fe 0" · "ฟรอมอี0" · "ฟอมอี 0%" · "ขอฟอร์ม 0" · "ฟรอม อี 0"
 *
 * OUTPUT = JSON ให้คนตรวจก่อน ingest (READ-ONLY · ไม่แตะ DB)
 *   node scripts/parse-hs-line-chats-2026-08-08.mjs > /tmp/hs-parsed.json
 */
import { readFileSync } from "node:fs";

const FILES = [
  "/Users/dev/Downloads/[LINE]ถามพิกัด PCS.txt",
  "/Users/dev/Downloads/[LINE]ถามพิกัด Pacred.txt",
];

/** บรรทัดหัวข้อความ LINE: "10:57 ชื่อคน ข้อความ…" */
const MSG_RX = /^(\d{2}:\d{2})\s+(.+?)\s(.*)$/;
const DATE_RX = /^(\d{4}\.\d{2}\.\d{2})\s/;

/**
 * โทเคนที่ "หน้าตาเหมือนพิกัด": 4-10 หลัก มีจุดคั่นได้
 * ⚠️ ต้องกัน false positive: เวลา (10:57) · ราคา (18,385) · ปี (2026) · ppb/W/mm
 */
const HS_RX = /(?<![\d.,:/-])(\d{4}(?:[. ]?\d{1,4}){0,3})(?![\d,%])/g;

const isPlausibleHs = (raw) => {
  const d = raw.replace(/[^\d]/g, "");
  if (d.length < 4 || d.length > 11) return false;
  const ch = Number(d.slice(0, 2));
  if (ch < 1 || ch > 97) return false;           // บทพิกัดจริง 01-97
  if (/^(19|20)\d\d$/.test(d) && d.length === 4) return false; // ปี พ.ศ./ค.ศ.
  return true;
};

/** ตัดคำสั่งงาน/คำสุภาพ ออกจากชื่อสินค้า */
const NOISE = [
  /รบกวน.*?(ให้หน่อย|ค่ะ|ครับ|นะคะ|นะครับ)?/g, /เช็ค ?พิกัด/g, /ขอ ?พิกัด/g, /ขอทราบ ?พิกัด/g,
  /ให้หน่อย/g, /สักครู่/g, /ยกเลิกข้อความ/g, /^รูป$/g, /@\S+/g, /สติกเกอร์/g,
  /^ครับ$|^ค่ะ$|^ค้าบ$|^ได้ครับ$|^โอเคครับ/g, /ครับผม/g, /อากร\s*\d+.*/g,
  /(ฟรอม ?อี|ฟอม ?อี|ฟอร์ม ?อี|fe|ขอฟอ?ร?ม?)\s*\d+.*/gi, /stat\s*\d+/gi, /^\d{3}$/g,
];
const cleanName = (s) => {
  let t = (s ?? "").trim();
  for (const rx of NOISE) t = t.replace(rx, " ");
  return t.replace(/[·|]/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–—:/,.]+|[\s\-–—:/,.]+$/g, "").trim();
};

/**
 * ตัวกรองสุดท้าย — ทิ้งสิ่งที่ "ไม่ใช่ชื่อสินค้า" (พนักงานค้นแล้วต้องไม่เจอขยะ):
 * ชื่อคน/แผนกที่หลุดจาก @-mention · เศษสถานะ (สแตค 000 · ไม่ติด…) · คำถามลอยๆ
 */
const NOT_A_PRODUCT = [
  /^(pacred|pcs|audit|sale|shipping|doc|cs|nat|gring|เวฟ)\b/i,
  /\b(doc|sale|audit|pricing|shipping)\s*[-(]/i,
  /^(ok|okay|ครับ|ค่ะ|ได้|แปป|แนะนำ|ใช่|เข้าได้|ทั้งหมด|อื่นๆ)$/i,
  /^(สแตค|stat|000|090|999)\b/i,
  /^\d+\s*(ไม่ติด|ติด)/,
  /ติดอะไร(ไหม|หรือเปล่า)/,
  /^(รายการที่|ข้อ)\s*[\d\s\-,]+$/,
  /^(เลี่ยง|ผมเลี่ยง|ผมว่า|ลอง|เอาเข้า|ใช้ชื่อ)\b/,
  /^[\d\s.%-]+$/,          // ตัวเลขล้วน
  /(เข้ากลุ่ม|ออกจากกลุ่ม)/,
];
const looksLikeProduct = (s) => !NOT_A_PRODUCT.some((rx) => rx.test(s));

const hasThai = (s) => /[฀-๿]/.test(s);
const hasLatin = (s) => /[A-Za-z]{3,}/.test(s);

/** "อากร 30" · "อากร30 เปอเซน" · "อากร 3%" · "ยกเว้นอากร"/"ฟรีฮากร" → 0 */
function parseDuty(text) {
  if (/ยกเว้น\s*อาก(ร|าร)|ฟรี\s*ฮ?าก(ร|าร)/.test(text)) return 0;
  const m = /อาก(?:ร|าร)\s*:?\s*(\d{1,3})(?:\.\d+)?\s*%?/.exec(text);
  return m ? Number(m[1]) : null;
}
/** fe/ฟอร์มอี ทุกสะกด */
function parseFormE(text) {
  const m = /(?:ฟรอม\s*อี|ฟอ?ร?ม\s*อี|ฟอมอี|ขอฟอ?ร?ม์?อี?|form\s*e|fe)\s*:?\s*(\d{1,3})/i.exec(text);
  return m ? Number(m[1]) : null;
}
/** สัญญาณกฎหมาย/ความเสี่ยง — ของมีค่าที่สุดในแชท (เลี่ยงพิกัด/ติดใบอนุญาต) */
function parseFlags(text) {
  const f = [];
  if (/ติด\s*มอก|เสี่ยง\s*มอก|สมอ\./i.test(text)) f.push("มอก.");
  if (/ติด\s*อย\.|อย\./i.test(text)) f.push("อย.");
  if (/ใบอนุญาต|ใบอณุญาต|ใบอนุญาติ|ติดใบ/.test(text)) f.push("ใบอนุญาต");
  if (/เลี่ยง(เป็น|พิกัด)?|เลียง|แนะนำ(ลูกค้า)?เลี่ยง/.test(text)) f.push("เลี่ยงพิกัด");
  if (/ทุ่มตลาด|ติดทุ่ม/.test(text)) f.push("ตอบโต้ทุ่มตลาด");
  if (/ไม่ติด(ใบ)?/.test(text)) f.push("ไม่ติดใบอนุญาต");
  if (/ฟอมอีจีนไม่รองรับ|ไม่รองรับ/.test(text)) f.push("ฟอร์มอีจีนไม่รองรับ");
  return [...new Set(f)];
}

const out = [];
for (const file of FILES) {
  const src = file.includes("PCS") ? "LINE-PCS" : "LINE-Pacred";
  const lines = readFileSync(file, "utf8").split("\n").map((l) => l.replace(/\r$/, ""));

  // ── PASS 1: เรียนรู้ "ชื่อคนพูด" จากบรรทัดที่เนื้อความเป็นมาร์คเกอร์ตายตัว ──
  // จำเป็นเพราะชื่อคนมีช่องว่าง ("Pacred Doc Gring") → regex เดาเองจะตัดผิด
  // แล้วชื่อคนจะไหลไปปนในชื่อสินค้า (พนักงานค้นแล้วเจอ "Doc Gring กระดาษลาเบล").
  const MARKERS = ["รูป", "สติกเกอร์", "ยกเลิกข้อความ", "วิดีโอ"];
  const speakers = new Set();
  for (const ln of lines) {
    const m = /^(\d{2}:\d{2})\s+(.+)$/.exec(ln);
    if (!m) continue;
    const rest = m[2];
    for (const mk of MARKERS) {
      if (rest.endsWith(" " + mk)) speakers.add(rest.slice(0, -(mk.length + 1)).trim());
    }
    const add = /^(.+?)\s+\1\s+(เพิ่ม|ลบ)\s/.exec(rest); // "X X เพิ่ม Y เข้ากลุ่ม"
    if (add) speakers.add(add[1].trim());
  }
  const speakerList = [...speakers].filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);

  // ── PASS 2: แยกข้อความ (ชื่อคนยาวสุดที่ตรง = ชื่อคน) ──
  const msgs = [];
  let cur = null, day = "";
  for (const ln of lines) {
    const d = DATE_RX.exec(ln);
    if (d) { day = d[1]; continue; }
    const m = /^(\d{2}:\d{2})\s+(.+)$/.exec(ln);
    if (m) {
      const rest = m[2];
      const who = speakerList.find((sp) => rest === sp || rest.startsWith(sp + " ")) ?? rest.split(" ")[0];
      cur = { at: `${day} ${m[1]}`, who, text: rest.slice(who.length).trim() };
      msgs.push(cur);
    } else if (cur && ln.trim() !== "") cur.text += "\n" + ln;
  }

  // ── PASS 3: จับพิกัด + ชื่อ ──
  msgs.forEach((msg, i) => {
    const mLines = msg.text.split("\n");
    // ข้อความนี้มีพิกัดกี่ตัว — ถ้าหลายตัว = ตอบหลายรายการรวด ห้ามยืมชื่อข้ามข้อความ
    const codesInMsg = [...msg.text.matchAll(HS_RX)].filter((x) => isPlausibleHs(x[1])).length;
    mLines.forEach((ln, li) => {
      // ข้ามบรรทัดที่เป็น "ไฟล์แนบ" — ชื่อไฟล์มีตัวเลขเพียบ (วันที่/เลข PI) แล้วจะ
      // กลายเป็นพิกัดปลอม (เจอจริง: 20260513 จาก Invoice-to-QL2026.05.13.xlsx)
      if (/\.(pdf|xlsx|xls|docx?|jpe?g|png|zip)\b/i.test(ln)) return;
      for (const mm of ln.matchAll(HS_RX)) {
        const rawCode = mm[1];
        if (!isPlausibleHs(rawCode)) continue;
        const digits = rawCode.replace(/[^\d]/g, "");
        const near = [ln.replace(rawCode, " "), mLines[li - 1] ?? "", mLines[li + 1] ?? "", mLines[li + 2] ?? ""];
        // ยืมชื่อจากคำถามก่อนหน้าได้เฉพาะเมื่อ (ก) ข้อความนี้ตอบพิกัดเดียว และ
        // (ข) ข้อความก่อนหน้าไม่มีพิกัดของตัวเอง (ไม่งั้นชื่อจะข้ามรายการ)
        if (codesInMsg === 1) {
          for (let back = 1; back <= 2; back++) {
            const prev = msgs[i - back];
            if (!prev) break;
            const prevHas = [...prev.text.matchAll(HS_RX)].some((x) => isPlausibleHs(x[1]));
            if (prevHas) break;
            near.push(prev.text);
          }
        }
        const names = [...new Set(near.map(cleanName).filter((s) => s.length >= 2 && s.length <= 120 && (hasThai(s) || hasLatin(s)) && looksLikeProduct(s)))].slice(0, 5);
        if (names.length === 0) continue;
        const ctx = [mLines.slice(Math.max(0, li - 1), li + 4).join("\n"), msgs[i + 1]?.text ?? ""].join("\n");
        out.push({
          code: digits, codeRaw: rawCode.trim(), names,
          duty: parseDuty(ctx) ?? parseDuty(msg.text),
          formE: parseFormE(ctx) ?? parseFormE(msg.text),
          flags: parseFlags([msgs[i - 1]?.text ?? "", msg.text, msgs[i + 1]?.text ?? ""].join("\n")),
          at: msg.at, who: msg.who, src,
        });
      }
    });
  });
}

// ── รวมพิกัดเดียวกัน (ชื่อสะสมทุกคำที่เคยใช้เรียก = ตัวช่วยค้นหาของพนักงาน) ──
const byCode = new Map();
for (const r of out) {
  const k = r.code;
  const g = byCode.get(k) ?? { code: k, names: new Set(), duty: null, formE: null, flags: new Set(), hits: 0, seen: [] };
  r.names.forEach((n) => g.names.add(n));
  if (g.duty == null && r.duty != null) g.duty = r.duty;
  if (g.formE == null && r.formE != null) g.formE = r.formE;
  r.flags.forEach((f) => g.flags.add(f));
  g.hits++; g.seen.push(`${r.at} ${r.who} (${r.src})`);
  byCode.set(k, g);
}
const merged = [...byCode.values()]
  .map((g) => ({ ...g, names: [...g.names], flags: [...g.flags], seen: g.seen.slice(0, 3) }))
  .sort((a, b) => b.hits - a.hits);

console.log(JSON.stringify({ totalMentions: out.length, distinctCodes: merged.length, codes: merged }, null, 1));
