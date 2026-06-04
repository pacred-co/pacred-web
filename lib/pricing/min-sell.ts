/**
 * Sales min-sell guardrail — Lane C (global-trade-group-2026-06-04.md §5).
 *
 *   "Sales min-sell guardrail: define the lowest a sales rep may quote —
 *    e.g. 2,900 / 4,900 (กว่างโจว / อี้อู) + เรือ 300."
 *
 * The floor is the lowest PRICE (the China→Thailand transport subtotal a
 * customer is charged) a sales rep / CS may quote for a given origin-warehouse
 * + transport route. Quoting below it erodes margin and undercuts the CEO's
 * profit-cap policy from the other side. It is the per-route mirror of
 * lib/pricing/margin-advisory.ts (the per-container profit CEILING).
 *
 * ── Behaviour (owner directive lens) ──────────────────────────────────────
 * The owner was explicit on the margin CAP that it must NEVER hard-block —
 * "ห้าม block เด็ดขาด" (margin-advisory.ts). The min-sell FLOOR is the
 * opposite end and the spec says "block OR hard-warn below floor". We follow
 * the same kind-but-firmer pattern as the rest of the codebase: this module
 * computes a `belowFloor` flag + a message and is otherwise PURE. The caller
 * decides whether to hard-warn (recommended default — surface a red banner the
 * rep must consciously override) or hard-block (set `block:true` on the policy
 * if the owner later wants a true gate). The module exposes BOTH a soft advisory
 * (`getMinSellAdvisory`) and the decision flag, so a UI can do either without a
 * second computation. NOTHING here writes or throws — it is render/Server-Action
 * safe and unit-testable with no DB.
 *
 * Storage (the CONFIG, not this pure module) lives in `business_config`
 * (key `pricing.min_sell_floor`, JSON) — see lib/pricing/min-sell-config.ts +
 * migration 0139. This module only consumes a resolved MinSellFloors object.
 */

/** Origin warehouse encoding (legacy tb_forwarder.fwarehousechina). */
export type MinSellWarehouse = "1" | "2"; // 1=กวางโจว · 2=อี้อู
/** Transport encoding (legacy tb_forwarder.ftransporttype). */
export type MinSellTransport = "1" | "2" | "3"; // 1=รถ · 2=เรือ · 3=อากาศ

/**
 * The configurable floor table. Per-warehouse BASE floor + a per-transport
 * surcharge ("+ เรือ 300"). The effective floor for a route =
 *   base[warehouse] + surcharge[transport]   (both default 0 if unset).
 *
 * This shape mirrors how the owner described it ("2,900 / 4,900 + เรือ 300") —
 * a base per origin, plus an additive bump for sea (and optionally air).
 */
export interface MinSellFloors {
  /** Base floor (THB) per origin warehouse. */
  base: Record<MinSellWarehouse, number>;
  /** Additive surcharge (THB) per transport mode (e.g. sea +300). */
  surcharge: Record<MinSellTransport, number>;
  /** Master switch — when false the guardrail is inert (no floor enforced). */
  enabled: boolean;
  /**
   * When true, callers SHOULD treat below-floor as a hard block (refuse the
   * quote/save). When false (default), callers hard-WARN but allow override.
   * Kept in the config so the owner can flip to a true gate without code change.
   */
  block: boolean;
}

/** Sensible defaults from the owner's example. Used when the config row is
 *  missing / a field is unseeded. กว่างโจว 2,900 · อี้อู 4,900 · เรือ +300. */
export const DEFAULT_MIN_SELL_FLOORS: MinSellFloors = {
  base: { "1": 2_900, "2": 4_900 },
  surcharge: { "1": 0, "2": 300, "3": 0 },
  enabled: true,
  block: false,
};

const n = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
};

const fmtThb = (x: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(x));

/**
 * Resolve the effective floor (THB) for one (warehouse, transport) route from
 * a MinSellFloors config. Returns 0 when disabled (so a 0 floor never warns).
 */
export function effectiveMinSell(
  floors: MinSellFloors,
  warehouse: MinSellWarehouse,
  transport: MinSellTransport,
): number {
  if (!floors.enabled) return 0;
  const base = n(floors.base?.[warehouse]);
  const sur = n(floors.surcharge?.[transport]);
  return Math.max(0, base + sur);
}

export type MinSellLevel = "ok" | "below";

export interface MinSellAdvisory {
  level: MinSellLevel;
  /** The effective floor applied (THB) for the route; 0 when disabled. */
  floorThb: number;
  /** The quoted price evaluated (THB). */
  quotedThb: number;
  /** How far BELOW the floor the quote is (THB); 0 when at/above. */
  shortfallThb: number;
  /** Gentle-but-firm Thai note when below; null when ok / disabled. */
  message: string | null;
  /**
   * Whether the caller should HARD-BLOCK the quote/save. Mirrors the config's
   * `block` flag AND requires `level==="below"`. When false, a below-floor quote
   * should hard-WARN but be overridable. This is the ONE field a gate reads.
   */
  block: boolean;
}

export interface MinSellEvalInput {
  floors: MinSellFloors;
  warehouse: MinSellWarehouse;
  transport: MinSellTransport;
  /** The price being quoted/saved (China→Thailand transport subtotal, THB). */
  quotedThb: number | string | null;
}

/**
 * Evaluate a quoted price against the per-route min-sell floor.
 *
 * Pure + side-effect-free. Returns `level:"below"` + a message + the config's
 * `block` decision when the quote is under the floor; `level:"ok"` otherwise.
 * A non-finite / ≤0 quote is treated as "ok" (nothing to evaluate — e.g. the
 * row hasn't been priced yet), so this never nags on empty forms.
 */
export function getMinSellAdvisory(input: MinSellEvalInput): MinSellAdvisory {
  const floorThb = effectiveMinSell(input.floors, input.warehouse, input.transport);
  const quoted = n(input.quotedThb);

  // Nothing to evaluate: floor disabled / unset, or no real quote yet.
  if (floorThb <= 0 || quoted <= 0 || quoted >= floorThb) {
    return {
      level: "ok",
      floorThb,
      quotedThb: quoted,
      shortfallThb: 0,
      message: null,
      block: false,
    };
  }

  const shortfallThb = Math.round((floorThb - quoted) * 100) / 100;
  const whLabel = input.warehouse === "2" ? "อี้อู" : "กวางโจว";
  const ttLabel = input.transport === "2" ? "ทางเรือ" : input.transport === "3" ? "ทางอากาศ" : "ทางรถ";
  return {
    level: "below",
    floorThb,
    quotedThb: quoted,
    shortfallThb,
    message:
      `⚠️ ราคาขาย ฿${fmtThb(quoted)} ต่ำกว่าราคาขายขั้นต่ำ ฿${fmtThb(floorThb)} ` +
      `(${whLabel} · ${ttLabel}) อยู่ ฿${fmtThb(shortfallThb)} — ` +
      (input.floors.block
        ? "ห้ามเสนอราคาต่ำกว่านี้ ติดต่อหัวหน้า/ฝ่ายราคาเพื่อขออนุมัติ"
        : "โปรดทบทวน หรือขออนุมัติหัวหน้า/ฝ่ายราคาก่อนเสนอ"),
    block: input.floors.block === true,
  };
}
