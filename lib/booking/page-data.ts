/**
 * BK-1 — server-side helpers the booking pages use to derive the base
 * service charge + label from the (optional) calculator carry in the
 * query string.
 *
 * The shipped `calc*` functions in `lib/booking-calculator.ts` need a
 * `Translator` callback (they live next to a next-intl runtime). The
 * server booking page just needs *the number* — so this module rolls a
 * smaller `calcBaseAmount` purely from the carry that uses the same
 * formulas conceptually but stays detached from the i18n runtime.
 *
 * For BK-1: if the carry includes a `price`, that wins (the calculator
 * already ran on the previous page). Otherwise we fall back to a rough
 * service-config minimum or 0 (the page still renders — the customer
 * picks options + sees an estimate built from those).
 *
 * Reasoning: per design doc §1.4 — "the booking detail page **reuses
 * the `calc*` functions** as its price engine — no new formula code".
 * Carrying the calc result via `?price=` makes that reuse trivial and
 * keeps the formulas in one place.
 */

import type { QuoteCarry, TabMode } from "@/types/booking";
import type { ServiceConfig } from "@/lib/booking/service-config";

const VALID_MODES: TabMode[] = [
  "sea",
  "truck",
  "air",
  "customs",
  "sourcing",
  "remit",
];

/** Parse the search params into a strictly-typed `Partial<QuoteCarry>`. */
export function readCarry(
  sp: Record<string, string | string[] | undefined>,
): Partial<QuoteCarry> {
  function str(k: string): string | undefined {
    const v = sp[k];
    return typeof v === "string" && v !== "" ? v : undefined;
  }
  function num(k: string): number | undefined {
    const v = str(k);
    if (!v) return undefined;
    const parsed = Number(v);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  const carry: Partial<QuoteCarry> = {};
  const mode = str("mode");
  if (mode && (VALID_MODES as string[]).includes(mode)) {
    carry.mode = mode as TabMode;
  }
  const price = num("price");
  if (price !== undefined) carry.price = price;
  const weight = num("weight");
  if (weight !== undefined) carry.weightKg = weight;
  const volume = num("volume");
  if (volume !== undefined) carry.volumeCbm = volume;
  const term = str("term");
  if (term === "ddp" || term === "exw" || term === "fob") carry.term = term;
  const size = str("size");
  if (size === "20ft" || size === "40ft") carry.size = size;
  const sub = str("sub");
  if (sub === "share" || sub === "full") carry.sub = sub;
  const transport = str("transport");
  if (transport === "ship" || transport === "truck" || transport === "air") {
    carry.transport = transport;
  }
  return carry;
}

/**
 * Derive the base service charge (THB) + display label for the booking
 * detail page from the service-config + the carry. If the carry has a
 * `price` we trust it (the calculator already produced it). Otherwise a
 * conservative service-config minimum is used.
 */
export function deriveBase(
  serviceConfig: ServiceConfig,
  carry: Partial<QuoteCarry>,
): { amount: number; label: string } {
  // Trust the calculator-carried price first.
  if (carry.price && carry.price > 0) {
    return {
      amount: Math.round(carry.price),
      label: labelFor(serviceConfig.slug),
    };
  }
  // Fallback floors — picked from the calc* min-clamps so the customer
  // sees a real "starting from" instead of zero. These are SAFE floors,
  // not authoritative quotes; the disclaimer makes the rep-confirmation
  // explicit (§4.7).
  const floor = FLOOR_BY_SLUG[serviceConfig.slug] ?? 0;
  return {
    amount: floor,
    label: labelFor(serviceConfig.slug),
  };
}

function labelFor(slug: string): string {
  // i18n-key: booking.base.label.<slug>
  switch (slug) {
    case "customs-clearance":
      return "ค่าพิธีการศุลกากร";
    case "import-china-lcl":
    case "import-china-fcl":
    case "import-china-truck":
    case "import-china-air":
    case "export":
      return "ค่าขนส่ง";
    case "china-shopping":
      return "ค่าบริการฝากสั่งซื้อ";
    case "yuan-transfer":
      return "ค่าบริการโอนหยวน";
    default:
      return "ค่าบริการ";
  }
}

const FLOOR_BY_SLUG: Record<string, number> = {
  "customs-clearance": 3500,
  "import-china-lcl": 2500,
  "import-china-fcl": 38000,
  "import-china-truck": 3500,
  "import-china-air": 1800,
  "china-shopping": 0,
  "yuan-transfer": 0,
  export: 0,
};
