import assert from "node:assert/strict";
import { computeForwarderDebitBatch, type ForwarderDebitRow } from "./forwarder-debit-total";
import { checkLinkedPaymentConsistency, describeLinkedPaymentDifferences } from "./linked-payment-consistency";

const rows: ForwarderDebitRow[] = [
  { id: 52436, fshipby: "PRF", ftrackingchn: "1783582989-3/4", paymethod: "1", ftotalprice: 229.5, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
  { id: 52437, fshipby: "PRF", ftrackingchn: "1783582989-4/4", paymethod: "1", ftotalprice: 229.5, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
  { id: 52557, fshipby: "PRF", ftrackingchn: "1783582989-2/4", paymethod: "1", ftotalprice: 238, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
  { id: 52559, fshipby: "PRF", ftrackingchn: "1783582989", paymethod: "1", ftotalprice: 289, ftransportprice: 100, fpriceupdate: 0, fshippingservice: 0, pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0 },
];

const batch = computeForwarderDebitBatch(rows, { userId: "PR086", isCorporate: true });
assert.equal(batch.total_thb, 1075.14);
assert.deepEqual(batch.lines.map((line) => line.price_thb), [227.21, 227.21, 235.62, 385.1]);

assert.equal(checkLinkedPaymentConsistency(1075.15, [
  { reforder: "52436", amount: 227.21 },
  { reforder: "52437", amount: 227.21 },
  { reforder: "52557", amount: 235.62 },
  { reforder: "52559", amount: 385.11 },
], batch).ok, false);

assert.deepEqual(checkLinkedPaymentConsistency(1075.14, [
  { reforder: "52436", amount: 227.21 },
  { reforder: "52437", amount: 227.21 },
  { reforder: "52557", amount: 235.62 },
  { reforder: "52559", amount: 385.1 },
], batch), { ok: true });


// ── describeLinkedPaymentDifferences (owner 2026-07-30 · เคส /admin/wallet/106611) ──
// เดิม error โยนรายละเอียดทิ้ง เหลือแค่ยอดรวม → พนักงานไปต่อไม่ถูก.
{
  const lines = describeLinkedPaymentDifferences([
    "total:29990.88!=29890.88",
    "52749:764.94!=664.94",
    "missing:99001",
    "unexpected:99002",
    "weird-code",
  ]);
  assert.equal(lines.length, 5);
  // ยอดรวม: จ่ายเกิน 100 + จัดรูปหลักพันให้อ่านง่าย
  assert.ok(lines[0].includes("ยอดรวม"), lines[0]);
  assert.ok(lines[0].includes("29,990.88"), lines[0]);
  assert.ok(lines[0].includes("29,890.88"), lines[0]);
  assert.ok(lines[0].includes("ลูกค้าจ่ายเกิน ฿100.00"), lines[0]);
  // รายแถว: บอกเลขรายการ + ทิศทาง
  assert.ok(lines[1].includes("รายการ #52749"), lines[1]);
  assert.ok(lines[1].includes("ลูกค้าจ่ายเกิน ฿100.00"), lines[1]);
  assert.ok(lines[2].includes("#99001") && lines[2].includes("ไม่ได้อยู่ในการชำระ"), lines[2]);
  assert.ok(lines[3].includes("#99002"), lines[3]);
  // รูปแบบที่ไม่รู้จัก = โชว์ดิบ ห้ามกลืนหาย
  assert.equal(lines[4], "weird-code");
}
{
  // จ่ายขาด = ทิศตรงข้าม
  const [line] = describeLinkedPaymentDifferences(["52750:100.00!=200.00"]);
  assert.ok(line.includes("ลูกค้าจ่ายขาด ฿100.00"), line);
}
assert.deepEqual(describeLinkedPaymentDifferences([]), []);

console.log("linked-payment consistency: OK");
