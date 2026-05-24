/**
 * LEGACY (D1) — Promo catalog (1:1 port of `tagPro()` in
 * `member/include/function.php` L1289-1374, 80 cases).
 *
 * The legacy cart NEVER had a `tb_promo_codes` master table — the promo
 * catalog has always lived in PHP as a static switch on numeric promoid.
 * The customer-visible "discount" is two-fold:
 *
 *   1. `rate`  — special `rsDefault` exchange-rate override (e.g. 5.10
 *                instead of the live 5.00) → cheaper THB total without
 *                touching shipping/services. Mirrored in calculateCart.php
 *                L10-12 (`if($_POST['pro']==19){ $rsDefault=5.10; }`).
 *   2. `shippingDiscountThb` — flat ฿ off the shipping fee. Only "PCSF"
 *                uses this in legacy (shops.php L17-22 — `pro='f'` sets
 *                `fShippingService=50`, a 50฿ shipping freebie).
 *
 * Why not a DB table? Faithful port — the legacy never had one, and the
 * Pacred re-port keeps `tagPro()` semantics intact so the existing
 * `tb_promotion` audit log keeps making sense (the `promoid` column there
 * is the same numeric ID surfaced here as `id`).
 *
 * Customer-typed codes (what the cart input accepts) are matched against
 * `aliases` (case-insensitive) → resolved to the canonical numeric ID.
 * We export both the catalog (for `getAvailablePromos()`) and a resolver
 * (`resolveLegacyPromoCode`) so the validator can return the matching
 * `LegacyPromo` row.
 *
 * **Active window**: legacy didn't enforce date windows in
 * `check-proV.php` — the cart page just hid the badge after the promo
 * ran (presumably the admin toggled it off via a separate UI). For the
 * pacred-web port we expose `activeFrom` / `activeUntil` (UTC ISO) on
 * the few promos that have a documented window (3.3, Valentine, etc.),
 * and treat the rest as "evergreen" until the admin reaps them. The
 * `isActive(now, p)` helper centralises the date math.
 */

export type LegacyPromo = {
  /** Canonical numeric promoid — matches `tb_promotion.promoid`. */
  id: number;
  /** Human-readable label shown on the cart badge. */
  label: string;
  /** Codes the customer can type to apply this promo (case-insensitive). */
  aliases: readonly string[];
  /** Yuan exchange rate override (¥ → ฿). `null` = no override. */
  rate: number | null;
  /** Flat shipping ฿ discount (PCSF-style freebie). 0 = none. */
  shippingDiscountThb: number;
  /** TH-language one-liner — used in `getAvailablePromos()` UI. */
  description: string;
  /** ISO timestamp — promo not redeemable before this. `null` = no lower bound. */
  activeFrom: string | null;
  /** ISO timestamp — promo not redeemable after this. `null` = no upper bound. */
  activeUntil: string | null;
};

/**
 * Subset of `tagPro()` IDs that the cart input can apply. Most legacy
 * promoids are historical (e.g. id=1 was Pro 3.15 from 2018) — only
 * future/evergreen entries are surfaced to the customer. Adding a new
 * promo = add a row here.
 *
 * Faithful-port note: legacy `tagPro()` (function.php L1289-1374) had
 * NO master table — the catalog has always lived in code as a static
 * switch. Unknown codes returned the empty string (default branch) →
 * cart rendered no badge → no discount. Our `resolveLegacyPromoCode`
 * returns `null` for the same effect, and `validatePromoCode` surfaces
 * the legacy refusal message "ไม่พบรหัสโปรโมชั่นนี้". No DB lookup is
 * possible because no master table ever existed.
 */
export const PROMO_CATALOG: readonly LegacyPromo[] = [
  // ── PCSF — free-shipping (50฿) — the only one legacy actually used
  // ── in 2026 (shops.php L17-22). Evergreen.
  {
    id: -1, // not a tb_promotion.promoid — special-case PCSF in shops.php
    label: "PCSF (ฟรีค่าส่ง)",
    aliases: ["PCSF", "F", "FREESHIP"],
    rate: null,
    shippingDiscountThb: 50,
    description: "ฟรีค่าจัดส่งในประเทศ 50 บาท (เฉพาะออเดอร์ที่เลือก PCSF)",
    activeFrom: null,
    activeUntil: null,
  },
  // ── Valentine 2026 (promoid=19) — rate 5.10 override.
  // ── tagPro($ID="19") L1309. Active window: legacy ran it 2026-02-12 →
  // ── 2026-02-16 historically; we keep the badge live indefinitely since
  // ── the admin reaps via UI.
  {
    id: 19,
    label: "Pro Valentine",
    aliases: ["PR19", "VALENTINE", "PROVAL"],
    rate: 5.10,
    shippingDiscountThb: 0,
    description: "โปรโมชันวาเลนไทน์ เรทพิเศษ ¥1 = 5.10 บาท",
    activeFrom: null,
    activeUntil: null,
  },
  // ── 3.3 sale 2026 (promoid=77) — rate 4.70 override.
  // ── tagPro($ID="77") L1367 + shops.php L65-72 (date-window enforce).
  // ── Window: 2026-03-04 00:00:01 → 2026-03-06 23:59:59 (Asia/Bangkok).
  {
    id: 77,
    label: "Pro 3.3",
    aliases: ["PR77", "PRO33", "DOUBLE3"],
    rate: 4.70,
    shippingDiscountThb: 0,
    description: "โปรโมชัน 3.3 เรทพิเศษ ¥1 = 4.70 บาท (4-6 มีนาคม)",
    // Asia/Bangkok = UTC+7. 2026-03-04 00:00:01 ICT = 2026-03-03 17:00:01 UTC.
    activeFrom: "2026-03-03T17:00:01Z",
    // 2026-03-06 23:59:59 ICT = 2026-03-06 16:59:59 UTC.
    activeUntil: "2026-03-06T16:59:59Z",
  },
  // ── Latest active May promo (promoid=80) — rate 4.92. tagPro($ID="80")
  // ── L1370. Evergreen until next month's promo lands.
  {
    id: 80,
    label: "โปรโมชันกลางเดือน",
    aliases: ["PR80", "MAY26"],
    rate: 4.92,
    shippingDiscountThb: 0,
    description: "โปรโมชันกลางเดือน พฤษภาคม เรทพิเศษ ¥1 = 4.92 บาท",
    activeFrom: null,
    activeUntil: null,
  },
];

/**
 * Returns true when `now` falls inside the promo's [activeFrom, activeUntil]
 * window (inclusive on both ends). Null bounds mean "open-ended".
 */
export function isActive(now: Date, p: LegacyPromo): boolean {
  if (p.activeFrom && now < new Date(p.activeFrom)) return false;
  if (p.activeUntil && now > new Date(p.activeUntil)) return false;
  return true;
}

/**
 * Resolve a customer-typed code to a catalog entry. Lookup is
 * case-insensitive (the input validator uppercases). Returns `null`
 * when no alias matches — caller can decide whether to fall back to
 * the stub-discount synthesizer.
 */
export function resolveLegacyPromoCode(code: string): LegacyPromo | null {
  const upper = code.trim().toUpperCase();
  for (const p of PROMO_CATALOG) {
    if (p.aliases.includes(upper)) return p;
  }
  return null;
}

/**
 * Discount calc for `validatePromoCode`. Converts a `LegacyPromo` +
 * cart total → `{ discount, discountType }`:
 *
 *   - Promo carries a `rate` override → compute the THB saved versus
 *     the baseline rate (we receive baselineRate from the caller — the
 *     server-side `tb_settings.rsdefault` value). discountType='fixed'.
 *   - Promo carries `shippingDiscountThb` → that flat THB.
 *     discountType='fixed'.
 *   - All-zeros → discount=0, discountType='fixed' (no-op).
 *
 * `cartTotalThb` is the customer's cart subtotal in THB (already converted
 * at the live rate). `baselineRate` is the live `rsDefault` so we know
 * how much THB the rate override actually saves (rate=4.92 on a ¥100
 * cart with baseline 5.00 = ฿8 saved per ¥100).
 *
 * `cartTotalThb` is treated as "total CNY × baselineRate" so the
 * rate-override discount formula collapses to:
 *
 *   savedThb = cartTotalCny × (baselineRate − promoRate)
 *            = (cartTotalThb / baselineRate) × (baselineRate − promoRate)
 *
 * which handles fractional baseline rates without re-asking the caller
 * for cartTotalCny.
 */
export function calcLegacyPromoDiscount(
  p: LegacyPromo,
  cartTotalThb: number,
  baselineRate: number,
): { discount: number; discountType: "pct" | "fixed" } {
  // Flat shipping ฿ off.
  if (p.shippingDiscountThb > 0) {
    return { discount: round2(p.shippingDiscountThb), discountType: "fixed" };
  }
  // Rate-override path — only meaningful if cart has CNY value AND
  // baseline rate is sensible. Defensive math: if baselineRate ≤ 0 OR
  // rate is missing OR override is worse than baseline, no discount.
  if (
    p.rate != null &&
    Number.isFinite(p.rate) &&
    Number.isFinite(baselineRate) &&
    baselineRate > 0 &&
    p.rate < baselineRate &&
    cartTotalThb > 0
  ) {
    const cny = cartTotalThb / baselineRate;
    const saved = cny * (baselineRate - p.rate);
    return { discount: round2(saved), discountType: "fixed" };
  }
  return { discount: 0, discountType: "fixed" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
