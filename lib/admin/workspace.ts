/**
 * Per-position WORKSPACE resolver (G1 · owner W3 "role and workspaces ต้องเริ่มทำได้แล้ว").
 *
 * The role MODEL is built (3-axis money-tier × department × position→workspace_role ·
 * migs 0220/0221 · wired via menuForStaffer). The MENU is scoped per position, but every
 * position still LANDS on the generic /admin dashboard. This module closes the G1 gap
 * (docs/research/platform-analysis-2026-06-30/roles.md §4): given a staffer's
 * workspace_role (their POSITION's menu key) + role set, return their WORKSPACE — the
 * focused set of queues they OWN today, each a (label · count · deep-link · next-action).
 *
 * ── Design (faithful to the doc's §5 Step 2) ─────────────────────────────────────────
 *  - The COUNTS come from the EXACT same SOT the sidebar badges use (BadgeCounts from
 *    actions/admin/sidebar-counts.ts → computeSidebarCounts). We do NOT invent a new
 *    count query → the workspace card count == the sidebar badge == the dashboard tab,
 *    by construction (§0f "badge ต้อง exact · อย่ามั่ว").
 *  - The QUEUE→ACTION pairing is anchored to the cargo fstatus matrix
 *    (lib/auth/check-fstatus-transition.ts TRANSITION_OWNERS): the from-states a role
 *    owns are exactly the rows in its queue + the flips it may do — queue and action
 *    stay in sync by construction (§0e reachability · doc §6). The deep-link targets the
 *    already-built filtered list for that stage (no new surface).
 *  - PURE module (no server-only / no DB I/O). The page resolves the staffer's
 *    workspace_role + roles + the BadgeCounts, then calls resolveWorkspace() here. This
 *    keeps the module unit-testable + client-safe (the AdminRole import is type-only).
 *
 * Reuses (does NOT re-implement): BadgeCounts (sidebar-counts SOT) · AdminRole + isGodRole
 * (require-admin / god-role) · the fstatus transition ownership (the queue filter mirrors
 * the deep-links the sidebar menus already point at). READ-ONLY — nothing here mutates.
 */
import type { AdminRole } from "@/lib/auth/require-admin";
import type { BadgeKey, BadgeCounts } from "@/lib/admin/sidebar-menu";
import type { FreightQueueKey, FreightQueueCounts } from "@/lib/freight/freight-queue-keys";
import { isGodRole } from "@/lib/admin/god-role";

/**
 * One focused queue a position owns. The reader sees at a glance: what it is (label),
 * how many wait (count via a BadgeKey from the live SOT), what to do next (nextAction),
 * and ≤1-click to act (href → the already-built filtered list).
 */
export type WorkspaceQueue = {
  /** stable key (for React keys + tests). */
  key: string;
  /** Thai label — "what is in MY stage" (e.g. "ของถึงไทย รอดำเนินการ"). */
  label: string;
  /**
   * the live-count source. A CARGO queue carries a `badge` (BadgeKey from the
   * sidebar SOT). A FREIGHT queue carries a `freightBadge` (FreightQueueKey
   * from lib/freight/freight-queue-counts). Exactly one is set — the count is
   * resolved by `queueCount()` from whichever counts map is supplied.
   */
  badge?: BadgeKey;
  /** the live-count key for a FREIGHT queue (freight spine has no BadgeKey). */
  freightBadge?: FreightQueueKey;
  /** ≤1-click deep-link to the existing filtered list/queue surface. */
  href: string;
  /** the next action a staffer takes on this queue ("ให้พนักงานทำอะไร" · §0g). */
  nextAction: string;
  /** lucide icon name (resolved in the page). */
  icon: string;
};

/** A position's full workspace = its ordered queues + a friendly heading. */
export type Workspace = {
  /** the workspace_role this maps to (for display / debug). */
  workspaceRole: AdminRole;
  /** Thai heading — "พื้นที่งานของ <ตำแหน่ง>". */
  headingTh: string;
  /** the queues this position owns, in the order they work them. */
  queues: WorkspaceQueue[];
  /**
   * true = an oversight workspace (manager/exec) that should ALSO see the full
   * dashboard. The page renders an overview link + the broad queue set.
   */
  isOversight: boolean;
};

// ── Reusable queue definitions (one per stage · count from the live SOT) ──────────────
// Each href targets an EXISTING filtered surface; each badge is an existing BadgeKey.
// fstatus filter contract: /admin/forwarders?status=N (verified · L11-21 of forwarders/page).
// hstatus filter contract:  /admin/service-orders?q=N (verified · L23 of service-orders/page).
const Q = {
  // ── ฝากสั่งซื้อ (shop · hstatus) — Sales / CS ──────────────────────────────
  shopPending:  { key: "shopPending",  label: "ฝากสั่งซื้อ รอดำเนินการ",       badge: "shopPending"  as BadgeKey, href: "/admin/service-orders?q=1", nextAction: "ตรวจ / เปิดราคา",        icon: "ShoppingCart" },
  shopAwaitPay: { key: "shopAwaitPay", label: "ฝากสั่งซื้อ รอชำระเงิน",        badge: "shopAwaitPay" as BadgeKey, href: "/admin/service-orders?q=2", nextAction: "รอลูกค้าชำระ / ตรวจสลิป", icon: "Wallet" },
  shopOrdered:  { key: "shopOrdered",  label: "ฝากสั่งซื้อ ชำระแล้ว (สั่งจีน)", badge: "shopOrdered"  as BadgeKey, href: "/admin/service-orders?q=3", nextAction: "สั่งซื้อจากจีน",         icon: "PackageCheck" },
  shopNote:     { key: "shopNote",     label: "หมายเหตุฝากสั่ง",               badge: "shopNote"     as BadgeKey, href: "/admin/service-orders?q=1", nextAction: "ตอบ / เคลียร์หมายเหตุ",  icon: "MessageSquare" },

  // ── ฝากนำเข้า (forwarder · fstatus) ────────────────────────────────────────
  // Warehouse owns the China→TH arrival stages → fstatus 4 (ของถึงไทย).
  fwdArrived:   { key: "fwdArrived",   label: "ของถึงไทย รอดำเนินการ",         badge: "forwarderArrived"  as BadgeKey, href: "/admin/forwarders?status=4", nextAction: "ยิงเข้าโกดัง / แจ้งเก็บเงิน", icon: "PackageCheck" },
  fwdWhError:   { key: "fwdWhError",   label: "สแกนเข้าโกดังไทย ยังไม่จับคู่",  badge: "forwarderWhError"  as BadgeKey, href: "/admin/forwarders/warehouse-history", nextAction: "จับคู่พัสดุที่สแกนค้าง", icon: "ScanLine" },
  // Accounting owns 4→5 (วางบิล) + 5→6 (รับชำระ).
  fwdAwaitPay:  { key: "fwdAwaitPay",  label: "ฝากนำเข้า รอชำระ / รอวางบิล",    badge: "forwarderArrived"  as BadgeKey, href: "/admin/forwarders?status=5", nextAction: "วางบิล / รับชำระ → ตัดจ่าย", icon: "Banknote" },
  fwdCredit:    { key: "fwdCredit",    label: "เครดิตค้างนำเข้า",              badge: "forwarderCredit"   as BadgeKey, href: "/admin/forwarders?status=c", nextAction: "ติดตามเครดิต / เก็บเงิน",   icon: "AlertCircle" },
  fwdNote:      { key: "fwdNote",      label: "หมายเหตุนำเข้า",                badge: "forwarderNote"     as BadgeKey, href: "/admin/forwarders",          nextAction: "ตอบ / เคลียร์หมายเหตุ",     icon: "MessageSquare" },
  // Driver / warehouse own 6→7 (ส่งของ).
  fwdDelivery:  { key: "fwdDelivery",  label: "เตรียมส่ง / กำลังจัดส่ง",        badge: "forwarderDelivery" as BadgeKey, href: "/admin/forwarders?status=6", nextAction: "มอบงานคนขับ / จัดรถ",       icon: "Truck" },
  driverItems:  { key: "driverItems",  label: "งานรอจัดรถ (มอบคนขับ)",         badge: "driverItems"       as BadgeKey, href: "/admin/drivers",             nextAction: "มอบคนขับ / สร้างรอบส่ง",    icon: "Truck" },

  // ── ฝากโอน / ชำระเงิน (yuan + wallet) — Accounting ─────────────────────────
  yuanPending:  { key: "yuanPending",  label: "ฝากโอน/ชำระ รอตรวจ",            badge: "yuanPending"  as BadgeKey, href: "/admin/yuan-payments",     nextAction: "ตรวจสลิป → อนุมัติ/ตัดจ่าย", icon: "Languages" },
  walletTopup:  { key: "walletTopup",  label: "ชำระเงิน (สลิป) รอตรวจ",         badge: "walletTopup"  as BadgeKey, href: "/admin/wallet?view=tx",    nextAction: "ตรวจสลิป → อนุมัติ/ตัดจ่าย", icon: "Wallet" },
  walletWdraw:  { key: "walletWdraw",  label: "ถอนเงิน รอจ่าย",                badge: "walletWithdraw" as BadgeKey, href: "/admin/wallet?view=tx",  nextAction: "ตรวจ → จ่ายเงินคืน",         icon: "Banknote" },
  cntDrawMoney: { key: "cntDrawMoney", label: "ค่าตู้รออนุมัติ",               badge: "cntDrawMoney" as BadgeKey, href: "/admin/cnt-hs",            nextAction: "ตรวจ → อนุมัติจ่ายค่าตู้",   icon: "Truck" },
  salesPayout:  { key: "salesPayout",  label: "เบิกค่าคอม/ค่าสินค้า รออนุมัติ",  badge: "salesPayout"  as BadgeKey, href: "/admin/sales-payouts",     nextAction: "ตรวจ → อนุมัติจ่าย",         icon: "BadgePercent" },

  // ── ลูกค้า / Sales funnel ──────────────────────────────────────────────────
  corpPending:  { key: "corpPending",  label: "นิติบุคคล รอตรวจอนุมัติ",        badge: "corporatePending" as BadgeKey, href: "/admin/juristic-check",  nextAction: "ตรวจเอกสาร → อนุมัติ",       icon: "ClipboardCheck" },
  custPending:  { key: "custPending",  label: "ลูกค้าใหม่ รออนุมัติ",           badge: "customerPending"  as BadgeKey, href: "/admin/customers",       nextAction: "ตรวจ → อนุมัติลูกค้า",       icon: "Users" },
  contactMsg:   { key: "contactMsg",   label: "ข้อความติดต่อใหม่",             badge: "contactMessages"  as BadgeKey, href: "/admin/contact-messages", nextAction: "ตอบ / มอบหมายเซล",          icon: "MessageSquare" },
  bookings:     { key: "bookings",     label: "คิวการจอง (RFQ)",              badge: "bookingsPending"  as BadgeKey, href: "/admin/bookings",        nextAction: "ติดต่อ → เปิดใบเสนอราคา",    icon: "Inbox" },
  refunds:      { key: "refunds",      label: "คืนเงินลูกค้า รอดำเนินการ",      badge: "refundsPending"   as BadgeKey, href: "/admin/refunds",         nextAction: "ตรวจ → คืนเงิน",             icon: "Undo2" },

  // ── QA / Incident ──────────────────────────────────────────────────────────
  incidents:    { key: "incidents",    label: "Incident รอจัดการ",            badge: "incidents"    as BadgeKey, href: "/admin/incidents",         nextAction: "รับเรื่อง → แก้ไข",          icon: "AlertTriangle" },
} as const satisfies Record<string, WorkspaceQueue>;

// ── FREIGHT queue definitions (count from the freight spine SOT) ──────────────────────
// Each href targets an EXISTING freight surface; each freightBadge is a FreightQueueKey.
// Count source = lib/freight/freight-queue-counts.ts (freight_quote / freight_quotes /
// freight_shipments) — the freight spine has no cargo BadgeKey, so these carry
// `freightBadge` instead of `badge` (the workspace page resolves it via queueCount).
// NOTE — icons are constrained to the workspace page's ICONS map
// (app/(admin)/admin/workspace/page.tsx · Inbox · BadgePercent · Truck ·
// ClipboardCheck · PackageCheck · Banknote · …); unknown names fall back to
// Inbox, so we reuse the page's existing set to avoid a generic-fallback icon.
const FQ = {
  // ── Freight SALES funnel (freight_quote leads → freight_quotes lifecycle) ───
  fLeads:     { key: "fLeads",     label: "ใบขอราคา Freight (RFQ) รอติดต่อ",  freightBadge: "freightLeads"        as FreightQueueKey, href: "/admin/freight/leads",       nextAction: "ติดต่อ → เปิดใบเสนอราคา",     icon: "Inbox" },
  fQuotePrice:{ key: "fQuotePrice",label: "ใบเสนอราคา รอประเมินราคา/อนุมัติ", freightBadge: "freightQuoteToPrice" as FreightQueueKey, href: "/admin/freight/quotes",      nextAction: "ลงราคา → ส่งอนุมัติ",        icon: "BadgePercent" },
  fQuoteSend: { key: "fQuoteSend", label: "ใบเสนอราคา อนุมัติแล้ว รอส่ง",     freightBadge: "freightQuoteToSend"  as FreightQueueKey, href: "/admin/freight/quotes",      nextAction: "ส่งใบเสนอราคาให้ลูกค้า",     icon: "Inbox" },
  fQuoteSent: { key: "fQuoteSent", label: "ใบเสนอราคา ส่งแล้ว รอลูกค้าตอบ",   freightBadge: "freightQuoteSent"    as FreightQueueKey, href: "/admin/freight/quotes",      nextAction: "ติดตาม → ตอบรับ/แปลงเป็นงาน",  icon: "ClipboardCheck" },

  // ── Freight OPERATION / DOC / CLEARANCE (freight_shipments lifecycle) ───────
  fShipPrep:     { key: "fShipPrep",     label: "งาน Freight ยืนยันแล้ว รอเตรียมเอกสาร/ใบขน", freightBadge: "freightShipPrep"      as FreightQueueKey, href: "/admin/freight/operations", nextAction: "เตรียมเอกสาร / ออกใบขน",   icon: "ClipboardCheck" },
  fShipTransit:  { key: "fShipTransit",  label: "งาน Freight กำลังขนส่ง / พิธีการ",          freightBadge: "freightShipInTransit" as FreightQueueKey, href: "/admin/freight/operations", nextAction: "ติดตามขนส่ง → ผ่านพิธีการ", icon: "Truck" },
  fShipCleared:  { key: "fShipCleared",  label: "ผ่านศุลกากรแล้ว รอส่งมอบ",                 freightBadge: "freightShipCleared"   as FreightQueueKey, href: "/admin/freight/shipments",  nextAction: "นัดส่งมอบ / ปิดงานขนส่ง",  icon: "PackageCheck" },
  fShipDelivered:{ key: "fShipDelivered",label: "งาน Freight ส่งมอบแล้ว รอวางบิล",          freightBadge: "freightShipDelivered" as FreightQueueKey, href: "/admin/freight/shipments",  nextAction: "วางบิล / ออกใบแจ้งหนี้",   icon: "Banknote" },
} as const satisfies Record<string, WorkspaceQueue>;

// ── workspace_role → the queues that position owns ────────────────────────────────────
// Keyed by every AdminRole that a POSITION can map to (admin_positions.workspace_role).
// Order = the order the seat works the queues. Heading = the seat's plain-Thai name.
// Roles not listed fall through to a sensible default (see resolveWorkspace).
type WorkspaceSpec = { headingTh: string; queues: readonly WorkspaceQueue[]; isOversight?: boolean };

const WORKSPACE_BY_ROLE: Partial<Record<AdminRole, WorkspaceSpec>> = {
  // ── Logistics ────────────────────────────────────────────────────────────
  warehouse: {
    headingTh: "พื้นที่งานโกดัง (Warehouse)",
    queues: [Q.fwdArrived, Q.fwdWhError, Q.fwdDelivery, Q.fwdNote],
  },
  driver: {
    headingTh: "พื้นที่งานคนขับ (Driver)",
    queues: [Q.driverItems, Q.fwdDelivery],
  },

  // ── Finance ──────────────────────────────────────────────────────────────
  accounting: {
    headingTh: "พื้นที่งานบัญชี/การเงิน (Accounting)",
    queues: [Q.walletTopup, Q.yuanPending, Q.fwdAwaitPay, Q.cntDrawMoney, Q.walletWdraw, Q.salesPayout, Q.fwdCredit],
  },

  // ── Pricing (COST capture) ───────────────────────────────────────────────
  pricing: {
    headingTh: "พื้นที่งานตั้งราคา (Pricing)",
    queues: [Q.shopPending, Q.fwdArrived],
  },

  // ── Sales / CS (biz_cs · share a base · doc §3 "Cs กับ เซลล์ประมาณนี้") ──────
  sales: {
    headingTh: "พื้นที่งานเซลล์ (Sales)",
    queues: [Q.shopPending, Q.contactMsg, Q.bookings, Q.custPending, Q.corpPending],
  },
  sales_admin: {
    headingTh: "พื้นที่งาน CS / บริการลูกค้า",
    queues: [Q.shopPending, Q.shopNote, Q.contactMsg, Q.bookings, Q.custPending, Q.corpPending, Q.refunds],
  },

  // ── FREIGHT — per-role workspaces over the freight spine (G1 freight lane) ──
  // Each freight position lands on ITS freight queues (count from the freight
  // SOT · lib/freight/freight-queue-counts) instead of the cargo oversight
  // DEFAULT. Mapped to the journey-status the role owns (the freight_quote /
  // freight_quotes / freight_shipments lifecycle).

  // Freight SALES — leads → pricing → send → follow-up (the whole funnel · oversight).
  freight_sales_manager: {
    headingTh: "พื้นที่งานหัวหน้าเซลล์ Freight",
    isOversight: true,
    queues: [FQ.fLeads, FQ.fQuotePrice, FQ.fQuoteSend, FQ.fQuoteSent, FQ.fShipDelivered],
  },
  freight_sales: {
    headingTh: "พื้นที่งานเซลล์ Freight",
    queues: [FQ.fLeads, FQ.fQuoteSent],
  },

  // Freight EXPORT — manager (oversight) · CS · Doc · Clearance · Messenger.
  freight_export_manager: {
    headingTh: "พื้นที่งานผู้จัดการ Freight (Export)",
    isOversight: true,
    queues: [FQ.fQuotePrice, FQ.fShipPrep, FQ.fShipTransit, FQ.fShipCleared, FQ.fShipDelivered],
  },
  freight_export_cs: {
    headingTh: "พื้นที่งาน CS / เอกสาร Freight (Export)",
    queues: [FQ.fLeads, FQ.fQuoteSent, FQ.fShipPrep],
  },
  freight_export_doc: {
    headingTh: "พื้นที่งานเอกสาร Freight (Export)",
    queues: [FQ.fShipPrep, FQ.fShipCleared],
  },
  freight_export_clearance: {
    headingTh: "พื้นที่งานพิธีการ Freight (Export)",
    queues: [FQ.fShipTransit, FQ.fShipCleared],
  },
  freight_export_messenger: {
    headingTh: "พื้นที่งานแมสเซนเจอร์ Freight (Export)",
    queues: [FQ.fShipCleared, FQ.fShipDelivered],
  },

  // Shared Import & Export clearance (one role, both dept's พิธีการ).
  freight_clearance_both: {
    headingTh: "พื้นที่งานพิธีการ Freight (นำเข้า/ส่งออก)",
    queues: [FQ.fShipTransit, FQ.fShipCleared],
  },

  // Freight IMPORT — manager (oversight) · CS · Doc · Clearance · Messenger.
  freight_import_manager: {
    headingTh: "พื้นที่งานผู้จัดการ Freight (Import)",
    isOversight: true,
    queues: [FQ.fQuotePrice, FQ.fShipPrep, FQ.fShipTransit, FQ.fShipCleared, FQ.fShipDelivered],
  },
  freight_import_cs: {
    headingTh: "พื้นที่งาน CS / เอกสาร Freight (Import)",
    queues: [FQ.fLeads, FQ.fQuoteSent, FQ.fShipPrep],
  },
  // Document / CS-Import (logistics · เอกสาร) — owns the DOC prep + clearance stages.
  freight_import_doc: {
    headingTh: "พื้นที่งานเอกสาร Freight (Import)",
    queues: [FQ.fShipPrep, FQ.fShipCleared, Q.corpPending],
  },
  freight_import_clearance: {
    headingTh: "พื้นที่งานพิธีการ Freight (Import)",
    queues: [FQ.fShipTransit, FQ.fShipCleared],
  },
  freight_import_messenger: {
    headingTh: "พื้นที่งานแมสเซนเจอร์ Freight (Import)",
    queues: [FQ.fShipCleared, FQ.fShipDelivered],
  },

  // ── QA / Ops ──────────────────────────────────────────────────────────────
  qa: {
    headingTh: "พื้นที่งาน QA / ตรวจสอบ",
    queues: [Q.incidents, Q.fwdNote, Q.shopNote, Q.fwdCredit],
  },
  ops: {
    headingTh: "พื้นที่งานปฏิบัติการ (Ops)",
    queues: [Q.shopPending, Q.fwdArrived, Q.yuanPending, Q.contactMsg, Q.incidents],
  },
  interpreter: {
    headingTh: "พื้นที่งานล่ามจีน (Interpreter)",
    queues: [Q.shopPending, Q.yuanPending],
  },

  // ── Manager — oversight (sees the broad set + the dashboard) ──────────────
  manager: {
    headingTh: "พื้นที่งานผู้จัดการ (Manager)",
    isOversight: true,
    queues: [Q.shopPending, Q.fwdArrived, Q.fwdAwaitPay, Q.driverItems, Q.walletTopup, Q.corpPending, Q.incidents],
  },
};

/**
 * The DEFAULT workspace — for god-nav tiers (ultra/super/normies) + any
 * workspace_role with no dedicated spec yet. Surfaces the cross-department
 * "what needs someone" set so a no-position oversight user still gets a useful
 * landing instead of an empty one. isOversight → also link the full dashboard.
 * (The freight_* roles no longer fall here — they each carry a dedicated
 * freight workspace spec above · G1 freight lane.)
 */
const DEFAULT_WORKSPACE: WorkspaceSpec = {
  headingTh: "พื้นที่งานของฉัน (ภาพรวม)",
  isOversight: true,
  queues: [
    Q.shopPending, Q.fwdArrived, Q.fwdAwaitPay, Q.driverItems,
    Q.walletTopup, Q.yuanPending, Q.corpPending, Q.contactMsg, Q.incidents,
  ],
};

/**
 * Resolve the WORKSPACE for a staffer.
 *
 * @param roles          — the staffer's admins.role set (the money tier; ultra/super/
 *                          normies are god-nav → oversight default unless they ALSO have
 *                          a specific position).
 * @param workspaceRole  — the staffer's POSITION's workspace_role (admin_positions ·
 *                          null = no position).
 *
 * Rules (additive · fail-soft · mirrors menuForStaffer):
 *   1. has a position with a known spec → that position's workspace (the focused seat).
 *   2. god-nav (ultra/super/normies) with no specific spec → the oversight DEFAULT.
 *   3. no position → first of the staffer's function-role specs, else the DEFAULT.
 *
 * A position ALWAYS wins over the tier (a `super`-tier person assigned a Warehouse
 * position gets the warehouse workspace — the position is the job · doc §6). Money
 * visibility stays keyed on the tier separately (canViewCost/Profit), untouched here.
 */
export function resolveWorkspace(
  roles: AdminRole[],
  workspaceRole: AdminRole | null,
): Workspace {
  // 1. A position with a dedicated spec wins (the focused seat).
  if (workspaceRole) {
    const spec = WORKSPACE_BY_ROLE[workspaceRole];
    if (spec) return materialize(workspaceRole, spec);
    // A position whose workspace_role has no spec yet (freight_* stubs / super) →
    // oversight default, but tagged with the position's role for display.
    return materialize(workspaceRole, DEFAULT_WORKSPACE);
  }

  // 2. No position. God-nav tiers → oversight default.
  if (isGodRole(roles)) return materialize(roles[0] ?? "normies", DEFAULT_WORKSPACE);

  // 3. No position, a function role → its spec (first match by role order), else default.
  for (const r of roles) {
    const spec = WORKSPACE_BY_ROLE[r];
    if (spec) return materialize(r, spec);
  }
  return materialize(roles[0] ?? "ops", DEFAULT_WORKSPACE);
}

function materialize(role: AdminRole, spec: WorkspaceSpec): Workspace {
  return {
    workspaceRole: role,
    headingTh: spec.headingTh,
    queues: [...spec.queues],
    isOversight: spec.isOversight ?? false,
  };
}

/**
 * A queue's live count (absent key → 0 · §0f exact).
 *  - CARGO queue (`badge`) → read from the BadgeCounts SOT.
 *  - FREIGHT queue (`freightBadge`) → read from the optional FreightQueueCounts
 *    (lib/freight/freight-queue-counts). Backward-compatible: callers that pass
 *    only `counts` (the cargo SOT) still resolve cargo queues; a freight queue
 *    resolves to 0 until `freightCounts` is supplied (the page wires it in).
 */
export function queueCount(
  counts: BadgeCounts,
  q: WorkspaceQueue,
  freightCounts?: FreightQueueCounts,
): number {
  if (q.freightBadge) return freightCounts?.[q.freightBadge] ?? 0;
  if (q.badge) return counts[q.badge] ?? 0;
  return 0;
}

/**
 * Sum of all queue counts in a workspace — the "today" total ("งานรอ X รายการ").
 * De-dupes by the queue's count-key (BadgeKey or FreightQueueKey) so a queue
 * shown twice isn't double-counted. `freightCounts` optional — absent → freight
 * queues contribute 0 (back-compat with cargo-only callers).
 */
export function workspaceTotal(
  counts: BadgeCounts,
  ws: Workspace,
  freightCounts?: FreightQueueCounts,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const q of ws.queues) {
    const key = q.freightBadge ? `f:${q.freightBadge}` : q.badge ? `c:${q.badge}` : null;
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    total += queueCount(counts, q, freightCounts);
  }
  return total;
}
