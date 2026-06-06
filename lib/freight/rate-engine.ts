/**
 * Freight rate ENGINE — composes a freight quote's line items + totals from the
 * real AXELRA rate model (lib/freight/rate-model.ts), grounded in the IMPORT
 * quote-builder sheets. Replaces today's manual per-line price typing in the
 * admin freight quote-builder with an accurate, incoterm-scoped auto-quote.
 *
 * Pure functions (no DB, no IO) — safe + fully unit-tested against the real
 * sheet totals (CIF AIR 4W = 10,211 · CIF SEA LCL 4W = 13,511).
 *
 * Pipeline: incoterm → scope categories → pick the Thai-local + freight lines in
 * scope for the mode → price each (truck-size / sell-tier / per-CBM/KG/CTNR) →
 * subtotal cost/sell → profit → VAT 7% → ≤15k/ตู้ margin guard → commission split.
 */

import type { Incoterm, TransportMode } from "@/lib/validators/freight-quote";
import {
  THAI_LOCAL_LINES,
  FREIGHT_LINES,
  INCOTERM_SCOPE,
  FREIGHT_VAT_PCT,
  FREIGHT_MARGIN_CAP_PER_CONTAINER,
  FREIGHT_COMMISSION,
  type DeliveryTruck,
  type SellTier,
  type ScopeCategory,
} from "./rate-model";

export type FreightQuoteSpec = {
  mode: TransportMode;
  incoterm: Incoterm;
  /** in-Thailand delivery truck size (sheet's SALE 4W / 6W) — default 4W. */
  deliveryTruck?: DeliveryTruck;
  /** sell tier ปลีก/ขาประจำ/ส่ง — default regular. */
  tier?: SellTier;
  /** sea_lcl volume (m³) — drives per-CBM freight. */
  cbm?: number;
  /** air chargeable weight (kg = max(actual, CBM×167)) — drives per-KG freight. */
  kgm?: number;
  /** sea_fcl container count — drives per-container lines + the margin cap. */
  containers?: number;
  /**
   * The TRUE China-side freight cost in ฿ (migration 0145 · tb_freight_rate
   * looked up + FX-converted by the compose action). When provided, it's added
   * to subtotalCost → `profit` becomes a real NET margin (not gross "กำไรขั้นต้น")
   * and `chinaCostPending` flips false. Omit it → unchanged gross behaviour
   * (the 26 existing engine tests pass nothing → identical results).
   */
  chinaFreightCostThb?: number;
};

export type FreightLineResult = {
  key: string;
  labelTh: string;
  scope: ScopeCategory;
  qty: number;
  unit: string;
  unitCost: number;
  unitSell: number;
  cost: number;
  sell: number;
};

export type FreightQuoteResult = {
  lines: FreightLineResult[];
  subtotalCost: number;
  /** The China-side freight cost (฿) folded into subtotalCost (0 if not supplied). */
  chinaFreightCostThb: number;
  subtotalSell: number;
  profit: number;
  vatPct: number;
  vat: number;
  total: number; // subtotalSell + vat
  marginCapThb: number;
  marginExceedsCap: boolean;
  /**
   * true when the quote bills a China-side freight/origin line whose COST isn't
   * modelled yet (the carrier rate is a monthly, FX-dependent per-port/carrier
   * matrix → lives in a future admin rate table, NOT hardcoded). When true,
   * `profit` is a GROSS figure (sell − Thai-local cost only) and must be shown
   * as "ก่อนหักต้นทุนเฟรทจีน", never as net. false for CIF/FOB (Thai-only scope:
   * those costs ARE modelled → profit is reliable).
   */
  chinaCostPending: boolean;
  commission: {
    freight: number;
    customs: number;
    doc: number;
    gross: number;
    wht: number;
    net: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function resolveSell(sell: number | Record<DeliveryTruck, number>, truck: DeliveryTruck): number {
  return typeof sell === "number" ? sell : sell[truck];
}

export function composeFreightQuote(spec: FreightQuoteSpec): FreightQuoteResult {
  const truck: DeliveryTruck = spec.deliveryTruck ?? "4W";
  const tier: SellTier = spec.tier ?? "regular";
  const scope = INCOTERM_SCOPE[spec.incoterm] ?? ["thai_customs", "thai_transport"];
  const inScope = (s: ScopeCategory) => scope.includes(s);
  const containers = Math.max(1, spec.containers ?? 1);

  const lines: FreightLineResult[] = [];

  // ── Thai-side fixed lines (customs + domestic transport) ──
  for (const l of THAI_LOCAL_LINES) {
    if (!inScope(l.scope)) continue;
    if (l.modes !== "all" && !l.modes.includes(spec.mode)) continue;
    const unitSell = resolveSell(l.sell, truck);
    lines.push({
      key: l.key, labelTh: l.labelTh, scope: l.scope,
      qty: 1, unit: "SET", unitCost: l.cost, unitSell,
      cost: l.cost, sell: unitSell,
    });
  }

  // ── China-side freight + origin-doc lines (per mode, 3-tier) ──
  for (const l of FREIGHT_LINES[spec.mode] ?? []) {
    if (!inScope(l.scope)) continue;
    const unitSell = l.sell[tier];
    const unitCost = l.cost ?? 0;
    let qty = 1;
    let unit = "SET";
    if (l.per === "cbm") { qty = Math.max(0, spec.cbm ?? 0); unit = "CBM"; }
    else if (l.per === "kgm") { qty = Math.max(0, spec.kgm ?? 0); unit = "KGM"; }
    else if (l.per === "container") { qty = containers; unit = "CONT"; }
    // per "set" → qty 1
    if (qty <= 0 && (l.per === "cbm" || l.per === "kgm")) continue; // no volume → skip volumetric freight
    lines.push({
      key: l.key, labelTh: l.labelTh, scope: l.scope,
      qty, unit, unitCost, unitSell,
      cost: round2(unitCost * qty), sell: round2(unitSell * qty),
    });
  }

  const localCost = round2(lines.reduce((s, l) => s + l.cost, 0));
  // 0145 — the admin-maintained China freight cost (FX-converted) makes profit NET.
  const chinaFreightCostThb = Math.max(0, round2(spec.chinaFreightCostThb ?? 0));
  const subtotalCost = round2(localCost + chinaFreightCostThb);
  const subtotalSell = round2(lines.reduce((s, l) => s + l.sell, 0));
  const profit = round2(subtotalSell - subtotalCost);
  const vat = round2((subtotalSell * FREIGHT_VAT_PCT) / 100);
  const total = round2(subtotalSell + vat);

  // ── CEO §4 margin guard — ≤ 15,000 ฿ per container ──
  const marginCapThb = FREIGHT_MARGIN_CAP_PER_CONTAINER * containers;
  const marginExceedsCap = profit > marginCapThb;

  // The China-side carrier/origin cost is a monthly, FX-dependent matrix (not
  // modelled here yet) — if we bill any freight/origin line at cost 0, `profit`
  // is gross, not net. (Air freight carries a representative cost > 0, so an
  // air-only freight scope won't trip this.)
  const chinaCostPending =
    spec.chinaFreightCostThb == null &&
    lines.some(
      (l) => (l.scope === "freight" || l.scope === "origin") && l.unitCost === 0,
    );

  // ── Commission split (1% freight · 5% customs · 5% doc · −3% WHT) ──
  const sumScope = (s: ScopeCategory) =>
    lines.filter((l) => l.scope === s).reduce((a, l) => a + l.sell, 0);
  const freightSell = sumScope("freight");
  const customsSell = sumScope("thai_customs");
  const docSell = sumScope("origin");
  const commFreight = round2((freightSell * FREIGHT_COMMISSION.salesFreightPct) / 100);
  const commCustoms = round2((customsSell * FREIGHT_COMMISSION.salesCustomsPct) / 100);
  const commDoc = round2((docSell * FREIGHT_COMMISSION.salesDocPct) / 100);
  const gross = round2(commFreight + commCustoms + commDoc);
  const wht = round2((gross * FREIGHT_COMMISSION.whtPct) / 100);
  const net = round2(gross - wht);

  return {
    lines,
    subtotalCost,
    chinaFreightCostThb,
    subtotalSell,
    profit,
    vatPct: FREIGHT_VAT_PCT,
    vat,
    total,
    marginCapThb,
    marginExceedsCap,
    chinaCostPending,
    commission: { freight: commFreight, customs: commCustoms, doc: commDoc, gross, wht, net },
  };
}
