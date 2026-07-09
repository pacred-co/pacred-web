/**
 * cart-price-display — format a cart/order line price for DISPLAY.
 *
 * When a customer / CS entered the price in a non-CNY currency, we persist
 * the ORIGINAL (input_currency, input_price) alongside the ¥-equivalent
 * `cprice` (mig 0248). This helper decides how a price cell renders:
 *
 *   foreign (USD/EUR/…) → primary = the ORIGINAL "$3,683.40 USD" (large/bold)
 *                          secondary = "≈ ¥24,936.60 · ฿127,177" (small)
 *   CNY / empty         → primary = "¥…" (as today · zero regression)
 *
 * DISPLAY-only: pricing still runs on `cprice` (the ¥-equiv) — the ฿ shown
 * here is the existing formula `cpriceYuan × rsDefault` (SELL rate). Pure +
 * client-safe (NO server-only) so both the customer + admin cart use it.
 */
import { normalizeCurrency } from "./currency-convert";

/** THB per 1 unit of a currency — the shape `fxRateMap()` produces.
 *  Accepted for spec/caller compatibility; NOT used to derive the ฿ (the ฿
 *  comes from `cpriceYuan × rsDefault`, per the money guardrail). */
export type FxRateMap = Record<string, number>;

export type CartPriceDisplayInput = {
  /** The ORIGINAL currency code entered ('' / 'CNY' → plain ¥ row). */
  inputCurrency: string | null | undefined;
  /** The ORIGINAL amount entered in `inputCurrency` (0 for a plain ¥ row). */
  inputPrice: number | null | undefined;
  /** The ¥ (CNY)-equivalent that pricing runs on (cprice, or a line total). */
  cpriceYuan: number;
  /** Yuan SELL rate (tb_settings.rsdefault) — for the ≈ ฿ secondary. */
  rsDefault: number;
  /** Optional FX pool (spec-compat · callers may pass it · not used here). */
  fxRates?: FxRateMap;
};

export type CartPriceDisplay = {
  /** True = a non-CNY original was entered → primary shows the original. */
  isForeign: boolean;
  /** The big/bold primary string ("$3,683.40 USD" or "¥24,936.60"). */
  primary: string;
  /** The small secondary string ("≈ ¥… · ฿…" foreign, or "฿…" for ¥ rows). */
  secondary: string;
};

/** PHP `number_format($n, 2)` — 2 decimals, comma thousands. */
function fmt2(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Round to whole baht + comma thousands. */
function fmtBaht0(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-US");
}

/** Currency symbol prefix for the primary line (falls back to no symbol). */
const SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  THB: "฿",
  CNY: "¥",
  JPY: "¥",
};

/**
 * Build the primary/secondary display strings for one price cell.
 *  - CNY / empty  → { isForeign:false, primary:"¥…", secondary:"฿…" }.
 *  - foreign      → { isForeign:true,  primary:"$… USD", secondary:"≈ ¥… · ฿…" }.
 */
export function formatCartPriceDisplay(input: CartPriceDisplayInput): CartPriceDisplay {
  const cur = normalizeCurrency(input.inputCurrency);
  const cpriceYuan = Number.isFinite(input.cpriceYuan) ? input.cpriceYuan : 0;
  const rate = Number.isFinite(input.rsDefault) ? input.rsDefault : 0;
  const baht = cpriceYuan * rate;

  // Plain ¥ / CNY / empty row → ¥ primary (byte-identical to today).
  const isForeign = cur !== "" && cur !== "CNY";
  if (!isForeign) {
    return {
      isForeign: false,
      primary: `¥${fmt2(cpriceYuan)}`,
      secondary: `฿${fmtBaht0(baht)}`,
    };
  }

  // Foreign original → primary = the ORIGINAL, secondary = ≈ ¥ · ฿.
  const amt = Number.isFinite(input.inputPrice) ? Number(input.inputPrice) : 0;
  const sym = SYMBOL[cur] ?? "";
  return {
    isForeign: true,
    primary: `${sym}${fmt2(amt)} ${cur}`,
    secondary: `≈ ¥${fmt2(cpriceYuan)} · ฿${fmtBaht0(baht)}`,
  };
}
