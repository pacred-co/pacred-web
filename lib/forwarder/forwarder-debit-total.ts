/**
 * Pure helper — compute the wallet-debit total(s) for a BATCH of unpaid
 * tb_forwarder rows being paid on a customer's behalf.
 *
 * Lives here (NOT in `actions/admin/pay-user.ts`) for the same reason as
 * `lib/service-order/debit-total.ts`: the test harness uses plain `tsx`,
 * and importing the action file pulls in `lib/supabase/admin.ts` which
 * `import "server-only"` (explodes outside `next start`). Keeping the
 * money math pure lets the test exercise it directly — we never inline
 * untested money math into a server action.
 *
 * ── Source of truth (legacy) ─────────────────────────────────────────
 * `pcs-admin/pay-users.php` `paymentForwarderNew` handler, the
 * sufficient-balance branch (`$userTotalWalletForm >= $pricePayAll`,
 * L435-491). Phase-2 ports ONLY the wallet-debit contract; the
 * insufficient-balance slip-top-up path (L342, L561) is Phase 3.
 *
 *   Per-forwarder BASE price (L320 / L387 / L391 / L445 / L449):
 *     base = (fTotalPrice + fTransportPrice + fPriceUpdate +
 *             fShippingService + priceCrate + fTransportPriceCHNTHB +
 *             priceOther) − fDiscount
 *
 *   PCSF first-item special (L386-395 / L444-453):
 *     For the FIRST row in the batch where fShipBy=='PCSF' AND
 *     fTransportPrice==0 AND userID!='PCS999', the transport leg is
 *     charged a flat ฿50 (the row's base is computed with +50), and the
 *     legacy ALSO mutates `tb_forwarder.fTransportPrice = 50` for that
 *     row. We surface that row's ID via `pcsfTransportFixId` so the
 *     action can perform the (faithful) side-effect write. Subsequent
 *     PCSF-zero rows stay free.
 *
 *   PCSMao เหมาๆ batch surcharge (L243-249 / L328-331):
 *     `PCSMao` = count of rows with fShipBy=='PCSF' AND fTransportPrice==0.
 *     If PCSMao>=1 AND userID!='PCS999', the batch threshold gets +฿50.
 *     This ฿50 is the SAME ฿50 that the first PCSF row's individual price
 *     already carries (L387) — so the batch total and the sum of the
 *     per-row prices stay consistent (no double-charge). It exists at
 *     batch level only to size the balance-check threshold.
 *
 *   Corporate (นิติบุคคล) 1% allowance (L333-335 / L397-402 / L455-460):
 *     If the customer is corporate (a `tb_corporate` row exists) AND the
 *     batch total `pricePayAll >= 1000`, EACH row's individual price is
 *     reduced by 1% (`pricePay -= pricePay*0.01`) AND the row is stamped
 *     `fUserCompany='1'`. The gate keys off the BATCH total, not the row
 *     — a single-row batch under ฿1000 gets no discount even for a
 *     corporate customer. We surface `applyCorporateDiscount` so the
 *     action knows whether to write `fusercompany='1'` (else `''`).
 *
 * Legacy stores most of these as numeric columns but a few as `varchar`
 * (string|number|null) — we coerce defensively. All outputs round to 2
 * satang.
 */

/** One unpaid forwarder row's pricing inputs (lowercase = PostgREST casing). */
export interface ForwarderDebitRow {
  id: number | string;
  fshipby: string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
}

export interface ForwarderDebitLine {
  /** tb_forwarder.id (as string, matching how callers key the loop). */
  id: string;
  /** THB to debit for this row (rounded 2dp). NaN if the inputs are bad. */
  price_thb: number;
  /** This row is the first PCSF-zero item → it carries the ฿50 transport. */
  isPcsfFirst: boolean;
}

export interface ForwarderDebitBatch {
  lines: ForwarderDebitLine[];
  /** Sum of all line prices, rounded 2dp (== legacy `pricePayAll`). */
  total_thb: number;
  /** The id of the first PCSF-zero row whose fTransportPrice the action
   *  must mutate to 50 (faithful L388/L446), or null if none. */
  pcsfTransportFixId: string | null;
  /** Whether the corporate 1% allowance fired (batch ≥ ฿1000 & corporate).
   *  When true, each settled row stamps fusercompany='1'; else ''. */
  applyCorporateDiscount: boolean;
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Is this a PCSF row eligible for the เหมาๆ ฿50 first-item rule? */
function isPcsfZero(row: ForwarderDebitRow): boolean {
  const shipBy = (row.fshipby ?? "").trim();
  // legacy compares fTransportPrice==0 (loose) — treat 0 / "0" / "" as zero
  return shipBy === "PCSF" && toNumber(row.ftransportprice) === 0;
}

/**
 * Compute the per-row debit amounts + batch total for paying a set of
 * forwarders on behalf of `userId`.
 *
 * @param rows         eligible tb_forwarder rows (already filtered to
 *                     fStatus='5' OR fCredit='1' by the caller)
 * @param opts.userId  the customer's userID (PCS999 is exempt from PCSF/เหมาๆ)
 * @param opts.isCorporate  true if a tb_corporate row exists for the user
 *
 * Order matters — the FIRST PCSF-zero row in `rows` is the one that gets
 * the ฿50 (legacy iterates the recordset in DB order; callers must pass
 * rows in a stable order, e.g. the same `WHERE … IN (…)` order).
 */
export function computeForwarderDebitBatch(
  rows: ForwarderDebitRow[],
  opts: { userId: string; isCorporate: boolean },
): ForwarderDebitBatch {
  const userId = (opts.userId ?? "").trim();
  const exemptPcsf = userId === "PCS999";

  // ── pass 1: PCSMao count + locate the first PCSF-zero row (L243-249) ──
  let firstPcsfIdx = -1;
  rows.forEach((r, i) => {
    if (isPcsfZero(r) && firstPcsfIdx === -1) firstPcsfIdx = i;
  });
  const pcsfFirstApplies = firstPcsfIdx !== -1 && !exemptPcsf;

  // ── pass 2: per-row BASE price (pre-corporate) ──
  // The first PCSF-zero row carries +฿50 on its transport leg (L387).
  const baseLines = rows.map((r, i) => {
    const base =
      toNumber(r.ftotalprice) +
      toNumber(r.ftransportprice) +
      toNumber(r.fpriceupdate) +
      toNumber(r.fshippingservice) +
      toNumber(r.pricecrate) +
      toNumber(r.ftransportpricechnthb) +
      toNumber(r.priceother) -
      toNumber(r.fdiscount);
    const isPcsfFirst = pcsfFirstApplies && i === firstPcsfIdx;
    const withPcsf = isPcsfFirst ? base + 50 : base;
    return { id: String(r.id), base: withPcsf, isPcsfFirst };
  });

  // ── batch threshold (== legacy pricePayAll BEFORE corporate, L321-331) ──
  // Sum of bases (which already includes the first PCSF +50). The L328-331
  // PCSMao +50 is the SAME ฿50 already in the first PCSF row's base, so we
  // do NOT add it again — that would double-charge. (Legacy adds it to the
  // batch var separately because its per-row +50 lives only in the loop's
  // local $pricePay, not in the running $pricePayAll until that loop; the
  // net effect is one ฿50, which our single-pass sum reproduces.)
  const preCorporateTotal = baseLines.reduce((s, l) => s + l.base, 0);

  // ── corporate 1% allowance — gate on batch total ≥ ฿1000 (L333-335) ──
  const applyCorporateDiscount = opts.isCorporate && preCorporateTotal >= 1000;

  const lines: ForwarderDebitLine[] = baseLines.map((l) => {
    let price = l.base;
    if (applyCorporateDiscount) {
      price = price - price * 0.01; // L398/L456: per-row 1% off
    }
    const finalPrice = Number.isFinite(price) && price > 0 ? round2(price) : NaN;
    return { id: l.id, price_thb: finalPrice, isPcsfFirst: l.isPcsfFirst };
  });

  const total_thb = round2(
    lines.reduce((s, l) => s + (Number.isFinite(l.price_thb) ? l.price_thb : 0), 0),
  );

  return {
    lines,
    total_thb,
    pcsfTransportFixId: pcsfFirstApplies ? String(rows[firstPcsfIdx].id) : null,
    applyCorporateDiscount,
  };
}
