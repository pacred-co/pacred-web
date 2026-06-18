import assert from "node:assert";
import { parseMomoInvoiceText } from "./momo-invoice-parser";

let passed = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); passed++; }

// Real INV-20260618-0003 layout (representative lines + the 4,700 + grand total).
const INV0003 = `INVOICE/ใบแจ้งหนี้
NO: INV-20260618-0003
# รายการ (Description) รหัสสมาชิก จำนวน (QTY) หน่วย (Unit Price) รวม (Total)
1 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
0004065 869.50 KG/2.5171 CBM
No Code 1 4,700.00
คิดตาม CBM
11,830.37
2 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1779529270 5.00 KG/0.0216 CBM
9602 1 2,500.00
คิดตาม CBM
54.00
3 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1779955936 50.00 KG/0.1554 CBM
No Code 2 2,500.00
คิดตาม CBM
777.00
4 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1779955936-2 13.00 KG/0.0441 CBM
No Code 40 2,500.00
คิดตาม CBM
4,410.00
12 ค่าขนส่งสินค้าจากจีน GZS260528-2
SF1562783666170 4.10 KG/0.0022 CBM
121 1 2,500.00
คิดตาม CBM
5.50
ยอดสุทธิ (Grand Total): 28,348.57`;

const p = parseMomoInvoiceText(INV0003);
ok(p.invoiceNo === "INV-20260618-0003", `invoiceNo: ${p.invoiceNo}`);
ok(p.grandTotal === 28348.57, `grandTotal: ${p.grandTotal}`);
ok(p.lines.length === 5, `line count: ${p.lines.length}`);

const byTrack = Object.fromEntries(p.lines.map((l) => [l.tracking, l]));
ok(byTrack["1779529270"].lineTotal === 54.0, `1779529270 total: ${byTrack["1779529270"].lineTotal}`);
ok(byTrack["1779529270"].unitPrice === 2500, `1779529270 unitPrice`);
ok(byTrack["1779529270"].cbm === 0.0216, `1779529270 cbm`);
ok(byTrack["1779955936"].lineTotal === 777.0, `1779955936 total (qty 2)`);
ok(byTrack["1779955936"].qty === 2, `1779955936 qty`);
ok(byTrack["1779955936-2"].lineTotal === 4410.0, `-2 total (qty 40)`);
ok(byTrack["SF1562783666170"].lineTotal === 5.5, `SF... total = MOMO cost 5.50`);
ok(byTrack["0004065"].lineTotal === 11830.37 && byTrack["0004065"].unitPrice === 4700, `4,700 line`);
// All internally consistent → no mismatch flags.
ok(p.lines.every((l) => !l.totalMismatch), `no false mismatch flags`);

// INV-0004 line 8: 0.00 unit price but 149.00 total → flagged + cost = lineTotal.
const INV0004 = `NO: INV-20260618-0004
7 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
800200527062 11.00 KG/0.073 CBM
99 20 2,500.00
คิดตาม CBM
3,650.00
8 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
SF0215892795945 13.50 KG/0.0596 CBM
014 1 0.00
คิดตาม CBM
149.00
ยอดสุทธิ (Grand Total): 6,824.32`;
const p2 = parseMomoInvoiceText(INV0004);
ok(p2.lines.length === 2, `INV0004 line count: ${p2.lines.length}`);
const odd = p2.lines.find((l) => l.tracking === "SF0215892795945")!;
ok(odd.lineTotal === 149.0, `odd line cost = 149 (the real charge)`);
ok(odd.unitPrice === 0, `odd line unitPrice 0`);
ok(odd.totalMismatch === true, `odd line FLAGGED (0×cbm ≠ 149)`);
ok(p2.lines.find((l) => l.tracking === "800200527062")!.lineTotal === 3650.0, `800… total (qty 20)`);

// Empty / junk input → no crash.
ok(parseMomoInvoiceText("").lines.length === 0, `empty text`);
ok(parseMomoInvoiceText("random\ntext\nno tracking").lines.length === 0, `junk text`);

console.log(`momo-invoice-parser.test.ts — ${passed} passed · 0 failed`);
