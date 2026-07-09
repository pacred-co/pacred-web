/**
 * currency-convert — normalise a price entered in ANY currency to its
 * ¥ (CNY)-equivalent, using the monthly Customs-Department FX pool
 * (business_config `customs.fx_rates` · THB-per-1-unit · lib/admin/customs-fx.ts).
 *
 * Why: the ฝากสั่งซื้อ cart stores `cprice` as price-per-piece in ¥ (CNY).
 * The currency selector lets a customer / CS-admin enter the per-piece price
 * in USD / THB / EUR / … ; this util converts it back to a ¥-equivalent so
 * ALL downstream money math is UNCHANGED (ราคารวมหยวน · ¥×rsdefault→THB ·
 * cost · rate-card all keep working off ¥).
 *
 *   yuanEquiv = amount × (fx[cur] / fx["CNY"])      [THB → fx = 1]
 *
 * CNY (or the RMB/YUAN aliases) → ×1 EXACTLY = byte-identical to today, so
 * existing yuan customers see zero regression.
 *
 * Pure + client-safe (NO `server-only`): the client uses it for the live
 * preview and the SERVER re-derives `cprice` from (currency, price, fx pool)
 * on submit — so a client can never fake the ¥-equivalent.
 */

/** THB per 1 unit of the currency — the shape `fxRateMap()` produces. */
export type FxRateMap = Record<string, number>;

/** Round to 2 decimals (money) — nudged for float safety. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Normalise a currency code · fold the ¥ aliases (RMB / YUAN / ¥) to CNY. */
export function normalizeCurrency(currency: string | undefined | null): string {
  const c = String(currency ?? "").trim().toUpperCase();
  if (c === "RMB" || c === "YUAN" || c === "¥") return "CNY";
  return c;
}

export type YuanEquivResult = {
  /** The ¥ (CNY)-equivalent, rounded to 2dp (the value to store as cprice). */
  yuan: number;
  /** True when the currency could not be resolved and we fell back to
   *  CNY-as-entered (surface a visible warning; never silently mis-convert). */
  flagged: boolean;
};

/**
 * Convert `amount` in `currency` → its ¥ (CNY) equivalent using `fxRates`.
 *  - CNY (or RMB/YUAN/¥ alias, or empty) → ×1 exactly (identity, no regression).
 *  - THB → rate 1 (THB is not in the pool; THB-per-THB = 1).
 *  - unknown currency OR missing CNY anchor → treat as CNY-as-entered + FLAG.
 *  - negative / NaN amount → { yuan: 0 } (not a currency problem → not flagged).
 */
export function toYuanEquivalent(
  amount: number,
  currency: string | undefined | null,
  fxRates: FxRateMap,
): YuanEquivResult {
  // Invalid amount → 0. Not a currency issue, so not flagged.
  if (!Number.isFinite(amount) || amount < 0) return { yuan: 0, flagged: false };

  const cur = normalizeCurrency(currency);

  // CNY = identity — skip the division so it is exactly the entered value.
  if (cur === "CNY" || cur === "") return { yuan: round2(amount), flagged: false };

  const cny = Number(fxRates?.["CNY"]);
  const rateOf = cur === "THB" ? 1 : Number(fxRates?.[cur]);

  // Missing CNY anchor or unknown currency → fall back to CNY-as-entered + flag.
  if (!Number.isFinite(cny) || cny <= 0 || !Number.isFinite(rateOf) || rateOf <= 0) {
    return { yuan: round2(amount), flagged: true };
  }

  return { yuan: round2((amount * rateOf) / cny), flagged: false };
}
