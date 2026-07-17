import assert from "node:assert";
import { parseMomoInvoiceText } from "./momo-invoice-parser";

let passed = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); passed++; }

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 2026-07-17 — every fixture below is transcribed VERBATIM from the real PDF
// text (§0b: the source is the truth). The previous fixture in this file was
// labelled "Real INV-20260618-0003" but was FABRICATED: its kg + cbm had each
// been divided by qty (real "1779955936 100.00 KG/0.3108 CBM" → fixture "50.00
// KG/0.1554"; real "-2 520.00 KG/1.7640" → fixture "13.00 KG/0.0441" = 1.764/40)
// so that the ×qty formula would reproduce the printed total. That single made-up
// fixture is the whole origin of the "มิ.ย. bills per-box, ก.ค. bills per-line"
// story. Re-extracted from all 5 PDFs, the truth is: BOTH months bill per LINE
// (cbm = the volume billed for the line · qty = a box count) — 15 discriminating
// lines, 15 vote line_total, 0 vote per_box. Never re-derive a fixture from a
// theory; transcribe it from the file.
// ─────────────────────────────────────────────────────────────────────────────

// Real INV-20260618-0003 (มิ.ย.) — a verbatim SUBSET of the items. Sub-total is set
// to foot this subset (Σ = 17,313.75) so the reconcile gate is exercised; the real
// full-invoice Sub-total is 23,097.30 — this is a fixture of real ROWS, not the file.
const INV0003 = `INVOICE/ใบแจ้งหนี้
NO: INV-20260618-0003
# รายการ (Description) รหัสสมาชิก จำนวน (QTY) หน่วย (Unit Price) รวม (Total)
1 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
0004065 869.50 KG/2.5171 CBM
No Code 1 2,500.00
คิดตาม CBM
6,292.75
2 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1779529270 5.00 KG/0.0216 CBM
9602 1 2,500.00
คิดตาม CBM
54.00
3 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1779955936 100.00 KG/0.3108 CBM
No Code 2 2,500.00
คิดตาม CBM
777.00
4 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1779955936-2 520.00 KG/1.7640 CBM
No Code 40 2,500.00
คิดตาม CBM
4,410.00
5 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
60527103087 624.00 KG/1.7280 CBM
No Code 48 2,500.00
คิดตาม CBM
4,320.00
10 ค่าขนส่งสินค้าจากจีน GZS260525-2
9822290862949 0.50 KG/0.0008 CBM
121 1 2,500.00
คิดตาม CBM
1.80
12 ค่าขนส่งสินค้าจากจีน GZS260528-2
SF1562783666170 4.10 KG/0.0022 CBM
121 1 2,500.00
คิดตาม CBM
5.50
ค่าขนส่งทั้งหมด (Sub-total): 15,861.05
ยอดสุทธิ (Grand Total): 22,899.33`;

const p = parseMomoInvoiceText(INV0003);
ok(p.invoiceNo === "INV-20260618-0003", `invoiceNo: ${p.invoiceNo}`);
ok(p.grandTotal === 22899.33, `grandTotal: ${p.grandTotal}`);
ok(p.lines.length === 7, `line count: ${p.lines.length}`);

const byTrack = Object.fromEntries(p.lines.map((l) => [l.tracking, l]));
ok(byTrack["1779529270"].lineTotal === 54.0, `1779529270 total: ${byTrack["1779529270"].lineTotal}`);
ok(byTrack["1779529270"].unitPrice === 2500, `1779529270 unitPrice`);
ok(byTrack["1779529270"].cbm === 0.0216, `1779529270 cbm`);
ok(byTrack["1779955936"].lineTotal === 777.0, `1779955936 total`);
ok(byTrack["1779955936"].qty === 2, `1779955936 qty`);
ok(byTrack["1779955936-2"].lineTotal === 4410.0, `-2 total`);
ok(byTrack["SF1562783666170"].lineTotal === 5.5, `SF... total = MOMO cost 5.50`);
ok(byTrack["0004065"].lineTotal === 6292.75 && byTrack["0004065"].unitPrice === 2500, `0004065 line`);

// 🔴 The มิ.ย. invoice bills per LINE, exactly like ก.ค. — this is the regression-lock
// on the fabricated-fixture story. 0.3108 × 2500 = 777 (NOT 0.3108 × 2500 × 2).
ok(p.cbmBasis === "line_total", `มิ.ย. invoice resolves line_total (not per_box): ${p.cbmBasis}`);
ok(p.cbmBasisVotes.lineTotal === 3 && p.cbmBasisVotes.perBox === 0, `votes ${JSON.stringify(p.cbmBasisVotes)}`);
ok(p.cbmBasisMaterial === true && p.cbmBasisUsable === true, `basis material + usable`);
ok(Math.abs(2500 * 0.3108 - 777) < 0.02, `arithmetic: 2500 × 0.3108 = 777.00 (qty 2 is a COUNT)`);
ok(Math.abs(2500 * 1.764 - 4410) < 0.02, `arithmetic: 2500 × 1.7640 = 4,410.00 (qty 40 is a COUNT)`);
// The multi-box lines fit the resolved basis → no flag.
ok(!byTrack["1779955936"].totalMismatch && !byTrack["1779955936-2"].totalMismatch, `multi-box lines not flagged`);
ok(!byTrack["60527103087"].totalMismatch, `48-box line not flagged`);
// 9822290862949: printed 1.80 but 0.0008 × 2500 = 2.00 → MOMO's own arithmetic is off → FLAG.
ok(byTrack["9822290862949"].totalMismatch === true, `real MOMO ฿0.20 arithmetic slip IS flagged`);
// Sub-total + reconcile gate.
ok(p.subTotal === 15861.05, `subTotal: ${p.subTotal}`);
ok(p.linesTotal === 15861.05, `linesTotal: ${p.linesTotal}`);
ok(p.reconciles === true, `reconciles when Σ === Sub-total`);
// memberCode captured · "No Code" → null.
ok(byTrack["1779529270"].memberCode === "9602", `memberCode 9602: ${byTrack["1779529270"].memberCode}`);
ok(byTrack["SF1562783666170"].memberCode === "121", `memberCode 121`);
ok(byTrack["0004065"].memberCode === null, `"No Code" → null`);
// cabinet captured when the description carries it · null on the "(Guangzhou - TH)" template.
ok(byTrack["SF1562783666170"].cabinet === "GZS260528-2", `cabinet: ${byTrack["SF1562783666170"].cabinet}`);
ok(byTrack["1779529270"].cabinet === null, `"(Guangzhou - TH)" → cabinet null (not "TH)")`);

// ─────────────────────────────────────────────────────────────────────────────
// Real INV-20260618-0004 (มิ.ย.) — verbatim, ALL 8 items + real Sub-total.
// Line 8 really does print "0.00" as the unit price with a real 149.00 total.
const INV0004 = `NO: INV-20260618-0004
1 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780103566 20.00 KG/0.0941 CBM
106 1 2,500.00
คิดตาม CBM
235.25
2 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780103566-2 10.00 KG/0.0496 CBM
106 1 2,500.00
คิดตาม CBM
124.00
3 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780103566-3 220.00 KG/0.9800 CBM
106 10 2,500.00
คิดตาม CBM
2,450.00
4 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780103566-4 20.00 KG/0.0297 CBM
106 1 2,500.00
คิดตาม CBM
74.25
5 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780103566-5 19.00 KG/0.0352 CBM
106 1 2,500.00
คิดตาม CBM
88.00
6 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780103566-6 17.00 KG/0.0491 CBM
106 1 2,500.00
คิดตาม CBM
122.75
7 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
800200527062 220.00 KG/1.4600 CBM
99 20 2,500.00
คิดตาม CBM
3,650.00
8 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
SF0215892795945 13.50 KG/0.0596 CBM
014 1 0.00
คิดตาม CBM
149.00
ค่าขนส่งทั้งหมด (Sub-total): 6,893.25
ยอดสุทธิ (Grand Total): 6,824.32`;
const p2 = parseMomoInvoiceText(INV0004);
ok(p2.lines.length === 8, `INV0004 line count: ${p2.lines.length}`);
ok(p2.subTotal === 6893.25 && p2.linesTotal === 6893.25 && p2.reconciles === true, `INV0004 real Σ foots real Sub-total`);
ok(p2.cbmBasis === "line_total", `INV0004 basis: ${p2.cbmBasis}`);
ok(p2.cbmBasisVotes.lineTotal === 2 && p2.cbmBasisVotes.perBox === 0, `INV0004 votes ${JSON.stringify(p2.cbmBasisVotes)}`);
const odd = p2.lines.find((l) => l.tracking === "SF0215892795945")!;
ok(odd.lineTotal === 149.0, `odd line cost = 149 (the real charge)`);
ok(odd.unitPrice === 0, `odd line unitPrice 0`);
// The rate is missing → the arithmetic CANNOT be checked. Say THAT, don't claim a
// "total mismatch" we never verified (0 × cbm ≠ total is a constant, not a check).
ok(odd.rateMissing === true, `0.00 rate → rateMissing (the honest signal)`);
ok(odd.totalMismatch === false, `0.00 rate → NOT claimed as a total mismatch`);
ok(p2.lines.find((l) => l.tracking === "800200527062")!.lineTotal === 3650.0, `800… total (qty 20 = count)`);
ok(!p2.lines.find((l) => l.tracking === "800200527062")!.totalMismatch, `2500 × 1.46 = 3,650 → not flagged`);
ok(p2.lines.filter((l) => l.rateMissing).length === 1, `exactly 1 rate-missing line`);

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 Real INV-20260708-0002 (ก.ค.) — the CONFIRMED prod money bug, verbatim incl.
// the trailing space + wrapped "CBM" row exactly as the PDF extracts it.
// Line #34 wraps "CBM" onto its own row → the old end-anchored TRACK_RE dropped it
// silently → Σ was short ฿181.42 vs the printed Sub-total and nothing checked.
const INV0002 = `INVOICE/ใบแจ้งหนี้
NO: INV-20260708-0002
33 ค่าขนส่งสินค้าจากจีน GZE260701-1
760234506976-2 133.00 KG/0.4298 CBM
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

// (3) qty is a BOX COUNT — unitPrice × cbm = lineTotal → no mismatch on qty=14.
const multiBox = t3["760234506976-2"];
ok(multiBox.qty === 14, `qty 14 captured`);
ok(multiBox.lineTotal === 2020.06 && Math.abs(4700 * 0.4298 - 2020.06) < 0.02, `4700 × 0.4298 = 2,020.06`);
ok(multiBox.totalMismatch === false, `qty=14 NOT flagged`);
ok(p3.lines.every((l) => !l.totalMismatch), `INV0002 → zero mismatch noise`);
ok(p3.cbmBasis === "line_total" && p3.cbmBasisUsable, `ก.ค. basis: ${p3.cbmBasis}`);
ok(p3.cbmBasisVotes.lineTotal === 2 && p3.cbmBasisVotes.perBox === 0, `ก.ค. votes ${JSON.stringify(p3.cbmBasisVotes)}`);

// (4) cabinet + memberCode on every line (the tracking↔ตู้ cross-check).
ok(t3["1781515241-1/3"].cabinet === "GZS260620-2", `เรือ cabinet`);
ok(t3["1781515241-1/3"].unitPrice === 2500, `GZS → 2,500 (เรือ)`);
ok(multiBox.cabinet === "GZE260701-1" && multiBox.unitPrice === 4700, `GZE → 4,700 (รถ)`);
ok(p3.lines.every((l) => !!l.cabinet && !!l.memberCode), `every line has ตู้ + รหัสสมาชิก`);

// (5) footer figures.
ok(p3.whtThb === 72.93, `WHT parsed past the "1%" digits: ${p3.whtThb}`);
ok(p3.crateTotal === 0 && p3.codTotal === 0 && p3.thDeliveryTotal === 0, `crate/cod/th-delivery = 0`);
ok(p3.grandTotal === 7220.05, `grandTotal: ${p3.grandTotal}`);

// (6) 🔴 the Σ GATE: corrupt one printed total → Σ no longer foots → reconciles=false.
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 THE BLIND SPOT this fix exists to close: MOMO over-charges ×qty on a line.
// Real ก.ค. shape + one line billed 4,700 × 0.4298 × 14 = ฿28,280.84 instead of
// ฿2,020.06 (14× over-charge). MOMO's own Sub-total agrees with MOMO's own error,
// so `reconciles` passes — the ONLY thing that can catch it is the strict basis.
// The old "fits EITHER formula" test passed this silently.
const OVERCHARGE = `NO: INV-20260708-0002
1 ค่าขนส่งสินค้าจากจีน GZE260701-1
760234506976-2 133.00 KG/0.4298 CBM
PR021 14 4,700.00
คิดตาม CBM
28,280.84
2 ค่าขนส่งสินค้าจากจีน GZE260701-1
500255762943 72.00 KG/0.3216 CBM
PR021 6 4,700.00
คิดตาม CBM
1,511.52
3 ค่าขนส่งสินค้าจากจีน GZE260701-1
760234521792-2 50.00 KG/0.1370 CBM
PR021 5 4,700.00
คิดตาม CBM
643.90
4 ค่าขนส่งสินค้าจากจีน GZS260620-2
1781515241-1/3 554.00 KG/2.0366 CBM
PR047 3 2,500.00
คิดตาม CBM
5,091.50
ค่าขนส่งทั้งหมด (Sub-total): 35,527.76
ยอดสุทธิ (Grand Total): 35,172.48`;
const oc = parseMomoInvoiceText(OVERCHARGE);
ok(oc.reconciles === true, `over-charge STILL foots MOMO's own Sub-total (why Σ alone can't catch it)`);
ok(oc.cbmBasis === "line_total", `3 honest lines out-vote 1 over-charge → basis stays line_total: ${oc.cbmBasis}`);
ok(oc.cbmBasisVotes.lineTotal === 3 && oc.cbmBasisVotes.perBox === 1, `votes ${JSON.stringify(oc.cbmBasisVotes)}`);
const bad = oc.lines.find((l) => l.tracking === "760234506976-2")!;
ok(bad.lineTotal === 28280.84, `the over-charged total is read as printed`);
ok(bad.totalMismatch === true, `🔴 the 14× over-charge IS FLAGGED (the whole point)`);
ok(oc.lines.filter((l) => l.totalMismatch).length === 1, `only the over-charged line is flagged — no noise`);

// …and the same over-charge on a 3-line invoice where it is 1-of-2 voters:
// 1 vs 1 is not evidence → refuse rather than let a mis-bill "prove" per_box.
const TIED = `NO: INV-20260708-0009
1 ค่าขนส่งสินค้าจากจีน GZE260701-1
760234506976-2 133.00 KG/0.4298 CBM
PR021 14 4,700.00
คิดตาม CBM
28,280.84
2 ค่าขนส่งสินค้าจากจีน GZE260701-1
500255762943 72.00 KG/0.3216 CBM
PR021 6 4,700.00
คิดตาม CBM
1,511.52
ค่าขนส่งทั้งหมด (Sub-total): 29,792.36`;
const tied = parseMomoInvoiceText(TIED);
ok(tied.cbmBasisVotes.lineTotal === 1 && tied.cbmBasisVotes.perBox === 1, `1-vs-1 votes`);
ok(tied.cbmBasis === null, `1-vs-1 → no basis guessed`);
ok(tied.cbmBasisUsable === false, `1-vs-1 → NOT usable → ingest refuses the file`);
ok(tied.reconciles === true, `…even though Σ foots — the Σ gate alone would have let it through`);
ok(tied.lines.every((l) => !l.totalMismatch), `no basis → no line is CLAIMED wrong (we checked nothing)`);

// A single lone voter can never establish a basis (it could BE the over-charge).
const LONE = `NO: INV-20260708-0010
1 ค่าขนส่งสินค้าจากจีน GZE260701-1
760234506976-2 133.00 KG/0.4298 CBM
PR021 14 4,700.00
คิดตาม CBM
28,280.84
2 ค่าขนส่งสินค้าจากจีน GZE260701-1
DPK214010238058-2/2 6.50 KG/0.0058 CBM
PR095 1 4,700.00
คิดตาม CBM
27.26
ค่าขนส่งทั้งหมด (Sub-total): 28,308.10`;
const lone = parseMomoInvoiceText(LONE);
ok(lone.cbmBasisVotes.perBox === 1 && lone.cbmBasisVotes.lineTotal === 0, `lone voter: ${JSON.stringify(lone.cbmBasisVotes)}`);
ok(lone.cbmBasis === null && lone.cbmBasisUsable === false, `1 lone vote is NOT enough to name the basis → refuse`);

// ─────────────────────────────────────────────────────────────────────────────
// Real INV-20260623-0006 (มิ.ย.) — EVERY line is 1 box, and MOMO prints "0.00" as
// the rate on all of them. Verbatim subset. The basis is unobservable here, but it
// is also IRRELEVANT (×1 makes both formulas identical) → must NOT block: 2 of the
// 5 real invoices look like this, and refusing them would block real work for no
// safety gain whatsoever.
const INV0006 = `NO: INV-20260623-0006
1 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780555730-1/6 17.00 KG/0.0750 CBM
107 1 0.00
คิดตาม CBM
187.50
2 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780555730-2/6 19.50 KG/0.0750 CBM
107 1 0.00
คิดตาม CBM
187.50
7 ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)
1780629608-1/8 47.00 KG/0.4236 CBM
107 1 0.00
คิดตาม CBM
1,059.00
ค่าขนส่งทั้งหมด (Sub-total): 1,434.00`;
const p6 = parseMomoInvoiceText(INV0006);
ok(p6.lines.length === 3, `INV0006 line count: ${p6.lines.length}`);
ok(p6.cbmBasisMaterial === false, `all-1-box → the basis cannot change any total`);
ok(p6.cbmBasis === null, `all-1-box → no basis is claimed…`);
ok(p6.cbmBasisUsable === true, `…but the file is USABLE (refusing it would be a false block)`);
ok(p6.reconciles === true, `INV0006 Σ foots`);
ok(p6.lines.every((l) => l.rateMissing && !l.totalMismatch), `0.00-rate lines → rateMissing, not a fake mismatch`);
ok(p6.lines.every((l) => l.qty === 1), `every qty = 1`);

// Empty / junk input → no crash, and never reconciles.
ok(parseMomoInvoiceText("").lines.length === 0, `empty text`);
ok(parseMomoInvoiceText("").reconciles === false, `empty text never reconciles`);
ok(parseMomoInvoiceText("random\ntext\nno tracking").lines.length === 0, `junk text`);

console.log(`momo-invoice-parser.test.ts — ${passed} passed · 0 failed`);
