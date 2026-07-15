#!/usr/bin/env node
/**
 * gen-carrier-province-coverage.mjs — parse the owner's carrier×province
 * workbook into the generated SOT `lib/forwarder/carrier-province-coverage.ts`.
 *
 * Source file (owner-maintained, 2026-07-14):
 *   C:/Users/Admin/Downloads/บริษัทขนส่ง_พื้นที่ขนส่ง(จังหวัด).xlsx
 *   sheet "main" — row 0 = header, each COLUMN = one บริษัทขนส่ง,
 *   the cells BELOW it = the provinces that carrier serves.
 *
 * The sheet is hand-typed and MESSY. This parser handles, and REPORTS:
 *   - "ทุกจังหวัด"            → all 77 provinces
 *   - "ภาคอีสานทุกจังหวัด"     → the 20 Isaan provinces
 *   - "ไปทุกจังหวัดในอีสาน ยกเว้น X Y" → Isaan minus the named exclusions
 *   - "ภาคเหนือทุกจังหวัด …"   → the 9 northern provinces (+ note kept)
 *   - typos / short names      → canonical 77 (ศรีสระเกษ→ศรีสะเกษ, โคราช→นครราชสีมา …)
 *   - a note glued to the province cell
 *       "นครราชสีมา ไม่เข้าวังน้ำเขียว / บัวลาย"  → province + provinceNote
 *       "นครปฐม (ส่งแค่บางเลน)"                  → province + provinceNote
 *       "ยะลา: ไม่ไป เบตง / แว้ง"                → province + provinceNote
 *   - a pure note that is NOT a province
 *       "เริ่มต้น 30" · "ไม่รับสาย" · "ต้องแจ้งอำเภอก่อน" · "ลาดบัวหลวง"
 *                                               → carrier-level note
 *
 * NOTHING is silently dropped: every non-empty cell ends up in exactly one of
 * { province, provinceNote, carrierNote } and the run prints a full report.
 *
 * Usage:
 *   node scripts/gen-carrier-province-coverage.mjs              # report only
 *   node scripts/gen-carrier-province-coverage.mjs --emit       # + write the SOT
 *   node scripts/gen-carrier-province-coverage.mjs --xlsx <path>
 */

import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

// ────────────────────────────────────────────────────────────
// Canonical province data
// ────────────────────────────────────────────────────────────

/**
 * The canonical 77 Thai provinces (tb_address.addressprovince spelling).
 *
 * ⚠ NOT a second source of truth — `lib/thai-provinces.ts` is the canonical
 * home (docs/conventions §13). This copy exists only so the .mjs parser can
 * run without a TS loader; `assertProvinceParity()` below fails the run if the
 * two ever drift, and the EMITTED file imports the canonical module.
 */
const PROVINCES_77 = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น",
  "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย",
  "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม",
  "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน",
  "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี",
  "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก",
  "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร",
  "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี",
  "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล",
  "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี",
  "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย",
  "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี",
  "อุบลราชธานี",
];

/**
 * Guard: the parser's PROVINCES_77 must equal the canonical `lib/thai-provinces.ts`
 * list (the module the emitted SOT imports). Any drift = a silent province that
 * the SOT would accept but `canonicalProvince()` would reject → fail loudly.
 */
function assertProvinceParity() {
  const src = fs.readFileSync(path.resolve("lib/thai-provinces.ts"), "utf8");
  const block = src.match(/export const THAI_PROVINCES = \[([\s\S]*?)\]/);
  if (!block) {
    console.error("[FATAL] cannot read THAI_PROVINCES from lib/thai-provinces.ts");
    process.exit(1);
  }
  const canonical = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const a = new Set(canonical);
  const b = new Set(PROVINCES_77);
  const onlyCanonical = canonical.filter((p) => !b.has(p));
  const onlyHere = PROVINCES_77.filter((p) => !a.has(p));
  if (onlyCanonical.length || onlyHere.length || a.size !== b.size) {
    console.error("[FATAL] province list drift vs lib/thai-provinces.ts");
    console.error(`  only in lib/thai-provinces.ts : ${onlyCanonical.join(", ") || "-"}`);
    console.error(`  only in this script           : ${onlyHere.join(", ") || "-"}`);
    process.exit(1);
  }
}

/** ภาคอีสาน — 20 provinces (matches the workbook's own "ชีต4" sheet). */
const ISAAN_20 = [
  "กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ",
  "บุรีรัมย์", "มหาสารคาม", "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย",
  "ศรีสะเกษ", "สกลนคร", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อำนาจเจริญ",
  "อุดรธานี", "อุบลราชธานี",
];

/** ภาคเหนือ — 9 provinces (matches "ชีต5" + the legacy NORTH set). */
const NORTH_9 = [
  "เชียงราย", "เชียงใหม่", "น่าน", "พะเยา", "แพร่", "แม่ฮ่องสอน", "ลำปาง",
  "ลำพูน", "อุตรดิตถ์",
];

/**
 * Typos / short names / legacy misspellings → canonical province.
 * Every alias below was OBSERVED in the workbook (or in the legacy
 * `PROVINCE_RULES` this SOT supersedes) — no speculative entries.
 */
const PROVINCE_ALIASES = {
  // typos
  "ศรีสระเกษ":  "ศรีสะเกษ",
  "ศรีสะเกส":   "ศรีสะเกษ",
  "เพชบูรณ์":   "เพชรบูรณ์",
  "เพรชบุรี":   "เพชรบุรี",
  "กาฬสิน":     "กาฬสินธุ์",
  "นาราธิวาส":  "นราธิวาส",
  "สุมุทรปราการ": "สมุทรปราการ",
  "สมุทรปราการ": "สมุทรปราการ",
  // short / colloquial names
  "โคราช":      "นครราชสีมา",
  "อุบล":       "อุบลราชธานี",
  "สุพรรณ":     "สุพรรณบุรี",
  "หนองบัว":    "หนองบัวลำภู",
  "อยุธยา":     "พระนครศรีอยุธยา",
  "กรุงเทพ":    "กรุงเทพมหานคร",
  "กทม":        "กรุงเทพมหานคร",
  "อุดร":       "อุดรธานี",
};

/**
 * RUNTIME-ONLY aliases — misspellings OBSERVED IN PROD address data
 * (`tb_forwarder.faddressprovince` + `tb_address.addressprovince`, probed
 * 2026-07-14). They are NOT workbook tokens, so they are deliberately kept OUT
 * of `PROVINCE_TOKENS` / `resolveProvince()` (adding them there could change how
 * a workbook cell is prefix-matched). They ARE emitted into the runtime
 * `PROVINCE_ALIASES` so `canonicalProvince()` resolves a real customer address.
 *
 * Why it matters now: the carrier list is CLOSED to this workbook (owner
 * 2026-07-14) — an address whose province does not canonicalise shows an EMPTY
 * private-carrier list, so a typo province = staff cannot book a courier.
 *
 * Counts at time of writing (prod):
 *   "กทม."          ×7  → handled by the trailing-dot strip → "กทม" (alias)
 *   "กรุงเทพฯ…"      ×1  → handled by the ฯ strip           → "กรุงเทพ…" (alias)
 *   "ปุมธานี"        ×2  ("จ.ปุมธานี")
 *   "สมุทปราการ"     ×1
 *   "นคสวรรค์"       ×1
 *   "สุราษฏร์ธานี"    ×1  (ฏ ปฏัก vs ฎ ชฎา)
 */
const RUNTIME_ONLY_ALIASES = {
  "ปุมธานี":       "ปทุมธานี",
  "สมุทปราการ":    "สมุทรปราการ",
  "นคสวรรค์":      "นครสวรรค์",
  "สุราษฏร์ธานี":   "สุราษฎร์ธานี",
};

/** What the generated file exports (workbook aliases ∪ prod-observed aliases). */
const RUNTIME_ALIASES = { ...PROVINCE_ALIASES, ...RUNTIME_ONLY_ALIASES };

// ────────────────────────────────────────────────────────────
// Carrier name → legacy `tb_forwarder.fshipby` code.
// Source: lib/cart/ship-by-eligibility.ts PCSFAM_ALL_OPTIONS (the legacy
// api-shipBy.php option list). ALL 28 workbook carriers already have a
// legacy code — no new code, no free-text name column, NO MIGRATION.
// ────────────────────────────────────────────────────────────
const LEGACY_SHIPBY_CODE = {
  "Flash Express":                "2",
  "J&T Express":                  "24",
  "ธนามัย ขนส่งด่วน":              "13",
  "จันทร์สว่างขนส่ง":              "12",
  "บุญอนันต์ขนส่ง":                "14",
  "SB สมใจขนส่ง":                 "7",
  "พี.เจ. ด่วนอีสาน ขนส่ง":         "15",
  "มะม่วงขนส่ง":                  "16",
  "เคพีเอ็น":                     "9",
  "PL ขนส่งด่วน":                 "23",
  "เฟิร์ส เอ็กเพรส ขนส่ง":          "10",
  "นิ่มซี่เส็งขนส่ง 1988":           "21",
  "วันชนะ แอนด์ วันณิสา ขนส่ง":     "17",
  "สมพงษ์อุบลรัตน์ ขนส่ง":          "18",
  "ธนาไพศาล ขนส่ง":               "22",
  "J.K. เอ็กซ์เพรส":               "3",
  "S & J ขนส่งด่วนสุพรรณบุรี":      "6",
  "ตองสอง ขนส่ง":                 "20",
  "อาร์.ซี.อาร์ เพลส":             "19",
  "ทรัพย์ปรีชา":                   "27",
  "พัฒนาเอ็กส์เพลส":               "28",
  "หาดใหญ่ทัวร์":                  "29",
  "PM ชลบุรี ขนส่งด่วน":           "26",
  "อาร์.ซี.เอ็กซเพรส":             "31",
  "หาดใหญ่ โอ.พี. 2012":           "30",
  "สี่สหาย":                      "32",
  "แพปลาสมบัติวัฒนา":              "33",
  "ทวีทรัพย์ระยอง ขนส่ง":           "34",
};

/** Latin slug per carrier (from the workbook's own "ชีต2" sheet, extended). */
const CARRIER_SLUG = {
  "Flash Express":                "FlashExpress",
  "J&T Express":                  "JandTExpress",
  "ธนามัย ขนส่งด่วน":              "Thanamaiexpressdelivery",
  "จันทร์สว่างขนส่ง":              "ChansawangTransport",
  "บุญอนันต์ขนส่ง":                "BoonananTransport",
  "SB สมใจขนส่ง":                 "SBSomjaiTransport",
  "พี.เจ. ด่วนอีสาน ขนส่ง":         "P_J_ExpressIsaanTransport",
  "มะม่วงขนส่ง":                  "MangoTransport",
  "เคพีเอ็น":                     "KPN",
  "PL ขนส่งด่วน":                 "PLExpressDelivery",
  "เฟิร์ส เอ็กเพรส ขนส่ง":          "FirstExpressTransport",
  "นิ่มซี่เส็งขนส่ง 1988":           "NimSeeSengTransport1988",
  "วันชนะ แอนด์ วันณิสา ขนส่ง":     "WanchanaandWannisaTransport",
  "สมพงษ์อุบลรัตน์ ขนส่ง":          "SompongUbonratTransport",
  "ธนาไพศาล ขนส่ง":               "ThanapaisarnTransport",
  "J.K. เอ็กซ์เพรส":               "J_K_Express",
  "S & J ขนส่งด่วนสุพรรณบุรี":      "SandJExpressDeliverySuphanburi",
  "ตองสอง ขนส่ง":                 "TongSongTransport",
  "อาร์.ซี.อาร์ เพลส":             "R_C_R_Place",
  "ทรัพย์ปรีชา":                   "SappreechaTransportPart",
  "พัฒนาเอ็กส์เพลส":               "PattanaExpressPlace",
  "หาดใหญ่ทัวร์":                  "HatYaiTransportTour",
  "PM ชลบุรี ขนส่งด่วน":           "PMChonburi",
  "อาร์.ซี.เอ็กซเพรส":             "RCExpress",
  "หาดใหญ่ โอ.พี. 2012":           "HatYaiOP2012",
  "สี่สหาย":                      "SiSahai",
  "แพปลาสมบัติวัฒนา":              "PaePlaSombatWattana",
  "ทวีทรัพย์ระยอง ขนส่ง":           "TaweeSapRayong",
};

// ────────────────────────────────────────────────────────────
// Cell parsing
// ────────────────────────────────────────────────────────────

/** Strip zero-width / NBSP junk + collapse whitespace. */
function clean(raw) {
  return String(raw ?? "")
    .replace(/[​-‏⁠﻿ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PROVINCE_SET = new Set(PROVINCES_77);

/**
 * Resolve a bare province token (exact / alias / จังหวัด-prefixed) → canonical,
 * else null.
 *
 * ⚠ The "จ." prefix strip REQUIRES the dot. An optional-dot `^จ\.?` would eat
 * the leading จ of "จันทบุรี" and silently drop the province (real bug, caught
 * by the parse report — จันทบุรี went missing for 3 carriers).
 */
function resolveProvince(token) {
  let t = clean(token).replace(/^จ\.\s*/, "").replace(/^จังหวัด\s*/, "");
  if (!t) return null;
  if (PROVINCE_SET.has(t)) return t;
  if (PROVINCE_ALIASES[t]) return PROVINCE_ALIASES[t];
  return null;
}

/**
 * Longest-first list of every recognisable province token (canonical + alias)
 * so "สุพรรณบุรี" wins over "สุพรรณ" when prefix-matching.
 */
const PROVINCE_TOKENS = [
  ...PROVINCES_77,
  ...Object.keys(PROVINCE_ALIASES),
].sort((a, b) => b.length - a.length);

/**
 * Split "<province><separator><note>" — returns { province, note } or null
 * when the cell does not START with a known province token.
 */
function splitProvinceNote(cell) {
  for (const tok of PROVINCE_TOKENS) {
    if (!cell.startsWith(tok)) continue;
    const rest = cell.slice(tok.length);
    // A bare province.
    if (!rest) return { province: resolveProvince(tok), note: "" };
    // Must be followed by a separator — otherwise it's a different word that
    // merely starts with the same letters (e.g. "เลย" vs "เลยไปบางอำเภอ").
    const m = rest.match(/^\s*[:：\-–(（]?\s*(.*?)\s*[)）]?\s*$/);
    if (!/^[\s:：\-–(（]/.test(rest)) continue;
    return { province: resolveProvince(tok), note: clean(m ? m[1] : rest) };
  }
  return null;
}

/**
 * Classify ONE cell for a carrier.
 * Returns { kind: "all" | "isaan" | "isaan-except" | "north" | "province" | "note", … }
 */
function classifyCell(rawCell) {
  const cell = clean(rawCell);
  if (!cell) return null;

  // "ทุกจังหวัด" (whole-country)
  if (/^ทุกจังหวัด/.test(cell)) {
    return { kind: "all", provinces: [...PROVINCES_77], note: cell === "ทุกจังหวัด" ? "" : cell };
  }

  // "ไปทุกจังหวัดในอีสาน ยกเว้น บึงกาฬ ชัยภูมิ"
  if (/ทุกจังหวัด.*อีสาน/.test(cell) && /ยกเว้น/.test(cell)) {
    const after = cell.split("ยกเว้น")[1] ?? "";
    const excluded = [];
    const unresolvedExcl = [];
    for (const tok of after.split(/[,\s/]+/).filter(Boolean)) {
      const p = resolveProvince(tok);
      if (p) excluded.push(p);
      else unresolvedExcl.push(tok);
    }
    return {
      kind: "isaan-except",
      provinces: ISAAN_20.filter((p) => !excluded.includes(p)),
      excluded,
      unresolvedExcl,
      note: cell,
    };
  }

  // "ภาคอีสานทุกจังหวัด"
  if (/^ภาคอีสาน/.test(cell) || /^อีสานทุกจังหวัด/.test(cell)) {
    return { kind: "isaan", provinces: [...ISAAN_20], note: cell === "ภาคอีสานทุกจังหวัด" ? "" : cell };
  }

  // "ภาคเหนือทุกจังหวัด ไม่ทุกอำเภอ อีสาน อุดร ขอนแก่น โคราช …"
  if (/^ภาคเหนือ/.test(cell)) {
    const extra = [];
    for (const tok of PROVINCE_TOKENS) {
      // only pick up provinces the note explicitly names AFTER the region word
      if (cell.slice("ภาคเหนือ".length).includes(tok)) {
        const p = resolveProvince(tok);
        if (p && !NORTH_9.includes(p) && !extra.includes(p)) extra.push(p);
      }
    }
    return { kind: "north", provinces: [...NORTH_9, ...extra], extra, note: cell };
  }

  // Bare province.
  const bare = resolveProvince(cell);
  if (bare) return { kind: "province", province: bare, note: "" };

  // "<province> <note>" / "<province>: <note>" / "<province> (<note>)"
  const split = splitProvinceNote(cell);
  if (split?.province) {
    return { kind: "province", province: split.province, note: split.note, raw: cell };
  }

  // Anything else = a carrier-level note (เริ่มต้น 30 · ไม่รับสาย · ลาดบัวหลวง …).
  return { kind: "note", note: cell };
}

// ────────────────────────────────────────────────────────────
// Parse
// ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const EMIT = argv.includes("--emit");
const xlsxArgIdx = argv.indexOf("--xlsx");
const XLSX_PATH =
  xlsxArgIdx >= 0
    ? argv[xlsxArgIdx + 1]
    : "C:/Users/Admin/Downloads/บริษัทขนส่ง_พื้นที่ขนส่ง(จังหวัด).xlsx";

const OUT_PATH = path.resolve("lib/forwarder/carrier-province-coverage.ts");

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`[FATAL] xlsx not found: ${XLSX_PATH}`);
  process.exit(1);
}

assertProvinceParity();

const wb = xlsx.readFile(XLSX_PATH);
if (!wb.SheetNames.includes("main")) {
  console.error(`[FATAL] sheet "main" not found (${wb.SheetNames.join(", ")})`);
  process.exit(1);
}
const rows = xlsx.utils.sheet_to_json(wb.Sheets["main"], {
  header: 1,
  raw: false,
  defval: "",
});

const header = (rows[0] ?? []).map(clean);
const carriers = [];
let unresolvedTotal = 0;

for (let col = 1; col < header.length; col++) {
  const name = header[col];
  if (!name) continue;

  const provinces = [];         // canonical, deduped, in sheet order
  const provinceNotes = {};     // province → restriction note
  const carrierNotes = [];      // pure-note cells
  const expansions = [];        // report: how a special value expanded
  const judgements = [];        // report: every non-trivial call

  for (let r = 1; r < rows.length; r++) {
    const raw = (rows[r] ?? [])[col];
    const c = classifyCell(raw);
    if (!c) continue;

    const addProvince = (p, note) => {
      if (!provinces.includes(p)) provinces.push(p);
      if (note) {
        provinceNotes[p] = provinceNotes[p]
          ? `${provinceNotes[p]} · ${note}`
          : note;
      }
    };

    switch (c.kind) {
      case "all":
        c.provinces.forEach((p) => addProvince(p));
        expansions.push(`"${clean(raw)}" → ทุกจังหวัด (77)`);
        if (c.note && c.note !== "ทุกจังหวัด") carrierNotes.push(c.note);
        break;
      case "isaan":
        c.provinces.forEach((p) => addProvince(p));
        expansions.push(`"${clean(raw)}" → ภาคอีสาน (20)`);
        if (c.note) carrierNotes.push(c.note);
        break;
      case "isaan-except":
        c.provinces.forEach((p) => addProvince(p));
        expansions.push(
          `"${clean(raw)}" → ภาคอีสาน (20) − [${c.excluded.join(", ")}] = ${c.provinces.length}`,
        );
        carrierNotes.push(c.note);
        if (c.unresolvedExcl.length) {
          unresolvedTotal += c.unresolvedExcl.length;
          judgements.push(
            `⚠ ยกเว้น token(s) not resolved: ${c.unresolvedExcl.join(", ")}`,
          );
        }
        break;
      case "north":
        c.provinces.forEach((p) => addProvince(p));
        expansions.push(
          `"${clean(raw)}" → ภาคเหนือ (9)${c.extra.length ? ` + จากหมายเหตุ [${c.extra.join(", ")}]` : ""}`,
        );
        carrierNotes.push(c.note);
        judgements.push(
          `JUDGEMENT: expanded ภาคเหนือ→9 and pulled the Isaan provinces named in the note (${c.extra.join(", ") || "none"}); the full cell is kept as a carrier note.`,
        );
        break;
      case "province":
        addProvince(c.province, c.note);
        if (c.note) {
          judgements.push(`"${c.raw}" → ${c.province} + note "${c.note}"`);
        } else if (clean(raw) !== c.province) {
          judgements.push(`alias "${clean(raw)}" → ${c.province}`);
        }
        break;
      case "note":
        carrierNotes.push(c.note);
        judgements.push(`NOT-A-PROVINCE → carrier note: "${c.note}"`);
        break;
    }
  }

  const code = LEGACY_SHIPBY_CODE[name];
  if (!code) {
    unresolvedTotal++;
    judgements.push(`⚠ NO legacy fshipby code mapped for this carrier name`);
  }

  carriers.push({
    name,
    code: code ?? "",
    slug: CARRIER_SLUG[name] ?? "",
    provinces,
    provinceNotes,
    carrierNotes,
    expansions,
    judgements,
  });
}

// ────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────

console.log("═".repeat(78));
console.log("PARSE REPORT — บริษัทขนส่ง × พื้นที่ขนส่ง(จังหวัด)");
console.log("═".repeat(78));
console.log(`source        : ${XLSX_PATH}`);
console.log(`carriers      : ${carriers.length}`);
console.log(`provinces SOT : ${PROVINCES_77.length} canonical · ${ISAAN_20.length} Isaan · ${NORTH_9.length} North`);
console.log("");

for (const c of carriers) {
  console.log(
    `── ${c.name}  [fshipby=${c.code || "??"} · ${c.slug || "no-slug"}]  → ${c.provinces.length} จังหวัด`,
  );
  console.log(`     provinces: ${c.provinces.join(", ") || "(none)"}`);
  for (const e of c.expansions) console.log(`     expand   : ${e}`);
  for (const [p, n] of Object.entries(c.provinceNotes))
    console.log(`     note[${p}]: ${n}`);
  for (const n of c.carrierNotes) console.log(`     note     : ${n}`);
  for (const j of c.judgements) console.log(`     · ${j}`);
  console.log("");
}

const provinceCoverage = new Map();
for (const c of carriers)
  for (const p of c.provinces)
    provinceCoverage.set(p, (provinceCoverage.get(p) ?? 0) + 1);
const uncovered = PROVINCES_77.filter((p) => !provinceCoverage.has(p));

console.log("─".repeat(78));
console.log(`provinces with ≥1 carrier : ${provinceCoverage.size}/77`);
console.log(`provinces with NO carrier : ${uncovered.length ? uncovered.join(", ") : "(none)"}`);
console.log(`unresolved values         : ${unresolvedTotal}`);
console.log("─".repeat(78));

// ────────────────────────────────────────────────────────────
// Emit the SOT
// ────────────────────────────────────────────────────────────

if (!EMIT) {
  console.log("\n(dry run — pass --emit to write lib/forwarder/carrier-province-coverage.ts)");
  process.exit(unresolvedTotal ? 1 : 0);
}

const j = (v) => JSON.stringify(v);
const body = carriers
  .map((c) => {
    const notes = Object.entries(c.provinceNotes);
    const lines = [
      `  {`,
      `    name: ${j(c.name)},`,
      `    code: ${j(c.code)},`,
      `    slug: ${j(c.slug)},`,
      `    provinces: [${c.provinces.map(j).join(", ")}],`,
    ];
    if (notes.length) {
      lines.push(`    provinceNotes: {`);
      for (const [p, n] of notes) lines.push(`      ${j(p)}: ${j(n)},`);
      lines.push(`    },`);
    }
    if (c.carrierNotes.length) {
      lines.push(`    notes: [${c.carrierNotes.map(j).join(", ")}],`);
    }
    lines.push(`  },`);
    return lines.join("\n");
  })
  .join("\n");

const out = `/**
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
 * \`code\` = the legacy \`tb_forwarder.fshipby\` value (api-shipBy.php option id).
 * Every carrier in the workbook already has one → nothing new to store, and
 * NO migration is required.
 *
 * \`provinceNotes\` = a per-province delivery RESTRICTION typed into the sheet
 * ("ไม่เข้าวังน้ำเขียว / บัวลาย", "ส่งแค่บางเลน", "ไม่ไป เบตง") — show it to
 * staff next to the carrier so they don't book an out-of-area drop.
 * \`notes\` = carrier-level notes ("เริ่มต้น 30", "ไม่รับสาย", "ต้องแจ้งอำเภอก่อน").
 *
 * Selection only — this file has ZERO effect on the ค่าส่งไทย price engine.
 */

// The 77 canonical provinces live in ONE place (docs/conventions §13) —
// \`lib/thai-provinces.ts\`; the generator asserts parity with it before emitting.
import { isThaiProvince } from "@/lib/thai-provinces";

/** ภาคอีสาน — the 20 provinces "ภาคอีสานทุกจังหวัด" expands to. */
export const ISAAN_PROVINCES: readonly string[] = [
${ISAAN_20.map((p) => `  ${j(p)},`).join("\n")}
];

/** ภาคเหนือ — the 9 provinces "ภาคเหนือทุกจังหวัด" expands to. */
export const NORTH_PROVINCES: readonly string[] = [
${NORTH_9.map((p) => `  ${j(p)},`).join("\n")}
];

/** Typos / short names observed in the workbook OR in prod address data → canonical. */
export const PROVINCE_ALIASES: Readonly<Record<string, string>> = {
${Object.entries(RUNTIME_ALIASES).map(([a, p]) => `  ${j(a)}: ${j(p)},`).join("\n")}
};

export type CarrierCoverage = {
  /** Carrier display name (verbatim from the workbook header). */
  name: string;
  /** Legacy \`tb_forwarder.fshipby\` code. */
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
${body}
];

/**
 * Normalise a raw address province string → canonical, or "" when unknown.
 *
 * Handles what prod actually stores (probed 2026-07-14):
 *   "จ.ชลบุรี" · "จังหวัดสมุทรปราการ" · "กทม." · "กรุงเทพฯมหานคร" · "เชียงราย\\u200b"
 *
 * ⚠ The "จ." strip REQUIRES the dot — an optional-dot \`^จ\\.?\` would eat the
 * leading จ of "จันทบุรี".
 */
export function canonicalProvince(raw: string | null | undefined): string {
  const t = String(raw ?? "")
    .replace(/[\\u200b-\\u200f\\u2060\\ufeff\\u00a0]/g, "")
    .replace(/\\s+/g, " ")
    .trim()
    .replace(/^จ\\.\\s*/, "")
    .replace(/^จังหวัด\\s*/, "")
    .replace(/ฯ/g, "")   // กรุงเทพฯ · กรุงเทพฯมหานคร
    .replace(/\\.+$/, "") // กทม.
    .trim();
  if (!t) return "";
  if (isThaiProvince(t)) return t;
  return PROVINCE_ALIASES[t] ?? "";
}

/** Every carrier that serves \`province\` (canonicalised on the way in). */
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
`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, out, "utf8");
console.log(`\n✅ emitted ${OUT_PATH} (${carriers.length} carriers)`);
process.exit(unresolvedTotal ? 1 : 0);
