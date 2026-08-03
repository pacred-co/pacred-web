/**
 * Unit tests สำหรับ lib/admin/dimension-audit-verdict.ts — ตัวตัดสิน
 * "ใครแก้ขนาด/คิว เมื่อไร แล้วมันเสียหายไหม".
 *
 * ⚠️ ตัวเลขทุกตัวในไฟล์นี้เป็น **ของจริงจาก prod** (fid 52447 · `1783582423-23` ·
 * PR179 · 28 กล่อง) ที่ integrator ตรวจจาก `admin_audit_log` action
 * `tb_forwarder.update_dimensions` มาแล้ว — ห้ามกุตัวเลขเอง (fixture ปลอมเคยหลอก
 * ทั้ง agent และ verifier มาแล้ว · AGENTS §0b).
 *
 * ทั้ง 8 ครั้งบน 52447:
 *   25/07 10:41  ขวัญเรือน (admin_ploy)  83×60×30 → 83×60×30   4.1832 → 4.1832
 *   31/07 07:36  สรวิชญ์  (admin_aom)    83×60×30 → 83×60×30   4.1832 → 4.1832
 *   31/07 07:47  ขวัญเรือน               83×60×30 → 82×59×29   4.1832 → 0.1403   ← เปลี่ยนจริง
 *   31/07 07:49  ขวัญเรือน               82×59×29 → 82×59×29   0.1403 → 0.1403
 *   31/07 08:07  ขวัญเรือน               82×59×29 → 82×59×29   0.1403 → 3.9284   ← เปลี่ยนจริง
 *   31/07 08:08  ขวัญเรือน               (ไม่เปลี่ยน)          3.9284 → 3.9284
 *   31/07 08:08  ขวัญเรือน               (ไม่เปลี่ยน)          3.9284 → 3.9284
 *   31/07 08:10  ขวัญเรือน               (ไม่เปลี่ยน)          3.9284 → 3.9284
 * MOMO วัด 4.1832 คิว · ระบบเหลือ 3.9284 ⇒ เก็บลูกค้าขาด ฿713.44 (เรทขาย 2,800/คิว)
 *
 * Run:  pnpm tsx lib/admin/dimension-audit-verdict.test.ts   (wired เข้า test:unit)
 */

import {
  toDimensionAuditEntry,
  summarizeDimensionAudit,
  describeEditor,
  CBM_TOLERANCE,
  type DimensionAuditEntry,
} from "./dimension-audit-verdict";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, actual: boolean) { assertEq(label, actual, true); }
function assertIncludes(label: string, haystack: string, needle: string) {
  if (haystack.includes(needle)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    "${haystack}"\n    ไม่มีคำว่า: "${needle}"`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── ข้อมูลจริง 52447 ────────────────────────────────────────────────────────
const PLOY = { adminName: "ขวัญเรือน บัวหลาง", adminLogin: "admin_ploy" };
const AOM = { adminName: "สรวิชญ์ กัวศรีนนท์", adminLogin: "admin_aom" };
const dim = (w: number, l: number, h: number, cbm: number) => ({ width: w, length: l, height: h, cbm });

const ENTRIES_52447: DimensionAuditEntry[] = [
  toDimensionAuditEntry({ at: "2026-07-25T10:41:00Z", ...PLOY, before: dim(83, 60, 30, 4.1832), after: dim(83, 60, 30, 4.1832) }),
  toDimensionAuditEntry({ at: "2026-07-31T07:36:00Z", ...AOM,  before: dim(83, 60, 30, 4.1832), after: dim(83, 60, 30, 4.1832) }),
  toDimensionAuditEntry({ at: "2026-07-31T07:47:00Z", ...PLOY, before: dim(83, 60, 30, 4.1832), after: dim(82, 59, 29, 0.1403) }),
  toDimensionAuditEntry({ at: "2026-07-31T07:49:00Z", ...PLOY, before: dim(82, 59, 29, 0.1403), after: dim(82, 59, 29, 0.1403) }),
  toDimensionAuditEntry({ at: "2026-07-31T08:07:00Z", ...PLOY, before: dim(82, 59, 29, 0.1403), after: dim(82, 59, 29, 3.9284) }),
  toDimensionAuditEntry({ at: "2026-07-31T08:08:00Z", ...PLOY, before: dim(82, 59, 29, 3.9284), after: dim(82, 59, 29, 3.9284) }),
  toDimensionAuditEntry({ at: "2026-07-31T08:08:30Z", ...PLOY, before: dim(82, 59, 29, 3.9284), after: dim(82, 59, 29, 3.9284) }),
  toDimensionAuditEntry({ at: "2026-07-31T08:10:00Z", ...PLOY, before: dim(82, 59, 29, 3.9284), after: dim(82, 59, 29, 3.9284) }),
];

// ── 1. แยก "เปลี่ยนจริง" ออกจาก "กดเซฟซ้ำ" ──────────────────────────────────
section("toDimensionAuditEntry — แยกกดเซฟซ้ำออกจากการแก้จริง (prod 52447)");
{
  assertEq("25/07 10:41 กดเซฟซ้ำค่าเดิม → changed=false", ENTRIES_52447[0].changed, false);
  assertEq("31/07 07:36 (admin_aom) กดเซฟซ้ำ → changed=false", ENTRIES_52447[1].changed, false);
  assertEq("31/07 07:47 ขนาด+คิวเปลี่ยน → changed=true", ENTRIES_52447[2].changed, true);
  assertEq("31/07 07:47 คิวหด 4.1832→0.1403 → delta −4.0429", ENTRIES_52447[2].cbmDelta, -4.0429);
  assertEq("31/07 07:49 กดเซฟซ้ำหลังแก้ → changed=false", ENTRIES_52447[3].changed, false);
  assertEq("31/07 08:07 ขนาดเท่าเดิมแต่คิวเปลี่ยน → changed=true", ENTRIES_52447[4].changed, true);
  assertEq("31/07 08:07 คิวขึ้น 0.1403→3.9284 → delta +3.7881", ENTRIES_52447[4].cbmDelta, 3.7881);
  assertEq("08:08 · 08:08 · 08:10 กดซ้ำล้วน → changed=false ทั้งสามครั้ง",
    [ENTRIES_52447[5].changed, ENTRIES_52447[6].changed, ENTRIES_52447[7].changed], [false, false, false]);
}

section("toDimensionAuditEntry — payload ที่มาเป็น string ก็อ่านได้ (ฝั่ง DB ส่งได้ทั้งสองแบบ)");
{
  const e = toDimensionAuditEntry({
    at: "2026-07-31T07:47:00Z", ...PLOY,
    before: { width: "83", length: "60", height: "30", cbm: "4.1832" },
    after: { width: 82, length: 59, height: 29, cbm: 0.1403 },
  });
  assertEq("string before → changed=true", e.changed, true);
  assertEq("string before → delta −4.0429", e.cbmDelta, -4.0429);
  const nullish = toDimensionAuditEntry({
    at: "2026-07-31T07:47:00Z", adminName: null, adminLogin: null,
    before: { width: null, length: undefined, height: "", cbm: null },
    after: { width: null, length: undefined, height: "", cbm: null },
  });
  assertEq("null/undefined ทุกช่อง → ไม่ระเบิด + changed=false", nullish.changed, false);
  assertEq("null ทุกช่อง → delta 0", nullish.cbmDelta, 0);
}

// ── 2. เคสจริง 52447 = alert ────────────────────────────────────────────────
section("summarizeDimensionAudit — เคสจริง 52447 (MOMO 4.1832 · ระบบ 3.9284 · เรท 2,800/คิว)");
{
  const s = summarizeDimensionAudit(ENTRIES_52447, {
    currentCbm: 3.9284,
    momoCbm: 4.1832,
    cbmSellRate: 2800,
  });
  assertEq("กดบันทึกทั้งหมด 8 ครั้ง", s.totalEdits, 8);
  assertEq("เปลี่ยนค่าจริงแค่ 2 ครั้ง (ที่เหลือกดซ้ำ)", s.realChanges, 2);
  assertEq("ครั้งล่าสุดที่เปลี่ยนจริง = 31/07 08:07", s.lastRealChange?.at, "2026-07-31T08:07:00Z");
  assertEq("คนแก้ล่าสุด = ขวัญเรือน", s.lastRealChange?.adminName, "ขวัญเรือน บัวหลาง");
  assertEq("คิวที่ถูกหดรวม 4.0429", s.cbmReducedTotal, 4.0429);
  assertEq("ขาดไป 0.2548 คิว", s.cbmShortfall, 0.2548);
  assertEq("เก็บลูกค้าขาด ฿713.44 (0.2548 × 2,800)", s.shortfallThb, 713.44);
  assertEq("ต่างจาก MOMO จริง", s.divergesFromMomo, true);
  assertEq("severity = alert", s.severity, "alert");
  assertIncludes("ข้อความบอกเลข MOMO", s.messageTh, "MOMO 4.1832");
  assertIncludes("ข้อความบอกเลขระบบ", s.messageTh, "ระบบ 3.9284");
  assertIncludes("ข้อความบอกเงินที่ขาด", s.messageTh, "฿713.44");
  assertIncludes("ข้อความบอกชื่อคนแก้ล่าสุด (owner จะได้ถามถูกคน)", s.messageTh, "ขวัญเรือน บัวหลาง (admin_ploy)");
}

section("summarizeDimensionAudit — 52447 แต่ไม่รู้เรทขาย → ยัง alert แต่บอกเป็น 'คิว'");
{
  const s = summarizeDimensionAudit(ENTRIES_52447, { currentCbm: 3.9284, momoCbm: 4.1832, cbmSellRate: null });
  assertEq("ยัง alert", s.severity, "alert");
  assertEq("ไม่มีเลขเงิน (ห้ามกุ)", s.shortfallThb, null);
  assertIncludes("บอกส่วนต่างเป็นคิวแทน", s.messageTh, "0.2548 คิว");
}

// ── 3. ไม่มีเลข MOMO = ห้าม alert เด็ดขาด ──────────────────────────────────
section("summarizeDimensionAudit — momoCbm = null → ห้ามเป็น alert (ไม่มีหลักฐานเทียบ)");
{
  const s = summarizeDimensionAudit(ENTRIES_52447, { currentCbm: 3.9284, momoCbm: null, cbmSellRate: 2800 });
  assertEq("severity = watch (ไม่ใช่ alert)", s.severity, "watch");
  assertEq("ไม่มีเลขเงินที่ขาด", s.shortfallThb, null);
  assertEq("cbmShortfall = 0 เมื่อเทียบไม่ได้", s.cbmShortfall, 0);
  assertEq("divergesFromMomo = false เมื่อเทียบไม่ได้", s.divergesFromMomo, false);
  assertIncludes("บอกตรงๆ ว่ายังไม่มีเลข MOMO", s.messageTh, "ยังไม่มีเลข MOMO");
  assertIncludes("ยังบอกชื่อคนแก้ล่าสุดได้", s.messageTh, "ขวัญเรือน บัวหลาง (admin_ploy)");
}
{
  const s = summarizeDimensionAudit(ENTRIES_52447, { currentCbm: 3.9284 });
  assertEq("ไม่ส่ง momoCbm มาเลย → watch", s.severity, "watch");
  const zero = summarizeDimensionAudit(ENTRIES_52447, { currentCbm: 3.9284, momoCbm: 0 });
  assertEq("momoCbm = 0 (ยังไม่ชั่ง) → watch ไม่ใช่ alert", zero.severity, "watch");
}

// ── 4. กดเซฟซ้ำล้วน = ok ────────────────────────────────────────────────────
section("summarizeDimensionAudit — กดเซฟซ้ำล้วน / ไม่เคยแก้");
{
  const repeats = ENTRIES_52447.filter((e) => !e.changed);
  const s = summarizeDimensionAudit(repeats, { currentCbm: 4.1832, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("6 ครั้ง แต่ไม่เปลี่ยนค่าเลย → ok", s.severity, "ok");
  assertEq("totalEdits = 6", s.totalEdits, 6);
  assertEq("realChanges = 0", s.realChanges, 0);
  assertEq("ไม่มี lastRealChange", s.lastRealChange, null);
  assertIncludes("ข้อความบอกว่ากดเซฟซ้ำ (จะได้ไม่ตกใจว่าแก้ 6 ครั้ง)", s.messageTh, "กดเซฟซ้ำ");
}
{
  const s = summarizeDimensionAudit([], { currentCbm: 4.1832, momoCbm: 4.1832 });
  assertEq("ไม่มีประวัติเลย → ok", s.severity, "ok");
  assertEq("ข้อความ 'ไม่เคยมีการแก้ขนาด'", s.messageTh, "ไม่เคยมีการแก้ขนาด");
}

// ── 5. แก้จริงแต่ยังตรง MOMO = watch (ของถูกต้อง ห้ามขึ้นแดง) ────────────────
section("summarizeDimensionAudit — แก้จริงแล้วคิวยังตรง MOMO → watch");
{
  const fixedIt: DimensionAuditEntry[] = [
    toDimensionAuditEntry({ at: "2026-07-31T07:47:00Z", ...PLOY, before: dim(83, 60, 30, 4.1832), after: dim(82, 59, 29, 0.1403) }),
    toDimensionAuditEntry({ at: "2026-07-31T08:07:00Z", ...PLOY, before: dim(82, 59, 29, 0.1403), after: dim(83, 60, 30, 4.1832) }),
  ];
  const s = summarizeDimensionAudit(fixedIt, { currentCbm: 4.1832, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("หดแล้วแก้กลับให้ตรง → watch ไม่ใช่ alert", s.severity, "watch");
  assertEq("ไม่มีส่วนต่างเงิน", s.shortfallThb, null);
  assertEq("realChanges = 2", s.realChanges, 2);
  assertEq("cbmReducedTotal ยังบันทึกไว้ 4.0429 (มีการหดจริงในประวัติ)", s.cbmReducedTotal, 4.0429);
  assertIncludes("บอกว่ายอดตรงกับ MOMO", s.messageTh, "ยอดคิวยังตรงกับที่ MOMO วัด");
}

section("summarizeDimensionAudit — คิวระบบ 'สูงกว่า' MOMO → watch (เก็บเกิน ไม่ใช่เคสเก็บขาด)");
{
  const grew: DimensionAuditEntry[] = [
    toDimensionAuditEntry({ at: "2026-07-31T08:07:00Z", ...PLOY, before: dim(82, 59, 29, 4.1832), after: dim(83, 60, 30, 5.0) }),
  ];
  const s = summarizeDimensionAudit(grew, { currentCbm: 5.0, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("คิวโตกว่า MOMO → watch", s.severity, "watch");
  assertEq("divergesFromMomo = true (ต่างจริง)", s.divergesFromMomo, true);
  assertEq("shortfall ติดลบ (ไม่ได้เก็บขาด)", s.cbmShortfall, -0.8168);
  assertEq("ไม่คิดเงินที่ขาด", s.shortfallThb, null);
  assertIncludes("บอกว่าระบบสูงกว่า", s.messageTh, "ระบบสูงกว่า");
}

section("summarizeDimensionAudit — คิวต่ำกว่า MOMO แต่ไม่เคยมีการหด → watch (ไม่โยนความผิดให้คนแก้)");
{
  // แถวที่มาต่ำกว่า MOMO ตั้งแต่ commit (สาเหตุอื่น) แล้วมีคนมาแก้ให้ 'โต' ขึ้น
  const onlyGrew: DimensionAuditEntry[] = [
    toDimensionAuditEntry({ at: "2026-07-31T08:07:00Z", ...PLOY, before: dim(80, 50, 20, 3.0), after: dim(82, 59, 29, 3.9284) }),
  ];
  const s = summarizeDimensionAudit(onlyGrew, { currentCbm: 3.9284, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("ต่ำกว่า MOMO แต่ไม่มีใครหดคิว → watch", s.severity, "watch");
  assertEq("cbmReducedTotal = 0", s.cbmReducedTotal, 0);
}

// ── 6. tolerance กันเศษปัดกลายเป็นข้อกล่าวหา ────────────────────────────────
section("CBM_TOLERANCE — เศษปัดเล็กๆ ต้องไม่กลายเป็น alert");
{
  const shrunk: DimensionAuditEntry[] = [
    toDimensionAuditEntry({ at: "2026-07-31T08:07:00Z", ...PLOY, before: dim(83, 60, 30, 4.1832), after: dim(83, 60, 30, 4.1802) }),
  ];
  const within = summarizeDimensionAudit(shrunk, { currentCbm: 4.1802, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("ต่าง 0.003 (< 0.005) → watch", within.severity, "watch");
  assertTrue("tolerance = 0.005", CBM_TOLERANCE === 0.005);

  const beyond: DimensionAuditEntry[] = [
    toDimensionAuditEntry({ at: "2026-07-31T08:07:00Z", ...PLOY, before: dim(83, 60, 30, 4.1832), after: dim(83, 60, 30, 4.17) }),
  ];
  const outside = summarizeDimensionAudit(beyond, { currentCbm: 4.17, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("ต่าง 0.0132 (> 0.005) → alert", outside.severity, "alert");
}

// ── 7. เรียงลำดับ + ป้ายชื่อ ────────────────────────────────────────────────
section("summarizeDimensionAudit — เรียงใหม่→เก่าเสมอ ไม่ว่าจะส่งมาลำดับไหน");
{
  const reversed = [...ENTRIES_52447].reverse();
  const s = summarizeDimensionAudit(reversed, { currentCbm: 3.9284, momoCbm: 4.1832, cbmSellRate: 2800 });
  assertEq("ส่งมาเก่า→ใหม่ ก็ยังได้ lastRealChange = 08:07", s.lastRealChange?.at, "2026-07-31T08:07:00Z");
  assertEq("ผลลัพธ์เหมือนเดิม (alert · ฿713.44)", [s.severity, s.shortfallThb], ["alert", 713.44]);
}

section("describeEditor — ป้ายชื่อคนแก้");
{
  assertEq("มีทั้งชื่อและล็อกอิน", describeEditor(PLOY), "ขวัญเรือน บัวหลาง (admin_ploy)");
  assertEq("มีแต่ชื่อ", describeEditor({ adminName: "ขวัญเรือน บัวหลาง", adminLogin: "" }), "ขวัญเรือน บัวหลาง");
  assertEq("มีแต่ล็อกอิน", describeEditor({ adminName: "", adminLogin: "admin_ploy" }), "admin_ploy");
  assertEq("ไม่มีอะไรเลย", describeEditor({ adminName: "", adminLogin: "" }), "ไม่ทราบผู้แก้ไข");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} dimension-audit-verdict: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
