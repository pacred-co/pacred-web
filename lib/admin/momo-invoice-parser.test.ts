import assert from "node:assert";
import { parseMomoInvoiceText } from "./momo-invoice-parser";

let passed = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); passed++; }

// Real INV-20260618-0003 layout (a representative SUBSET of lines + the 4,700 + grand
// total). Sub-total is set to foot this subset (Σ = 17,076.87) so the reconcile gate is
// exercised; the real full-invoice Sub-total differs — this is a fixture, not the file.
// ⚠️ NOTE the 2026-06 template bills total = unitPrice × cbm × qty (cbm = PER-BOX).
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
ค่าขนส่งทั้งหมด (Sub-total): 17,076.87
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
// All internally consistent (2026-06 template: unitPrice × cbm × qty) → no mismatch flags.
ok(p.lines.every((l) => !l.totalMismatch), `no false mismatch flags`);
// 2026-06 template regression-lock: qty IS the multiplier here (0.1554 × 2500 × 2 = 777).
ok(byTrack["1779955936"].qty === 2 && !byTrack["1779955936"].totalMismatch, `per-box template qty=2 not flagged`);
ok(byTrack["1779955936-2"].qty === 40 && !byTrack["1779955936-2"].totalMismatch, `per-box template qty=40 not flagged`);
// Sub-total + reconcile gate.
ok(p.subTotal === 17076.87, `subTotal: ${p.subTotal}`);
ok(p.linesTotal === 17076.87, `linesTotal: ${p.linesTotal}`);
ok(p.reconciles === true, `reconciles when Σ === Sub-total`);
// memberCode captured · "No Code" → null.
ok(byTrack["1779529270"].memberCode === "9602", `memberCode 9602: ${byTrack["1779529270"].memberCode}`);
ok(byTrack["SF1562783666170"].memberCode === "121", `memberCode 121`);
ok(byTrack["0004065"].memberCode === null, `"No Code" → null`);
// cabinet captured when the description carries it · null on the "(Guangzhou - TH)" template.
ok(byTrack["SF1562783666170"].cabinet === "GZS260528-2", `cabinet: ${byTrack["SF1562783666170"].cabinet}`);
ok(byTrack["1779529270"].cabinet === null, `"(Guangzhou - TH)" → cabinet null (not "TH)")`);

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 Real INV-20260708-0002 (2026-07 template) — the CONFIRMED prod money bug.
// Line #34 wraps "CBM" onto its own row → the old end-anchored TRACK_RE dropped it
// silently → Σ was short ฿181.42 vs the printed Sub-total and nothing checked.
// This template bills total = unitPrice × cbm (qty = BOX COUNT, not a multiplier).
const INV0002 = `INVOICE/ใบแจ้งหนี้
NO: INV-20260708-0002
33 ค่าขนส่งสินค้าจากจีน GZE260701-1
760234506976-2 320.00 KG/0.4298 CBM
PR021 14 4,700.00
คิดตาม CBM
2,020.06
34 ค่าขนส่งสินค้าจากจีน GZE260701-1
DPK214010238058-1/2 40.00 KG/0.0386
CBM
PR095 1 4,700.00
คิดตาม CBM
181.42
35 ค่าขนส่งสินค้าจากจีน GZS260620-2
1781515241-1/3 554.00 KG/2.0366 CBM
PR047 3 2,500.00
คิดตาม CBM
5,091.50
ค่าขนส่งทั้งหมด (Sub-total): 7,292.98
หักภาษีค่าขนส่ง ณ ที่จ่าย (WHT 1%) 72.93
ค่าตีลังไม้ทั้งหมด: 0.00
ค่าเก็บเงินปลายทางทั้งหมด: 0.00
ค่าบริการขนส่งในไทย: 0.00
ยอดสุทธิ (Grand Total): 7,220.05`;

const p3 = parseMomoInvoiceText(INV0002);
// (1) the CBM-wrap line is NO LONGER dropped — the ฿181.42 money bug.
ok(p3.lines.length === 3, `INV0002 line count (wrap line kept): ${p3.lines.length}`);
const t3 = Object.fromEntries(p3.lines.map((l) => [l.tracking, l]));
const wrapped = t3["DPK214010238058-1/2"];
ok(!!wrapped, `wrapped-CBM line parsed at all`);
ok(wrapped.kg === 40 && wrapped.cbm === 0.0386, `wrapped line kg/cbm: ${wrapped.kg}/${wrapped.cbm}`);
ok(wrapped.unitPrice === 4700 && wrapped.qty === 1, `wrapped line reads the price row past the "CBM" row`);
ok(wrapped.lineTotal === 181.42, `wrapped line total ฿181.42: ${wrapped.lineTotal}`);
ok(wrapped.memberCode === "PR095", `wrapped line memberCode: ${wrapped.memberCode}`);
ok(wrapped.cabinet === "GZE260701-1", `wrapped line cabinet: ${wrapped.cabinet}`);

// (2) Σ foots the printed Sub-total → reconciles.
ok(p3.subTotal === 7292.98, `subTotal: ${p3.subTotal}`);
ok(p3.linesTotal === 7292.98, `linesTotal = 2020.06+181.42+5091.50: ${p3.linesTotal}`);
ok(p3.reconciles === true, `reconciles=true when Σ === Sub-total`);

// (3) qty is a BOX COUNT here — unitPrice × cbm = lineTotal → no mismatch on qty=14.
const multiBox = t3["760234506976-2"];
ok(multiBox.qty === 14, `qty 14 captured`);
ok(multiBox.lineTotal === 2020.06 && Math.abs(4700 * 0.4298 - 2020.06) < 0.02, `4700 × 0.4298 = 2,020.06`);
ok(multiBox.totalMismatch === false, `qty=14 NOT flagged (was noise: 4700×0.4298×14)`);
ok(p3.lines.every((l) => !l.totalMismatch), `INV0002 → zero mismatch noise`);

// (4) cabinet + memberCode on every line (the tracking↔ตู้ cross-check).
ok(t3["1781515241-1/3"].cabinet === "GZS260620-2", `เรือ cabinet`);
ok(t3["1781515241-1/3"].unitPrice === 2500, `GZS → 2,500 (เรือ)`);
ok(multiBox.cabinet === "GZE260701-1" && multiBox.unitPrice === 4700, `GZE → 4,700 (รถ)`);
ok(p3.lines.every((l) => !!l.cabinet && !!l.memberCode), `every line has ตู้ + รหัสสมาชิก`);

// (5) footer figures.
ok(p3.whtThb === 72.93, `WHT parsed past the "1%" digits: ${p3.whtThb}`);
ok(p3.crateTotal === 0 && p3.codTotal === 0 && p3.thDeliveryTotal === 0, `crate/cod/th-delivery = 0`);
ok(p3.grandTotal === 7220.05, `grandTotal: ${p3.grandTotal}`);

// (6) 🔴 the GATE: corrupt one printed total → Σ no longer foots → reconciles=false.
// (±0.02 satang tolerance is intentional — a 1-satang rounding diff must NOT block.)
ok(parseMomoInvoiceText(INV0002.replace("2,020.06", "2,020.07")).reconciles === true, `1-satang rounding still reconciles (tolerance)`);
const broken = parseMomoInvoiceText(INV0002.replace("2,020.06", "2,120.06"));
ok(broken.linesTotal === 7392.98, `tampered Σ: ${broken.linesTotal}`);
ok(broken.reconciles === false, `reconciles=false when Σ ≠ Sub-total (ingest must refuse)`);
// A dropped line (the original bug's shape) also fails the gate → money never written.
const dropped = parseMomoInvoiceText(INV0002.replace(/34 ค่าขนส่ง[\s\S]*?181\.42\n/, ""));
ok(dropped.lines.length === 2, `line removed from the fixture`);
ok(dropped.reconciles === false, `a DROPPED line can never pass the gate again`);

// (7) fail-closed: unreadable / missing Sub-total never reconciles.
const noSub = parseMomoInvoiceText(INV0002.replace("ค่าขนส่งทั้งหมด (Sub-total): 7,292.98", ""));
ok(noSub.subTotal === null, `no Sub-total → null`);
ok(noSub.reconciles === false, `no Sub-total → fails CLOSED (never writes money)`);

// (8) the "CBM" guard row is required — a KG/CBM-shaped row without it is NOT a line
//     (so the optional-CBM regex can't false-positive on unrelated text).
const noGuard = parseMomoInvoiceText(`1 ค่าขนส่งสินค้าจากจีน GZE260701-1
DPK214010238058-1/2 40.00 KG/0.0386
PR095 1 4,700.00
คิดตาม CBM
181.42`);
ok(noGuard.lines.length === 0, `no "CBM" guard row → not treated as a tracking line`);

// Sub-total wrapped onto its own row (same wrap class) still reads.
const wrapSub = parseMomoInvoiceText(INV0002.replace("ค่าขนส่งทั้งหมด (Sub-total): 7,292.98", "ค่าขนส่งทั้งหมด (Sub-total):\n7,292.98"));
ok(wrapSub.subTotal === 7292.98 && wrapSub.reconciles === true, `wrapped Sub-total still reconciles`);

// Empty / junk input → no crash, and never reconciles.
ok(parseMomoInvoiceText("").lines.length === 0, `empty text`);
ok(parseMomoInvoiceText("").reconciles === false, `empty text never reconciles`);
ok(parseMomoInvoiceText("random\ntext\nno tracking").lines.length === 0, `junk text`);

console.log(`momo-invoice-parser.test.ts — ${passed} passed · 0 failed`);
