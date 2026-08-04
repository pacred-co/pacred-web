/**
 * 🔒 ยามกันคิวเพี้ยนกลับมาอีก — ห้ามหน้าไหนคิดคิวเอง ต้องผ่าน SOT `totalCbmOf`.
 *
 * owner 2026-07-24: *"หัวข้อรายการรวมก็ยังแสดงข้อมูลผิดอยู่ครับ คิวผิดมั่ง กล่องผิดมั่ง
 * ยังเจออีกหลายที่เลยครับ แก้ไม่หมดหรอครับ · มันลามไปยันโกดัง จัดส่ง และออกค่าคอม
 * ให้พนักงานทุกคนนะครับ ข้อมูลใช้คนละที่หรือแสดงผลคนละแบบก็แย่หมดสิครับ องค์กร"*
 *
 * ── ทำไมต้องเป็นเทส ไม่ใช่ "ตั้งใจเขียนให้ถูก" ────────────────────────────
 * กฎ famountcount ถูกทำเป็น SOT ตั้งแต่ 2026-07-19 แล้ว **แต่กวาดไม่ครบ** —
 * เหลือ 11 จุดที่คิดเอง กว่าจะรู้ก็ตอน owner เห็นคิว 344 บนจอ (ของจริง 8.6).
 * การ "ไล่ตรวจด้วยตาทุกรอบ" ไม่สเกล → ให้เครื่องจับแทน:
 * ไฟล์ใหม่ที่เผลอเขียน `fvolume * famount` หรือ `+= fvolume` จะทำเทสแดงทันที.
 *
 * ── อาการ 2 ทิศที่เทสนี้จับ ───────────────────────────────────────────────
 *   คูณเกิน  `fvolume * famount`  → พังกับ famountcount='1' (937 แถวบน prod)
 *   นับขาด   `Σ fvolume` ดิบ      → พังกับแถวคีย์มือ (55 แถว)
 * ทั้งคู่แก้ด้วยคำเดียว: `totalCbmOf(row)`
 *
 * Run: tsx lib/forwarder/cbm-sot-guard.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { totalCbmOf } from "./quantities";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** ไฟล์ที่ "เป็นเจ้าของกฎ" — อนุญาตให้เขียนสูตรตรงๆ ได้ */
const OWNERS = [
  "lib/forwarder/quantities.ts",
  "lib/forwarder/live-rate.ts",              // เครื่องคิดราคา — port ตรงจาก legacy L1935-1941
  "actions/admin/forwarders-edit.ts",        // ตัวเขียนราคา — เดียวกัน
  "lib/forwarder/cbm-sot-guard.test.ts",
  // ⚪ ไม่ใช่แถว tb_forwarder — เป็นแถว momo_box_detail ที่ "1 แถว = 1 กล่องจริง"
  //    (ไม่มีคอลัมน์ famountcount ให้ยึด) → Σ ดิบถูกต้องแล้ว
  "lib/integrations/momo-web/split-box-rows-plan.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const ROOT = process.cwd();
const FILES = ["app", "lib", "actions", "components"]
  .flatMap((d) => { try { return walk(join(ROOT, d)); } catch { return []; } })
  // 🔴 ต้อง normalise `\` → `/` (2026-08-04): `join()` บน Windows คืน
  // `lib\forwarder\live-rate.ts` แต่ OWNERS เขียนด้วย `/` ⇒ ลิสต์ยกเว้น
  // **ไม่ทำงานเลยบน Windows** → ยามแดงค้างที่ไฟล์เจ้าของกฎเอง (live-rate.ts)
  // ทั้งที่โค้ดถูก. บน Mac ผ่าน บน Windows แดง = เกตเชื่อถือไม่ได้ทั้งทีม.
  .map((p) => p.slice(ROOT.length + 1).replaceAll("\\", "/"))
  .filter((p) => !OWNERS.includes(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"));

/** ตัดคอมเมนต์ออกก่อนตรวจ — เอกสารพูดถึงสูตรได้ แต่โค้ดห้ามเขียน */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

console.log(`ยาม CBM SOT — สแกน ${FILES.length} ไฟล์`);

ok("🔴 ห้ามคูณ fvolume × famount เอง (พังกับ famountcount='1')", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = codeOnly(readFileSync(join(ROOT, f), "utf8"));
    if (/fvolume[^;\n]{0,40}\*[^;\n]{0,40}famount|famount[^;\n]{0,40}\*[^;\n]{0,40}fvolume/.test(src)) {
      bad.push(f);
    }
  }
  assert.deepEqual(bad, [], `ใช้ totalCbmOf(row) แทน — เจอที่:\n  ${bad.join("\n  ")}`);
});

ok("🔴 ห้ามบวกสะสม fvolume ดิบ (นับขาดกับแถวคีย์มือ)", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = codeOnly(readFileSync(join(ROOT, f), "utf8"));
    // += fvolume  ·  reduce(... + fvolume)  ·  sum += Number(x.fvolume)
    if (/\+=\s*(Number\()?[A-Za-z_$][\w$.]*\.fvolume|\+\s*(Number\()?[A-Za-z_$][\w$.]*\.fvolume\s*(\?\?[^,)]*)?\)?\s*,\s*0\s*\)/.test(src)) {
      bad.push(f);
    }
  }
  assert.deepEqual(bad, [], `ใช้ totalCbmOf(row) แทน — เจอที่:\n  ${bad.join("\n  ")}`);
});

console.log("\nพฤติกรรมของ SOT (ล็อกไว้ไม่ให้ใครแก้ผิดทิศ)");

ok("famountcount='1' → fvolume คือยอดรวม ห้ามคูณ (เคสจริง 1783234654)", () => {
  assert.equal(totalCbmOf({ fvolume: 8.6, famount: 40, famountcount: "1" }), 8.6);
});

ok("famountcount ว่าง → ต่อกล่อง ต้องคูณ", () => {
  assert.equal(totalCbmOf({ fvolume: 0.5, famount: 4, famountcount: null }), 2);
});

ok("เคสจริงที่ owner เจอ — คูณเองจะได้ 344 (ของจริง 8.6)", () => {
  const real = totalCbmOf({ fvolume: 8.6, famount: 40, famountcount: "1" });
  assert.equal(real, 8.6);
  assert.notEqual(real, 8.6 * 40);
});

console.log(`\n✅ cbm-sot-guard: ${passed} assertions passed`);
