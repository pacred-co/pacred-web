/**
 * Unit tests — lib/admin/pay-user-history-group.ts (PURE grouping planner ของ
 * หน้าประวัติจ่ายเงินแทนลูกค้า). Display-only — ไม่มีเงิน ไม่มี DB.
 *
 * Run:  pnpm tsx lib/admin/pay-user-history-group.test.ts   (wired into test:unit)
 */

import {
  planPayUserHistoryEntries,
  walletHeaderIdOf,
  type PayUserHsRow,
} from "./pay-user-history-group";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── fixtures — เคสจริงจากจอ owner: หัว 106832 (type='1') + ลูก 106833-106838 ──
const T = "2026-07-31 09:19:00";
const hsRow = (over: Partial<PayUserHsRow> & { id: number }): PayUserHsRow => ({
  date: T,
  userid: "PR187",
  amount: "100.00",
  type: "4",
  status: "1",
  reforder: String(50000 + over.id),
  reforder2: 106832,
  adminidcrate: "admin_tam",
  ...over,
});
const header = (id: number, over: Partial<PayUserHsRow> = {}): PayUserHsRow =>
  hsRow({ id, type: "1", reforder: "", reforder2: null, amount: "600.00", ...over });

const kinds = (entries: ReturnType<typeof planPayUserHistoryEntries>) =>
  entries.map((e) => (e.kind === "group" ? `g${e.headerId}` : `s${e.row.id}`));

section("walletHeaderIdOf — parse reforder2 (bigint/string ปนกัน)");
{
  assertEq("number 106832", walletHeaderIdOf({ reforder2: 106832 }), 106832);
  assertEq('string "106832"', walletHeaderIdOf({ reforder2: "106832" }), 106832);
  assertEq('empty ""', walletHeaderIdOf({ reforder2: "" }), null);
  assertEq("null", walletHeaderIdOf({ reforder2: null }), null);
  assertEq('"0"', walletHeaderIdOf({ reforder2: "0" }), null);
  assertEq('non-numeric "abc"', walletHeaderIdOf({ reforder2: "abc" }), null);
}

section("เคสจอ owner — ลูก 6 แถว (106833-106838) + หัว 106832 → 1 กรุ๊ป");
{
  const children = [106838, 106837, 106836, 106835, 106834, 106833].map((id) => hsRow({ id }));
  const entries = planPayUserHistoryEntries({
    pageRows: children,
    headers: [header(106832)],
    siblings: children,
    hasQuery: false,
  });
  assertEq("ยุบเหลือแถวเดียว", kinds(entries), ["g106832"]);
  const g = entries[0];
  if (g.kind === "group") {
    assertEq("ลูกครบ 6 แถว", g.children.length, 6);
    assertEq("ลูกเรียงใหม่สุดก่อน (id desc เมื่อ date เท่ากัน)", g.children.map((c) => c.id), [106838, 106837, 106836, 106835, 106834, 106833]);
    assertEq("หัวถูกตัว", g.header.id, 106832);
  } else { fail++; console.error("  ✗ entry แรกไม่ใช่กรุ๊ป"); }
}

section("standalone — ไม่มี reforder2 → แถวเดี่ยวแบบเดิม");
{
  const rows = [hsRow({ id: 900, reforder2: null }), hsRow({ id: 899, reforder2: "" })];
  const entries = planPayUserHistoryEntries({ pageRows: rows, headers: [], siblings: [], hasQuery: false });
  assertEq("2 แถวเดี่ยว ตามลำดับเดิม", kinds(entries), ["s900", "s899"]);
}

section("standalone — reforder2 ชี้หัวที่หาไม่เจอ → แถวเดี่ยว");
{
  const rows = [hsRow({ id: 901, reforder2: 777777 })];
  const entries = planPayUserHistoryEntries({ pageRows: rows, headers: [], siblings: [], hasQuery: false });
  assertEq("render เดี่ยว", kinds(entries), ["s901"]);
}

section("standalone — reforder2 ชี้แถวที่ไม่ใช่หัว (type≠'1') → แถวเดี่ยว");
{
  const notHeader = hsRow({ id: 500, type: "4" }); // แถว type='4' ธรรมดา ไม่ใช่หัวรอบชำระ
  const rows = [hsRow({ id: 902, reforder2: 500 })];
  const entries = planPayUserHistoryEntries({ pageRows: rows, headers: [notHeader], siblings: [], hasQuery: false });
  assertEq("render เดี่ยว (หัวไม่ valid)", kinds(entries), ["s902"]);
}

section("brokenHeaderIds — ดึงชุดลูกไม่สำเร็จ → ห้ามกรุ๊ป (กัน Σ มั่ว)");
{
  const rows = [hsRow({ id: 903 }), hsRow({ id: 904 })];
  const entries = planPayUserHistoryEntries({
    pageRows: rows,
    headers: [header(106832)],
    siblings: [],
    brokenHeaderIds: [106832],
    hasQuery: false,
  });
  assertEq("ทั้งคู่ render เดี่ยว", kinds(entries), ["s903", "s904"]);
}

section("คร่อมหน้า (ไม่มีคำค้น) — หน้า 2 ที่มีแต่หางชุด → ข้าม (โผล่ไปแล้วหน้า 1)");
{
  // ชุดลูก 106833-106838; หน้า 2 เห็นเฉพาะ 106834+106833 (หางชุด) — ลูกใหม่สุด
  // (106838) อยู่หน้า 1 → หน้า 2 ต้องไม่โผล่ซ้ำ และห้ามหลุดเป็นแถวเดี่ยว
  const allChildren = [106838, 106837, 106836, 106835, 106834, 106833].map((id) => hsRow({ id }));
  const page2 = allChildren.slice(4); // 106834, 106833
  const entries = planPayUserHistoryEntries({
    pageRows: page2,
    headers: [header(106832)],
    siblings: allChildren,
    hasQuery: false,
  });
  assertEq("หน้า 2 ว่าง (ชุดโผล่ที่หน้า 1 แล้ว)", kinds(entries), []);
}

section("คร่อมหน้า (ไม่มีคำค้น) — หน้าที่มีลูกใหม่สุด → กรุ๊ปโผล่พร้อมลูกครบชุด");
{
  const allChildren = [106838, 106837, 106836, 106835, 106834, 106833].map((id) => hsRow({ id }));
  const page1 = allChildren.slice(0, 4); // 106838..106835 (มีลูกใหม่สุด)
  const entries = planPayUserHistoryEntries({
    pageRows: page1,
    headers: [header(106832)],
    siblings: allChildren,
    hasQuery: false,
  });
  assertEq("กรุ๊ปโผล่หน้านี้", kinds(entries), ["g106832"]);
  const g = entries[0];
  if (g.kind === "group") assertEq("ลูกครบทั้ง 6 แม้ 2 ตัวอยู่หน้าถัดไป", g.children.length, 6);
}

section("มีคำค้น — ลูกแมตช์ตัวเดียวในหน้า (ลูกใหม่สุดไม่อยู่) → ยังโผล่ (กันงานหาย)");
{
  const allChildren = [106838, 106837, 106836, 106835, 106834, 106833].map((id) => hsRow({ id }));
  const page = [allChildren[5]]; // ค้นเจอเฉพาะ 106833
  const entries = planPayUserHistoryEntries({
    pageRows: page,
    headers: [header(106832)],
    siblings: allChildren,
    hasQuery: true,
  });
  assertEq("กรุ๊ปโผล่ (โหมดค้นหาไม่ตัดทิ้ง)", kinds(entries), ["g106832"]);
}

section("ลูกชุดเดียวกันหลายแถวบนหน้าเดียว → โผล่ครั้งเดียว + แถวอื่นแทรกตามลำดับ");
{
  const c1 = hsRow({ id: 106838 });
  const c2 = hsRow({ id: 106837 });
  const solo = hsRow({ id: 106836, reforder2: null });
  const entries = planPayUserHistoryEntries({
    pageRows: [c1, solo, c2],
    headers: [header(106832)],
    siblings: [c1, c2],
    hasQuery: false,
  });
  assertEq("กรุ๊ปเดียว + เดี่ยวตามลำดับหน้า", kinds(entries), ["g106832", "s106836"]);
}

section("ลูกซ้ำ (อยู่ทั้ง pageRows และ siblings) → dedup ด้วย id");
{
  const c1 = hsRow({ id: 106838 });
  const entries = planPayUserHistoryEntries({
    pageRows: [c1],
    headers: [header(106832)],
    siblings: [c1, hsRow({ id: 106838 })], // ตัวซ้ำ
    hasQuery: false,
  });
  const g = entries[0];
  if (g.kind === "group") assertEq("นับลูกครั้งเดียว", g.children.length, 1);
  else { fail++; console.error("  ✗ ไม่ได้กรุ๊ป"); }
}

section("สองรอบชำระบนหน้าเดียว → สองกรุ๊ป แยกกันถูกชุด");
{
  const a1 = hsRow({ id: 201, reforder2: 100 });
  const a2 = hsRow({ id: 200, reforder2: 100 });
  const b1 = hsRow({ id: 151, reforder2: 90, date: "2026-07-30 08:00:00" });
  const entries = planPayUserHistoryEntries({
    pageRows: [a1, a2, b1],
    headers: [header(100), header(90, { date: "2026-07-30 08:00:00" })],
    siblings: [a1, a2, b1],
    hasQuery: false,
  });
  assertEq("สองกรุ๊ปตามลำดับ", kinds(entries), ["g100", "g90"]);
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
