/**
 * Named fine-grained fee split for a tb_forwarder row — the SINGLE helper the
 * three cargo money documents (ใบวางบิล · ใบเสร็จ · ใบแจ้งหนี้) use to PRESENT the
 * charge broken into its correctly-labeled parts.
 *
 * ── WHY THIS EXISTS (owner 2026-07-07 · money-accounting rule) ─────────────
 * `calcForwarderGross` / the `computeForwarderDebitBatch` breakdown roll a row's
 * non-freight charges into ONE opaque bucket (`otherCharges`) that the papers
 * printed as a generic "บริการอื่นๆ". That HID **ค่าขนส่งในไทย** (`ftransportprice`)
 * — a distinct fee that belongs in a DIFFERENT bank account (LOGISTICS
 * 225-2-91144-0) than the freight/เหมาๆ (SERVICE 204-1-55856-6). This helper does
 * NOT invent or re-total anything: it re-presents the SAME gross with each named
 * component surfaced so the reader (and the accountant reconciling per-account)
 * sees exactly what the charge is made of.
 *
 * ── THE FEE TAXONOMY (report-cnt detail table = the canonical labels) ──────
 *   freight       ค่าขนส่งสินค้า   ftotalprice            → SERVICE (rate × kg/cbm)
 *   thaiShipping  ค่าขนส่งในไทย    ftransportprice        → LOGISTICS (the real Thai leg)
 *   crate         ค่าตีลัง        pricecrate
 *   update        ค่าอัปเดต       fpriceupdate
 *   chnPlus       ค่าขนส่งจีน+    ftransportpricechnthb
 *   other         ค่าอื่นๆ        priceother + fshippingservice
 *   discount      ส่วนลด          fdiscount (a POSITIVE number that is SUBTRACTED)
 *
 * NOT included here: ค่าส่งเหมาๆ (MAO_FLAT_FEE ฿100) — that is a HEADER-level
 * promo fee (SERVICE · never one of the 7 row price columns · lives in
 * forwarder-debit-total.ts / the doc's mao_fee_thb), added ON TOP of the gross.
 *
 * INVARIANT (locked by the test): `namedFeesGross(splitForwarderFees(row))`
 * equals `calcForwarderGross(row)` to the satang, and
 * `thaiShipping+crate+update+chnPlus+other` equals the debit-batch
 * `breakdown.otherCharges`. This is a pure re-labeling — the money is identical.
 */

/** The subset of tb_forwarder price columns this helper reads (legacy varchars
 *  coerced defensively). `ForwarderPriceFields` (outstanding.ts) + the billing /
 *  receipt / invoice row shapes are all structurally assignable to this. */
export interface ForwarderFeeFields {
  ftotalprice:           number | string | null;
  ftransportprice:       number | string | null;
  fpriceupdate:          number | string | null;
  fshippingservice:      number | string | null;
  pricecrate:            number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother:            number | string | null;
  fdiscount:             number | string | null;
}

/** The named fees for ONE row (or a Σ). `discount` is positive (subtracted). */
export interface NamedForwarderFees {
  freight:      number; // ค่าขนส่งสินค้า  (ftotalprice · SERVICE)
  thaiShipping: number; // ค่าขนส่งในไทย   (ftransportprice · LOGISTICS)
  crate:        number; // ค่าตีลัง        (pricecrate)
  update:       number; // ค่าอัปเดต       (fpriceupdate)
  chnPlus:      number; // ค่าขนส่งจีน+    (ftransportpricechnthb)
  other:        number; // ค่าอื่นๆ        (priceother + fshippingservice)
  discount:     number; // ส่วนลด          (fdiscount · SUBTRACTED)
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Split ONE forwarder row into its named fees (RAW · unrounded — so the sum is
 *  byte-identical to calcForwarderGross before rounding). */
export function splitForwarderFees(row: ForwarderFeeFields): NamedForwarderFees {
  return {
    freight:      toNumber(row.ftotalprice),
    thaiShipping: toNumber(row.ftransportprice),
    crate:        toNumber(row.pricecrate),
    update:       toNumber(row.fpriceupdate),
    chnPlus:      toNumber(row.ftransportpricechnthb),
    other:        toNumber(row.priceother) + toNumber(row.fshippingservice),
    discount:     toNumber(row.fdiscount),
  };
}

/** Σ each named fee over a set of rows (each field rounded to 2dp for display). */
export function sumNamedFees(rows: ForwarderFeeFields[]): NamedForwarderFees {
  const acc: NamedForwarderFees = {
    freight: 0, thaiShipping: 0, crate: 0, update: 0, chnPlus: 0, other: 0, discount: 0,
  };
  for (const r of rows) {
    const f = splitForwarderFees(r);
    acc.freight      += f.freight;
    acc.thaiShipping += f.thaiShipping;
    acc.crate        += f.crate;
    acc.update       += f.update;
    acc.chnPlus      += f.chnPlus;
    acc.other        += f.other;
    acc.discount     += f.discount;
  }
  return {
    freight:      round2(acc.freight),
    thaiShipping: round2(acc.thaiShipping),
    crate:        round2(acc.crate),
    update:       round2(acc.update),
    chnPlus:      round2(acc.chnPlus),
    other:        round2(acc.other),
    discount:     round2(acc.discount),
  };
}

/** The signed non-freight contribution to the gross = every named fee EXCEPT
 *  freight, minus discount. Subtract this from a stored gross total to recover
 *  the balancing freight line (which absorbs any per-line override / juristic-1%
 *  / frozen drift so the itemized lines always re-sum to the stored total). */
export function namedNonFreight(f: NamedForwarderFees): number {
  return f.thaiShipping + f.crate + f.update + f.chnPlus + f.other - f.discount;
}

/** freight + all non-freight named fees − discount = the row/batch GROSS (pre-mao,
 *  pre-WHT). Equals `calcForwarderGross` to the satang — the locked invariant. */
export function namedFeesGross(f: NamedForwarderFees): number {
  return round2(f.freight + namedNonFreight(f));
}
