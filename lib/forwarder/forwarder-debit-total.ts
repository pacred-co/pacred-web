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

import { MAO_FLAT_FEE, isMaoCarrier } from "./mao-fee";
import { trackingSuffix } from "@/lib/admin/momo-bill-header";

/** One unpaid forwarder row's pricing inputs (lowercase = PostgREST casing). */
export interface ForwarderDebitRow {
  id: number | string;
  fshipby: string | null;
  /**
   * The China tracking — used to anchor the เหมาๆ flat fee to the BASE tracking
   * (no -N suffix) of a shipment, so it's charged ONCE per shipment across ANY
   * pay path (single-row line-by-line OR whole-batch · owner 2026-06-23 "ระวังเก็บ
   * ตังเบิ้ล"). Optional: callers that omit it fall back to first-in-batch (legacy).
   */
  ftrackingchn?: string | null;
  /**
   * The container this row is packed into (fcabinetnumber). The เหมาๆ ฿100 is the flat
   * in-Thailand DELIVERY fee → charged ONCE per delivery batch, and a container IS one
   * delivery (all of a customer's trackings in it arrive + ship together in one truck
   * run). When present it is the เหมาๆ dedup key so two BASE trackings of ONE container
   * are billed ฿100 once, not ฿200 (owner 2026-07-14 "ส่งลอบเดียวกัน ไม่เก็บเหมาๆ สองลอบ").
   * Optional: callers that omit it fall back to per-base-tracking (unchanged).
   */
  fcabinetnumber?: string | null;
  /**
   * '1'=ต้นทาง (prepaid) · '2'=ปลายทาง (COD — the courier collects the domestic leg at
   * the door). A COD row's `ftransportprice` is the AT-DOOR amount, so it must NOT be
   * folded into the Pacred upfront collect/debit total (else the domestic leg is
   * double-charged: once on the bill + once by the courier). Mirrors the customer
   * self-pay engine (forwarder-collect-total.ts:136) + the list-page outstanding
   * (outstanding.ts:87) so the collect surfaces never drift. OPTIONAL: absent/undefined
   * → treated as prepaid → the domestic leg is added as before (no regression for
   * callers that don't SELECT paymethod).
   */
  paymethod?: number | string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
}

/**
 * Itemised collect breakdown for ONE row (owner 2026-06-19 "แจงรายละเอียดค่า" — so
 * staff + customers see exactly what the charge is made of, not one opaque number).
 * All amounts THB, rounded 2dp. `total` === the line's `price_thb`.
 */
export interface ForwarderCollectBreakdown {
  freight: number;       // ค่าขนส่งสินค้า (ftotalprice — rate × kg/cbm)
  otherCharges: number;  // ค่าบริการ/ขนส่งอื่นๆ (ftransportprice + fpriceupdate + fshippingservice + pricecrate + ftransportpricechnthb + priceother)
  discount: number;      // ส่วนลด (fdiscount) — a positive number that is SUBTRACTED
  maoFee: number;        // ค่าส่งเหมาๆ (MAO_FLAT_FEE ฿100 on the first PCSF/PRF-zero row, else 0)
  wht1pct: number;       // หัก ณ ที่จ่าย นิติ 1% — a positive number that is SUBTRACTED (0 if not applied)
  total: number;         // ยอดเก็บจริง = freight + otherCharges + maoFee − discount − wht1pct
}

export interface ForwarderDebitLine {
  /** tb_forwarder.id (as string, matching how callers key the loop). */
  id: string;
  /** THB to debit for this row (rounded 2dp). NaN if the inputs are bad. */
  price_thb: number;
  /** This row is the first PCSF-zero item → it carries the ฿50 transport. */
  isPcsfFirst: boolean;
  /** Itemised "what is this charge" breakdown (owner: แจงรายละเอียดค่า). */
  breakdown: ForwarderCollectBreakdown;
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

/** Is this a เหมาๆ row eligible for the flat first-item fee? (PCSF legacy / PRF rebrand) */
function isPcsfZero(row: ForwarderDebitRow): boolean {
  // legacy compares fTransportPrice==0 (loose) — treat 0 / "0" / "" as zero
  return isMaoCarrier(row.fshipby) && toNumber(row.ftransportprice) === 0;
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

  // ── pass 1: locate the เหมาๆ flat-fee ANCHOR — ONE per BILL / pay-batch ──
  // owner 2026-07-15 (rule ratified · "เก็บเหมาๆ ซ้ำตอนรวมหลายการจ่ายแทนลูกค้า"): the เหมาๆ
  // ฿100 fires ONCE per COLLECTION EVENT — one ใบวางบิล / one pay-on-behalf transaction —
  // regardless of how many containers it spans. The whole `rows` set IS that one event, so
  // there is exactly ONE anchor across the entire batch. This aligns the admin/consolidate
  // engine with the customer SELF-PAY engine (computeForwarderCollectTotal · already ฿100
  // once per batch) → หน้าลูกค้า == ในงาน. (Supersedes the 2026-07-14 per-CONTAINER rule:
  // per-bill is the strictly-lower, single-collection reading the owner chose — a bill over
  // 2 containers = ฿100, not ฿200. Same-container 52118+52119 = ฿100 still holds.)
  //
  // A row can only ANCHOR if it is a เหมาๆ-eligible BASE row (suffix 0). That preserves the
  // split-box guard (owner 2026-06-23 · กันเก็บตังเบิ้ล): a -N box sub-row never anchors, so
  // paying it solo never fires the fee; only the base row can carry it. Legacy callers that
  // don't pass ftrackingchn fall back to the first PCSF row in the batch.
  const haveTracking = rows.some((r) => (r.ftrackingchn ?? "").trim() !== "");
  let firstPcsfIdx = -1;
  rows.forEach((r, i) => {
    if (isPcsfZero(r) && firstPcsfIdx === -1) firstPcsfIdx = i;
  });
  const isMaoBase = (r: ForwarderDebitRow, i: number): boolean => {
    if (exemptPcsf || !isPcsfZero(r)) return false;
    // eligible base = the base tracking (suffix 0); legacy (no tracking) = first in batch.
    return haveTracking ? trackingSuffix(r.ftrackingchn) === 0 : i === firstPcsfIdx;
  };
  // ONE anchor for the whole batch = the FIRST เหมาๆ-eligible base row (per-bill rule).
  const anchorIds = new Set<string>();
  const firstAnchor = rows.find((r, i) => isMaoBase(r, i));
  if (firstAnchor) anchorIds.add(String(firstAnchor.id));
  const isMaoAnchor = (r: ForwarderDebitRow): boolean => anchorIds.has(String(r.id));
  const anchorIdx = rows.findIndex((r) => isMaoAnchor(r));

  // ── pass 2: per-row BASE price (pre-corporate) ──
  // The เหมาๆ anchor row carries +MAO_FLAT_FEE on its transport leg (L387).
  const baseLines = rows.map((r) => {
    const freight = toNumber(r.ftotalprice);
    // D1 (2026-07-15 · MONEY · F1) — the DOMESTIC leg (ftransportprice) is billed upfront
    // ONLY for a prepaid (ต้นทาง) row. A COD (ปลายทาง · paymethod='2') row's ftransportprice
    // is collected at the door by the courier, so it is NOT folded into the Pacred
    // collect/debit total (else the domestic leg is double-charged). Absent paymethod ⇒
    // prepaid ⇒ unchanged. Mirrors outstanding.ts:87 + forwarder-collect-total.ts:136 so the
    // four collect surfaces (ใบวางบิล · ใบแจ้งหนี้ · ใบเสร็จ · pay-bar) never drift on COD.
    const domesticLeg = toNumber(r.paymethod) === 2 ? 0 : toNumber(r.ftransportprice);
    const otherCharges =
      domesticLeg +
      toNumber(r.fpriceupdate) +
      toNumber(r.fshippingservice) +
      toNumber(r.pricecrate) +
      toNumber(r.ftransportpricechnthb) +
      toNumber(r.priceother);
    const discount = toNumber(r.fdiscount);
    const base = freight + otherCharges - discount;
    const isPcsfFirst = isMaoAnchor(r);
    const maoFee = isPcsfFirst ? MAO_FLAT_FEE : 0;
    const withPcsf = base + maoFee;
    return { id: String(r.id), base: withPcsf, isPcsfFirst, freight, otherCharges, discount, maoFee };
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
    const wht1pct = applyCorporateDiscount ? l.base * 0.01 : 0; // L398/L456: per-row 1% off
    const price = l.base - wht1pct;
    const finalPrice = Number.isFinite(price) && price > 0 ? round2(price) : NaN;
    return {
      id: l.id,
      price_thb: finalPrice,
      isPcsfFirst: l.isPcsfFirst,
      breakdown: {
        freight: round2(l.freight),
        otherCharges: round2(l.otherCharges),
        discount: round2(l.discount),
        maoFee: l.maoFee,
        wht1pct: round2(wht1pct),
        total: Number.isFinite(finalPrice) ? finalPrice : round2(l.base - wht1pct),
      },
    };
  });

  const total_thb = round2(
    lines.reduce((s, l) => s + (Number.isFinite(l.price_thb) ? l.price_thb : 0), 0),
  );

  return {
    lines,
    total_thb,
    pcsfTransportFixId: anchorIdx >= 0 ? String(rows[anchorIdx].id) : null,
    applyCorporateDiscount,
  };
}
