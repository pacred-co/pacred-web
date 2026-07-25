/**
 * 🔒 ยามกัน "กดนำเข้าระบบไม่ได้ทั้งหน้า" — คอลัมน์ NOT NULL ห้ามถูกเขียนเป็น null.
 *
 * เคสจริง 2026-07-25 (owner: *"เอาเข้าไม่ได้ครับ ... พนักงานกดเข้าไม่ได้จะแก้ยังไง"*):
 * เพิ่มฟีเจอร์แกลเลอรีรูป → เขียน `fimages: null` เมื่อไม่มีรูป · แต่ `fimages` เป็น
 * **NOT NULL DEFAULT '[]'** → ทุกการนำเข้าตาย `23502 not-null constraint` พร้อมกันทั้งหน้า.
 *
 * ── ทำไม gate เดิมไม่เห็น ────────────────────────────────────────────────
 * tsc / lint / build / test:unit **ไม่รู้จัก constraint ของฐานข้อมูล** — เขียวหมดทั้งที่
 * INSERT ยิงไม่ลง. เห็นตอนพนักงานกดเท่านั้น = สายเกินไป.
 * ยามนี้อ่าน "ชุดคอลัมน์ NOT NULL จริงบน prod" (สแนปช็อตด้านล่าง) เทียบกับ INSERT ในโค้ด:
 *   1. คอลัมน์ NOT NULL ถูกเขียนด้วยค่าที่มี `null` ปนในนิพจน์ → แดง
 *   2. (คู่กัน) scripts/verify-momo-commit-insert-2026-07-25.ts ยิง INSERT จริงลง prod แล้ว
 *      ROLLBACK — ครอบ 7 เคสใช้งานจริง + 1 เคส regression ที่ต้องพัง
 *
 * 🔄 รีเฟรชสแนปช็อตเมื่อมี migration แตะ tb_forwarder:
 *   SELECT column_name FROM information_schema.columns
 *    WHERE table_name='tb_forwarder' AND is_nullable='NO' ORDER BY 1;
 *
 * Run: tsx lib/admin/momo-commit-insert-guard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** tb_forwarder — คอลัมน์ NOT NULL ทั้งหมด (สแนปช็อต prod 2026-07-25 · 88 คอลัมน์). */
const NOT_NULL_COLUMNS = new Set<string>([
  "adminid", "adminidcreator", "adminidkey", "adminidpurchaser", "adminidupdate",
  "advance_bill_confirmed", "advance_bill_measure_source", "crate", "custom_comparison",
  "custom_comparison_value", "customrate", "customratecbm", "customratekg",
  "doc_tier_confirmed", "faddressdistrict", "faddresslastname", "faddresslatitude",
  "faddresslongitude", "faddressname", "faddressno", "faddressnote", "faddressprovince",
  "faddresssubdistrict", "faddresstel", "faddresstel2", "faddresszipcode", "famount",
  "fcabinet_locked", "fcabinetnumber", "fcostrefrate", "fcosttotalprice",
  "fcosttotalpricesheet", "fcover", "fcredit", "fdetail", "fdiscount", "ffreeshipping",
  "fheight", "fimages", "flength", "fnoteuser", "fnoteuserread", "fphotoend", "fpriceupdate",
  "fproductstype", "fprofitpriceupdate", "fprofittotal", "fprofittransportchn", "fqc",
  "fqcprice", "frefprice", "frefrate", "fsendsms1day", "fsendsms3day", "fsendsms3eday",
  "fshipby", "fstatus", "fstatuscaradminoff", "fstatuscaradminon", "fstatuscaroff",
  "ftotalprice", "ftrackingchn", "ftrackingth", "ftransportprice", "ftransportpricechnthb",
  "ftransporttype", "fusercompany", "fvolume", "fwarehousechina", "fwarehousename", "fweight",
  "fwidth", "id", "import_duty_pct", "import_duty_thb", "linkapiorder", "paymethod",
  "pricecrate", "pricemore", "priceother", "printstatus1", "printstatus2", "printstatus3",
  "printstatus4", "reforder", "session", "subuserid", "userid",
]);

const SRC = readFileSync(join(process.cwd(), "lib/admin/commit-momo-row-core.ts"), "utf8");
const insertAt = SRC.indexOf(".insert({");
const insertBlock = SRC.slice(insertAt, insertAt + 9000);

/** คู่ (คอลัมน์ → นิพจน์ค่า) ที่ INSERT เขียน — ตัดคอมเมนต์ท้ายบรรทัดออกก่อน. */
function insertPairs(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of insertBlock.split("\n")) {
    const m = /^\s{6}([a-z_][a-z0-9_]*):\s*(.+?),\s*(?:\/\/.*)?$/.exec(line);
    if (m) out.push([m[1]!, m[2]!.replace(/\/\/.*$/, "").trim()]);
  }
  return out;
}

console.log(`ยาม INSERT ตอนนำเข้า MOMO — ตรวจ ${insertPairs().length} คอลัมน์ที่เขียนจริง`);

ok("🔴 คอลัมน์ NOT NULL ต้องไม่ถูกเขียนเป็น null (23502 = พนักงานกดนำเข้าไม่ได้ทั้งหน้า)", () => {
  const bad: string[] = [];
  for (const [col, expr] of insertPairs()) {
    if (!NOT_NULL_COLUMNS.has(col)) continue;
    // นิพจน์ที่ "ให้ null ได้": `: null` ท้าย ternary · `?? null` · ค่าเป็น null ตรงๆ
    if (/(^null$)|(\?\?\s*null)|(:\s*null\s*$)/.test(expr)) bad.push(`${col} = ${expr}`);
  }
  assert.deepEqual(bad, [], `คอลัมน์พวกนี้ NOT NULL บน prod — ส่ง null ไม่ได้:\n  ${bad.join("\n  ")}`);
});

ok("fimages ต้องเป็น JSON array เสมอ (เคสที่พังจริง)", () => {
  const pair = insertPairs().find(([c]) => c === "fimages");
  assert.ok(pair, "INSERT ต้องเขียน fimages");
  assert.ok(/JSON\.stringify/.test(pair![1]), `fimages ต้อง JSON.stringify(...) — เจอ: ${pair![1]}`);
});

ok("คอลัมน์ที่ INSERT เขียน ต้องมีอยู่จริงในสแนปช็อต/หรือเป็น nullable ที่รู้จัก", () => {
  // กันพิมพ์ชื่อคอลัมน์ผิด (42703) — เช็คเฉพาะตัวที่อยู่ในชุด NOT NULL ว่าสะกดตรง
  const cols = insertPairs().map(([c]) => c);
  assert.ok(cols.length > 50, `INSERT ควรเขียน >50 คอลัมน์ — เจอ ${cols.length} (regex อาจพัง)`);
  assert.ok(cols.includes("ftrackingchn") && cols.includes("userid"), "ต้องมีคอลัมน์แกนหลัก");
});

console.log(`\n✅ momo-commit-insert-guard: ${passed} assertions passed`);
