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
 * 🔴 ROOT FIX 2026-07-17 (a) — "a value wrapped onto the next row" is a whole bug
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
 * 🔴 ROOT FIX 2026-07-17 (b) — the CBM-basis BLIND SPOT.
 *    The old `totalMismatch` accepted the total if it fitted EITHER
 *    `unitPrice × cbm` OR `unitPrice × cbm × qty`. Accepting both readings makes
 *    the flag blind on every qty>1 line: if MOMO ever bills 4,700 × 0.4298 × 14
 *    = ฿28,280.84 where the truth is ฿2,020.06 (14× over-charge), the OR passes
 *    it AND `reconciles` still passes (MOMO's own Sub-total agrees with MOMO's
 *    own error). That kills the whole point — "รายงาน ตรง/ขัดแย้ง ก่อนกดตัดจ่าย".
 *    Fix: resolve ONE basis for the WHOLE invoice from EVIDENCE (majority-fit
 *    across the lines that can discriminate), then apply that single formula
 *    strictly. Undecidable ⇒ fail closed (never guess a basis).
 *
 *    ⚠️ What the evidence actually says (5 real invoices re-extracted from the
 *    PDFs 2026-07-17 · 87 lines · 15 discriminating lines):
 *        INV-20260708-0002  line_total 6 : per_box 0     ← ก.ค.
 *        INV-20260618-0003  line_total 7 : per_box 0     ← มิ.ย.
 *        INV-20260618-0004  line_total 2 : per_box 0     ← มิ.ย.
 *        INV-20260623-0006  line_total 0 : per_box 0     (ทุกบรรทัด 1 กล่อง)
 *        INV-20260625-0003  line_total 0 : per_box 0     (ทุกบรรทัด 1 กล่อง)
 *    → EVERY real invoice, both months, is `line_total` (cbm = the volume billed
 *    for the whole line · qty = a box COUNT). There is NO มิ.ย.-vs-ก.ค. template
 *    split, so this module does NOT read the invoice number to pick a formula —
 *    an invoice-number rule would be a myth hard-coded into the money path.
 *    (The "มิ.ย. = per_box" story came from a fabricated fixture — see the test.)
 *    The detection is nonetheless evidence-based, not hard-coded to line_total,
 *    so the day MOMO really does change, the votes flip and we notice.
 *
 * ⚠️ scripts/momo-invoice-cost-backfill-2026-06-26.mjs holds a FROZEN copy of the
 *    pre-fix regexes (a one-off backfill, already applied 2026-06-26, with its own
 *    Sub-total reconcile gate). It is intentionally not re-synced — do not treat it
 *    as this module's mirror.
 */

/** How to read the invoice's CBM column.
 *  · `line_total` — cbm = the volume billed for the whole line → total = unitPrice × cbm
 *  · `per_box`    — cbm = the volume of ONE box            → total = unitPrice × cbm × qty */
export type MomoCbmBasis = "per_box" | "line_total";

export type MomoInvoiceLine = {
  tracking: string;
  kg: number;
  cbm: number;        // CBM as printed on the invoice (meaning = the invoice's cbmBasis)
  qty: number;        // the BOX COUNT printed on the invoice
  unitPrice: number;  // ฿/CBM (2,500 เรือ · 4,700 รถ)
  lineTotal: number;  // รวม (Total) = the COST for this tracking — MOMO's bill WINS
  /** The printed total does not match `unitPrice × cbm (× qty)` under the invoice's
   *  resolved basis → MOMO's own arithmetic is off → a human must look.
   *  Always false when the basis is unusable (nothing was checked → say nothing) or
   *  when the rate is missing (see rateMissing) — never claim a check we didn't run. */
  totalMismatch: boolean;
  /** MOMO printed "0.00" as the unit price (real: INV-20260623-0006 has 16 such
   *  lines). The total is still the bill, but the arithmetic CANNOT be verified —
   *  reported honestly instead of being folded into totalMismatch (which would be
   *  a constant-true, i.e. zero information). */
  rateMissing: boolean;
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
   *  🔴 Money gate 1 of 2: never write cost from a parse where this is false. */
  reconciles: boolean;
  /** The single CBM reading resolved for this WHOLE invoice from the lines'
   *  evidence · null = could not be decided. */
  cbmBasis: MomoCbmBasis | null;
  /** Votes behind cbmBasis, so the UI can show the accountant WHY we read the
   *  invoice the way we did (and a dev can see a template flip the day it lands). */
  cbmBasisVotes: { lineTotal: number; perBox: number };
  /** true when at least one line's total would DIFFER between the two readings
   *  (i.e. some line has qty>1 with a real rate + cbm). When false, both readings
   *  are arithmetically identical on every line — the basis is then unknowable AND
   *  irrelevant, so it must not block (2 of the 5 real invoices are all-1-box). */
  cbmBasisMaterial: boolean;
  /** 🔴 Money gate 2 of 2: every line can be evaluated unambiguously — either the
   *  basis is decided, or it cannot change any line. False ⇒ refuse the file. */
  cbmBasisUsable: boolean;
  /** Thai, human-readable: how the basis was decided (or why it wasn't). */
  cbmBasisReason: string;
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

/** Satang tolerance. Deliberately tight: MOMO computes from the CBM it prints, so
 *  across all 87 real lines the strict reading has ZERO false flags — a looser
 *  tolerance would only let a line fit BOTH readings and weaken the vote. */
const SATANG = 0.02;

/** A basis is only trusted on a real body of agreeing evidence. ONE vote is not
 *  enough: on an otherwise all-1-box invoice a single MOMO ×qty OVER-CHARGE would
 *  be the only voter, "prove" per_box, and thereby excuse itself — the exact blind
 *  spot this fix exists to close. Two independent lines can't do that by accident. */
const MIN_DECISIVE_VOTES = 2;
/** With mixed votes the winner must dominate (a stray mis-billed line must not
 *  flip the invoice, but a genuinely split invoice must not be guessed either). */
const DOMINANCE_RATIO = 3;

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

type RawLine = Omit<MomoInvoiceLine, "totalMismatch" | "rateMissing">;

/** Can this line tell the two readings apart? Only a real rate on more than one box
 *  can: at qty ≤ 1 (or rate/cbm = 0) both formulas give the identical number. */
function isDiscriminating(l: RawLine): boolean {
  return l.qty > 1 && l.unitPrice > 0 && l.cbm > 0 && l.lineTotal > 0;
}

function fitsLineTotal(l: RawLine): boolean {
  return Math.abs(round2(l.unitPrice * l.cbm) - l.lineTotal) <= SATANG;
}
function fitsPerBox(l: RawLine): boolean {
  return Math.abs(round2(l.unitPrice * l.cbm * l.qty) - l.lineTotal) <= SATANG;
}

type BasisResolution = {
  basis: MomoCbmBasis | null;
  votes: { lineTotal: number; perBox: number };
  material: boolean;
  usable: boolean;
  reason: string;
};

/**
 * Resolve ONE CBM reading for the whole invoice from the lines themselves.
 * Evidence only — deliberately NOT keyed on the invoice number (see the header:
 * every real invoice of both months is line_total, so a number→formula rule would
 * hard-code a myth and mis-read the very lines it claims to explain).
 */
function resolveCbmBasis(lines: RawLine[]): BasisResolution {
  const material = lines.some(isDiscriminating);
  let lineTotal = 0;
  let perBox = 0;
  for (const l of lines) {
    if (!isDiscriminating(l)) continue;
    const fl = fitsLineTotal(l);
    const fb = fitsPerBox(l);
    if (fl && !fb) lineTotal += 1;
    else if (fb && !fl) perBox += 1;
    // fits both (impossible while discriminating) or neither (a mis-billed line) → no vote
  }
  const votes = { lineTotal, perBox };

  if (!material) {
    // Every line reads the same under both formulas → the basis cannot be observed,
    // and cannot change a single number. Refusing here would block real invoices
    // (2 of the 5 real ones are all-1-box) for no safety gain at all.
    return {
      basis: null,
      votes,
      material: false,
      usable: true,
      reason: "ทุกบรรทัดเป็น 1 กล่อง — สูตรทั้งสองแบบให้ยอดเท่ากัน จึงไม่ต้องชี้ขาดรุ่นใบ (ไม่มีผลต่อการตรวจ)",
    };
  }

  const winner: MomoCbmBasis = lineTotal >= perBox ? "line_total" : "per_box";
  const win = Math.max(lineTotal, perBox);
  const lose = Math.min(lineTotal, perBox);
  const label = (b: MomoCbmBasis) => (b === "line_total" ? "คิว = ทั้งบรรทัด" : "คิว = ต่อกล่อง");

  if (win >= MIN_DECISIVE_VOTES && win >= DOMINANCE_RATIO * lose) {
    return {
      basis: winner,
      votes,
      material: true,
      usable: true,
      reason:
        `อ่านใบเป็นแบบ "${label(winner)}" — ตรวจจากบรรทัดที่ชี้ขาดได้ (มากกว่า 1 กล่อง): ` +
        `เข้ากับสูตรนี้ ${win} บรรทัด · สูตรอีกแบบ ${lose} บรรทัด` +
        (lose > 0 ? ` (${lose} บรรทัดที่ไม่เข้าจะถูกทำเครื่องหมาย "ยอดไม่ตรงสูตร" ให้ตรวจ)` : ""),
    };
  }

  return {
    basis: null,
    votes,
    material: true,
    usable: false,
    reason:
      `ชี้ขาดรุ่นใบไม่ได้ — บรรทัดที่ชี้ขาดได้เข้ากับสูตร "คิว = ทั้งบรรทัด" ${lineTotal} บรรทัด · ` +
      `"คิว = ต่อกล่อง" ${perBox} บรรทัด ` +
      (win === 0
        ? "(ไม่มีบรรทัดไหนเข้ากับสูตรใดเลย)"
        : win < MIN_DECISIVE_VOTES
          ? `(หลักฐานน้อยเกินไป ต้องมีอย่างน้อย ${MIN_DECISIVE_VOTES} บรรทัดที่สอดคล้องกัน)`
          : "(สองสูตรก้ำกึ่งกัน)") +
      " — ระบบไม่เดา กรุณาให้ทีมพัฒนาตรวจใบนี้ก่อนบันทึกต้นทุน",
  };
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

  const raw: RawLine[] = [];
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
    let sawPriceRow = false;
    for (let j = bodyStart; j < Math.min(bodyStart + 5, rows.length); j++) {
      const ln = rows[j];
      if (!sawPriceRow) {
        const pm = ln.match(PRICE_RE);
        if (pm) {
          const mc = pm[1].trim();
          memberCode = mc && !/^no\s*code$/i.test(mc) ? mc : null;
          qty = Number(pm[2]) || 1;
          unitPrice = num(pm[3]);
          sawPriceRow = true;
          continue;
        }
      }
      if (/คิดตาม\s*CBM/i.test(ln)) {
        const tm = (rows[j + 1] ?? "").match(MONEY_ONLY_RE);
        if (tm) lineTotal = num(tm[1]);
        break;
      }
      // Fallback: a bare money-only row after the price row (no "คิดตาม CBM") = total.
      const mo = ln.match(MONEY_ONLY_RE);
      if (mo && sawPriceRow) { lineTotal = num(mo[1]); break; }
    }

    // De-dup defensively (a tracking should appear once per invoice).
    if (seen.has(tracking)) continue;
    seen.add(tracking);

    raw.push({ tracking, kg, cbm, qty, unitPrice, lineTotal, cabinet: cabinetAbove(rows, i), memberCode });
  }

  // ── Resolve ONE reading for the whole invoice, then judge every line by it. ──
  const b = resolveCbmBasis(raw);
  // When the basis is immaterial (every line 1 box) both formulas agree, so either
  // may be used to evaluate; line_total is the arithmetic identity there.
  const evalBasis: MomoCbmBasis | null = b.basis ?? (b.usable ? "line_total" : null);

  const lines: MomoInvoiceLine[] = raw.map((l) => {
    const rateMissing = l.unitPrice <= 0 && l.lineTotal > 0;
    const checkable = evalBasis != null && !rateMissing && l.lineTotal > 0 && l.unitPrice > 0;
    return {
      ...l,
      rateMissing,
      // Only ever claim a mismatch from a check we actually ran (§0f: อย่ามั่ว).
      totalMismatch: checkable
        ? !(evalBasis === "line_total" ? fitsLineTotal(l) : fitsPerBox(l))
        : false,
    };
  });

  const subTotal = moneyForLabel(rows, SUBTOTAL_LABEL);
  const linesTotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));

  return {
    invoiceNo,
    grandTotal,
    lines,
    subTotal,
    linesTotal,
    // Fails closed: an unreadable Sub-total (null) never reconciles.
    reconciles: subTotal != null && Math.abs(linesTotal - subTotal) < SATANG,
    cbmBasis: b.basis,
    cbmBasisVotes: b.votes,
    cbmBasisMaterial: b.material,
    cbmBasisUsable: b.usable,
    cbmBasisReason: b.reason,
    whtThb: moneyForLabel(rows, WHT_LABEL),
    crateTotal: moneyForLabel(rows, CRATE_LABEL),
    codTotal: moneyForLabel(rows, COD_LABEL),
    thDeliveryTotal: moneyForLabel(rows, TH_DELIVERY_LABEL),
  };
}
