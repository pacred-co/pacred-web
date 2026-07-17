/**
 * MOMO (ฮุย ไท่ต๋า / HUI TAI DA) supplier-invoice parser.
 *
 * MOMO bills Pacred per tracking ("ค่าขนส่งสินค้าจากจีน … X.XX KG/Y.YYYY CBM …
 * คิดตาม CBM … {total}"). The per-line "รวม (Total)" IS the actual COST Pacred
 * owes MOMO for that tracking — the source of truth for tb_forwarder.fcosttotalprice
 * (more exact than our default rate card, which a few lines deviate from:
 * one invoice line was 4,700, another 0.00 with a 149.00 total).
 *
 * This is a PURE text parser (no PDF binary dependency): the admin pastes the
 * invoice text (or it is extracted upstream). Each line item renders as 5-6 rows:
 *    "{n} ค่าขนส่งสินค้าจากจีน {ตู้|(Guangzhou - TH)}"   ← ตู้ (cabinet) when present
 *    "{tracking} {kg} KG/{cbm} CBM"                        ← CBM may WRAP (see below)
 *    "{memberCode} {qty} {unitPrice}"
 *    "คิดตาม CBM"
 *    "{lineTotal}"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ROOT FIX 2026-07-17 — "a value wrapped onto the next row" is the WHOLE bug
 *    class here (PDF text extraction breaks a row wherever the column ends).
 *    Confirmed prod money bug: INV-20260708-0002 line #34 wraps "CBM" onto its
 *    own row → the old end-anchored TRACK_RE never matched → the line was
 *    SILENTLY DROPPED → Σ short ฿181.42 vs the printed Sub-total, and nothing
 *    checked. Both halves are fixed here:
 *      1. every value is read "inline OR on the next row" (tracking CBM + footer)
 *      2. `reconciles` = Σ(lineTotal) === the printed Sub-total. A parse that
 *         does not foot the invoice must NEVER write money → the ingest action
 *         refuses the whole file (fail-closed).
 *
 * ⚠️ scripts/momo-invoice-cost-backfill-2026-06-26.mjs holds a FROZEN copy of the
 *    pre-fix regexes (a one-off backfill, already applied 2026-06-26, with its own
 *    Sub-total reconcile gate). It is intentionally not re-synced — do not treat it
 *    as this module's mirror.
 */

export type MomoInvoiceLine = {
  tracking: string;
  kg: number;
  cbm: number;        // CBM as printed on the invoice (see cbmIsPerBox note below)
  qty: number;        // the BOX COUNT printed on the invoice
  unitPrice: number;  // ฿/CBM (2,500 เรือ · 4,700 รถ)
  lineTotal: number;  // รวม (Total) = the COST for this tracking — MOMO's bill WINS
  /** lineTotal matches NEITHER unitPrice×cbm NOR unitPrice×cbm×qty → a human must look. */
  totalMismatch: boolean;
  /** ตู้ MOMO asserts for this line ("ค่าขนส่งสินค้าจากจีน GZE260701-1") · null on the
   *  older "(Guangzhou - TH)" template. Cross-check vs our fcabinetnumber = the
   *  tracking↔ตู้ reconcile the owner calls "หัวใจ". */
  cabinet: string | null;
  /** รหัสสมาชิก as printed (PR095 · 012 · 9602) · null for "No Code". */
  memberCode: string | null;
};

export type ParsedMomoInvoice = {
  invoiceNo: string | null;
  grandTotal: number | null;
  lines: MomoInvoiceLine[];
  /** "ค่าขนส่งทั้งหมด (Sub-total)" as printed — the figure Σ(lineTotal) must foot. */
  subTotal: number | null;
  /** Σ of every parsed lineTotal (rounded to satang). */
  linesTotal: number;
  /** linesTotal === subTotal (±0.02). FALSE when the Sub-total is unreadable.
   *  🔴 Money gate: never write cost from a parse where this is false. */
  reconciles: boolean;
  /** "หักภาษีค่าขนส่ง ณ ที่จ่าย (WHT 1%)" */
  whtThb: number | null;
  /** "ค่าตีลังไม้ทั้งหมด" */
  crateTotal: number | null;
  /** "ค่าเก็บเงินปลายทางทั้งหมด" */
  codTotal: number | null;
  /** "ค่าบริการขนส่งในไทย" */
  thDeliveryTotal: number | null;
};

const num = (s: string): number => Number(String(s).replace(/,/g, "").trim());
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** "{tracking} {kg} KG/{cbm} CBM" — trailing CBM OPTIONAL (it wraps); when absent the
 *  next row MUST be exactly "CBM" (a guard, so this can't false-positive). */
const TRACK_RE = /^(\S+)\s+([\d.]+)\s*KG\s*\/\s*([\d.]+)\s*(CBM)?$/i;
const CBM_ONLY_RE = /^CBM$/i;
// "{memberCode…} {qty} {unitPrice}" — member = the prefix, then the LAST integer + money.
const PRICE_RE = /^(.*?)\s*(\d+)\s+([\d,]+\.\d{2})\s*$/;
const MONEY_ONLY_RE = /^([\d,]+\.\d{2})$/;
const MONEY_AT_EOL_RE = /([\d,]+\.\d{2})\s*$/;
/** ตู้ on the description row. The alnum-only class rejects the older
 *  "(Guangzhou - TH)" template (the ")" makes it fail) → cabinet stays null. */
const CABINET_RE = /ค่าขนส่งสินค้าจากจีน\s+([A-Za-z0-9][A-Za-z0-9\-_/]*)\s*$/;

const SUBTOTAL_LABEL = /(?:ค่าขนส่งทั้งหมด|Sub-?total)/i;
const WHT_LABEL = /(?:หักภาษีค่าขนส่ง|WHT)/i;
const CRATE_LABEL = /ค่าตีลังไม้ทั้งหมด/;
const COD_LABEL = /ค่าเก็บเงินปลายทางทั้งหมด/;
const TH_DELIVERY_LABEL = /ค่าบริการขนส่งในไทย/;

/**
 * Read the money for a footer label — inline ("…(Sub-total): 21,626.89") OR wrapped
 * onto the next row. Same "the value may wrap" defence as the tracking CBM fix.
 * Returns null when unreadable → the caller fails closed.
 */
function moneyForLabel(rows: string[], label: RegExp): number | null {
  for (let i = 0; i < rows.length; i++) {
    if (!label.test(rows[i])) continue;
    const inline = rows[i].match(MONEY_AT_EOL_RE);
    if (inline) return num(inline[1]);
    const next = (rows[i + 1] ?? "").match(MONEY_ONLY_RE);
    if (next) return num(next[1]);
  }
  return null;
}

/** ตู้ from the description row just above the tracking row. Scans back at most 2 rows
 *  and stops at anything that belongs to the PREVIOUS line-item (so we can never
 *  attribute the wrong ตู้ to a line — a wrong ตู้ is worse than no ตู้). */
function cabinetAbove(rows: string[], trackingIdx: number): string | null {
  for (let j = trackingIdx - 1; j >= 0 && trackingIdx - j <= 2; j--) {
    const ln = rows[j];
    if (TRACK_RE.test(ln) || MONEY_ONLY_RE.test(ln) || /คิดตาม\s*CBM/i.test(ln)) return null;
    const cm = ln.match(CABINET_RE);
    if (cm) return cm[1];
  }
  return null;
}

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
    // CBM wrapped onto its own row? Require the guard row to be exactly "CBM".
    const cbmWrapped = !m[4];
    if (cbmWrapped && !CBM_ONLY_RE.test(rows[i + 1] ?? "")) continue;

    const tracking = m[1];
    const kg = num(m[2]);
    const cbm = num(m[3]);

    let qty = 1;
    let unitPrice = 0;
    let lineTotal = 0;
    let memberCode: string | null = null;
    // Scan the few rows after the tracking row (skipping the wrapped "CBM" row) for
    // the "{member} {qty} {unitPrice}" row, then the "คิดตาม CBM" marker whose NEXT
    // money-only row is the line total.
    const bodyStart = i + (cbmWrapped ? 2 : 1);
    for (let j = bodyStart; j < Math.min(bodyStart + 5, rows.length); j++) {
      const ln = rows[j];
      if (unitPrice === 0) {
        const pm = ln.match(PRICE_RE);
        if (pm) {
          const mc = pm[1].trim();
          memberCode = mc && !/^no\s*code$/i.test(mc) ? mc : null;
          qty = Number(pm[2]) || 1;
          unitPrice = num(pm[3]);
          continue;
        }
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

    // ⚠️ MOMO's two invoice templates disagree on what the CBM column means:
    //   · 2026-07 (INV-20260708-0002): CBM = the BILLED volume for the whole line
    //     → total = unitPrice × cbm   (qty is a box COUNT · verified 39/39 lines)
    //   · 2026-06 (INV-20260618-0003/-0004): CBM = the PER-BOX volume
    //     → total = unitPrice × cbm × qty   (verified: 0.1554×2500×2 = 777.00)
    // The printed lineTotal is authoritative either way (it IS the bill), so this
    // flag is advisory only: raise it when NEITHER reading explains the total (e.g.
    // the real 0.00-unit-price/149.00 line) — never cry wolf on a multi-box line.
    const expectedByLine = round2(unitPrice * cbm);
    const expectedByBox = round2(unitPrice * cbm * qty);
    lines.push({
      tracking,
      kg,
      cbm,
      qty,
      unitPrice,
      lineTotal,
      totalMismatch:
        lineTotal > 0 &&
        Math.abs(expectedByLine - lineTotal) > 0.02 &&
        Math.abs(expectedByBox - lineTotal) > 0.02,
      cabinet: cabinetAbove(rows, i),
      memberCode,
    });
  }

  const subTotal = moneyForLabel(rows, SUBTOTAL_LABEL);
  const linesTotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));

  return {
    invoiceNo,
    grandTotal,
    lines,
    subTotal,
    linesTotal,
    // Fails closed: an unreadable Sub-total (null) never reconciles.
    reconciles: subTotal != null && Math.abs(linesTotal - subTotal) < 0.02,
    whtThb: moneyForLabel(rows, WHT_LABEL),
    crateTotal: moneyForLabel(rows, CRATE_LABEL),
    codTotal: moneyForLabel(rows, COD_LABEL),
    thDeliveryTotal: moneyForLabel(rows, TH_DELIVERY_LABEL),
  };
}
