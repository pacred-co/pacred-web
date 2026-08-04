/**
 * รันชุดยูนิตเทสทั้งหมด ทีละไฟล์ — แทนการต่อ `&&` ยาวๆ ใน package.json.
 *
 * 🔴 เหตุผล (2026-08-04): `test:unit` เดิมเป็นคำสั่งเดียวยาว 10,557 ตัวอักษร
 * เกินเพดานบรรทัดคำสั่งของ Windows (8,191) → `pnpm test:unit` ตายทันทีด้วย
 * "The command line is too long." ⇒ เกตยูนิตเทสรันไม่ได้เลยบนเครื่อง Windows
 * (เหลือแค่ tsc/lint). ตัวนี้ spawn ทีละไฟล์จึงไม่ชนเพดาน.
 *
 * พฤติกรรมเหมือนเดิม: ลำดับเดิม · หยุดทันทีที่ตก (fail-fast แบบ &&) · exit 1 เมื่อตก.
 * รายชื่อเทสอยู่ที่ `scripts/unit-tests.mjs` — เพิ่มเทสใหม่ที่ไฟล์นั้น.
 *
 * รัน: pnpm test:unit
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { UNIT_TESTS, INTEGRATION_TESTS } from "./unit-tests.mjs";

// `pnpm test` = ยูนิต + เทสที่ต่อ DB จริง · `pnpm test:unit` = ยูนิตล้วน (เกตก่อน push)
const withIntegration = process.argv.includes("--with-integration");
const TESTS = withIntegration ? [...UNIT_TESTS, ...INTEGRATION_TESTS] : UNIT_TESTS;

const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(1);

// เรียก tsx ตรงๆ ผ่าน node — ไม่ผ่าน `npx` + `shell:true` (ช้ากว่า · ขึ้น
// DeprecationWarning DEP0190 ทุกไฟล์ · และ shell ทำให้อาร์กิวเมนต์ไม่ถูก escape)
const TSX_CLI = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));

for (const [i, entry] of TESTS.entries()) {
  const res = spawnSync(process.execPath, [TSX_CLI, ...entry.split(" ").filter(Boolean)], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.error(`\n✗ ตกที่ไฟล์ที่ ${i + 1}/${TESTS.length}: ${entry}`);
    console.error(`ยูนิตเทสไม่ผ่าน (${secs()}s)`);
    process.exit(1);
  }
}

console.log(`\n✓ ยูนิตเทสผ่านครบ ${TESTS.length} ไฟล์ (${secs()}s)`);
