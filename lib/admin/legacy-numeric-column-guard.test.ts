/**
 * กันคลาส "เรียกเมธอดของ string บนคอลัมน์ที่จริงๆ เป็นตัวเลข" (owner 2026-07-28).
 *
 * 🔴 เคสจริงที่ทำให้ทั้งหน้าแตก: ปุ่ม "ย้อนการชำระ" บน /admin/wallet/pay-user
 * โยน `TypeError: funding.reforder2.trim is not a function` เพราะโค้ดเขียนว่า
 *     (funding.reforder2 ?? "").trim() !== ""
 * แต่ **`tb_wallet_hs.reforder2` เป็น NUMBER บน prod** (ต่างจาก `reforder` ที่เป็น text)
 * → พังทุกครั้งที่รายการนั้นเป็นการจ่ายแบบรวมสลิป (= การจ่ายแทนลูกค้าเกือบทุกใบ)
 * ทั้งที่ควรจะแค่ขึ้นข้อความว่า "ต้องให้บัญชีย้อนทั้งชุด".
 *
 * ทำไม tsc จับไม่ได้: type ที่ประกาศไว้ในไฟล์เขียนว่า `reforder2: string | null`
 * ตามความเชื่อ ไม่ใช่ตามของจริงใน DB — **type ที่มือคนเขียนเอง = คำกล่าวอ้าง ไม่ใช่ความจริง**
 * (PostgREST คืน number มาจริง). เทสนี้จึงสแกน "รูปแบบการเขียน" แทนการเชื่อ type.
 *
 * กติกา: คอลัมน์ในลิสต์นี้ ถ้าจะใช้เมธอดของ string ต้องห่อ `String(...)` เสมอ.
 *
 * Run: tsx lib/admin/legacy-numeric-column-guard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** คอลัมน์ legacy ที่ "หน้าตาเหมือน id ที่เป็นข้อความ" แต่ DB เก็บเป็นตัวเลข. */
const NUMERIC_COLUMNS = ["reforder2"];
const STRING_METHODS = ["trim", "toUpperCase", "toLowerCase", "startsWith", "includes", "padStart", "split"];

const ROOTS = ["actions", "lib", "app", "components", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist"]);

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !name.endsWith(".test.ts")) yield p;
  }
}

const offenders: string[] = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    for (const col of NUMERIC_COLUMNS) {
      for (const method of STRING_METHODS) {
        // จับ `<อะไรก็ได้>.reforder2 ?? "").trim(`  และ `.reforder2.trim(`
        // แต่ยกเว้นเมื่ออยู่หลัง `String(` ในบรรทัดเดียวกัน (ที่ถูกต้อง).
        const re = new RegExp(`\\.${col}(\\s*\\?\\?\\s*["'\`][^"'\`]*["'\`]\\s*\\))?\\s*\\.${method}\\(`);
        src.split("\n").forEach((line, i) => {
          if (!re.test(line)) return;
          const idx = line.indexOf(`.${col}`);
          const before = line.slice(0, idx);
          if (/String\(\s*[A-Za-z_$][\w$.]*$/.test(before)) return; // ห่อ String(...) แล้ว = ผ่าน
          offenders.push(`${file}:${i + 1} → ${line.trim().slice(0, 110)}`);
        });
      }
    }
  }
}

console.log("legacy-numeric-column-guard — คอลัมน์ตัวเลขต้องห่อ String() ก่อนใช้เมธอดของ string");
assert.deepEqual(
  offenders,
  [],
  `\n🔴 พบการเรียกเมธอดของ string บนคอลัมน์ที่เป็นตัวเลขจริง (จะพังตอนรัน · tsc จับไม่ได้):\n` +
    offenders.map((o) => "   " + o).join("\n") +
    `\n   วิธีแก้: ห่อด้วย String(...) เช่น String(row.reforder2 ?? "").trim()\n`,
);
console.log(`  ✓ สแกน ${ROOTS.join(", ")} — ไม่พบจุดที่เรียกตรงๆ`);

// เคสตรวจตัวเอง: ถ้าใครลบ String() ออก เทสต้องแดง (ป้องกันเทสที่ผ่านตลอดกาล)
{
  const bad = `const has = (funding.reforder2 ?? "").trim() !== "";`;
  const re = new RegExp(`\\.reforder2(\\s*\\?\\?\\s*["'\`][^"'\`]*["'\`]\\s*\\))?\\s*\\.trim\\(`);
  assert.equal(re.test(bad), true, "regex ต้องจับรูปแบบที่พังได้จริง");
  const good = `const has = String(funding.reforder2 ?? "").trim() !== "";`;
  const idx = good.indexOf(".reforder2");
  assert.equal(/String\(\s*[A-Za-z_$][\w$.]*$/.test(good.slice(0, idx)), true, "รูปแบบที่ถูกต้องต้องไม่ถูกจับ");
}
console.log("  ✓ ตัวจับพิสูจน์แล้วว่าจับของพังได้ และไม่จับของที่ถูก");
console.log("\n✅ legacy-numeric-column-guard: 3 assertions passed");
