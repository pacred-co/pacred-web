/**
 * MOMO supplier-invoice PDF → the exact text shape `parseMomoInvoiceText` already reads.
 * PURE half (no unpdf, no I/O) so the load-bearing decisions below are unit-locked.
 * The unpdf glue lives in ./momo-invoice-pdf.ts (server-only).
 *
 * Owner 2026-07-17: "ให้ทางบัญชี **อัพไฟล์ PDF** จากทาง MOMO — MOMO จะปล่อยไฟล์มาให้บัญชี
 * เป็นรอบๆ". Until now the only input was a paste, so accounting had to open each PDF,
 * Ctrl+A, Ctrl+C into a textarea — every file, every round. This removes that step and
 * NOTHING else: it reproduces the SAME text the paste produces, so the whole proven money
 * path downstream (parse → basis vote → Sub-total gate → ตู้ reconcile → preview → apply)
 * is byte-for-byte unchanged. It must never parse, interpret, or total anything itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔑 WHY the PDF's own item order + hasEOL — and NOT the two obvious alternatives.
 * Verified against the real INV-20260708-0002 (2026-07-17):
 *
 *  1. unpdf's `extractText(pdf, { mergePages: true })` returns the document as ONE FLAT
 *     STRING with ZERO newlines. The parser is line-oriented (a line-item = 5-6
 *     consecutive rows), so that text parses to **0 lines** — the upload would have
 *     ingested nothing, with only the Sub-total gate between us and a silent bad read.
 *
 *  2. Grouping the text items by Y coordinate rebuilds the *visual table* — wrong, and
 *     wrong in a DANGEROUS way: cells sharing a row glue together with no separator, so
 *     the ตู้ swallows the member code and the two money columns merge
 *     ("GZS260620-2" + "012" → "GZS260620-2012" · "2,500.00" + "5,091.50" →
 *     "2,500.005,091.50"). A ตู้ read as "GZS260620-2012" matches no fcabinetnumber —
 *     it would MANUFACTURE ตู้ conflicts out of a perfectly healthy invoice, i.e. break
 *     the exact tracking↔ตู้ check the owner calls "หัวใจ".
 *
 *  3. pdf.js emits the items in the PDF's own content order and flags the end of each
 *     text row with `hasEOL` — which is what a viewer's Ctrl+A copy follows. This
 *     reproduces the paste shape the parser's fixtures were transcribed from. Proven on
 *     all 5 real invoices: every one foots its printed Sub-total to the satang, and the
 *     CBM-basis votes (6/0 · 7/0 · 2/0 · 0/0 · 0/0 = 15 line_total, 0 per_box) reproduce
 *     the evidence table independently of how those invoices were first extracted.
 *
 * ⚠️ Thai ligature note: this PDF's font decomposes "ำ" into two glyphs, so the extracted
 * Thai reads "จำานวน"/"จำากัด"/"ชำาระ". Harmless — EVERY label the parser matches
 * (ค่าขนส่งสินค้าจากจีน · คิดตาม CBM · ค่าขนส่งทั้งหมด · ยอดสุทธิ · ค่าตีลังไม้ทั้งหมด ·
 * ค่าเก็บเงินปลายทางทั้งหมด · ค่าบริการขนส่งในไทย · หักภาษีค่าขนส่ง) is free of "ำ".
 * If a future label needs "ำ", normalise it HERE — never loosen the parser to fit.
 */

/** ใบจริงหนักสุด ~0.2 MB / 4 หน้า. 20 MB เผื่อไว้เกินพอ และกัน PDF ที่ฝังรูปมาทั้งเล่ม. */
export const MOMO_INVOICE_PDF_MAX_BYTES = 20 * 1024 * 1024;

/** ข้อความน้อยกว่านี้ = ไฟล์สแกน/รูปภาพ (ไม่มี text layer) ไม่ใช่ใบที่ MOMO ออกจากระบบ. */
const MIN_MEANINGFUL_CHARS = 50;

/** The bits of a pdf.js TextItem this module needs (structural — no pdf.js type import). */
export type PdfTextItemLike = { str: string; hasEOL?: boolean };

/** ตรวจว่าเป็น PDF จริงจาก magic number "%PDF" ไม่ใช่จากนามสกุลไฟล์ (ชื่อไฟล์โกหกได้). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  );
}

/**
 * Pre-flight the uploaded bytes. Returns a Thai reason, or null when the file may be
 * opened. Fails closed — an unreadable file must never reach the parser, because
 * "half a file" foots short and is indistinguishable from a real Sub-total mismatch.
 */
export function validateInvoicePdfBytes(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "ไฟล์ว่าง — อ่านไม่ได้";
  if (bytes.length > MOMO_INVOICE_PDF_MAX_BYTES) {
    return `ไฟล์ใหญ่เกินไป (${(bytes.length / 1024 / 1024).toFixed(1)} MB) — จำกัด ${
      MOMO_INVOICE_PDF_MAX_BYTES / 1024 / 1024
    } MB · ใบแจ้งหนี้ MOMO จริงประมาณ 0.2 MB ไฟล์นี้อาจไม่ใช่ใบแจ้งหนี้`;
  }
  if (!looksLikePdf(bytes)) {
    return "ไฟล์นี้ไม่ใช่ PDF — กรุณาอัปโหลดไฟล์ใบแจ้งหนี้ PDF ที่ MOMO ส่งมา";
  }
  return null;
}

/**
 * Join pdf.js text items back into the parser's row shape: content order preserved, a
 * newline wherever pdf.js marks the end of a text row, and a hard row break between
 * pages (a page boundary is always a row boundary — never let the last row of page 1
 * fuse with the first row of page 2, which would corrupt both).
 */
export function assembleInvoiceText(pages: PdfTextItemLike[][]): string {
  let out = "";
  for (const items of pages) {
    for (const item of items) {
      out += item.str;
      if (item.hasEOL) out += "\n";
    }
    out += "\n";
  }
  return out;
}

/** A scanned/image-only PDF yields (almost) no text — say THAT, don't let the Sub-total
 *  gate report a meaningless "แกะได้ 0 บรรทัด" ([[wrong-error-message-hides-real-block]]). */
export function isTextlessPdf(text: string): boolean {
  return text.replace(/\s/g, "").length < MIN_MEANINGFUL_CHARS;
}

export const TEXTLESS_PDF_ERROR =
  "ไฟล์นี้ไม่มีข้อความให้อ่าน (น่าจะเป็นไฟล์สแกน/รูปภาพ) — ต้องใช้ไฟล์ PDF ต้นฉบับที่ MOMO ออกจากระบบ";
