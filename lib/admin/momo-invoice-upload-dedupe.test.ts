/**
 * ล็อกกติกา "ไฟล์เดิมไม่เก็บซ้ำ · ไฟล์เปลี่ยนต้องเก็บ" (owner 2026-07-30).
 *
 * 2 ข้อที่ผิดแล้วเจ็บคนละแบบ — ทั้งคู่มีเทสคุมไว้:
 *   · ข้ามผิด  → ประวัติเงินหายถาวร (กู้ไม่ได้)  ⇒ ทุกเคสที่ "ตัดสินไม่ได้" ต้องออกมาเป็น insert
 *   · เก็บเกิน → เปลืองพื้นที่ (สิ่งที่ owner บ่น) ⇒ ไฟล์เดิมของใบเดิมต้องออกมาเป็น skip
 *
 * Run: tsx lib/admin/momo-invoice-upload-dedupe.test.ts
 */
import assert from "node:assert/strict";
import {
  decideInvoiceUploadDedupe,
  groupUploadsByInvoiceNo,
  describeUploadRevisionDiff,
  type UploadDedupeCandidate,
  type UploadGroupRow,
} from "./momo-invoice-upload-dedupe";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const cand = (over: Partial<UploadDedupeCandidate> & { id: number }): UploadDedupeCandidate => ({
  invoiceNo: "INV-20260723-0006",
  fileHash: HASH_A,
  ...over,
});

console.log("decideInvoiceUploadDedupe — เก็บหรือไม่เก็บ");

ok("เลขใบเดิม + ไฟล์เดิม → skip (ชี้กลับแถวเดิม) = เคสจริง prod INV-20260723-0006", () => {
  const d = decideInvoiceUploadDedupe({
    invoiceNo: "INV-20260723-0006",
    fileHash: HASH_A,
    existing: [cand({ id: 7 })],
  });
  assert.deepEqual(d, { action: "skip", existingId: 7 });
});

ok("เลขใบเดิม + ไฟล์ต่าง → insert เป็นเวอร์ชันถัดไป (MOMO ออกใบใหม่)", () => {
  const d = decideInvoiceUploadDedupe({
    invoiceNo: "INV-20260723-0006",
    fileHash: HASH_B,
    existing: [cand({ id: 7 })],
  });
  assert.deepEqual(d, { action: "insert", revision: 2 });
});

ok("ใบใหม่ที่ไม่เคยอัพ → insert เวอร์ชัน 1", () => {
  const d = decideInvoiceUploadDedupe({
    invoiceNo: "INV-20260801-0001",
    fileHash: HASH_A,
    existing: [cand({ id: 7 })],
  });
  assert.deepEqual(d, { action: "insert", revision: 1 });
});

ok("นับเวอร์ชันจากใบเดียวกันเท่านั้น ไม่นับใบอื่นที่อยู่ในลิสต์ด้วย", () => {
  const d = decideInvoiceUploadDedupe({
    invoiceNo: "INV-A",
    fileHash: "new",
    existing: [
      cand({ id: 1, invoiceNo: "INV-A", fileHash: HASH_A }),
      cand({ id: 2, invoiceNo: "INV-B", fileHash: HASH_B }),
      cand({ id: 3, invoiceNo: "INV-A", fileHash: HASH_B }),
    ],
  });
  assert.deepEqual(d, { action: "insert", revision: 3 });
});

ok("🔴 ไม่มีแฮช (วางข้อความ / คอลัมน์ยังไม่ migrate) → เก็บเสมอ ห้ามข้าม", () => {
  assert.deepEqual(
    decideInvoiceUploadDedupe({ invoiceNo: "INV-A", fileHash: null, existing: [cand({ id: 1, invoiceNo: "INV-A" })] }),
    { action: "insert", revision: 1 },
  );
});

ok("🔴 แกะเลขที่ใบไม่เจอ → จัดกลุ่มไม่ได้ → เก็บเสมอ ห้ามข้าม", () => {
  assert.deepEqual(
    decideInvoiceUploadDedupe({ invoiceNo: null, fileHash: HASH_A, existing: [cand({ id: 1, invoiceNo: null })] }),
    { action: "insert", revision: 1 },
  );
});

ok("แถวเก่าที่ยังไม่มีแฮช (ก่อน mig 0284) ไม่ถูกจับคู่เป็น 'ไฟล์เดิม'", () => {
  const d = decideInvoiceUploadDedupe({
    invoiceNo: "INV-A",
    fileHash: HASH_A,
    existing: [cand({ id: 1, invoiceNo: "INV-A", fileHash: null })],
  });
  assert.deepEqual(d, { action: "insert", revision: 2 });
});

ok("ช่องว่างหัว-ท้ายเลขใบ/แฮช ไม่ทำให้กลายเป็นคนละไฟล์", () => {
  const d = decideInvoiceUploadDedupe({
    invoiceNo: " INV-A ",
    fileHash: ` ${HASH_A} `,
    existing: [cand({ id: 9, invoiceNo: "INV-A", fileHash: HASH_A })],
  });
  assert.deepEqual(d, { action: "skip", existingId: 9 });
});

ok("ประวัติว่างเปล่า → insert เวอร์ชัน 1", () => {
  assert.deepEqual(decideInvoiceUploadDedupe({ invoiceNo: "INV-A", fileHash: HASH_A, existing: [] }), {
    action: "insert",
    revision: 1,
  });
});

console.log("\ngroupUploadsByInvoiceNo — 1 ใบ = 1 แถวบนจอ");

const row = (over: Partial<UploadGroupRow> & { id: number }): UploadGroupRow => ({
  invoiceNo: "INV-A",
  uploadedAt: "2026-07-30T00:00:00Z",
  lineCount: 23,
  subTotal: 1000,
  linesTotal: 1000,
  reconciles: true,
  ...over,
});

ok("อัพใบเดียวหลายเวอร์ชัน → 1 กลุ่ม · latest = ใหม่สุด · older เรียงใหม่→เก่า", () => {
  const g = groupUploadsByInvoiceNo([row({ id: 3 }), row({ id: 2 }), row({ id: 1 })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].latest.id, 3);
  assert.deepEqual(g[0].older.map((o) => o.id), [2, 1]);
  assert.equal(g[0].revisions, 3);
});

ok("หลายใบ → หลายกลุ่ม · ลำดับตาม input (ไม่ re-sort ทับลำดับที่ query สั่ง)", () => {
  const g = groupUploadsByInvoiceNo([
    row({ id: 5, invoiceNo: "INV-B" }),
    row({ id: 4, invoiceNo: "INV-A" }),
    row({ id: 3, invoiceNo: "INV-B" }),
  ]);
  assert.deepEqual(g.map((x) => x.invoiceNo), ["INV-B", "INV-A"]);
  assert.equal(g[0].revisions, 2);
  assert.equal(g[1].revisions, 1);
});

ok("🔴 แถวที่ไม่มีเลขที่ใบ = แยกกลุ่มละแถว (ห้ามเดาว่าเป็นใบเดียวกัน)", () => {
  const g = groupUploadsByInvoiceNo([row({ id: 2, invoiceNo: null }), row({ id: 1, invoiceNo: null })]);
  assert.equal(g.length, 2);
  assert.equal(g[0].revisions, 1);
  assert.equal(g[1].revisions, 1);
});

ok("ลิสต์ว่าง → ไม่มีกลุ่ม", () => {
  assert.deepEqual(groupUploadsByInvoiceNo([]), []);
});

console.log("\ndescribeUploadRevisionDiff — อะไรเปลี่ยนไประหว่าง 2 เวอร์ชัน");

ok("จำนวนบรรทัดเปลี่ยน", () => {
  assert.equal(
    describeUploadRevisionDiff(row({ id: 1, lineCount: 23 }), row({ id: 2, lineCount: 24 })),
    "บรรทัด 23 → 24",
  );
});

ok("Sub-total เปลี่ยน (ยอดบนใบ = เรื่องเงิน ต้องเห็น)", () => {
  assert.equal(
    describeUploadRevisionDiff(row({ id: 1, subTotal: 1000 }), row({ id: 2, subTotal: 1250.5 })),
    "Sub-total ฿1,000.00 → ฿1,250.50",
  );
});

ok("สถานะ 'Σ ตรง Sub-total' เปลี่ยน", () => {
  assert.equal(
    describeUploadRevisionDiff(row({ id: 1, reconciles: false }), row({ id: 2, reconciles: true })),
    "ยอดตรงกับใบ ✗ → ✓",
  );
});

ok("เปลี่ยนหลายอย่างพร้อมกัน → ต่อกันด้วย ·", () => {
  assert.equal(
    describeUploadRevisionDiff(
      row({ id: 1, lineCount: 23, subTotal: 1000, reconciles: true }),
      row({ id: 2, lineCount: 24, subTotal: 1100, reconciles: false }),
    ),
    "บรรทัด 23 → 24 · Sub-total ฿1,000.00 → ฿1,100.00 · ยอดตรงกับใบ ✓ → ✗",
  );
});

ok("สาระเท่าเดิม (ไฟล์ต่างแต่ยอดเท่ากัน) → null ไม่อวดว่าเปลี่ยน", () => {
  assert.equal(describeUploadRevisionDiff(row({ id: 1 }), row({ id: 2 })), null);
});

ok("ต่างกันต่ำกว่า 1 สตางค์ = ไม่ถือว่าเปลี่ยน (กัน float noise ขึ้นจอเงิน)", () => {
  assert.equal(
    describeUploadRevisionDiff(row({ id: 1, subTotal: 1000 }), row({ id: 2, subTotal: 1000.001 })),
    null,
  );
});

ok("Sub-total อ่านไม่เจอ (null) เทียบกับมีค่า = เปลี่ยน", () => {
  assert.equal(
    describeUploadRevisionDiff(row({ id: 1, subTotal: null }), row({ id: 2, subTotal: 500 })),
    "Sub-total — → ฿500.00",
  );
});

console.log(`\n✅ momo-invoice-upload-dedupe: ${passed} assertions passed`);
