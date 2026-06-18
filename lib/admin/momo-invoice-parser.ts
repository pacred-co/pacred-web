/**
 * MOMO (ฮุย ไท่ต๋า / HUI TAI DA) supplier-invoice parser.
 *
 * MOMO bills Pacred per tracking ("ค่าขนส่งสินค้าจากจีน … X.XX KG/Y.YYYY CBM …
 * คิดตาม CBM … {total}"). The per-line "รวม (Total)" IS the actual COST Pacred
 * owes MOMO for that tracking — the source of truth for tb_forwarder.fcosttotalprice
 * (more exact than our default 2,500/CBM rate, which a few lines deviate from:
 * one invoice line was 4,700, another 0.00 with a 149.00 total).
 *
 * This is a PURE text parser (no PDF binary dependency): the admin pastes the
 * invoice text (or it is extracted upstream). Tested against the real INV-2026
 * 0618-0003 / -0004 layouts. Each line item renders as 5 text rows:
 *    "{n} ค่าขนส่งสินค้าจากจีน …"
 *    "{tracking} {kg} KG/{cbm} CBM"
 *    "{memberCode} {qty} {unitPrice}"
 *    "คิดตาม CBM"
 *    "{lineTotal}"
 */

export type MomoInvoiceLine = {
  tracking: string;
  kg: number;
  cbm: number;        // per-unit CBM as printed on the invoice
  qty: number;
  unitPrice: number;  // ฿/CBM (usually 2,500)
  lineTotal: number;  // รวม (Total) = the COST for this tracking
  /** lineTotal disagrees with unitPrice × cbm × qty (a 0-unit-price or odd line). */
  totalMismatch: boolean;
};

export type ParsedMomoInvoice = {
  invoiceNo: string | null;
  grandTotal: number | null;
  lines: MomoInvoiceLine[];
};

const num = (s: string): number => Number(String(s).replace(/,/g, "").trim());
const round2 = (n: number): number => Math.round(n * 100) / 100;

const TRACK_RE = /^(\S+)\s+([\d.]+)\s*KG\s*\/\s*([\d.]+)\s*CBM$/i;
// "{memberCode…} {qty} {unitPrice}" — capture the LAST integer + the trailing money value.
const PRICE_RE = /(\d+)\s+([\d,]+\.\d{2})\s*$/;
const MONEY_ONLY_RE = /^([\d,]+\.\d{2})$/;

/** Parse pasted MOMO supplier-invoice text into per-tracking cost lines. */
export function parseMomoInvoiceText(text: string): ParsedMomoInvoice {
  const rows = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const invoiceNo = (text.match(/INV-\d{8}-\d{4}/) ?? [null])[0];
  const gt = text.match(/(?:Grand Total|ยอดสุทธิ)[^\d]*([\d,]+\.\d{2})/i);
  const grandTotal = gt ? num(gt[1]) : null;

  const lines: MomoInvoiceLine[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].match(TRACK_RE);
    if (!m) continue;
    const tracking = m[1];
    const kg = num(m[2]);
    const cbm = num(m[3]);

    let qty = 1;
    let unitPrice = 0;
    let lineTotal = 0;
    // Scan the few rows after the tracking row for: the "{qty} {unitPrice}" row,
    // then the "คิดตาม CBM" marker whose NEXT money-only row is the line total.
    for (let j = i + 1; j < Math.min(i + 6, rows.length); j++) {
      const ln = rows[j];
      if (unitPrice === 0) {
        const pm = ln.match(PRICE_RE);
        if (pm) { qty = Number(pm[1]) || 1; unitPrice = num(pm[2]); continue; }
      }
      if (/คิดตาม\s*CBM/i.test(ln)) {
        const tm = (rows[j + 1] ?? "").match(MONEY_ONLY_RE);
        if (tm) lineTotal = num(tm[1]);
        break;
      }
      // Fallback: a bare money-only row after the tracking (no "คิดตาม CBM") = total.
      const mo = ln.match(MONEY_ONLY_RE);
      if (mo && unitPrice !== 0) { lineTotal = num(mo[1]); break; }
    }

    // De-dup defensively (a tracking should appear once per invoice).
    if (seen.has(tracking)) continue;
    seen.add(tracking);

    const expected = round2(unitPrice * cbm * qty);
    lines.push({
      tracking,
      kg,
      cbm,
      qty,
      unitPrice,
      lineTotal,
      totalMismatch: lineTotal > 0 && Math.abs(expected - lineTotal) > 0.02,
    });
  }

  return { invoiceNo, grandTotal, lines };
}
