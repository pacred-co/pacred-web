/**
 * Pure helper — compute the CUSTOMER SELF-PAY collect total for a set of
 * tb_forwarder rows the customer ticked on the `/service-import` pay-bar.
 *
 * Lives here (NOT in `actions/forwarder.ts`) so the plain-`tsx` test harness
 * can exercise the money math directly without pulling in `lib/supabase/admin.ts`
 * (which `import "server-only"` — explodes outside `next start`). We never inline
 * untested money math into a server action.
 *
 * ── Why a SEPARATE helper from `forwarder-debit-total.ts` ─────────────────
 * The CUSTOMER self-pay path (legacy `member/include/pages/forwarder/calPrice.php`
 * + `member/forwarder.php paymentForwarderNew`) and the ADMIN pay-on-behalf path
 * (legacy `pcs-admin/pay-users.php`) are TWO distinct legacy code paths with
 * DIFFERENT ฿50 / exemption models — do NOT conflate:
 *   • admin  (`computeForwarderDebitBatch`): exempts only `PCS999`; the ฿50 lands
 *     on the FIRST PCSF-zero row.
 *   • customer (this helper · calPrice.php L29-45): counts ALL PCSF-zero rows,
 *     SUBTRACTS the `userNotPCS50`-allowlist × `'หนองแขม'`-district exemption, then
 *     adds ONE flat ฿50 to the batch when the surviving count ≥ 1.
 *
 * This helper is the SINGLE SOURCE OF TRUTH for the customer self-pay total, so
 * the DISPLAY (`calculateForwarderTotal`) and the CHARGE (`submitForwarderPayment`)
 * can never drift (the BUG-2 root cause: two hand-rolled copies of this math).
 *
 * ── Source of truth (legacy) ──────────────────────────────────────────────
 * `member/include/pages/forwarder/calPrice.php` L25-45 (verbatim, mirrored in
 * `actions/forwarder.ts calculateForwarderTotal` L111-179):
 *
 *   Per-row total (calPrice.php L26):
 *     fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService
 *     + priceCrate + fTransportPriceCHNTHB + priceOther − fDiscount
 *
 *   PCSF +50 flat (calPrice.php L29-42):
 *     countPricePCSF = # rows with fShipBy='PCSF' AND fTransportPrice=0,
 *       MINUS 1 for each row whose fAddressDistrict contains 'หนองแขม' AND the
 *       user is on the userNotPCS50 allowlist (the หนองแขม self-handling exemption).
 *     If countPricePCSF >= 1 → price += 50 (ONE flat fee for the whole batch).
 *
 *   Juristic 1% reduction (calPrice.php L43-45):
 *     If userCompany == '1' AND price >= 1000 → price -= price * 0.01.
 *     ⚠️ gated on tb_users.userCompany — NOT on tb_corporate existence.
 *
 * Legacy stores most of these as numeric columns but a few as `varchar`
 * (string|number|null) — we coerce defensively. The total rounds to 2 satang.
 */

import { MAO_FLAT_FEE, isMaoCarrier } from "./mao-fee";

/** One forwarder row's pricing inputs (lowercase = PostgREST casing). */
export interface ForwarderCollectRow {
  fshipby: string | null;
  ftransportprice: number | string | null;
  /**
   * '1'=ต้นทาง (prepaid) · '2'=ปลายทาง (COD, collected at the door by the courier).
   * A COD row's ftransportprice is the AT-DOOR amount → it must NOT be billed
   * in the Pacred upfront collect total (else double-charge). Optional/absent →
   * treated as prepaid (the domestic leg is billed as before).
   */
  paymethod?: number | string | null;
  faddressdistrict: string | null;
  ftotalprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
}

/** Result of the customer self-pay collect calc. `total` is rounded 2dp. */
export interface ForwarderCollectTotal {
  /** ยอดเก็บจริง (THB, rounded 2dp). */
  total: number;
  /** Surviving PCSF-zero row count after the หนองแขม/allowlist exemption. */
  countPCSF: number;
  /** Whether the flat ฿50 PCSF เหมาๆ fee was added (countPCSF >= 1). */
  applied50: boolean;
  /** Whether the juristic 1% reduction fired (userCompany='1' AND total >= 1000). */
  appliedWht: boolean;
}

/**
 * The per-user "no ฿50" allowlist — the หนองแขม self-handling customers the
 * legacy `calPrice.php` reads from a static JSON (`in_array($userID, $userNotPCS50)`).
 * Mirrors the bare username membership check; PR equivalents added for D1
 * rebrand parity (the same member-code numbering mapped 1:1 from PCS → PR).
 *
 * NOTE: the exemption fires ONLY for a PCSF-zero row whose `fAddressDistrict`
 * ALSO contains 'หนองแขม' — being on this list alone is not enough.
 */
export const userNotPCS50: ReadonlySet<string> = new Set<string>([
  "PCS50", "PCS3083", "PCS3983", "PCS999",
  "PR50", "PR3083", "PR3983", "PR999",
]);

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the customer self-pay collect total for a set of eligible forwarder
 * rows (already filtered to fStatus='5' OR fCredit='1' by the caller).
 *
 * Reproduces `actions/forwarder.ts calculateForwarderTotal` L111-179 EXACTLY,
 * which itself is the verbatim `calPrice.php` L25-45 port.
 *
 * @param rows             eligible tb_forwarder rows
 * @param opts.userId      the customer's userID (PR<n>) — the หนองแขม allowlist key
 * @param opts.userCompany tb_users.userCompany ('1' = juristic) — the 1% lever
 */
export function computeForwarderCollectTotal(
  rows: ForwarderCollectRow[],
  opts: { userId: string; userCompany: string },
): ForwarderCollectTotal {
  const userId = (opts.userId ?? "").trim();
  const userCompany = String(opts.userCompany ?? "");
  const isAllowlisted = userNotPCS50.has(userId);

  let price = 0;
  let countPricePCSF = 0;

  for (const r of rows) {
    // calPrice.php L26 — per-row total. The DOMESTIC leg (ftransportprice) is
    // billed upfront ONLY for a prepaid (ต้นทาง) row; a COD (ปลายทาง, paymethod='2')
    // row's ftransportprice is collected at the door by the courier, so it is NOT
    // added to the Pacred upfront bill (owner: COD row can't be billed the domestic
    // shipping upfront). This guards ONLY the domestic leg — freight/mao/crate/other
    // are untouched.
    const domesticLeg = toNumber(r.paymethod) === 2 ? 0 : toNumber(r.ftransportprice);
    const totalPrice =
      toNumber(r.ftotalprice) +
      domesticLeg +
      toNumber(r.fpriceupdate) +
      toNumber(r.fshippingservice) +
      toNumber(r.pricecrate) +
      toNumber(r.ftransportpricechnthb) +
      toNumber(r.priceother) -
      toNumber(r.fdiscount);
    price += totalPrice;

    // calPrice.php L29-31 — เหมาๆ rows (PCSF legacy / PRF rebrand) with
    // fTransportPrice=0 are counted.
    if (isMaoCarrier(r.fshipby) && toNumber(r.ftransportprice) === 0) {
      countPricePCSF++;
    }

    // calPrice.php L34-38 — หนองแขม self-handling exemption: a row whose
    // district contains 'หนองแขม' AND a user on the userNotPCS50 allowlist
    // un-counts that row from the +50 (the legacy `countPricePCSF--`).
    if (
      r.faddressdistrict &&
      r.faddressdistrict.indexOf("หนองแขม") !== -1 &&
      isAllowlisted
    ) {
      countPricePCSF--;
    }
  }

  // calPrice.php L40-42 — flat เหมาๆ fee when at least one PCSF/PRF row survives.
  // Owner 2026-06-19: the fee is ฿100 (MAO_FLAT_FEE), raised from the legacy ฿50.
  const applied50 = countPricePCSF >= 1;
  if (applied50) price += MAO_FLAT_FEE;

  // calPrice.php L43-45 — juristic users with price >= 1000 get a 1% reduction.
  const appliedWht = userCompany === "1" && price >= 1000;
  if (appliedWht) price -= price * 0.01;

  return {
    total: round2(price),
    countPCSF: countPricePCSF,
    applied50,
    appliedWht,
  };
}
