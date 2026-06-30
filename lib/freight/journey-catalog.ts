/**
 * Freight JOURNEY status — canonical catalogue + role matrix + rollup (SOT).
 *
 * The brief (`Desktop/บรีฟเวิคโฟลว งานเฟรท/` · synthesised in
 * `docs/research/platform-analysis-2026-06-30/freight.md` §1c/§1f/§4) defines a
 * **per-transport-flavour journey** of 15-19 ordered sub-statuses grouped into
 * 3 phases (ORIGIN → TRANSIT → DESTINATION), each step carrying a `show_customer`
 * flag, a MAIN-status rollup bucket, the milestone date it stamps, and the set of
 * roles allowed to advance it. This is the THIRD status axis (orthogonal to the
 * 6-state lifecycle `freight_shipments.status` and the 4-stage AX-JOB cockpit
 * ownership layer) — the missing piece the brief asks for.
 *
 * ⚠️ BUILD-TRAP: PLAIN module (NOT "use server"). A "use server" file may export
 *    ONLY async functions — a const/type export there fails `next build` at
 *    "collect page data". The const catalogue + the pure helpers live here; the
 *    server actions + pages import them.
 *
 * 🔌 SOT SEAM: when the Foundation lane lands its own `lib/freight/journey-status.ts`
 *    with an equivalent catalogue + `canRoleSetStatus`, the integrator re-points
 *    the two import sites (the workflow action + the shipment-detail page) at it
 *    and deletes this file. Until then this is the self-contained SOT my lane
 *    consumes — so the ops + shipment lane is real, tsc-passing, and additive.
 *
 * READ-ONLY / PURE: no DB client, no mutation, no `server-only`. Unit-testable;
 *    Client Components may import the pure helpers + const maps.
 */

import type { AdminRole } from "@/lib/auth/require-admin";

// ────────────────────────────────────────────────────────────
// Transport flavours (G1 — EXPAND truck → truck_fcl + truck_lcl)
// ────────────────────────────────────────────────────────────

/**
 * The 5 journey flavours. The legacy spine column `transport_mode` still uses
 * the 4-value enum (`sea_fcl | sea_lcl | truck | air`); `truck` is widened here
 * into FCL vs LCL because their pipelines differ (รับตู้/โหลด/ปิดตู้ vs
 * รับสินค้า/รวม/ปิดรอบ). `resolveJourneyMode` maps the legacy value → a flavour.
 */
export const JOURNEY_MODES = [
  "truck_fcl",
  "truck_lcl",
  "sea_fcl",
  "sea_lcl",
  "air",
] as const;
export type JourneyMode = (typeof JOURNEY_MODES)[number];

export const JOURNEY_MODE_LABEL: Record<JourneyMode, string> = {
  truck_fcl: "🚚 ทางรถ (FCL · เต็มตู้)",
  truck_lcl: "🚚 ทางรถ (LCL · รวมตู้)",
  sea_fcl:   "🚢 ทางเรือ (FCL · เต็มตู้)",
  sea_lcl:   "🚢 ทางเรือ (LCL · รวมตู้)",
  air:       "✈️ ทางอากาศ (Cargo)",
};

/**
 * Map a legacy `freight_shipments.transport_mode` (4-value) + an optional
 * load-type hint to a journey flavour. The spine has no FCL/LCL split for truck
 * yet, so a bare `truck` defaults to truck_lcl (the consolidation pipeline — the
 * common case) unless a hint says full-container.
 */
export function resolveJourneyMode(
  transportMode: string | null | undefined,
  loadTypeHint?: "fcl" | "lcl" | null,
): JourneyMode {
  const m = (transportMode ?? "").trim().toLowerCase();
  if (m === "sea_fcl") return "sea_fcl";
  if (m === "sea_lcl") return "sea_lcl";
  if (m === "air") return "air";
  if (m === "truck_fcl") return "truck_fcl";
  if (m === "truck_lcl") return "truck_lcl";
  if (m === "truck") return loadTypeHint === "fcl" ? "truck_fcl" : "truck_lcl";
  // Unknown / legacy garbage → safest customer-visible default.
  return "sea_lcl";
}

// ────────────────────────────────────────────────────────────
// Phases + MAIN status rollup (G3)
// ────────────────────────────────────────────────────────────

export const JOURNEY_PHASES = ["origin", "transit", "destination", "internal", "terminal"] as const;
export type JourneyPhase = (typeof JOURNEY_PHASES)[number];

export const JOURNEY_PHASE_LABEL: Record<JourneyPhase, string> = {
  origin:      "ต้นทาง",
  transit:     "ระหว่างทาง",
  destination: "ปลายทาง",
  internal:    "ภายใน",
  terminal:    "สิ้นสุด",
};

/**
 * The MAIN-status rollup buckets (brief §1a staff / §1b customer). One chip the
 * job sits in for the top-of-list filter. Each journey code rolls up to one of
 * these; `mainStatusOf` derives it (never stored).
 */
export const MAIN_STATUSES = [
  "pending",            // รอดำเนินการ
  "await_confirm",      // รอลูกค้าคอนเฟิร์ม
  "prep_docs",          // เตรียมเอกสาร
  "origin_ops",         // ดำเนินการขนส่ง (ต้นทาง)
  "in_transit",         // อยู่ระหว่างขนส่ง
  "arrived",            // ถึงปลายทาง
  "await_billing",      // รอวางบิล (internal)
  "closed",             // ปิดงาน (internal)
  "cancelled",          // ยกเลิก
] as const;
export type MainStatus = (typeof MAIN_STATUSES)[number];

export const MAIN_STATUS_LABEL: Record<MainStatus, string> = {
  pending:       "รอดำเนินการ",
  await_confirm: "รอลูกค้าคอนเฟิร์ม",
  prep_docs:     "เตรียมเอกสาร",
  origin_ops:    "ดำเนินการขนส่ง (ต้นทาง)",
  in_transit:    "อยู่ระหว่างขนส่ง",
  arrived:       "ถึงปลายทาง",
  await_billing: "รอวางบิล",
  closed:        "ปิดงาน",
  cancelled:     "ยกเลิก",
};

/** Customer sees 8 buckets (await_billing + closed collapse to "ส่งมอบแล้ว"). */
export function mainStatusForCustomer(m: MainStatus): MainStatus {
  if (m === "await_billing" || m === "closed") return "arrived";
  return m;
}

// ────────────────────────────────────────────────────────────
// The 8-role workspace matrix (brief §4)
// ────────────────────────────────────────────────────────────

/**
 * The brief's 8 functional roles, each mapped to the concrete `AdminRole`s in
 * the code catalogue (a superset). A journey code names the role-GROUPS allowed
 * to advance it; `canRoleSetStatus` expands those to AdminRoles + the god/manager
 * bypass.
 */
export type JourneyRoleGroup =
  | "sales"        // intake / booking / confirm
  | "pricing"      // quote / cost
  | "document"     // CS · docs · FORM E · ใบขน · แลก D/O · พิธีการ
  | "operation"    // รับตู้/โหลด/ปิดตู้ · tracking · ส่งปลายทาง · คืนตู้
  | "accounting";  // วางบิล · ปิดงาน · รับชำระ

export const JOURNEY_ROLE_GROUP_LABEL: Record<JourneyRoleGroup, string> = {
  sales:      "ฝ่ายขาย (Sales)",
  pricing:    "ฝ่ายราคา (Pricing)",
  document:   "ฝ่ายเอกสาร/CS (Document)",
  operation:  "ฝ่ายปฏิบัติการ/ขนส่ง (Operation)",
  accounting: "ฝ่ายบัญชี (Accounting)",
};

/** Concrete AdminRoles that belong to each functional group (brief §4 table). */
const ROLE_GROUP_MEMBERS: Record<JourneyRoleGroup, readonly AdminRole[]> = {
  sales: [
    "freight_sales", "freight_sales_manager", "sales", "sales_admin",
  ],
  pricing: ["pricing"],
  document: [
    "freight_export_cs", "freight_import_cs",
    "freight_export_doc", "freight_import_doc",
    "freight_clearance_both",
    "freight_export_messenger", "freight_import_messenger",
  ],
  operation: [
    "ops",
    "freight_export_clearance", "freight_import_clearance",
    "warehouse", "driver",
  ],
  accounting: ["accounting"],
};

/** Managers (per-lane + cargo) who may OVERRIDE any journey code on a flavour. */
const MANAGER_ROLES: readonly AdminRole[] = [
  "freight_sales_manager", "freight_export_manager", "freight_import_manager", "manager",
];

/**
 * Does this caller's role set permit setting `code`?
 *
 * Allowed when ANY of:
 *   - a god role (ultra/super/normies) — full override (isGodRole)
 *   - a manager role — full override per flavour
 *   - the caller holds an AdminRole in one of the code's `allowedGroups`
 *
 * `isGod` is passed in (the action computes it once via isGodRole) so this stays
 * a PURE predicate with no server import.
 */
export function canRoleSetStatus(
  code: JourneyCode,
  callerRoles: AdminRole[],
  isGod: boolean,
): boolean {
  if (isGod) return true;
  if (callerRoles.some((r) => MANAGER_ROLES.includes(r))) return true;
  const meta = JOURNEY_CODE_META[code];
  if (!meta) return false;
  const allowed = new Set<AdminRole>();
  for (const g of meta.allowedGroups) {
    for (const r of ROLE_GROUP_MEMBERS[g]) allowed.add(r);
  }
  return callerRoles.some((r) => allowed.has(r));
}

/** The role groups that can advance a given code (for UI hinting). */
export function allowedGroupsOf(code: JourneyCode): readonly JourneyRoleGroup[] {
  return JOURNEY_CODE_META[code]?.allowedGroups ?? [];
}

// ────────────────────────────────────────────────────────────
// The canonical journey-code catalogue (G2 · §1f)
// ────────────────────────────────────────────────────────────

/**
 * Cross-flavour superset of journey codes. Each flavour subscribes to an ordered
 * subset (`JOURNEY_PIPELINES`). A code is the canonical KEY stored in
 * `freight_shipments.journey_status`.
 */
export type JourneyCode =
  // ── ORIGIN ──
  | "PENDING"               // รอดำเนินการ (created, not started)
  | "AWAIT_CONFIRM"         // รอลูกค้าคอนเฟิร์ม
  | "CONFIRMED"             // ลูกค้าคอนเฟิร์มแล้ว
  | "PREP_DOCS"             // เตรียมเอกสาร
  | "RECEIVE_GOODS"         // รับสินค้าจากร้านค้า (LCL/air)
  | "AT_CN_WAREHOUSE"       // ถึงโกดังจีน
  | "CONSOLIDATING"         // รวมสินค้า (LCL)
  | "ENTER_CFS"             // เข้า CFS/โกดังจีน (sea-lcl)
  | "PICKUP_EMPTY"          // รับตู้เปล่าเข้าจุดโหลด (FCL)
  | "LOADING"               // กำลังโหลดสินค้าขึ้นตู้ (FCL)
  | "SEALED"                // ปิดตู้ + ซีล (FCL)
  | "DISPATCH_CLOSED"       // ปิดตู้รถ / ปิดรอบ (truck-lcl)
  | "CONSOLIDATE_CONTAINER" // รวมตู้ (sea-lcl)
  | "BOOK_FLIGHT"           // จองไฟลท์ (air)
  | "AWB_PREP"              // เตรียมเอกสาร AWB (air)
  // ── ORIGIN CUSTOMS ──
  | "CN_CUSTOMS"            // เคลียร์ศุลกากรจีน / ศุลกากรต้นทาง
  // ── TRANSIT ──
  | "DEPARTED"              // รถออกเดินทาง / ATD
  | "IN_TRANSIT"           // ระหว่างทาง / เดินเรือ / ระหว่างบิน
  | "AT_BORDER"            // ถึงด่านมุกดาหาร (truck)
  | "AT_POL"               // เข้าท่าเรือ/สนามบินต้นทาง (POL)
  | "ETD"                  // กำหนดเรือ/ไฟลท์ออก
  | "ON_WATER"            // อยู่ระหว่างเดินเรือ (sea)
  | "IN_FLIGHT"           // ระหว่างบิน (air)
  | "ETA"                 // กำหนดถึง
  | "AT_POD"             // ATA/POD — เรือ/ไฟลท์ถึงจริง / ถึงสนามบินปลายทาง
  | "DO_EXCHANGE"        // แลก D/O (sea)
  // ── TH CUSTOMS ──
  | "TH_CUSTOMS"         // ผ่านศุลกากรไทย
  // ── DESTINATION ──
  | "HAULAGE"            // ลากตู้ส่ง (sea-fcl)
  | "OPEN_CONTAINER"     // เปิดตู้แยกสินค้า (sea-lcl)
  | "AT_TH_WAREHOUSE"    // ถึงโกดังไทย (truck)
  | "AWAIT_PAYMENT"      // รอชำระเงิน 🟡 (customer action)
  | "PREPARING"          // เตรียมจัดส่ง
  | "OUT_FOR_DELIVERY"   // กำลังจัดส่ง / กระจายส่ง
  | "DELIVERED"          // ส่งสำเร็จ
  | "RETURN_CONTAINER"   // คืนตู้ (sea-fcl · internal)
  // ── INTERNAL END ──
  | "BILLING"            // วางบิล (ภายใน)
  | "CLOSED"             // ปิดงาน (ภายใน)
  // ── TERMINAL ──
  | "CANCELLED";         // ยกเลิก

export type JourneyCodeMeta = {
  code: JourneyCode;
  labelTh: string;
  /** Simplified customer-facing label (used on the portal timeline). */
  customerLabelTh: string;
  phase: JourneyPhase;
  /** Which MAIN-status bucket this rolls up to (§1a/1b). */
  mainStatus: MainStatus;
  /** Customer sees this step on the portal timeline (G4). */
  showCustomer: boolean;
  /** Role groups allowed to ADVANCE the shipment TO this code (§4). */
  allowedGroups: readonly JourneyRoleGroup[];
  /**
   * Which milestone date column this code stamps when set (G6). null = no date
   * milestone. The action writes `now()` (or the supplied date) to this column.
   */
  milestoneField:
    | "etd_at" | "atd_at" | "eta_at" | "ata_at"
    | "cn_cleared_at" | "th_cleared_at"
    | "departed_at" | "arrived_th_warehouse_at" | "delivered_at"
    | "do_exchanged_at" | "container_returned_at"
    | "confirmed_at" | "billed_at" | "closed_at"
    | null;
  /** Status-pill colour family (G7 · 🟢 done · 🟡 customer-action · 🔵 in-progress · 🔴 terminal). */
  tone: "neutral" | "info" | "action" | "ok" | "danger";
};

/** The catalogue — one entry per code. Order here is the canonical sort hint. */
export const JOURNEY_CODE_META: Record<JourneyCode, JourneyCodeMeta> = {
  PENDING:               { code: "PENDING",               labelTh: "รอดำเนินการ",              customerLabelTh: "รอดำเนินการ",        phase: "origin",      mainStatus: "pending",       showCustomer: true,  allowedGroups: ["sales"],                    milestoneField: null,                       tone: "neutral" },
  AWAIT_CONFIRM:         { code: "AWAIT_CONFIRM",         labelTh: "รอลูกค้าคอนเฟิร์ม",         customerLabelTh: "รอยืนยัน",           phase: "origin",      mainStatus: "await_confirm", showCustomer: true,  allowedGroups: ["sales"],                    milestoneField: null,                       tone: "action" },
  CONFIRMED:             { code: "CONFIRMED",             labelTh: "ลูกค้าคอนเฟิร์มแล้ว",        customerLabelTh: "ยืนยันแล้ว",          phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["sales"],                    milestoneField: "confirmed_at",             tone: "info" },
  PREP_DOCS:             { code: "PREP_DOCS",             labelTh: "เตรียมเอกสาร",              customerLabelTh: "เตรียมเอกสาร",        phase: "origin",      mainStatus: "prep_docs",     showCustomer: true,  allowedGroups: ["document"],                 milestoneField: null,                       tone: "info" },
  RECEIVE_GOODS:         { code: "RECEIVE_GOODS",         labelTh: "รับสินค้าจากร้านค้า",        customerLabelTh: "รับสินค้าแล้ว",        phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  AT_CN_WAREHOUSE:       { code: "AT_CN_WAREHOUSE",       labelTh: "ถึงโกดังจีน",               customerLabelTh: "ถึงโกดังจีน",         phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  CONSOLIDATING:         { code: "CONSOLIDATING",         labelTh: "รวมสินค้า",                 customerLabelTh: "รวมสินค้า",          phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  ENTER_CFS:             { code: "ENTER_CFS",             labelTh: "เข้า CFS / โกดังจีน",        customerLabelTh: "เข้าโกดังรวม",        phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  PICKUP_EMPTY:          { code: "PICKUP_EMPTY",          labelTh: "รับตู้เปล่าเข้าจุดโหลด",      customerLabelTh: "เตรียมโหลดตู้",        phase: "origin",      mainStatus: "origin_ops",    showCustomer: false, allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  LOADING:               { code: "LOADING",               labelTh: "กำลังโหลดสินค้าขึ้นตู้",       customerLabelTh: "กำลังโหลดสินค้า",      phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  SEALED:                { code: "SEALED",                labelTh: "ปิดตู้ + ซีล",               customerLabelTh: "ปิดตู้แล้ว",          phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  DISPATCH_CLOSED:       { code: "DISPATCH_CLOSED",       labelTh: "ปิดรอบรถ",                 customerLabelTh: "ปิดรอบแล้ว",          phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  CONSOLIDATE_CONTAINER: { code: "CONSOLIDATE_CONTAINER", labelTh: "รวมตู้",                   customerLabelTh: "รวมตู้แล้ว",          phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  BOOK_FLIGHT:           { code: "BOOK_FLIGHT",           labelTh: "จองไฟลท์",                 customerLabelTh: "จองไฟลท์แล้ว",        phase: "origin",      mainStatus: "origin_ops",    showCustomer: true,  allowedGroups: ["operation", "document"],    milestoneField: null,                       tone: "info" },
  AWB_PREP:              { code: "AWB_PREP",              labelTh: "เตรียมเอกสาร AWB",          customerLabelTh: "เตรียมเอกสาร",        phase: "origin",      mainStatus: "prep_docs",     showCustomer: false, allowedGroups: ["document"],                 milestoneField: null,                       tone: "info" },
  CN_CUSTOMS:            { code: "CN_CUSTOMS",            labelTh: "เคลียร์ศุลกากรจีน",          customerLabelTh: "ผ่านศุลกากรต้นทาง",     phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["document"],                 milestoneField: "cn_cleared_at",            tone: "info" },
  DEPARTED:              { code: "DEPARTED",              labelTh: "ออกเดินทาง (ATD)",          customerLabelTh: "ออกเดินทางแล้ว",      phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "atd_at",                   tone: "info" },
  IN_TRANSIT:            { code: "IN_TRANSIT",            labelTh: "ระหว่างขนส่ง",              customerLabelTh: "อยู่ระหว่างขนส่ง",     phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "departed_at",              tone: "info" },
  AT_BORDER:             { code: "AT_BORDER",             labelTh: "ถึงด่านมุกดาหาร",            customerLabelTh: "ถึงด่านชายแดน",       phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  AT_POL:                { code: "AT_POL",                labelTh: "เข้าท่าต้นทาง (POL)",         customerLabelTh: "เข้าท่าต้นทาง",        phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  ETD:                   { code: "ETD",                   labelTh: "กำหนดออก (ETD)",            customerLabelTh: "กำหนดออก",           phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "etd_at",                   tone: "info" },
  ON_WATER:              { code: "ON_WATER",              labelTh: "อยู่ระหว่างเดินเรือ",         customerLabelTh: "อยู่ระหว่างเดินเรือ",   phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  IN_FLIGHT:             { code: "IN_FLIGHT",             labelTh: "ระหว่างบิน",                customerLabelTh: "ระหว่างบิน",          phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  ETA:                   { code: "ETA",                   labelTh: "กำหนดถึง (ETA)",            customerLabelTh: "กำหนดถึง",           phase: "transit",     mainStatus: "in_transit",    showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "eta_at",                   tone: "info" },
  AT_POD:                { code: "AT_POD",                labelTh: "ถึงปลายทาง (ATA/POD)",       customerLabelTh: "ถึงปลายทาง",         phase: "transit",     mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "ata_at",                   tone: "ok" },
  DO_EXCHANGE:           { code: "DO_EXCHANGE",           labelTh: "แลก D/O",                  customerLabelTh: "ดำเนินพิธีการ",        phase: "transit",     mainStatus: "arrived",       showCustomer: false, allowedGroups: ["document"],                 milestoneField: "do_exchanged_at",          tone: "info" },
  TH_CUSTOMS:            { code: "TH_CUSTOMS",            labelTh: "ผ่านศุลกากรไทย",            customerLabelTh: "ผ่านศุลกากรไทย",       phase: "transit",     mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["document"],                 milestoneField: "th_cleared_at",            tone: "info" },
  HAULAGE:               { code: "HAULAGE",               labelTh: "ลากตู้ส่ง (Haulage)",        customerLabelTh: "นำส่งปลายทาง",        phase: "destination", mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "arrived_th_warehouse_at",  tone: "info" },
  OPEN_CONTAINER:        { code: "OPEN_CONTAINER",        labelTh: "เปิดตู้แยกสินค้า",            customerLabelTh: "แยกสินค้า",          phase: "destination", mainStatus: "arrived",       showCustomer: false, allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  AT_TH_WAREHOUSE:       { code: "AT_TH_WAREHOUSE",       labelTh: "ถึงโกดังไทย",               customerLabelTh: "ถึงโกดังไทย",         phase: "destination", mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "arrived_th_warehouse_at",  tone: "ok" },
  AWAIT_PAYMENT:         { code: "AWAIT_PAYMENT",         labelTh: "รอชำระเงิน",                customerLabelTh: "รอชำระเงิน",         phase: "destination", mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["accounting"],               milestoneField: null,                       tone: "action" },
  PREPARING:             { code: "PREPARING",             labelTh: "เตรียมจัดส่ง",              customerLabelTh: "เตรียมจัดส่ง",        phase: "destination", mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  OUT_FOR_DELIVERY:      { code: "OUT_FOR_DELIVERY",      labelTh: "กำลังจัดส่ง",               customerLabelTh: "กำลังจัดส่ง",         phase: "destination", mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["operation"],                milestoneField: null,                       tone: "info" },
  DELIVERED:             { code: "DELIVERED",             labelTh: "ส่งสำเร็จ",                 customerLabelTh: "ส่งสำเร็จ",          phase: "destination", mainStatus: "arrived",       showCustomer: true,  allowedGroups: ["operation"],                milestoneField: "delivered_at",             tone: "ok" },
  RETURN_CONTAINER:      { code: "RETURN_CONTAINER",      labelTh: "คืนตู้",                   customerLabelTh: "คืนตู้",             phase: "destination", mainStatus: "arrived",       showCustomer: false, allowedGroups: ["operation"],                milestoneField: "container_returned_at",    tone: "info" },
  BILLING:               { code: "BILLING",               labelTh: "วางบิล (ภายใน)",            customerLabelTh: "ส่งมอบแล้ว",          phase: "internal",    mainStatus: "await_billing", showCustomer: false, allowedGroups: ["accounting"],               milestoneField: "billed_at",                tone: "info" },
  CLOSED:                { code: "CLOSED",                labelTh: "ปิดงาน (ภายใน)",            customerLabelTh: "ส่งมอบแล้ว",          phase: "internal",    mainStatus: "closed",        showCustomer: false, allowedGroups: ["accounting"],               milestoneField: "closed_at",                tone: "ok" },
  CANCELLED:             { code: "CANCELLED",             labelTh: "ยกเลิก",                   customerLabelTh: "ยกเลิก",             phase: "terminal",    mainStatus: "cancelled",     showCustomer: true,  allowedGroups: ["sales", "accounting"],      milestoneField: null,                       tone: "danger" },
};

export const ALL_JOURNEY_CODES = Object.keys(JOURNEY_CODE_META) as JourneyCode[];

// ────────────────────────────────────────────────────────────
// Per-flavour pipelines (the ordered subset each flavour subscribes to)
// ────────────────────────────────────────────────────────────

const COMMON_INTAKE: JourneyCode[] = ["PENDING", "AWAIT_CONFIRM", "CONFIRMED", "PREP_DOCS"];
const COMMON_DEST_END: JourneyCode[] = ["AWAIT_PAYMENT", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "BILLING", "CLOSED"];

/** Ordered journey code list per flavour (the brief §1c pipelines). */
export const JOURNEY_PIPELINES: Record<JourneyMode, JourneyCode[]> = {
  truck_fcl: [
    ...COMMON_INTAKE,
    "PICKUP_EMPTY", "LOADING", "SEALED",
    "CN_CUSTOMS", "DEPARTED", "IN_TRANSIT", "AT_BORDER", "TH_CUSTOMS",
    "AT_TH_WAREHOUSE",
    ...COMMON_DEST_END,
  ],
  truck_lcl: [
    ...COMMON_INTAKE,
    "RECEIVE_GOODS", "AT_CN_WAREHOUSE", "CONSOLIDATING", "DISPATCH_CLOSED",
    "CN_CUSTOMS", "DEPARTED", "IN_TRANSIT", "AT_BORDER", "TH_CUSTOMS",
    "AT_TH_WAREHOUSE",
    ...COMMON_DEST_END,
  ],
  sea_fcl: [
    ...COMMON_INTAKE,
    "PICKUP_EMPTY", "LOADING", "SEALED",
    "CN_CUSTOMS", "AT_POL", "ETD", "DEPARTED", "ON_WATER", "ETA", "AT_POD",
    "DO_EXCHANGE", "TH_CUSTOMS",
    "HAULAGE", "AWAIT_PAYMENT", "DELIVERED", "RETURN_CONTAINER", "BILLING", "CLOSED",
  ],
  sea_lcl: [
    ...COMMON_INTAKE,
    "RECEIVE_GOODS", "ENTER_CFS", "CONSOLIDATE_CONTAINER",
    "CN_CUSTOMS", "AT_POL", "ETD", "DEPARTED", "ON_WATER", "ETA", "AT_POD",
    "DO_EXCHANGE", "TH_CUSTOMS",
    "OPEN_CONTAINER",
    ...COMMON_DEST_END,
  ],
  air: [
    ...COMMON_INTAKE,
    "RECEIVE_GOODS", "BOOK_FLIGHT", "AWB_PREP",
    "CN_CUSTOMS", "AT_POL", "ETD", "DEPARTED", "IN_FLIGHT", "ETA", "AT_POD",
    "TH_CUSTOMS",
    ...COMMON_DEST_END,
  ],
};

/** The ordered code list for a flavour (empty array if unknown). */
export function pipelineFor(mode: JourneyMode): JourneyCode[] {
  return JOURNEY_PIPELINES[mode] ?? [];
}

/** Index of a code within its flavour pipeline (−1 if not in this flavour). */
export function seqOf(mode: JourneyMode, code: JourneyCode): number {
  return pipelineFor(mode).indexOf(code);
}

/** The default starting code for a brand-new shipment. */
export const INITIAL_JOURNEY_CODE: JourneyCode = "PENDING";

// ────────────────────────────────────────────────────────────
// Pure rollups + helpers consumed by the actions + UI
// ────────────────────────────────────────────────────────────

/** Derive the MAIN-status bucket (§1a) from a journey code. */
export function mainStatusOf(code: JourneyCode | null | undefined): MainStatus {
  if (!code) return "pending";
  return JOURNEY_CODE_META[code]?.mainStatus ?? "pending";
}

/** Is this code a valid step on the given flavour's pipeline? */
export function isCodeInPipeline(mode: JourneyMode, code: JourneyCode): boolean {
  return seqOf(mode, code) >= 0;
}

/**
 * The codes a shipment may legally advance TO, given its current code + flavour.
 * Forward-only by default (next steps), but BILLING (internal · can start early
 * from "ถึงโกดังไทย") and CANCELLED are always offered. The action still gates by
 * role; this is the UI candidate set.
 */
export function nextCandidateCodes(
  mode: JourneyMode,
  current: JourneyCode | null,
): JourneyCode[] {
  const pipeline = pipelineFor(mode);
  if (pipeline.length === 0) return [];
  const curIdx = current ? pipeline.indexOf(current) : -1;
  const candidates = new Set<JourneyCode>();
  // The next forward step(s) — offer the immediate next 3 so an operator can
  // skip a step that doesn't apply, without exposing the whole pipeline.
  for (let i = curIdx + 1; i < pipeline.length && i <= curIdx + 3; i++) {
    candidates.add(pipeline[i]);
  }
  // BILLING is allowed early (brief: "วางบิลเริ่มได้ตั้งแต่ถึงโกดังไทย").
  const reachedTh =
    curIdx >= 0 &&
    pipeline.slice(0, curIdx + 1).some(
      (c) => c === "AT_TH_WAREHOUSE" || c === "HAULAGE" || c === "OPEN_CONTAINER" || c === "TH_CUSTOMS",
    );
  if (reachedTh && pipeline.includes("BILLING")) candidates.add("BILLING");
  candidates.delete("CANCELLED"); // cancel is a separate destructive control
  return pipeline.filter((c) => candidates.has(c));
}

/**
 * RED-overlay flag (§1e · NOT a status — overlays the current journey code).
 */
export const ISSUE_FLAGS = ["none", "delay", "hold", "problem"] as const;
export type IssueFlag = (typeof ISSUE_FLAGS)[number];

export const ISSUE_FLAG_LABEL: Record<IssueFlag, string> = {
  none:    "ปกติ",
  delay:   "🔴 ล่าช้า (Delay)",
  hold:    "🔴 ติดด่าน / Hold",
  problem: "🔴 มีปัญหา",
};

/** A code is a customer-visible step (§1d). */
export function showCustomer(code: JourneyCode): boolean {
  return JOURNEY_CODE_META[code]?.showCustomer ?? false;
}
