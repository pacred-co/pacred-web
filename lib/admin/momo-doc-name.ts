/**
 * MOMO document naming — extract the printed doc NO so attached files carry a name
 * we recognise, not the browser's "REC-20260718-0002 (15).pdf" dup soup.
 *
 * Owner (2026-07-23, verbatim): *"momo ชื่อไฟล์เขายังไม่ได้ตั้ง NO: INV-20260717-0003
 *   เอาเลข ในเอกสารเขามาตั้งเป็นชื่อไฟล์ได้เลยครับ … โหลดมาแล้วชื่อไฟล์ก็ซ้ำอะ ลองหาแพทเทิน
 *   การตั้งภายในไม่ให้เรางงกันเอง"*
 *
 * MOMO (ฮุย ไท่ ต๋า) prints two document kinds, each with its OWN number after "NO:":
 *   · ใบแจ้งหนี้  NO: INV-YYYYMMDD-NNNN   (the bill they send us to pay)
 *   · ใบเสร็จ     NO: REC-YYYYMMDD-NNNN   (sent AFTER we pay · also carries "อ้างอิง: INV-…")
 *
 * The receipt references its invoice ("อ้างอิง: INV-…") — that INV is a REFERENCE, not
 * the file's identity. So we key on the number printed after "NO:" (the doc's own id),
 * and only fall back to a bare match when there is no "NO:" line.
 *
 * PURE — no I/O. Given the extracted text of a PDF (or any string), returns the doc's NO
 * and kind; separately builds the clean stored base name. Used by the settlement attach
 * (receipt + slip) and safe to reuse anywhere a MOMO doc is named.
 */

export type MomoDocKind = "receipt" | "invoice" | "unknown";

const REC_RE = /REC-\d{8}-\d{4}/;
const INV_RE = /INV-\d{8}-\d{4}/;
/** The doc's OWN number: printed right after "NO:" (both INV & REC use this header). */
const OWN_NO_RE = /NO\s*:?\s*((?:REC|INV)-\d{8}-\d{4})/i;

/**
 * Read the MOMO document's own NO from its text.
 * · Prefer the "NO:" line (identity) · else first REC- · else first INV-.
 * · kind follows the prefix of whatever we resolved.
 */
export function detectMomoDocNo(text: string): { no: string | null; kind: MomoDocKind } {
  const t = text ?? "";
  const own = t.match(OWN_NO_RE)?.[1]?.toUpperCase() ?? null;
  const no = own ?? t.match(REC_RE)?.[0] ?? t.match(INV_RE)?.[0] ?? null;
  if (!no) return { no: null, kind: "unknown" };
  return { no, kind: no.startsWith("REC") ? "receipt" : "invoice" };
}

/**
 * The clean base name (no extension — uploadToBucket keeps the real ext + a unique
 * ms prefix) for an attached settlement document.
 *
 * · a MOMO receipt/invoice we could read → its NO (REC-… / INV-…)
 * · a bank transfer slip (no NO on it)   → "slip" (the ms prefix makes it unique)
 * · anything unreadable                  → the kind label, never empty
 */
export function momoAttachmentBaseName(
  attachKind: "receipt" | "slip",
  detectedNo: string | null,
): string {
  if (detectedNo) return detectedNo;
  return attachKind === "receipt" ? "receipt" : "slip";
}
