/**
 * Locks MOMO document naming — the doc's OWN NO (not its อ้างอิง reference) becomes
 * the filename, so attachments never collide as "…(15).pdf".
 *
 * The receipt fixture is the shape of the real REC-20260718-0002 the owner sent
 * (a receipt that references INV-20260711-0001) — the one case that MUST resolve to
 * the REC, never the referenced INV.
 *
 * Run: tsx lib/admin/momo-doc-name.test.ts
 */
import assert from "node:assert/strict";
import { detectMomoDocNo, momoAttachmentBaseName } from "./momo-doc-name";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("detectMomoDocNo");

ok("receipt: keeps its OWN NO (REC), NOT the อ้างอิง invoice", () => {
  const text =
    "ใบเสร็จรับเงิน/ใบกำกับภาษี (สำเนา) RECEIPT/TAX INVOICE NO: REC-20260718-0002 " +
    "Date: 18 ก.ค. 2569 อ้างอิง: INV-20260711-0001";
  const r = detectMomoDocNo(text);
  assert.equal(r.no, "REC-20260718-0002");
  assert.equal(r.kind, "receipt");
});

ok("invoice: reads NO: INV-… (owner's example)", () => {
  const r = detectMomoDocNo("บริษัท ฮุย ไท่ ต๋า ... NO: INV-20260717-0003 Date: ...");
  assert.equal(r.no, "INV-20260717-0003");
  assert.equal(r.kind, "invoice");
});

ok("no 'NO:' header → first REC in text still wins over a later INV", () => {
  const r = detectMomoDocNo("... REC-20260718-0002 ... reference INV-20260711-0001 ...");
  assert.equal(r.no, "REC-20260718-0002");
  assert.equal(r.kind, "receipt");
});

ok("only an INV present → invoice", () => {
  const r = detectMomoDocNo("ใบแจ้งหนี้ INV-20260625-0003 ...");
  assert.equal(r.no, "INV-20260625-0003");
  assert.equal(r.kind, "invoice");
});

ok("a bank slip (no MOMO doc no) → null / unknown", () => {
  const r = detectMomoDocNo("โอนเงินสำเร็จ 18 ก.ค. 69 เลขที่รายการ: 016199173656DTF08806 8,918.42 บาท");
  assert.equal(r.no, null);
  assert.equal(r.kind, "unknown");
});

ok("empty / null-ish text → null, no throw", () => {
  assert.deepEqual(detectMomoDocNo(""), { no: null, kind: "unknown" });
  // @ts-expect-error — defensive: callers may hand us a non-string
  assert.deepEqual(detectMomoDocNo(undefined), { no: null, kind: "unknown" });
});

ok("case-insensitive 'no:' still resolves", () => {
  assert.equal(detectMomoDocNo("tax invoice no: rec-20260718-0002").no, "REC-20260718-0002");
});

console.log("\nmomoAttachmentBaseName");

ok("a detected NO becomes the base name verbatim", () => {
  assert.equal(momoAttachmentBaseName("receipt", "REC-20260718-0002"), "REC-20260718-0002");
  assert.equal(momoAttachmentBaseName("slip", "INV-20260711-0001"), "INV-20260711-0001");
});

ok("no NO → kind label (uploadToBucket adds a unique ms prefix), never empty", () => {
  assert.equal(momoAttachmentBaseName("receipt", null), "receipt");
  assert.equal(momoAttachmentBaseName("slip", null), "slip");
});

console.log(`\n✅ momo-doc-name: ${passed} assertions passed`);
