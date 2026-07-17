import assert from "node:assert";
import {
  assembleInvoiceText,
  isTextlessPdf,
  looksLikePdf,
  validateInvoicePdfBytes,
  MOMO_INVOICE_PDF_MAX_BYTES,
  type PdfTextItemLike,
} from "./momo-invoice-pdf-text";
import { parseMomoInvoiceText } from "./momo-invoice-parser";

let passed = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); passed++; }

const bytes = (...b: number[]) => new Uint8Array(b);
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

// ── magic number, not the file name ─────────────────────────────────────────
ok(looksLikePdf(bytes(...PDF_MAGIC)) === true, "a %PDF- header is a PDF");
ok(looksLikePdf(bytes(0x50, 0x4b, 0x03, 0x04, 0x00)) === false, "a .xlsx (PK zip) renamed .pdf is rejected");
ok(looksLikePdf(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00)) === false, "a JPEG is rejected");
ok(looksLikePdf(bytes(0x25, 0x50)) === false, "a truncated 2-byte file is rejected (no OOB read)");
ok(looksLikePdf(new Uint8Array(0)) === false, "empty is not a PDF");

// ── pre-flight guards fail CLOSED with a real reason ────────────────────────
ok(validateInvoicePdfBytes(bytes(...PDF_MAGIC)) === null, "a real PDF header passes pre-flight");
ok((validateInvoicePdfBytes(new Uint8Array(0)) ?? "").includes("ว่าง"), "empty file → Thai 'ไฟล์ว่าง'");
ok((validateInvoicePdfBytes(bytes(0x50, 0x4b, 0x03, 0x04)) ?? "").includes("ไม่ใช่ PDF"), "non-PDF → Thai 'ไม่ใช่ PDF'");
{
  // over the cap: header is valid, size is not → must still refuse (size checked before magic)
  const big = new Uint8Array(MOMO_INVOICE_PDF_MAX_BYTES + 1);
  big.set(PDF_MAGIC);
  const err = validateInvoicePdfBytes(big) ?? "";
  ok(err.includes("ใหญ่เกินไป"), `oversize → Thai 'ใหญ่เกินไป': ${err.slice(0, 40)}`);
  ok(err.includes("20 MB"), "the refusal names the actual limit (not a bare 'too big')");
}

// ── textless (scanned) detection ────────────────────────────────────────────
ok(isTextlessPdf("") === true, "no text → textless");
ok(isTextlessPdf("   \n \n  ") === true, "whitespace-only → textless");
ok(isTextlessPdf("x".repeat(49)) === true, "49 chars → textless");
ok(isTextlessPdf("x".repeat(50)) === false, "50 chars → has text");

// ── 🔑 the load-bearing decision: hasEOL ⇒ newline, order PRESERVED ─────────
// Guards the two verified-wrong alternatives (see momo-invoice-pdf-text.ts):
//   · flat merge (no newlines)  → parser reads 0 lines
//   · Y-grouping (visual table) → columns glue → ตู้ swallows the member code
{
  const items: PdfTextItemLike[] = [
    { str: "1 ค่าขนส่งสินค้าจากจีน GZS260620-2", hasEOL: true },
    { str: "1781515241-1/3 554.00 KG/2.0366 CBM", hasEOL: true },
    { str: "012 1 2,500.00", hasEOL: true },
    { str: "คิดตาม CBM", hasEOL: true },
    { str: "5,091.50", hasEOL: true },
  ];
  const text = assembleInvoiceText([items]);
  ok(text.includes("\n"), "hasEOL produces real newlines (a flat string would parse to 0 lines)");
  const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
  ok(rows.length === 5, `one row per hasEOL item: ${rows.length}`);
  ok(rows[0] === "1 ค่าขนส่งสินค้าจากจีน GZS260620-2", "the ตู้ row stands alone — the member code did NOT glue on");
  ok(!text.includes("GZS260620-2012"), "🔴 regression-lock: ตู้+memberCode must NEVER fuse (the Y-grouping bug)");
  ok(!text.includes("2,500.005,091.50"), "🔴 regression-lock: the two money columns must NEVER fuse");
}

// ── items WITHOUT hasEOL concatenate (pdf.js splits a row into many items) ──
{
  const text = assembleInvoiceText([[
    { str: "1781515241-1/3" },
    { str: " " },
    { str: "554.00 KG/2.0366 CBM", hasEOL: true },
  ]]);
  ok(text.split("\n")[0] === "1781515241-1/3 554.00 KG/2.0366 CBM", `intra-row items join: ${JSON.stringify(text.split("\n")[0])}`);
}

// ── a page boundary is ALWAYS a row boundary ────────────────────────────────
{
  // last item of page 1 has no hasEOL — without the page break it would fuse with page 2
  const text = assembleInvoiceText([[{ str: "5,091.50" }], [{ str: "2 ค่าขนส่งสินค้าจากจีน GZE260701-1", hasEOL: true }]]);
  ok(!text.includes("5,091.502 ค่าขนส่ง"), "🔴 page 1's tail must never fuse with page 2's head");
  ok(text.split("\n").map((r) => r.trim()).filter(Boolean).length === 2, "page break splits the rows");
}

// ── end-to-end: assembled text feeds the REAL parser unchanged ──────────────
// The same 5 rows the real INV-20260708-0002 yields for its line #1 (verified 2026-07-17),
// proving the assembler's output is the shape parseMomoInvoiceText already reads.
{
  const items: PdfTextItemLike[] = [
    { str: "1 ค่าขนส่งสินค้าจากจีน GZS260620-2", hasEOL: true },
    { str: "1781515241-1/3 554.00 KG/2.0366 CBM", hasEOL: true },
    { str: "012 1 2,500.00", hasEOL: true },
    { str: "คิดตาม CBM", hasEOL: true },
    { str: "5,091.50", hasEOL: true },
    { str: "NO: INV-20260708-0002", hasEOL: true },
    { str: "ค่าขนส่งทั้งหมด (Sub-total): 5,091.50", hasEOL: true },
  ];
  const p = parseMomoInvoiceText(assembleInvoiceText([items]));
  ok(p.lines.length === 1, `parser reads the assembled text: ${p.lines.length} line(s)`);
  ok(p.lines[0].tracking === "1781515241-1/3", `tracking: ${p.lines[0].tracking}`);
  ok(p.lines[0].cabinet === "GZS260620-2", `ตู้ survives extraction intact: ${p.lines[0].cabinet}`);
  ok(p.lines[0].memberCode === "012", `memberCode stays its own field: ${p.lines[0].memberCode}`);
  ok(p.lines[0].unitPrice === 2500 && p.lines[0].lineTotal === 5091.5, "unit price + line total split correctly");
  ok(p.invoiceNo === "INV-20260708-0002", `invoiceNo: ${p.invoiceNo}`);
  ok(p.reconciles === true, "the Sub-total gate reconciles on extracted text");
}

console.log(`✅ momo-invoice-pdf-text: ${passed} assertions passed`);
