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
  /** the live-count badge key from the sidebar SOT — count resolved by the page. */
  badge: BadgeKey;
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

  // ── Document / CS-Import (logistics · เอกสาร) ─────────────────────────────
  freight_import_doc: {
    headingTh: "พื้นที่งานเอกสาร (Document / CS)",
    queues: [Q.fwdArrived, Q.fwdAwaitPay, Q.corpPending],
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
 * workspace_role with no dedicated spec yet (e.g. the freight_* stubs). Surfaces the
 * cross-department "what needs someone" set so a no-position oversight user still gets
 * a useful landing instead of an empty one. isOversight → also link the full dashboard.
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

/** A queue's live count, read from the BadgeCounts SOT (absent key → 0 · §0f exact). */
export function queueCount(counts: BadgeCounts, q: WorkspaceQueue): number {
  return counts[q.badge] ?? 0;
}

/**
 * Sum of all queue counts in a workspace — the "today" total ("งานรอ X รายการ").
 * De-dupes by BadgeKey so a queue shown twice (e.g. fwdArrived reused for two stages)
 * isn't double-counted.
 */
export function workspaceTotal(counts: BadgeCounts, ws: Workspace): number {
  const seen = new Set<BadgeKey>();
  let total = 0;
  for (const q of ws.queues) {
    if (seen.has(q.badge)) continue;
    seen.add(q.badge);
    total += counts[q.badge] ?? 0;
  }
  return total;
}
