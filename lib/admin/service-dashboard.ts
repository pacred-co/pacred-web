/**
 * 🧭 Cross-platform SERVICE dashboard — aggregation layer (owner W2 "ทำ dashboard
 * ให้หมด" · 2026-06-30).
 *
 * Now that every order carries a `service_key` (migration 0232 + the 2026-06-30
 * backfill) the platform can finally PIVOT BY SERVICE instead of by-table. This
 * module computes, per service lane, the volume + status + money KPIs the owner's
 * scaling cockpit needs, all from the LIVE `tb_*` / `freight_*` tables.
 *
 * ⚠️ PLAIN MODULE (NOT "use server"): exports types + an async data function only,
 *    but it is imported by a Server Component page, NOT a client component, so the
 *    Supabase admin client (RLS bypass · server-only) is safe here.
 *
 * 🔒 READ-ONLY (AGENTS.md §0e + the W2 brief): every query is a SELECT / count.
 *    NO .insert / .update / .upsert / .delete anywhere in this file. service_key
 *    is a categorization LABEL — this dashboard never touches money math; it only
 *    SUMS the existing money columns via the existing helpers.
 *
 * Money figures reuse the established columns + helper (no new math, services.md §5):
 *   shop_order      tb_header_order  SELLING hcostallth · COST hcostall
 *   yuan_transfer   tb_payment       SELLING paythb · COST paythbcost  (paystatus='2' only)
 *   import_cargo    tb_forwarder     SELLING calcForwarderOutstanding() · COST fcosttotalprice
 *   freight_*       freight_shipments SELLING commercial_value_thb · DECLARED declared_customs_value_thb
 *   customs / tax / domestic  count-only (no per-row selling column in the live source yet)
 *
 * Status SOTs reused for the breakdown pills:
 *   shop  → HSTATUS_CFG (lib/admin/service-order-status.ts)
 *   cargo → FSTATUS_CFG (lib/admin/forwarder-status.ts)
 *   freight/customs → local label maps (freight_shipments / customs_declarations enums)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  SERVICE_CATALOG_LIST,
  type ServiceCatalogEntry,
  type ServiceKey,
  type ServiceGroup,
} from "@/lib/services/service-catalog";
import { calcForwarderOutstanding, type ForwarderPriceFields } from "@/lib/forwarder/outstanding";
import { HSTATUS_CFG } from "@/lib/admin/service-order-status";
import { FSTATUS_CFG } from "@/lib/admin/forwarder-status";

// status label maps the aggregators reference — derived from the shared SOTs so
// the breakdown pills read 1:1 with every list/detail page (no per-file drift).
const HSTATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(HSTATUS_CFG).map(([k, v]) => [k, v.label]),
);
const FSTATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(FSTATUS_CFG).map(([k, v]) => [k, v.label]),
);

// ── status label maps (the breakdown pills read these) ──────────────────────
// shop + cargo come from the shared SOTs; freight + customs use the enum values
// declared in their migrations (0050 / 0057). Each map's KEY ORDER is the
// pipeline order so the breakdown renders left→right as the workflow flows.

/** freight_shipments.status (mig 0050). */
export const FREIGHT_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  confirmed: "ยืนยันแล้ว",
  in_progress: "กำลังดำเนินการ",
  cleared: "เคลียร์ศุลกากรแล้ว",
  delivered: "ส่งมอบแล้ว",
  cancelled: "ยกเลิก",
};
/** freight statuses that mean "physically moving / live job". */
const FREIGHT_IN_TRANSIT = new Set(["confirmed", "in_progress", "cleared"]);

/** customs_declarations.status (mig 0057). */
export const CUSTOMS_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ยื่นแล้ว",
  accepted: "รับเรื่องแล้ว",
  released: "ปล่อยสินค้าแล้ว",
  cancelled: "ยกเลิก",
};

// ── public shapes ───────────────────────────────────────────────────────────

export interface ServiceStatusSlice {
  /** raw status code (hstatus / fstatus / freight enum). */
  code: string;
  /** human Thai label resolved from the relevant SOT/map. */
  label: string;
  count: number;
}

export interface ServiceMoney {
  /** SELLING Σ over all rows of this service (THB). 0 when no selling column. */
  sellingThb: number;
  /** COST Σ (THB). 0 when no cost column for this service. */
  costThb: number;
  /** margin = selling − cost (THB). null when either side isn't measurable. */
  marginThb: number | null;
  /** DECLARED value Σ (freight/customs only · THB). null when n/a. */
  declaredThb: number | null;
  /** whether this service exposes any money figure at all (count-only services = false). */
  hasMoney: boolean;
}

export interface ServiceDashboardRow {
  entry: ServiceCatalogEntry;
  serviceKey: ServiceKey;
  /** total order count for this service (all-time, live source). */
  orderCount: number;
  /** orders created since the start of the current month. */
  monthCount: number;
  /** orders physically in transit / live (service-specific statuses). */
  inTransitCount: number;
  /** status breakdown (non-zero only · pipeline-ordered · capped to the SOT codes). */
  statuses: ServiceStatusSlice[];
  money: ServiceMoney;
  /** the live source table the figures came from (provenance / drill hint). */
  sourceTable: string | null;
  /** ≤3-click drill-down to the service's existing list page (null = no list yet). */
  drillHref: string | null;
  /** true when the service has zero orders (the scale frontier). */
  isEmpty: boolean;
  /** any per-query error messages (surfaced, not swallowed — §0c). */
  errors: string[];
}

export interface ServiceGroupRollup {
  group: ServiceGroup;
  label: string;
  orderCount: number;
  monthCount: number;
  inTransitCount: number;
  sellingThb: number;
  costThb: number;
}

/** the 3-account money strip (lib/payment/bank-accounts.ts taxonomy). */
export interface AccountMoneySlice {
  account: "trading" | "service" | "logistics";
  label: string;
  /** selling Σ of all services whose defaultAccount routes here (heuristic, no ใบกำกับ split). */
  sellingThb: number;
  serviceCount: number;
}

export interface ServiceDashboardData {
  monthLabelTh: string;
  rows: ServiceDashboardRow[];
  groups: ServiceGroupRollup[];
  accounts: AccountMoneySlice[];
  totals: {
    orderCount: number;
    monthCount: number;
    inTransitCount: number;
    sellingThb: number;
    costThb: number;
  };
  /** at least one query failed → the page can show a soft banner. */
  hadError: boolean;
}

// ── tiny pure helpers ─────────────────────────────────────────────────────

const GROUP_LABEL: Record<ServiceGroup, string> = {
  cargo: "คาร์โก้ (จีน → ไทย)",
  freight: "เฟรท (นำเข้า/ส่งออก สากล)",
  service: "บริการเสริม",
};
const ACCOUNT_LABEL: Record<AccountMoneySlice["account"], string> = {
  trading: "บัญชีเทรดดิ้ง (ใบกำกับ / VAT)",
  service: "บัญชีบริการ",
  logistics: "บัญชีขนส่ง (ในไทย)",
};
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function sumNum<T extends Record<string, unknown>>(rows: T[] | null | undefined, key: keyof T): number {
  return (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

/** Build a pipeline-ordered, non-zero status breakdown from a code→count map. */
function buildStatusSlices(
  counts: Record<string, number>,
  labelMap: Record<string, string>,
): ServiceStatusSlice[] {
  // preserve the labelMap key order (= pipeline order); append any unknown codes.
  const ordered = Object.keys(labelMap);
  const seen = new Set(ordered);
  for (const code of Object.keys(counts)) if (!seen.has(code)) ordered.push(code);
  return ordered
    .map((code): ServiceStatusSlice => ({
      code,
      label: labelMap[code] ?? code,
      count: counts[code] ?? 0,
    }))
    .filter((s) => s.count > 0);
}

// ── per-service aggregators (each: SELECT-only, returns a ServiceDashboardRow) ──
//
// Each helper queries the LIVE source for ONE service. It pulls only the
// discriminator + money columns it needs (small projections) and surfaces any
// query error in `errors[]` rather than throwing — a single dead lane must not
// blank the whole cockpit (§0c). Counts use `head:true` count queries so they
// aren't subject to the PostgREST 1000-row cap.

type Admin = ReturnType<typeof createAdminClient>;
/**
 * Loose PostgREST filter-builder shape — the `build` callback receives the
 * `.select()` result (a filter builder with .eq/.gte/…), NOT the bare table
 * builder. Typed loose because this helper spans many heterogeneous tb_* tables;
 * the queries are SELECT/count only, so the loose typing has no write risk.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountFilter = any;

async function countWhere(
  admin: Admin,
  table: string,
  build: (q: CountFilter) => unknown,
): Promise<{ count: number; error: string | null }> {
  let q: CountFilter = admin.from(table).select("*", { count: "exact", head: true });
  q = build(q) ?? q;
  const res = await q;
  return { count: res.count ?? 0, error: res.error ? `${table}: ${res.error.message}` : null };
}

/** shop_order → tb_header_order (hstatus · hcostallth selling · hcostall cost). */
async function loadShopOrder(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];
  const HSTATUS_CODES = ["1", "2", "3", "4", "40", "5", "6"];

  const [total, month, statusCounts, moneyRows] = await Promise.all([
    countWhere(admin, "tb_header_order", () => undefined),
    countWhere(admin, "tb_header_order", (q) => q.gte("hdate", monthStartIso)),
    Promise.all(
      HSTATUS_CODES.map(async (code) => ({
        code,
        ...(await countWhere(admin, "tb_header_order", (q) => q.eq("hstatus", code))),
      })),
    ),
    // selling/cost — exclude cancelled ('6'); the money columns are tiny ints.
    admin.from("tb_header_order").select("hcostallth, hcostall").neq("hstatus", "6").limit(50_000),
  ]);

  if (total.error) errors.push(total.error);
  if (month.error) errors.push(month.error);
  for (const s of statusCounts) if (s.error) errors.push(s.error);
  if (moneyRows.error) errors.push(`tb_header_order(money): ${moneyRows.error.message}`);

  const countMap: Record<string, number> = {};
  for (const s of statusCounts) countMap[s.code] = s.count;
  // in-transit / live = สั่งสินค้า(3) + รอร้านจีนจัดส่ง(4) + ถึงโกดังจีน(40)
  const inTransit = (countMap["3"] ?? 0) + (countMap["4"] ?? 0) + (countMap["40"] ?? 0);

  const selling = round2(sumNum(moneyRows.data, "hcostallth"));
  const cost = round2(sumNum(moneyRows.data, "hcostall"));

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total.count, monthCount: month.count, inTransitCount: inTransit,
    statuses: buildStatusSlices(countMap, HSTATUS_LABELS),
    money: { sellingThb: selling, costThb: cost, marginThb: round2(selling - cost), declaredThb: null, hasMoney: true },
    sourceTable: "tb_header_order", drillHref: "/admin/service-orders",
    isEmpty: total.count === 0, errors,
  };
}

/** yuan_transfer → tb_payment (paystatus · paythb selling · paythbcost cost · completed only for money). */
async function loadYuanTransfer(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];
  const PAYSTATUS = { "1": "รอตรวจสอบ", "2": "สำเร็จ", "3": "ปฏิเสธ/ยกเลิก" };

  const [total, month, statusCounts, moneyRows] = await Promise.all([
    countWhere(admin, "tb_payment", () => undefined),
    countWhere(admin, "tb_payment", (q) => q.gte("paydate", monthStartIso)),
    Promise.all(
      Object.keys(PAYSTATUS).map(async (code) => ({
        code,
        ...(await countWhere(admin, "tb_payment", (q) => q.eq("paystatus", code))),
      })),
    ),
    // money only counts COMPLETED transfers (paystatus='2') — matches the KPI page.
    admin.from("tb_payment").select("paythb, paythbcost").eq("paystatus", "2").limit(50_000),
  ]);

  if (total.error) errors.push(total.error);
  if (month.error) errors.push(month.error);
  for (const s of statusCounts) if (s.error) errors.push(s.error);
  if (moneyRows.error) errors.push(`tb_payment(money): ${moneyRows.error.message}`);

  const countMap: Record<string, number> = {};
  for (const s of statusCounts) countMap[s.code] = s.count;
  const inTransit = countMap["1"] ?? 0; // รอตรวจสอบ = the only "live work" state

  const selling = round2(sumNum(moneyRows.data, "paythb"));
  const cost = round2(sumNum(moneyRows.data, "paythbcost"));

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total.count, monthCount: month.count, inTransitCount: inTransit,
    statuses: buildStatusSlices(countMap, PAYSTATUS),
    money: { sellingThb: selling, costThb: cost, marginThb: round2(selling - cost), declaredThb: null, hasMoney: true },
    sourceTable: "tb_payment", drillHref: "/admin/yuan-payments",
    isEmpty: total.count === 0, errors,
  };
}

/** import_cargo → tb_forwarder (fstatus · calcForwarderOutstanding selling · fcosttotalprice cost). */
async function loadImportCargo(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];
  const FSTATUS_CODES = ["1", "2", "3", "4", "5", "6", "62", "7"];

  const [total, month, statusCounts, moneyRows] = await Promise.all([
    countWhere(admin, "tb_forwarder", () => undefined),
    countWhere(admin, "tb_forwarder", (q) => q.gte("fdate", monthStartIso)),
    Promise.all(
      FSTATUS_CODES.map(async (code) => ({
        code,
        ...(await countWhere(admin, "tb_forwarder", (q) => q.eq("fstatus", code))),
      })),
    ),
    // SELLING via the live composite (calcForwarderOutstanding) — same engine the
    // forwarders list / billing use. Pull the 7 price columns + fcosttotalprice.
    admin
      .from("tb_forwarder")
      .select(
        "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany, fcosttotalprice",
      )
      .limit(50_000),
  ]);

  if (total.error) errors.push(total.error);
  if (month.error) errors.push(month.error);
  for (const s of statusCounts) if (s.error) errors.push(s.error);
  if (moneyRows.error) errors.push(`tb_forwarder(money): ${moneyRows.error.message}`);

  const countMap: Record<string, number> = {};
  for (const s of statusCounts) countMap[s.code] = s.count;
  // in-transit = pre-arrival fstatus 1..3 (รอเข้า/ถึงจีน/กำลังมาไทย)
  const inTransit = (countMap["1"] ?? 0) + (countMap["2"] ?? 0) + (countMap["3"] ?? 0);

  // selling = Σ calcForwarderOutstanding(row) — reuse the helper, no inline math.
  let selling = 0;
  let cost = 0;
  for (const r of moneyRows.data ?? []) {
    selling += calcForwarderOutstanding(r as unknown as ForwarderPriceFields);
    cost += Number((r as { fcosttotalprice?: number | string | null }).fcosttotalprice ?? 0);
  }
  selling = round2(selling);
  cost = round2(cost);

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total.count, monthCount: month.count, inTransitCount: inTransit,
    statuses: buildStatusSlices(countMap, FSTATUS_LABELS),
    money: { sellingThb: selling, costThb: cost, marginThb: round2(selling - cost), declaredThb: null, hasMoney: true },
    sourceTable: "tb_forwarder", drillHref: "/admin/forwarders",
    isEmpty: total.count === 0, errors,
  };
}

/** freight_import / freight_export → freight_shipments (service_key + direction · status · commercial/declared value). */
async function loadFreight(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];
  const isExport = entry.serviceKey === "freight_export";

  // freight_shipments rows are tagged by service_key (backfill 2026-06-30) — pivot
  // directly on it (the cleanest now that the column exists).
  const tagEq = (q: CountFilter): CountFilter => q.eq("service_key", entry.serviceKey);

  const STATUS_CODES = Object.keys(FREIGHT_STATUS_LABEL);

  const [total, month, statusCounts, moneyRows] = await Promise.all([
    countWhere(admin, "freight_shipments", (q) => tagEq(q)),
    countWhere(admin, "freight_shipments", (q) => tagEq(q).gte("created_at", monthStartIso)),
    Promise.all(
      STATUS_CODES.map(async (code) => ({
        code,
        ...(await countWhere(admin, "freight_shipments", (q) => tagEq(q).eq("status", code))),
      })),
    ),
    admin
      .from("freight_shipments")
      .select("commercial_value_thb, declared_customs_value_thb")
      .eq("service_key", entry.serviceKey)
      .limit(50_000),
  ]);

  if (total.error) errors.push(total.error);
  if (month.error) errors.push(month.error);
  for (const s of statusCounts) if (s.error) errors.push(s.error);
  if (moneyRows.error) errors.push(`freight_shipments(money): ${moneyRows.error.message}`);

  const countMap: Record<string, number> = {};
  for (const s of statusCounts) countMap[s.code] = s.count;
  const inTransit = STATUS_CODES.reduce((n, c) => (FREIGHT_IN_TRANSIT.has(c) ? n + (countMap[c] ?? 0) : n), 0);

  const selling = round2(sumNum(moneyRows.data, "commercial_value_thb"));
  const declared = round2(sumNum(moneyRows.data, "declared_customs_value_thb"));

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total.count, monthCount: month.count, inTransitCount: inTransit,
    statuses: buildStatusSlices(countMap, FREIGHT_STATUS_LABEL),
    // freight cost lives in a separate P&L snapshot (mig 0165) not on this table →
    // report selling + declared; cost left out (hasMoney true · cost 0 · margin null).
    money: { sellingThb: selling, costThb: 0, marginThb: null, declaredThb: declared, hasMoney: true },
    sourceTable: "freight_shipments",
    drillHref: isExport ? "/admin/freight/quotes" : "/admin/freight/operations",
    isEmpty: total.count === 0, errors,
  };
}

/** customs_clearance → customs_declarations (status · count-only money). */
async function loadCustoms(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];
  const STATUS_CODES = Object.keys(CUSTOMS_STATUS_LABEL);

  const [total, month, statusCounts] = await Promise.all([
    countWhere(admin, "customs_declarations", () => undefined),
    countWhere(admin, "customs_declarations", (q) => q.gte("created_at", monthStartIso)),
    Promise.all(
      STATUS_CODES.map(async (code) => ({
        code,
        ...(await countWhere(admin, "customs_declarations", (q) => q.eq("status", code))),
      })),
    ),
  ]);

  if (total.error) errors.push(total.error);
  if (month.error) errors.push(month.error);
  for (const s of statusCounts) if (s.error) errors.push(s.error);

  const countMap: Record<string, number> = {};
  for (const s of statusCounts) countMap[s.code] = s.count;
  // live = submitted + accepted (in the queue, not yet released/cancelled)
  const inTransit = (countMap["submitted"] ?? 0) + (countMap["accepted"] ?? 0);

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total.count, monthCount: month.count, inTransitCount: inTransit,
    statuses: buildStatusSlices(countMap, CUSTOMS_STATUS_LABEL),
    money: emptyMoney(),
    sourceTable: "customs_declarations", drillHref: "/admin/accounting/cargo-declarations",
    isEmpty: total.count === 0, errors,
  };
}

/** tax_documents → cross-cutting (forwarder + shop tax invoices · count-only). */
async function loadTaxDocuments(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];

  const [fwTotal, shopTotal, fwMonth, shopMonth] = await Promise.all([
    countWhere(admin, "tb_forwarder_tax_invoice", () => undefined),
    countWhere(admin, "tb_shop_tax_invoice", () => undefined),
    countWhere(admin, "tb_forwarder_tax_invoice", (q) => q.gte("created_at", monthStartIso)),
    countWhere(admin, "tb_shop_tax_invoice", (q) => q.gte("created_at", monthStartIso)),
  ]);
  for (const r of [fwTotal, shopTotal, fwMonth, shopMonth]) if (r.error) errors.push(r.error);

  const total = fwTotal.count + shopTotal.count;
  const month = fwMonth.count + shopMonth.count;

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total, monthCount: month, inTransitCount: 0,
    statuses: [
      { code: "forwarder", label: "ใบกำกับ ฝากนำเข้า", count: fwTotal.count },
      { code: "shop", label: "ใบกำกับ ฝากสั่ง/โอน", count: shopTotal.count },
    ].filter((s) => s.count > 0),
    money: emptyMoney(),
    sourceTable: "tb_forwarder_tax_invoice / tb_shop_tax_invoice", drillHref: "/admin/accounting/etax",
    isEmpty: total === 0, errors,
  };
}

/** domestic_logistics → tb_forwarder_driver (driver assignment batches · count-only). */
async function loadDomestic(admin: Admin, entry: ServiceCatalogEntry, monthStartIso: string): Promise<ServiceDashboardRow> {
  const errors: string[] = [];

  const [total, month] = await Promise.all([
    countWhere(admin, "tb_forwarder_driver", () => undefined),
    // tb_forwarder_driver has no reliable created date column we can rely on cross-env →
    // month-count best-effort on `id` desc is meaningless; report all-time only.
    Promise.resolve({ count: 0, error: null as string | null }),
  ]);
  void monthStartIso;
  if (total.error) errors.push(total.error);
  if (month.error) errors.push(month.error);

  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: total.count, monthCount: 0, inTransitCount: 0,
    statuses: [],
    money: emptyMoney(),
    sourceTable: "tb_forwarder_driver", drillHref: "/admin/drivers",
    isEmpty: total.count === 0, errors,
  };
}

function emptyMoney(): ServiceMoney {
  return { sellingThb: 0, costThb: 0, marginThb: null, declaredThb: null, hasMoney: false };
}

/** A coming-soon / no-DB-home lane (active=false): a placeholder row, zero everything. */
function placeholderRow(entry: ServiceCatalogEntry): ServiceDashboardRow {
  return {
    entry, serviceKey: entry.serviceKey,
    orderCount: 0, monthCount: 0, inTransitCount: 0, statuses: [],
    money: emptyMoney(), sourceTable: entry.orderTable, drillHref: null,
    isEmpty: true, errors: [],
  };
}

// ── THE entry point ─────────────────────────────────────────────────────────

/**
 * Build the whole cross-platform service dashboard in one shot (parallel queries).
 *
 * Iterates the catalog (live lanes only get real aggregators; coming-soon lanes
 * get a placeholder row), then rolls up by group + by 3-account. READ-ONLY.
 */
export async function loadServiceDashboard(): Promise<ServiceDashboardData> {
  const admin = createAdminClient();
  const now = new Date();
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLabelTh = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;

  // dispatch each LIVE service to its aggregator; coming-soon → placeholder.
  const rowPromises: Promise<ServiceDashboardRow>[] = SERVICE_CATALOG_LIST.map((entry) => {
    if (!entry.isLive) return Promise.resolve(placeholderRow(entry));
    switch (entry.serviceKey) {
      case "shop_order": return loadShopOrder(admin, entry, monthStartIso);
      case "yuan_transfer": return loadYuanTransfer(admin, entry, monthStartIso);
      case "import_cargo": return loadImportCargo(admin, entry, monthStartIso);
      case "freight_import":
      case "freight_export": return loadFreight(admin, entry, monthStartIso);
      case "customs_clearance": return loadCustoms(admin, entry, monthStartIso);
      case "tax_documents": return loadTaxDocuments(admin, entry, monthStartIso);
      case "domestic_logistics": return loadDomestic(admin, entry, monthStartIso);
      default: return Promise.resolve(placeholderRow(entry));
    }
  });

  const rows = await Promise.all(rowPromises);

  // ── group rollup ──
  const groupOrder: ServiceGroup[] = ["cargo", "freight", "service"];
  const groups: ServiceGroupRollup[] = groupOrder.map((group) => {
    const members = rows.filter((r) => r.entry.group === group);
    return {
      group, label: GROUP_LABEL[group],
      orderCount: members.reduce((s, r) => s + r.orderCount, 0),
      monthCount: members.reduce((s, r) => s + r.monthCount, 0),
      inTransitCount: members.reduce((s, r) => s + r.inTransitCount, 0),
      sellingThb: round2(members.reduce((s, r) => s + r.money.sellingThb, 0)),
      costThb: round2(members.reduce((s, r) => s + r.money.costThb, 0)),
    };
  });

  // ── 3-account money strip ──
  // Heuristic: sum a service's selling into its catalog defaultAccount bucket.
  // (A ใบกำกับ would re-route an individual order to TRADING, but that per-order
  //  override isn't summed here — this strip is a service-level lens, not the
  //  ledger. The money SOT remains lib/payment/bank-accounts.ts.)
  const accountOrder: AccountMoneySlice["account"][] = ["trading", "service", "logistics"];
  const accounts: AccountMoneySlice[] = accountOrder.map((account) => {
    const members = rows.filter((r) => r.entry.defaultAccount === account && r.money.hasMoney);
    return {
      account, label: ACCOUNT_LABEL[account],
      sellingThb: round2(members.reduce((s, r) => s + r.money.sellingThb, 0)),
      serviceCount: members.filter((r) => !r.isEmpty).length,
    };
  });

  const totals = {
    orderCount: rows.reduce((s, r) => s + r.orderCount, 0),
    monthCount: rows.reduce((s, r) => s + r.monthCount, 0),
    inTransitCount: rows.reduce((s, r) => s + r.inTransitCount, 0),
    sellingThb: round2(rows.reduce((s, r) => s + r.money.sellingThb, 0)),
    costThb: round2(rows.reduce((s, r) => s + r.money.costThb, 0)),
  };

  const hadError = rows.some((r) => r.errors.length > 0);

  return { monthLabelTh, rows, groups, accounts, totals, hadError };
}
