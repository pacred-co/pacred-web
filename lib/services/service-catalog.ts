/**
 * 🧭 Pacred service catalog — THE service-identity source of truth (owner 2026-06-30
 * "เอาทุกบริการของเราเข้า DB · 7-8 บริการ · แยก FCL/LCL × รถ/เรือ/แอร์ × คาร์โก้/เฟรท").
 *
 * Today a row's SERVICE is inferred from WHICH TABLE it lives in — there is no
 * service_catalog table and no service_key column. This module makes service
 * identity first-class so dashboards + role/workspace can pivot on it.
 *
 * ⚠️ PLAIN MODULE (NOT "use server"): exports consts/types/pure functions only,
 *    so it is safe to import from anywhere (pages, actions, scripts, the seed).
 *
 * The 8 lanes (services.md §1) — mirrored 1:1 by migration 0232's seed:
 *   1 shop_order         (cargo)   ฝากสั่งซื้อ
 *   2 yuan_transfer      (cargo)   ฝากโอนหยวน
 *   3 import_cargo       (cargo)   ฝากนำเข้า — คาร์โก้
 *   4 freight_import     (freight) เฟรท นำเข้า FCL/LCL
 *   5 freight_export     (freight) ส่งออก
 *   6 customs_clearance  (service) เคลียร์ติดด่าน / ตัวแทนออกของ
 *   7 tax_documents      (service) ใบกำกับ / ใบขน issuing (cross-cutting)
 *   8 domestic_logistics (service) ขนส่งในไทย + แมสเซ็นเจอร์
 *
 * REFERENCE/CATEGORIZATION ONLY (AGENTS.md §0e) — service_key is a label; it
 * never feeds selling price / cost / a declaration's persisted duty. The account
 * routing bridges to lib/payment/bank-accounts.ts (the money SOT).
 */

import { resolvePaymentAccount, type PacredBankAccount } from "@/lib/payment/bank-accounts";

// ── the dimension vocabularies (mirror migration 0232's CHECK constraints) ──

/** group_kind — คาร์โก้/เฟรท/บริการ (the owner's first axis). */
export type ServiceGroup = "cargo" | "freight" | "service";

/** transport modes a service can use — subset of รถ/เรือ/แอร์. */
export type TransportModeKey = "truck" | "sea" | "air";

/** FCL/LCL applicability. `na` = not applicable (yuan / tax-doc). */
export type FclLcl = "fcl" | "lcl" | "both" | "na";

/** import / export / both / na — distinguishes freight_import vs freight_export. */
export type ServiceDirection = "import" | "export" | "both" | "na";

/** pricing mode (how the lane is billed). */
export type ServicePricingMode = "rate" | "item" | "job" | null;

/** the default tax_doc_pref for new orders of this service (lib/tax/tax-doc-mode.ts). */
export type DefaultTaxDoc = "receipt" | "tax_invoice" | "customs";

export const SERVICE_KEYS = [
  "shop_order",
  "yuan_transfer",
  "import_cargo",
  "freight_import",
  "freight_export",
  "customs_clearance",
  "tax_documents",
  "domestic_logistics",
  // marketing "soon" lanes — kept so the public grid + dashboards run from ONE
  // table; active=false until a build flips them on.
  "tax_refund",
  "fumigation",
  "consignment",
  "bill_payment",
  "broker_matching",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export interface ServiceCatalogEntry {
  serviceKey: ServiceKey;
  nameTh: string;
  nameEn: string;
  group: ServiceGroup;
  /** which transport modes the service CAN use (subset of truck/sea/air; [] = n/a). */
  transportModes: TransportModeKey[];
  fclLcl: FclLcl;
  direction: ServiceDirection;
  pricingMode: ServicePricingMode;
  /** can this lane produce a ใบกำกับภาษี? */
  issuesTaxInvoiceDefault: boolean;
  /** default tax_doc_pref for a new order of this service. */
  defaultTaxDoc: DefaultTaxDoc;
  /**
   * default money account (lib/payment/bank-accounts.ts key) when the order does
   * NOT opt into a ใบกำกับ. A ใบกำกับ ALWAYS overrides to "trading" — see
   * serviceAccountFor().
   */
  defaultAccount: "service" | "logistics" | "trading";
  /** does the lane need มูลค่าสำแดง (freight/customs)? */
  requiresDeclared: boolean;
  /** the live table that holds this service's orders (aggregation/doc hint). */
  orderTable: string | null;
  /** is the lane actually run today (vs marketing-only / coming soon)? */
  isLive: boolean;
  sort: number;
}

/**
 * THE catalog — mirrors migration 0232's seed exactly. Keep the two in sync.
 */
export const SERVICE_CATALOG: Record<ServiceKey, ServiceCatalogEntry> = {
  shop_order: {
    serviceKey: "shop_order",
    nameTh: "ฝากสั่งซื้อสินค้า",
    nameEn: "China shopping cart",
    group: "cargo",
    transportModes: ["truck", "sea", "air"],
    fclLcl: "lcl",
    direction: "import",
    pricingMode: "item",
    issuesTaxInvoiceDefault: true, // dormant flag (tax_invoice.shop_yuan_enabled)
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: "tb_header_order",
    isLive: true,
    sort: 10,
  },
  yuan_transfer: {
    serviceKey: "yuan_transfer",
    nameTh: "ฝากโอนชำระ / โอนหยวน",
    nameEn: "Yuan / Alipay transfer",
    group: "cargo",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: true, // dormant flag
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: "tb_payment",
    isLive: true,
    sort: 20,
  },
  import_cargo: {
    serviceKey: "import_cargo",
    nameTh: "ฝากนำเข้า — คาร์โก้",
    nameEn: "China→TH cargo (LCL consolidated)",
    group: "cargo",
    transportModes: ["truck", "sea", "air"],
    fclLcl: "lcl",
    direction: "import",
    pricingMode: "rate", // rate OR item — pricing_mode flag; default rate
    issuesTaxInvoiceDefault: true,
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: true,
    orderTable: "tb_forwarder",
    isLive: true,
    sort: 30,
  },
  freight_import: {
    serviceKey: "freight_import",
    nameTh: "ฝากนำเข้า — เฟรท FCL/LCL",
    nameEn: "International freight import (FCL/LCL)",
    group: "freight",
    transportModes: ["truck", "sea", "air"],
    fclLcl: "both",
    direction: "import",
    pricingMode: "job",
    issuesTaxInvoiceDefault: true,
    defaultTaxDoc: "customs",
    defaultAccount: "service",
    requiresDeclared: true,
    orderTable: "freight_shipments",
    isLive: true,
    sort: 40,
  },
  freight_export: {
    serviceKey: "freight_export",
    nameTh: "ส่งออกสินค้า",
    nameEn: "Export worldwide (FCL/LCL)",
    group: "freight",
    transportModes: ["truck", "sea", "air"],
    fclLcl: "both",
    direction: "export",
    pricingMode: "job",
    issuesTaxInvoiceDefault: true,
    defaultTaxDoc: "customs",
    defaultAccount: "service",
    requiresDeclared: true,
    orderTable: "freight_shipments",
    isLive: true,
    sort: 50,
  },
  customs_clearance: {
    serviceKey: "customs_clearance",
    nameTh: "เคลียร์สินค้าติดด่าน / ตัวแทนออกของ",
    nameEn: "Customs clearance",
    group: "service",
    transportModes: ["truck", "sea", "air"],
    fclLcl: "na",
    direction: "both",
    pricingMode: "job",
    issuesTaxInvoiceDefault: true,
    defaultTaxDoc: "customs",
    defaultAccount: "service",
    requiresDeclared: true,
    orderTable: "customs_declarations",
    isLive: true,
    sort: 60,
  },
  tax_documents: {
    serviceKey: "tax_documents",
    nameTh: "ใบกำกับ / ใบขนสินค้า",
    nameEn: "Tax-invoice + customs declaration issuing",
    group: "service",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: true,
    defaultTaxDoc: "tax_invoice",
    defaultAccount: "trading",
    requiresDeclared: false,
    orderTable: null, // cross-cutting (tb_forwarder_tax_invoice / tb_shop_tax_invoice / customs_declarations)
    isLive: true,
    sort: 70,
  },
  domestic_logistics: {
    serviceKey: "domestic_logistics",
    nameTh: "ขนส่งในไทย + แมสเซ็นเจอร์",
    nameEn: "Domestic logistics",
    group: "service",
    transportModes: ["truck"],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: false,
    defaultTaxDoc: "receipt",
    defaultAccount: "logistics",
    requiresDeclared: false,
    orderTable: "tb_forwarder_driver",
    isLive: true,
    sort: 80,
  },

  // ── marketing-only "soon" lanes (active=false in DB · no order surface) ──
  tax_refund: {
    serviceKey: "tax_refund",
    nameTh: "ขอคืนภาษี",
    nameEn: "Tax refund",
    group: "service",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: false,
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: null,
    isLive: false,
    sort: 90,
  },
  fumigation: {
    serviceKey: "fumigation",
    nameTh: "บริการฟูมิเกชัน",
    nameEn: "Fumigation",
    group: "service",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: true,
    defaultTaxDoc: "customs",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: null,
    isLive: false,
    sort: 100,
  },
  consignment: {
    serviceKey: "consignment",
    nameTh: "บริการฝากขายสินค้า",
    nameEn: "Consignment",
    group: "cargo",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: false,
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: null,
    isLive: false,
    sort: 110,
  },
  bill_payment: {
    serviceKey: "bill_payment",
    nameTh: "บริการฝากจ่ายบริการ",
    nameEn: "Pay-on-behalf services",
    group: "service",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: false,
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: null,
    isLive: false,
    sort: 120,
  },
  broker_matching: {
    serviceKey: "broker_matching",
    nameTh: "จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ",
    nameEn: "Customs broker matching",
    group: "service",
    transportModes: [],
    fclLcl: "na",
    direction: "na",
    pricingMode: null,
    issuesTaxInvoiceDefault: false,
    defaultTaxDoc: "receipt",
    defaultAccount: "service",
    requiresDeclared: false,
    orderTable: null,
    isLive: false,
    sort: 130,
  },
};

/** All catalog entries as an array, sorted (for grids / dashboards). */
export const SERVICE_CATALOG_LIST: ServiceCatalogEntry[] = Object.values(SERVICE_CATALOG).sort(
  (a, b) => a.sort - b.sort,
);

/** Lookup an entry by key (undefined if unknown). */
export function serviceEntry(key: string | null | undefined): ServiceCatalogEntry | undefined {
  if (!key) return undefined;
  return SERVICE_CATALOG[key as ServiceKey];
}

// ── resolveServiceKey: derive service identity from a row + its table ───────

/** The order tables resolveServiceKey understands (the live tb_* / freight sources). */
export type ServiceSourceTable =
  | "tb_header_order"
  | "tb_forwarder"
  | "tb_payment"
  | "freight_shipments";

/**
 * A loose row shape — only the discriminator columns matter; everything is
 * optional so a partial SELECT still resolves. Legacy columns are lowercase.
 */
export interface ServiceRow {
  // tb_forwarder discriminators
  ftransporttype?: string | null;
  fcabinetnumber?: string | null;
  // tb_header_order discriminator
  htransporttype?: string | null;
  // freight_shipments discriminators
  transport_mode?: string | null; // 'sea_fcl' | 'sea_lcl' | 'truck' | 'air'
  direction?: string | null; // 'import' | 'export' (once the column exists)
  [k: string]: unknown;
}

export interface ResolvedService {
  serviceKey: ServiceKey;
  /** chosen transport mode (truck/sea/air) when derivable, else null. */
  transportMode: TransportModeKey | null;
  /** chosen FCL/LCL when derivable, else the catalog default for the service. */
  fclLcl: FclLcl;
  /** chosen direction when derivable, else the catalog default for the service. */
  direction: ServiceDirection;
}

/** legacy transport-type code ("1"/"2"/"3") → mode key. */
function modeFromLegacyType(t: string | null | undefined): TransportModeKey | null {
  const s = (t ?? "").trim();
  if (s === "1") return "truck";
  if (s === "2") return "sea";
  if (s === "3") return "air";
  return null;
}

/** container-name token (GZS/SEA · GZA/AIR · GZE/EK) → mode key. Mirrors cabinet-transport.ts. */
function modeFromCabinetName(name: string | null | undefined): TransportModeKey | null {
  const n = (name ?? "").toUpperCase();
  if (!n) return null;
  if (n.includes("GZS") || n.includes("SEA")) return "sea";
  if (n.includes("GZA") || n.includes("AIR")) return "air";
  if (n.includes("GZE") || n.includes("EK")) return "truck"; // EK is ROAD
  return null;
}

/** freight transport_mode enum → {mode, fclLcl}. */
function decodeFreightMode(tm: string | null | undefined): {
  mode: TransportModeKey | null;
  fclLcl: FclLcl;
} {
  const s = (tm ?? "").trim();
  if (s === "sea_fcl") return { mode: "sea", fclLcl: "fcl" };
  if (s === "sea_lcl") return { mode: "sea", fclLcl: "lcl" };
  if (s === "air") return { mode: "air", fclLcl: "na" };
  if (s === "truck") return { mode: "truck", fclLcl: "na" };
  return { mode: null, fclLcl: "na" };
}

/**
 * Derive the service_key (+ chosen transport mode / FCL-LCL / direction) for an
 * existing order row, from WHICH table it lives in + its discriminator columns.
 *
 * The mapping (services.md §4 "How existing orders link to a service"):
 *   tb_header_order  → shop_order      (mode = htransporttype 1/2/3)
 *   tb_payment       → yuan_transfer   (no transport)
 *   tb_forwarder     → import_cargo    (mode = container-name first, then ftransporttype)
 *   freight_shipments→ freight_export when direction='export', else freight_import
 *                      (mode + fcl/lcl from transport_mode enum)
 *
 * Falls back to the catalog default for fcl/lcl + direction when not derivable.
 * Categorization only — never reads/writes money.
 */
export function resolveServiceKey(row: ServiceRow | null | undefined, sourceTable: ServiceSourceTable): ResolvedService {
  const r = row ?? {};

  switch (sourceTable) {
    case "tb_header_order": {
      const def = SERVICE_CATALOG.shop_order;
      return {
        serviceKey: "shop_order",
        transportMode: modeFromLegacyType(r.htransporttype),
        fclLcl: def.fclLcl,
        direction: def.direction,
      };
    }
    case "tb_payment": {
      const def = SERVICE_CATALOG.yuan_transfer;
      return {
        serviceKey: "yuan_transfer",
        transportMode: null,
        fclLcl: def.fclLcl,
        direction: def.direction,
      };
    }
    case "tb_forwarder": {
      const def = SERVICE_CATALOG.import_cargo;
      // container NAME wins (cabinet-transport.ts SOT — ftransporttype is unreliable),
      // then fall back to the stored legacy type.
      const mode =
        modeFromCabinetName(r.fcabinetnumber) ?? modeFromLegacyType(r.ftransporttype);
      return {
        serviceKey: "import_cargo",
        transportMode: mode,
        fclLcl: def.fclLcl, // cargo has no explicit FCL/LCL column yet → LCL default
        direction: def.direction,
      };
    }
    case "freight_shipments": {
      const isExport = (r.direction ?? "").trim() === "export";
      const key: ServiceKey = isExport ? "freight_export" : "freight_import";
      const def = SERVICE_CATALOG[key];
      const decoded = decodeFreightMode(r.transport_mode);
      return {
        serviceKey: key,
        transportMode: decoded.mode,
        // freight transport_mode encodes fcl/lcl for sea; otherwise keep catalog "both"
        fclLcl: decoded.fclLcl === "na" ? def.fclLcl : decoded.fclLcl,
        direction: isExport ? "export" : "import",
      };
    }
    default: {
      // Exhaustive guard — unknown table → shop_order conservative default.
      const def = SERVICE_CATALOG.shop_order;
      return {
        serviceKey: "shop_order",
        transportMode: null,
        fclLcl: def.fclLcl,
        direction: def.direction,
      };
    }
  }
}

// ── account routing bridge → lib/payment/bank-accounts.ts (the money SOT) ───

/**
 * Resolve the destination bank account for a service's payment, bridging the
 * catalog to the 3-account money SOT. A ใบกำกับ ALWAYS routes to TRADING (+VAT);
 * otherwise the catalog's default account decides:
 *   - default 'logistics' → the LOGISTICS lane (ค่าขนส่งในไทย before delivery)
 *   - default 'service'/'trading' → resolved by issuesTaxInvoice
 *
 * @param serviceKey       the service the order belongs to
 * @param opts.issuesTaxInvoice  this specific order opts into a ใบกำกับ
 */
export function serviceAccountFor(
  serviceKey: string,
  opts: { issuesTaxInvoice?: boolean } = {},
): PacredBankAccount {
  const entry = serviceEntry(serviceKey);
  const issuesTaxInvoice = opts.issuesTaxInvoice ?? false;
  // domestic-delivery leg routing only applies to lanes whose default account
  // is LOGISTICS (domestic_logistics) — a ใบกำกับ still overrides to TRADING.
  const isDomesticDeliveryLeg = entry?.defaultAccount === "logistics";
  return resolvePaymentAccount({ issuesTaxInvoice, isDomesticDeliveryLeg });
}
