import "server-only";

/**
 * MOMO supplier-invoice PDF → text. The unpdf/pdf.js I/O glue; every decision, guard and
 * rationale lives in ./momo-invoice-pdf-text.ts (pure + unit-locked). Read that file first.
 *
 * server-only: unpdf bundles a pdf.js build — it must never be pulled into a client chunk.
 */

import {
  assembleInvoiceText,
  isTextlessPdf,
  TEXTLESS_PDF_ERROR,
  validateInvoicePdfBytes,
  type PdfTextItemLike,
} from "./momo-invoice-pdf-text";

export type MomoInvoicePdfExtract =
  | { ok: true; text: string; pages: number }
  | { ok: false; error: string };

/**
 * Extract an uploaded MOMO invoice PDF into the exact text the paste path produces.
 * Never returns partial text: any failure → a Thai reason naming the real blocker.
 */
export async function extractMomoInvoicePdfText(bytes: Uint8Array): Promise<MomoInvoicePdfExtract> {
  const invalid = validateInvoicePdfBytes(bytes);
  if (invalid) return { ok: false, error: invalid };

  try {
    // Imported lazily so unpdf is only ever loaded on a real upload.
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);

    const pages: PdfTextItemLike[][] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // TextMarkedContent nodes carry no `str` — skip them, keep everything else in order.
      // flatMap (not a type-predicate filter): pdf.js's TextItem is structurally compatible with
      // PdfTextItemLike but not nominally assignable, so `i is PdfTextItemLike` is rejected (TS2677).
      pages.push(
        content.items.flatMap((i) =>
          "str" in i && typeof i.str === "string" ? [{ str: i.str, hasEOL: i.hasEOL }] : [],
        ),
      );
    }

    const text = assembleInvoiceText(pages);
    if (isTextlessPdf(text)) return { ok: false, error: TEXTLESS_PDF_ERROR };
    return { ok: true, text, pages: pdf.numPages };
  } catch (e) {
    console.error("[momo-invoice-pdf] extract failed", e);
    return {
      ok: false,
      error:
        "อ่านไฟล์ PDF ไม่สำเร็จ — ไฟล์อาจเสียหายหรือมีรหัสผ่าน · ลองเปิดด้วยโปรแกรมอ่าน PDF ดูก่อน ถ้าเปิดได้ปกติให้แจ้งทีมพัฒนาพร้อมไฟล์ใบนี้",
    };
  }
}
