/**
 * Freight rate model — grounded in the REAL AXELRA "แบบฟรอมออกราคา IMPORT" rate
 * cards (`/Users/dev/Desktop/olddata dev/.../แบบฟรอมออกราคา IMPORT .xlsx`).
 *
 * This is the data half of the freight rate engine (lib/freight/rate-engine.ts).
 * Every number here is transcribed from the AXELRA IMPORT quote-builder sheets
 * (IM CIF AIR · IM CIF SEA LCL · IM CIF SEA FCL · the freight/China-side block).
 * Verified: the THAI-local line items below sum to the sheet's "รวมราคา (คร่าวๆ)"
 * exactly — CIF AIR 4W = 10,211 · CIF SEA LCL 4W = 13,511 (see rate-engine.test).
 *
 * Phase D / freight quote-funnel (§3.4 + §5.2 of the freight master plan). This
 * is the per-route base catalogue; a future migration can move it to an admin-
 * editable `tb_freight_rate_*` table (the cargo `tb_rate_g_*` pattern). For now
 * it gives accurate, real-data quotes vs today's manual sheet lookup.
 *
 * ⚠️ COMPLIANCE: the "ปิดตรวจ จ่ายเจ้าหน้าที่ (จ่ายนอกระบบ)" off-book line in the
 * sheets is NOT modelled here (it's 0 in the sheets + flagged in the freight
 * cluster doc §5). We price the compliant core only.
 */

import type { Incoterm, TransportMode } from "@/lib/validators/freight-quote";

/** 3-tier sell price (ปลีก / ลูกค้าประจำ / ส่ง). */
export type SellTier = "retail" | "regular" | "wholesale";
export const SELL_TIER_LABEL: Record<SellTier, string> = {
  retail: "ปลีก", regular: "ลูกค้าประจำ", wholesale: "ส่ง",
};

/** In-Thailand delivery truck size — the sheets' SALE 4W vs SALE 6W columns. */
export type DeliveryTruck = "4W" | "6W";

/** Which leg of the journey a line belongs to — drives incoterm scoping. */
export type ScopeCategory =
  | "freight"        // China→TH ocean/air freight
  | "origin"         // origin-side pickup/doc (China)
  | "thai_customs"   // Thai customs clearance + port fees
  | "thai_transport" // Thai domestic delivery truck
  | "import_tax";    // Thai import duty + VAT (DDP only)

/**
 * Incoterm → the scope categories the CUSTOMER buys from us (เงื่อนไข term sheet).
 *   CIF — clear Thai customs + Thai transport (freight already paid by seller).
 *   FOB — customer books freight; we clear customs + Thai transport.
 *   CFR — we book freight + Thai transport (customer clears).
 *   EXW — everything from factory door (+ origin pickup), excl. import tax.
 *   DDP — everything incl. Thai import tax (door-to-door all-in).
 * The other Incoterm enum values map to the closest standard meaning.
 */
export const INCOTERM_SCOPE: Record<Incoterm, ScopeCategory[]> = {
  CIF: ["thai_customs", "thai_transport"],
  FOB: ["thai_customs", "thai_transport"],
  FAS: ["thai_customs", "thai_transport"],
  CFR: ["freight", "thai_transport"],
  CPT: ["freight", "thai_transport"],
  CIP: ["freight", "thai_transport"],
  DAP: ["freight", "thai_customs", "thai_transport"],
  DPU: ["freight", "thai_customs", "thai_transport"],
  EXW: ["freight", "origin", "thai_customs", "thai_transport"],
  FCA: ["freight", "origin", "thai_customs", "thai_transport"],
  DDP: ["freight", "origin", "thai_customs", "thai_transport", "import_tax"],
};

/**
 * SF-1 — does this incoterm's scope make US incur (and bill) the China-side
 * freight/origin cost? CFR/CPT/CIP/EXW/FCA/DAP/DPU/DDP include "freight" and/or
 * "origin" → true. CIF/FOB/FAS are Thai-customs-only (the seller already paid the
 * China freight) → false; folding the looked-up China cost for those would
 * understate the NET margin. The compose action gates `lookupChinaFreightCostThb`
 * on this predicate. Pure (no IO) so it can be unit-tested + reused.
 */
export function incursChinaFreightCost(incoterm: Incoterm): boolean {
  return (INCOTERM_SCOPE[incoterm] ?? []).some(
    (s) => s === "freight" || s === "origin",
  );
}

/** A fixed THB line item (Thai customs / transport). `cost=0` = pass-through
 *  "ค่าบริการ/วางบิลตามใบเสร็จ". `sell` may vary by delivery-truck size. */
export type FixedLine = {
  key: string;
  labelTh: string;
  scope: ScopeCategory;
  /** which transport modes this line applies to ("all" = every mode). */
  modes: TransportMode[] | "all";
  cost: number;
  sell: number | Record<DeliveryTruck, number>;
};

/**
 * Thai-side local charges — transcribed from IM CIF AIR + IM CIF SEA LCL.
 * The CIF set (scope thai_customs + thai_transport) sums to the sheet total.
 */
export const THAI_LOCAL_LINES: readonly FixedLine[] = [
  { key: "customs_registration", labelTh: "ลงทะเบียนกรมศุลกากร",            scope: "thai_customs",   modes: "all",        cost: 800, sell: 1500 },
  { key: "customs_clearance",    labelTh: "บริการพิธีการศุลกากร",           scope: "thai_customs",   modes: "all",        cost: 500, sell: 3500 },
  { key: "declaration_paperless",labelTh: "ยิงใบขน Paperless",              scope: "thai_customs",   modes: "all",        cost: 200, sell: 350  },
  { key: "do_receiving",         labelTh: "ค่ารับใบตราส่ง (D/O)",           scope: "thai_customs",   modes: "all",        cost: 0,   sell: 421  },
  { key: "additional_customs",   labelTh: "บริการศุลกากรอื่นๆ (ปิดตรวจในระบบ)", scope: "thai_customs", modes: "all",      cost: 500, sell: 1000 },
  { key: "customs_paperless_fee",labelTh: "ค่าธรรมเนียมศุลกากร Paperless",   scope: "thai_customs",   modes: "all",        cost: 0,   sell: 200  },
  { key: "stamp_signature",      labelTh: "ค่าตรายาง",                      scope: "thai_customs",   modes: "all",        cost: 0,   sell: 350  },
  // mode-specific
  { key: "customs_overtime_lcl", labelTh: "ค่าล่วงเวลาศุลกากร",             scope: "thai_customs",   modes: ["sea_lcl", "sea_fcl"], cost: 0, sell: 400 },
  { key: "customs_overtime_air", labelTh: "ค่าล่วงเวลาศุลกากร",             scope: "thai_customs",   modes: ["air"],      cost: 0,   sell: 500  },
  { key: "rent_3day_lcl",        labelTh: "ค่าเช่าโกดัง 3 วัน",             scope: "thai_customs",   modes: ["sea_lcl"],  cost: 0,   sell: 150  },
  { key: "labor_loading_lcl",    labelTh: "ค่าแรงงานขึ้นของ",               scope: "thai_customs",   modes: ["sea_lcl"],  cost: 0,   sell: 450  },
  { key: "labor_loading_air",    labelTh: "ค่าแรงงานขึ้นของ (สนามบิน)",      scope: "thai_customs",   modes: ["air"],      cost: 0,   sell: 500  },
  { key: "employee_overtime_air",labelTh: "ค่าล่วงเวลาพนักงาน",             scope: "thai_customs",   modes: ["air"],      cost: 0,   sell: 500  },
  { key: "gate_charge",          labelTh: "ค่าผ่านท่า",                     scope: "thai_customs",   modes: ["sea_lcl", "air"], cost: 0, sell: { "4W": 190, "6W": 480 } },
  // Thai domestic transport (เช็คตามระยะทางจริง — these are the sheet's representative defaults)
  { key: "transport_lcl",        labelTh: "ค่ารถขนส่งในไทย",               scope: "thai_transport", modes: ["sea_lcl"],  cost: 0,   sell: { "4W": 5000, "6W": 6000 } },
  { key: "transport_air",        labelTh: "ค่ารถขนส่งในไทย",               scope: "thai_transport", modes: ["air"],      cost: 0,   sell: { "4W": 1200, "6W": 4000 } },
] as const;

/** A 3-tier freight line — sell varies by SellTier; `perUnit` (CBM/KGM/CTNS)
 *  or a flat per-shipment fee. */
export type FreightLine = {
  key: string;
  labelTh: string;
  scope: ScopeCategory;
  /** "cbm" → ×CBM · "kgm" → ×chargeable-kg · "container" → ×containers · "set" → flat */
  per: "cbm" | "kgm" | "container" | "set";
  sell: Record<SellTier, number>;
  cost?: number;
};

/**
 * China→TH freight + origin-doc lines, per mode. 3-tier (ปลีก/ขาประจำ/ส่ง)
 * transcribed from the SEA-LCL/FCL China-side block of the IMPORT quote-builder.
 * Only billed when the incoterm scope includes "freight"/"origin".
 */
export const FREIGHT_LINES: Record<TransportMode, readonly FreightLine[]> = {
  sea_lcl: [
    { key: "ocean_freight_lcl", labelTh: "ค่าขนส่งจีน-ไทย (ทางเรือ LCL)", scope: "freight", per: "cbm", sell: { retail: 2200, regular: 1800, wholesale: 1600 } },
    { key: "bl_custom_exw",     labelTh: "B/L + CUSTOM/EXW (จีน)",        scope: "origin",  per: "set", sell: { retail: 2500, regular: 2000, wholesale: 1500 } },
    { key: "doc_service_exw",   labelTh: "DOC service EXW/FOB (จีน)",      scope: "origin",  per: "set", sell: { retail: 3500, regular: 3000, wholesale: 2500 } },
    { key: "form_e_co",         labelTh: "FORM E / CO (ACFTA)",           scope: "origin",  per: "set", sell: { retail: 2500, regular: 2000, wholesale: 1500 } },
  ],
  sea_fcl: [
    { key: "freight_doc_fcl",   labelTh: "ค่าบริการจองเฟรท + Document",    scope: "freight", per: "container", sell: { retail: 3500, regular: 3000, wholesale: 2500 } },
    { key: "labor_unload_fcl",  labelTh: "ค่าแรงงานลงตู้",                 scope: "thai_transport", per: "container", sell: { retail: 3500, regular: 3200, wholesale: 3000 } },
    { key: "form_e_co_fcl",     labelTh: "FORM E / CO (ACFTA)",           scope: "origin",  per: "set", sell: { retail: 2500, regular: 2000, wholesale: 1500 } },
  ],
  air: [
    // air freight is per chargeable-kg (volumetric = CBM×167); representative rate band.
    { key: "air_freight",       labelTh: "ค่าขนส่งจีน-ไทย (ทางอากาศ)",     scope: "freight", per: "kgm", sell: { retail: 80, regular: 70, wholesale: 60 }, cost: 50 },
  ],
  truck: [
    { key: "truck_crossborder", labelTh: "ค่าขนส่งข้ามแดน (รถ EK)",        scope: "freight", per: "container", sell: { retail: 0, regular: 0, wholesale: 0 } },
  ],
} as const;

/** Standard config (CEO directives). */
export const FREIGHT_VAT_PCT = 7;
/** CEO §4 profit-cap — ≤ 15,000 ฿ margin per container (the per-job ceiling). */
export const FREIGHT_MARGIN_CAP_PER_CONTAINER = 15_000;

/** Commission model (freight cluster doc §2.8): SALES 1% freight + 5% customs
 *  clearance + 5% doc-handling; all − 3% WHT. */
export const FREIGHT_COMMISSION = {
  salesFreightPct: 1,
  salesCustomsPct: 5,
  salesDocPct: 5,
  whtPct: 3,
} as const;

// ────────────────────────────────────────────────────────────
// Reference labels + policy constants (for the human pricing guide)
// ────────────────────────────────────────────────────────────

/** Human label per scope leg (the guide groups lines by this). */
export const SCOPE_LABEL: Record<ScopeCategory, string> = {
  freight:        "ค่าเฟรทจีน→ไทย",
  origin:         "ค่าต้นทาง / เอกสารจีน",
  thai_customs:   "พิธีการ + ค่าท่าไทย",
  thai_transport: "ขนส่งในไทย",
  import_tax:     "ภาษีนำเข้าไทย (DDP)",
};

/** Concise Thai hint per incoterm — what WE bill (matches INCOTERM_SCOPE). */
export const INCOTERM_LABEL: Record<Incoterm, string> = {
  EXW: "หน้าโรงงานจีน — ต้นทาง+เฟรท+พิธีการ+ส่งไทย",
  FCA: "ส่งมอบผู้ขนส่งต้นทาง — ต้นทาง+เฟรท+พิธีการ+ส่งไทย",
  CPT: "จ่ายค่าขนส่งถึงปลายทาง — เฟรท+ส่งไทย",
  CIP: "CPT + ประกัน — เฟรท+ส่งไทย",
  DAP: "ส่งถึงที่ — เฟรท+พิธีการ+ส่งไทย",
  DPU: "ส่งถึง+ลงสินค้า — เฟรท+พิธีการ+ส่งไทย",
  DDP: "ส่งถึงที่ รวมภาษี — ครบทุกขา",
  FAS: "ข้างเรือต้นทาง — พิธีการ+ส่งไทย",
  FOB: "พ้นกราบเรือ — พิธีการ+ส่งไทย (ลูกค้าจองเฟรท)",
  CFR: "ค่าเฟรทถึงปลายทาง — เฟรท+ส่งไทย (ลูกค้าเคลียร์เอง)",
  CIF: "CFR + ประกัน — พิธีการ+ส่งไทย (เฟรทจ่ายแล้ว)",
};

/** Freight markup tiers (เงื่อนไข จ๊อบการทำงาน A23: "เฟรท 30-25-20-15-10%").
 *  Which tier applies = a sales/volume judgment → the human picks at confirm.
 *
 *  ⚠️ These are the CODE DEFAULTS. They are seeded into business_config (mig 0145
 *  keys `freight.markup_tiers_pct` / `freight.default_markup_pct`) and are
 *  admin-editable at /admin/settings/business-config. The rate engine reads the
 *  configured values through these consts as the fallback default — so an admin
 *  edit is actually respected (no longer a dead write) while an unseeded/missing
 *  config row falls back to identical legacy behaviour. The config is threaded in
 *  from the SERVER caller (getBusinessConfig is server-only) → see
 *  rate-engine.composeFreightQuote's `markupTiersPct`/`defaultMarkupPct` spec
 *  fields, which default to these consts. */
export const FREIGHT_MARKUP_TIERS_PCT = [30, 25, 20, 15, 10] as const;

/** Default freight markup % (the reference tier) — mirrors business_config
 *  `freight.default_markup_pct` (mig 0145, seeded = 25). Used as the fallback
 *  default when the server caller doesn't thread a configured value. */
export const FREIGHT_DEFAULT_MARKUP_PCT = 25 as const;

/** FX reference (the cost sheets quote USD at this rate, refreshed monthly).
 *  The guide shows it so the pricer confirms the current month's rate before
 *  computing true cost — it is NOT a hardcoded authoritative number. */
export const FREIGHT_FX_REFERENCE = {
  thbPerUsd: 35,
  note: "เรทอ้างอิงรายเดือน (จากชีต cost AXELRA) — ยืนยันเรทเดือนปัจจุบันก่อนคิดต้นทุนจริง",
} as const;
