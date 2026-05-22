/**
 * D1 Phase B — per-role admin sidebar menus, faithful to legacy PCS Cargo.
 *
 * Legacy PCS (`pcs-admin/include/left-menu.php`) does NOT filter one flat
 * array by a role enum. It reads a `company / department / section` triple
 * from `tb_admin` and `require_once`s exactly ONE purpose-built menu file
 * (~22 of them) assembled from reusable OOP blocks
 * (`include/pages/left-menu/OOP/*`). Every queue item carries a live-count
 * badge (`badgeMenu($count)`). Section headers are fixed EN words:
 *   Cargo & Freight · Freight · Cargo · Settings · Learning · Extension
 *
 * Pacred's RBAC is a 7-value `AdminRole` enum. Rather than re-introduce the
 * legacy `company/department/section` columns, this module reproduces the
 * legacy *shape*: it defines the OOP menu blocks ONCE, then hand-assembles a
 * purpose-built menu per role from those blocks — exactly how the legacy
 * per-role `.php` files do. `super` sees the full CEO sidebar.
 *
 * The badge counts are computed server-side (one batched query — see
 * `actions/admin/sidebar-counts.ts`) and keyed by `BadgeKey`.
 *
 *   Audit source: docs/research/d1-fidelity-admin.md §1
 *   Legacy ground truth: pcs-admin/include/pages/left-menu/OOP/
 */

import type { AdminRole } from "@/lib/auth/require-admin";

// ──────────────────────────────────────────────────────────────
// Badge keys — every key maps to one count in the batched query.
// Names mirror the legacy `count*` PHP variables where possible.
// ──────────────────────────────────────────────────────────────
export type BadgeKey =
  | "walletTopup"        // legacy countDeposit  — wallet deposits pending
  | "walletWithdraw"     // legacy countWithdraw — wallet withdrawals pending
  | "walletAll"          // countDeposit + countWithdraw (parent badge)
  | "shopPending"        // legacy countShops1   — ฝากสั่ง รอดำเนินการ
  | "shopAwaitPay"       // legacy countShops2   — ฝากสั่ง รอชำระเงิน
  | "shopOrdered"        // legacy countShops4   — ฝากสั่ง สั่งสินค้าแล้ว
  | "shopNote"           // legacy countNoteShop — หมายเหตุฝากสั่ง
  | "forwarderArrived"   // legacy countForwarder6 area — ถึงไทย/รอชำระ
  | "forwarderDelivery"  // เตรียมส่ง / กำลังจัดส่ง
  | "forwarderCredit"    // เครดิตสินค้า
  | "forwarderNote"      // legacy countNote — หมายเหตุนำเข้า
  | "forwarderWhError"   // legacy countErrorF4 — ประวัติเข้าโกดังไทย
  | "driverItems"        // legacy status_driver_item — มอบงานคนขับ
  | "yuanPending"        // legacy countPayment1 — ฝากโอน/ชำระ
  | "cntDrawMoney"       // legacy countDrawMoneyCNT — ค่าตู้รออนุมัติ
  | "shopPayout"         // legacy countShopPay1 — เบิกค่าสินค้า
  | "salesPayout"        // โบนัสเซลล์ รออนุมัติ
  | "interpreterPayout"  // โบนัสล่ามจีน รออนุมัติ
  | "withdrawalAll"      // parent — sum of all เบิกเงิน sub-rows
  | "customerPending"    // ลูกค้ารอ approve
  | "corporatePending"   // legacy countComp — สมาชิกนิติบุคคล รอตรวจ
  | "contactMessages"    // ข้อความติดต่อ (lead funnel) ใหม่
  | "refundsPending"     // คืนเงิน รอดำเนินการ
  | "bookingsPending"    // การจอง รอยืนยัน
  | "incidents";         // Incident triage — open

/** Counts resolved server-side; absent key → 0. */
export type BadgeCounts = Partial<Record<BadgeKey, number>>;

// ──────────────────────────────────────────────────────────────
// Phase-gated visibility (2026-05-20 night owner brief).
//   Phase 1 = LIVE for customers (visible to ALL admin staff).
//   Phase 2 = soon-to-launch (QA queues · refunds · driver-runs ·
//             commissions · learning · marketing) — `super` only.
//   Phase 3 = deeper future (broadcasts/bookings internal ·
//             container-costs · csv-imports · system tools) — `super` only.
//   Phase 4 = way later (Extension toolbox · barcode · etc.) — `super` only.
//   Default = Phase 1. Only TAG LEAVES with `phase` 2/3/4. A parent's
//   effective phase is computed at filter time as MIN of its children.
// ──────────────────────────────────────────────────────────────
export type Phase = 1 | 2 | 3 | 4;

// ──────────────────────────────────────────────────────────────
// Menu item shape. Mirrors a legacy `<li class="nav-item">`.
//  - `badge`    → live-count pill key (legacy badgeMenu($count))
//  - `children` → nested accordion (legacy `<ul class="menu-content">`)
//  - `icon`     → lucide icon name (resolved in the component)
//  - `labelKey` → i18n key under the `pcsAdminNav` namespace
//  - `phase`    → visibility gate (defaults to 1 = visible to all)
// ──────────────────────────────────────────────────────────────
export type MenuItem = {
  /** i18n key under namespace `pcsAdminNav` (e.g. "wallet.title"). */
  labelKey: string;
  /** Route href, or undefined for accordion-only parent rows. */
  href?: string;
  /** lucide-react icon name. Parents may omit. */
  icon?: string;
  /** Live-count badge key — renders a red pill (legacy badgeMenu). */
  badge?: BadgeKey;
  /** Phase gate. Undefined = 1 (visible to all). 2/3/4 = super only. */
  phase?: Phase;
  /** Nested sub-menu (legacy nested <ul>). */
  children?: MenuItem[];
};

/** A fixed legacy section header + the items under it. */
export type MenuSection = {
  /** Section header text — legacy uses fixed EN words. */
  header: string;
  items: MenuItem[];
};

// ════════════════════════════════════════════════════════════════
// OOP MENU BLOCKS — defined once, reused across role menus.
// Each block === one legacy `include/pages/left-menu/OOP/*` file.
// ════════════════════════════════════════════════════════════════

/** Single-leaf "กระเป๋าสตางค์" replacement (ภูม brief 2026-05-20 ค่ำ —
 *  Pacred is one company; the legacy 6-leaf wallet dropdown was retired).
 *  Sub-items (ทั้งหมด / จ่ายแทน / ประวัติ / ถอน / เติม / เพิ่ม) now live
 *  in the page top-menubar on /admin/wallet (Agent B owns the page).
 *
 *  Tombstone: prior `blockWallet: MenuItem = { labelKey: "wallet.title", ... 6 children ... }`
 *  defined here was the legacy `OOP/Cargo/menu-wallet.php` faithful port.
 *  Removed 2026-05-20 ค่ำ per ภูม brief. */
const itemWalletAll: MenuItem = {
  labelKey: "wallet.title",
  href: "/admin/wallet",
  icon: "Wallet",
  badge: "walletAll",
};

/** Single-leaf "บริการฝากสั่งสินค้า" replacement (ภูม brief 2026-05-20 ค่ำ).
 *  Sub-items (search / all / pending / cart / cartAdd / note) now live in
 *  the page top-menubar on /admin/service-orders (Agent B owns the page).
 *
 *  Tombstone: prior `blockPurchasing: MenuItem = { labelKey: "purchasing.title", ... 6 children ... }`
 *  defined here was the legacy `OOP/Cargo/menu-purchasing.php` faithful port.
 *  Removed 2026-05-20 ค่ำ per ภูม brief. */
const itemPurchasingAll: MenuItem = {
  labelKey: "purchasing.title",
  href: "/admin/service-orders",
  icon: "ShoppingCart",
  badge: "shopPending",
};

/** legacy OOP/Cargo/menu-barcode.php — สแกนบาร์โค้ด (nested)
 *
 *  2026-05-20 ค่ำ (Wave 2D · Option A) — Phase 4 tags removed; barcode is
 *  Phase 1 because it's the faithful port of legacy daily-use scanners
 *  (`barcode-c-*.php` + `barcode-d-*.php`). Each item below was a `?mode=…`
 *  placeholder; now points at the real routes built by Wave 2B agents.
 *  Driver leaves = USB handheld scanner UI; Cargo leaves = mobile camera UI. */
const blockBarcode: MenuItem = {
  labelKey: "barcode.title",
  icon: "Barcode",
  children: [
    {
      labelKey: "barcode.searchImport",  // ทั้งหมด (search any tracking)
      icon: "Search",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode/driver/all", icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode/cargo/all",  icon: "Camera"   },
      ],
    },
    {
      labelKey: "barcode.recordIntake",  // บันทึกเข้าโกดังไทย (type=4)
      icon: "PackageCheck",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode/driver/import", icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode/cargo/import",  icon: "Camera"   },
      ],
    },
    {
      labelKey: "barcode.searchPrepare",  // เตรียมส่ง (type=6)
      icon: "Package",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode/driver/prepare", icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode/cargo/prepare",  icon: "Camera"   },
      ],
    },
    {
      labelKey: "barcode.scanFromBox",  // พิมพ์จากหน้ากล่อง / รับเข้าจีน (type=from)
      icon: "Printer",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode/driver/from", icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode/cargo/from",  icon: "Camera"   },
      ],
    },
  ],
};

/** 2-level "บริการฝากนำเข้า" dropdown (ภูม brief 2026-05-20 ค่ำ — split by
 *  Cargo/Freight then by mode). The legacy 10+ operational items (search,
 *  note, whHistory, combine-bill, barcode, container-cost-check, etc.)
 *  collapse into the page top-menubar on /admin/forwarders. The dropdown
 *  here is a SEGMENT FILTER router — each leaf takes the operator to the
 *  same `/admin/forwarders` page pre-filtered by `?segment=<group>-<mode>`.
 *
 *  URL contract (Agent B uses these on /admin/forwarders/page.tsx):
 *    - Cargo:   ?segment=cargo-fcl | ?segment=cargo-lcl
 *    - Freight: ?segment=freight-fcl | ?segment=freight-lcl
 *                ?segment=freight-truck | ?segment=freight-sea | ?segment=freight-air
 *
 *  Tombstone: prior `blockForwarder` (legacy `OOP/Cargo/menu-forwarder.php`
 *  faithful port — search · searchMulti · list parent · note · checkCntCost ·
 *  cntReport · whHistory · assignDriver · combineBill · blockBarcode) was
 *  defined here. Removed 2026-05-20 ค่ำ per ภูม brief — operations now live
 *  in the page top-menubar; the deeper barcode toolbox stays in `blockBarcode`
 *  for warehouse role's sidebar reuse. */
/**
 * 2026-05-21 ภูม brief — collapsed to a SINGLE leaf. Previously a 4-leaf
 * nested dropdown (Cargo>FCL/LCL · Freight>FCL/LCL) — but per ภูม
 * "ทำให้มันใช้งานง่าย ไม่ต้องเป็น dropdown menu" the Cargo/Freight +
 * FCL/LCL split moved to in-page **Segmented Control** pills inside
 * `<PageTopMenubar>` on `/admin/forwarders` (the same head menu that
 * holds the รถ/เรือ/แอร์ mode chip).
 *
 * Sidebar = 1 line · the head menu carries every filter dimension
 * (service-type segment · FCL/LCL · mode). Tombstone keeps old comment
 * for context.
 */
const blockForwarderImport: MenuItem = {
  labelKey: "forwarderImport.title",
  href: "/admin/forwarders",
  icon: "Package",
  badge: "forwarderArrived",
};

/** legacy OOP/Cargo/menu-payment.php — บริการฝากโอน/ชำระ */
const blockPayment: MenuItem = {
  labelKey: "payment.title",
  icon: "Languages",
  badge: "yuanPending",
  children: [
    { labelKey: "payment.list", href: "/admin/yuan-payments",     icon: "Languages", badge: "yuanPending" },
    { labelKey: "payment.add",  href: "/admin/yuan-payments/new", icon: "Plus" },
  ],
};

/** Single-leaf "ออกรายงาน" replacement (ภูม brief 2026-05-20 ค่ำ).
 *  The 8 sub-reports (shop / forwarder / payment / salesRep / allUser /
 *  byCode / driver / web) now live in the page top-menubar on
 *  /admin/reports (Agent B owns the page).
 *
 *  Tombstone: prior `blockReport: MenuItem = { labelKey: "report.title", ... 8 children ... }`
 *  defined here was the legacy `OOP/Cargo/menu-report.php` faithful port.
 *  Removed 2026-05-20 ค่ำ per ภูม brief. */
const itemReportsAll: MenuItem = {
  labelKey: "report.title",
  href: "/admin/reports",
  icon: "BarChart3",
};

/** Unified "ระบบบัญชี" sidebar entry — single leaf (ภูม brief 2026-05-21
 *  night: mirror the /admin/forwarders pattern; move Cargo/Freight split
 *  out of the sidebar dropdown into a Segmented Control inside the page
 *  header).
 *
 *  Sidebar lands on /admin/accounting/cargo by default; the pill at the
 *  top of that page flips to /admin/accounting/freight without leaving
 *  the header. Both hub pages render their own page-top-menubar legacy-
 *  style (PageTopMenubar items={CARGO_MENUBAR | FREIGHT_MENUBAR}).
 *
 *  Tombstone — the previous shape was a 2-child dropdown:
 *    children: [
 *      { labelKey: "accounting.cargo",   href: "/admin/accounting/cargo",   icon: "Package" },
 *      { labelKey: "accounting.freight", href: "/admin/accounting/freight", icon: "Truck" },
 *    ]
 *  Removed 2026-05-21 night so the sidebar stays slim + every cross-
 *  page split lives in head menubars (Pacred-is-one-company pattern).
 *
 *  Component: components/admin/accounting-segment-pills.tsx
 */
const blockAccounting: MenuItem = {
  labelKey: "accounting.title",
  href: "/admin/accounting/cargo",
  icon: "Landmark",
};

/** legacy OOP/Cargo/menu-settings.php — ตั้งค่าระบบ Cargo
 *
 * 2026-05-22 (Wave 7.3 orphan wiring): added 2 new groups — "ระบบ" (cron
 * jobs · system notification log · CSV bulk import) and "เครื่องมือ"
 * (organization email · admin users). These were orphan pages prior to
 * this commit — accessible only via URL typing. ภูม confirmed wiring
 * per re-audit-2026-05-21-night.md §D + page-inventory-2026-05-21-night.md.
 */
const blockSettingsCargo: MenuItem = {
  labelKey: "settingsCargo.title",
  icon: "Settings",
  children: [
    { labelKey: "settingsCargo.general",   href: "/admin/settings",                  icon: "Settings" },
    { labelKey: "settingsCargo.homeNotice", href: "/admin/settings/notifications",   icon: "MessageCircle" },
    { labelKey: "settingsCargo.popup",     href: "/admin/settings/business-config",  icon: "MessageCircle" },
    {
      labelKey: "settingsCargo.rates",
      icon: "SlidersHorizontal",
      children: [
        { labelKey: "settingsCargo.rateGeneral", href: "/admin/rates/general", icon: "Users" },
        { labelKey: "settingsCargo.rateVip",     href: "/admin/rates/vip",     icon: "Users" },
        { labelKey: "settingsCargo.rateCustomUser", href: "/admin/rates/custom-user", icon: "Users" },
        { labelKey: "settingsCargo.rateCustomHs",   href: "/admin/rates/custom-hs",   icon: "Users" },
      ],
    },
    { labelKey: "settingsCargo.vipTiers",  href: "/admin/settings/business-config",  icon: "Users" },
    {
      labelKey: "settingsCargo.system",
      icon: "Activity",
      children: [
        { labelKey: "settingsCargo.crons",        href: "/admin/system/crons",         icon: "Clock" },
        { labelKey: "settingsCargo.systemNotifs", href: "/admin/system/notifications", icon: "BellRing" },
        { labelKey: "settingsCargo.csvImports",   href: "/admin/csv-imports",          icon: "Upload" },
      ],
    },
    {
      labelKey: "settingsCargo.tools",
      icon: "Wrench",
      children: [
        { labelKey: "settingsCargo.orgEmail",   href: "/admin/organization-email", icon: "MessageCircle" },
        { labelKey: "settingsCargo.adminUsers", href: "/admin/admins",             icon: "UserCog" },
      ],
    },
  ],
};

/** Single-leaf "ลูกค้าทั้งหมด" replacement (ภูม brief 2026-05-20 ค่ำ —
 *  Pacred is one company; the legacy Cargo/Freight customer-split + the
 *  8-item nested dropdown was retired). Cargo/Freight subdivision +
 *  group filters (ทั่วไป/VIP/SVIP/นิติ/เครดิต/เทียบ) now live in the
 *  page top-menubar on /admin/customers (CUSTOMERS_MENUBAR config).
 *
 *  Tombstone: the prior `blockUserCargo` + `blockUserCargoAndFreight`
 *  defined here · 2026-05-19 R1-restructure had carved them faithful to
 *  the legacy `OOP/Cargo/menu-user.php` + `OOP/CargoAndFreight/menu-user.php`.
 *  Removed 2026-05-20 ค่ำ per Pacred-is-one-company brief. */
const itemCustomersAll: MenuItem = {
  labelKey: "manageCustomersAll.title",
  href: "/admin/customers",
  icon: "Users",
  badge: "corporatePending",
};

/** Single-leaf "QA & QC" replacement (ภูม brief 2026-05-20 ค่ำ · Phase 2).
 *  The 12 SLA-breach sub-queues now live in the page top-menubar on
 *  /admin/qa (Agent B creates the new hub page).
 *
 *  Tombstone: prior `blockQA: MenuItem = { labelKey: "qa.title", ... 12 SLA leaves ... }`
 *  defined here was the legacy `OOP/Cargo/menu-QAAndQC.php` faithful port.
 *  Removed 2026-05-20 ค่ำ per ภูม brief — Phase 2 (super-only) preserved. */
const itemQAAll: MenuItem = {
  labelKey: "qa.title",
  href: "/admin/qa",
  icon: "ShieldAlert",
  phase: 2,
};

/** 2-level "HR" dropdown (ภูม brief 2026-05-20 ค่ำ — flatten the prior
 *  `hrGroup.title` wrapper + the two standalone blocks into a single
 *  HR block with 2 hub children). Each child routes to a hub page
 *  (Agent B creates `/admin/hr/humanresource` and `/admin/hr/assets`),
 *  where the deeper items (org-chart · recruitment · employees ·
 *  attendance · maintenance · purchasing · stock) become page top-menubar
 *  items.
 *
 *  Tombstones: prior `blockHrHumanResource` (legacy
 *  `OOP/CargoAndFreight/menu-hr-manage-human-resource.php` faithful port —
 *  orgChartImage · orgChartTable · recruitment · people · attendance) and
 *  `blockHrCorporateAssets` (legacy `menu-hr-manage-corporate-assets.php` —
 *  maintenance · purchasing · stock) were defined here. Removed
 *  2026-05-20 ค่ำ per ภูม brief — and the `hrGroup.title` wrapper that
 *  previously nested both in `menuSuper` is dropped (this `blockHr` IS
 *  the wrapper now). */
const blockHr: MenuItem = {
  labelKey: "hr.titleSection",
  icon: "UserCheck",
  children: [
    { labelKey: "hr.humanResource",   href: "/admin/hr/humanresource", icon: "Users" },
    { labelKey: "hr.corporateAssets", href: "/admin/hr/assets",        icon: "Boxes" },
  ],
};

/** legacy OOP/CargoAndFreight/menu-withdrawal-list.php — รายการเบิกเงิน */
const blockWithdrawalList: MenuItem = {
  labelKey: "withdrawal.title",
  icon: "Banknote",
  badge: "withdrawalAll",
  children: [
    {
      labelKey: "withdrawal.cargo",
      icon: "Banknote",
      badge: "withdrawalAll",
      children: [
        { labelKey: "withdrawal.shopGoods",   href: "/admin/sales-payouts?kind=shop-goods",  icon: "HandCoins", badge: "shopPayout" },
        // Phase 3 — container-costs deeper-future per 2026-05-20 brief.
        { labelKey: "withdrawal.cntCost",     href: "/admin/cnt-hs", icon: "Truck", badge: "cntDrawMoney", phase: 3 },
        // Phase 2 — freight-th stub (no legacy source · still placeholder per brief).
        { labelKey: "withdrawal.thaiFreight", href: "/admin/withdrawal/freight-th",  icon: "Truck", phase: 2 },
        { labelKey: "withdrawal.agentCustomer", href: "/admin/reports/user-sales-history",   icon: "Users" },
        // Phase 2 — sales-only commissions / payouts (not live to customers).
        { labelKey: "withdrawal.salesBonus",  href: "/admin/sales-payouts",                  icon: "BadgePercent", badge: "salesPayout",       phase: 2 },
        { labelKey: "withdrawal.interpreterBonus", href: "/admin/commissions",               icon: "BadgePercent", badge: "interpreterPayout", phase: 2 },
        { labelKey: "withdrawal.driver",      href: "/admin/driver-runs",                    icon: "Truck",                                     phase: 2 },
      ],
    },
    // Phase 2 — Freight side withdrawal (forwarder-sales commissions, not live).
    { labelKey: "withdrawal.freight", href: "/admin/forwarder-sales", icon: "Banknote", phase: 2 },
  ],
};

/** RETIRED 2026-05-20 ค่ำ — replaced by single-leaf `itemCustomersAll`
 *  above (ภูม brief: Pacred = 1 company · no Cargo/Freight customer split).
 *  Tombstone kept so future agents do not re-add a parallel block by mistake. */
// const blockUserCargoAndFreight: MenuItem = { ... } // RETIRED — see itemCustomersAll

/** RETIRED — the standalone Freight-only accounting block was merged
 * into the unified `blockAccounting` above (Pacred is one company,
 * not three; per ภูม brief 2026-05-20 night). All role menus now reference
 * `blockAccounting`. Keep this stub commented-out as a tombstone so a
 * future agent doesn't re-add a parallel block by mistake. */
// const blockAccFreight: MenuItem = { ... } // RETIRED — see blockAccounting

// ── Learning section blocks — legacy OOP/Learning/* ──────────────
// Phase 2 — Learning hub per 2026-05-20 owner brief (soon-to-launch).
const blockLearningRegulations: MenuItem = {
  labelKey: "learning.regulations", href: "/admin/learning?topic=regulations", icon: "ScrollText", phase: 2,
};
const blockLearningTraining: MenuItem = {
  labelKey: "learning.training",
  icon: "GraduationCap",
  children: [
    { labelKey: "learning.businessPlan", href: "/admin/learning?topic=business-plan", icon: "FileText", phase: 2 },
    { labelKey: "learning.culture",      href: "/admin/learning?topic=culture",       icon: "FileText", phase: 2 },
    { labelKey: "learning.jobFlow",      href: "/admin/learning?topic=job-flow",      icon: "FileText", phase: 2 },
  ],
};
const blockLearningNewsfeed: MenuItem = {
  labelKey: "learning.newsfeed", href: "/admin/learning?topic=newsfeed", icon: "Newspaper", phase: 2,
};
const blockLearningTos: MenuItem = {
  labelKey: "learning.tos", href: "/admin/settings/tos-versions", icon: "FileText", phase: 2,
};

// ── Extension section blocks — legacy OOP/Extension/* ────────────
// Phase 4 — Extension toolbox per 2026-05-20 owner brief (way later).
// Exception: `extension.history` (= /admin/audit) is Phase 1 because HR audit
// is in the Phase 1 essentials list ("ระบบทำงานพนักงาน · audit · policies").
const blockExtJuristic: MenuItem = {
  labelKey: "extension.juristicCheck", href: "/admin/juristic-check", icon: "ClipboardCheck", phase: 4,
};
const blockExtThaiTransport: MenuItem = {
  labelKey: "extension.thaiTransport", href: "/admin/carriers", icon: "Truck", phase: 4,
};
const blockExtMeetingRoom: MenuItem = {
  labelKey: "extension.meetingRoom", href: "/admin/hr/attendance?tab=meeting-room", icon: "CalendarCheck", phase: 4,
};
const blockExtHistory: MenuItem = {
  // Phase 1 — HR audit is an explicit Phase 1 essential.
  labelKey: "extension.history", href: "/admin/audit", icon: "Save",
};
const blockExtIncidents: MenuItem = {
  // Phase 2 — incident triage aligns with QA queues (also Phase 2).
  labelKey: "extension.incidents", href: "/admin/incidents", icon: "AlertTriangle", badge: "incidents", phase: 2,
};

// ── 6 Phase 2 orphan extensions (ภูม flagged 2026-05-21) ─────────
// Wired to menuSuper Extension section. All `phase: 2` → non-super
// roles don't see them; super gets the navigation while waiting for
// the broader launch. Audit doc: docs/research/orphan-pages-audit-2026-05-21.md
const blockExtKpi: MenuItem = {
  labelKey: "extension.kpi", href: "/admin/kpi", icon: "BarChart3", phase: 2,
};
const blockExtContactMessages: MenuItem = {
  labelKey: "extension.contactMessages", href: "/admin/contact-messages",
  icon: "MessageSquare", badge: "contactMessages", phase: 2,
};
const blockExtTaxInvoices: MenuItem = {
  labelKey: "extension.taxInvoices", href: "/admin/tax-invoices", icon: "FileText", phase: 2,
};
const blockExtWorkboard: MenuItem = {
  labelKey: "extension.workboard", href: "/admin/board", icon: "KanbanSquare", phase: 2,
};
const blockExtInbox: MenuItem = {
  labelKey: "extension.inbox", href: "/admin/board/inbox", icon: "Inbox", phase: 2,
};
const blockExtBroadcasts: MenuItem = {
  labelKey: "broadcasts.title", href: "/admin/broadcasts", icon: "BellRing", phase: 2,
};
const blockExtWithdrawalsAll: MenuItem = {
  labelKey: "extension.withdrawalsAll", href: "/admin/withdrawals", icon: "Banknote", phase: 2,
};

// ── Dashboard — single leaf (Pacred-is-one-company per ภูม 2026-05-20 ค่ำ).
//
//  Prior shape carried a 3-way All/Freight/Cargo dropdown pointing at
//  `/admin?c=all/freight/cargo`. The page (`app/[locale]/(admin)/admin/page.tsx`)
//  only honours `?tab=…` so the `?c=…` carriers were a no-op — all three
//  dropdown items rendered the exact same dashboard, hiding behind a
//  fake "feature". Collapsed to one leaf; any carrier filter belongs in
//  the in-page tab strip, not the sidebar.
const itemDashboard: MenuItem = {
  labelKey: "dashboard.title",
  href: "/admin",
  icon: "LayoutDashboard",
};

// ════════════════════════════════════════════════════════════════
// SHARED SECTION ASSEMBLERS — legacy fixed section headers.
// ════════════════════════════════════════════════════════════════

const learningSection: MenuSection = {
  header: "Learning",
  items: [blockLearningRegulations, blockLearningTraining, blockLearningNewsfeed, blockLearningTos],
};

/** Extension section — `super` gets the full toolbox; others a subset. */
function extensionSection(items: MenuItem[]): MenuSection {
  return { header: "Extension", items };
}

// ════════════════════════════════════════════════════════════════
// PER-ROLE MENUS — each === one legacy per-role .php file.
// ════════════════════════════════════════════════════════════════

/**
 * `super` — the CEO sidebar (legacy CargoAndFreight/CEO/CEO.php), the
 * fullest menu. Canonical fixed section order.
 */
const menuSuper: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    // 2026-05-20 ค่ำ ภูม brief: Pacred = 1 company (not the legacy
    // 3-company split). Merged the prior "Cargo & Freight" + "Cargo"
    // sections into a single section. Cross-shared items (HR/QA/
    // จัดการลูกค้า/รายการเบิกเงิน) come first, then operational
    // (wallet/purchasing/forwarder/payment/report/accounting).
    //
    // 2026-05-20 ค่ำ second batch: 6 sections consolidated — the deep
    // dropdowns (wallet · purchasing · forwarder · report · QA · HR) were
    // flattened to single-leaves (or 2-level Cargo/Freight × mode for
    // forwarder, 2-level for HR) so the sidebar stays scannable; the
    // deeper operational items moved to each page's top-menubar.
    header: "Cargo & Freight",
    items: [
      blockHr,
      itemQAAll,
      // 2026-05-21 ภูม flagged — QA module rebuild (P0 #2) landed but had
      // no super sidebar entry. menuWarehouse + menuQa already include it
      // (L650 + L766). super now reaches it via this leaf too.
      { labelKey: "warehouse.qaInspect", href: "/admin/warehouse/qa-inspections", icon: "ClipboardCheck" },
      itemCustomersAll,
      blockWithdrawalList,
      itemWalletAll,
      itemPurchasingAll,
      blockForwarderImport,
      // 2026-05-21 ภูม flagged — /admin/drivers had no direct super sidebar
      // entry · only reachable via the /admin/forwarders top-menubar
      // "งาน → มอบงานคนขับ". Added as a top-level leaf so super can land
      // on the driver-assignment queue in one click. Re-uses the existing
      // driverItems badge.
      { labelKey: "forwarder.assignDriver", href: "/admin/drivers", icon: "Truck", badge: "driverItems" },
      // 2026-05-23 (Wave 10 · Agent C) — driver mobile work-list /admin/drivers/work
      // for super/ops to peek into any driver's mobile view (driver role auto-
      // filters to self · ?driver=<userid> param for oversight). Useful when a
      // dispatcher needs to see what a specific driver has on their phone today.
      { labelKey: "forwarder.driverWork", href: "/admin/drivers/work", icon: "Smartphone" },
      blockPayment,
      itemReportsAll,
      blockAccounting,
    ],
  },
  { header: "Settings", items: [blockSettingsCargo] },
  learningSection,
  // 2026-05-21 — Extension section expanded with 6 Phase 2 orphans
  // (ภูม flagged · audit doc orphan-pages-audit-2026-05-21.md):
  // kpi · workboard · inbox · contactMessages · broadcasts · taxInvoices ·
  // withdrawalsAll. All phase: 2 — non-super doesn't see them.
  extensionSection([
    blockExtKpi,
    blockExtWorkboard,
    blockExtInbox,
    blockExtContactMessages,
    blockExtBroadcasts,
    blockExtTaxInvoices,
    blockExtWithdrawalsAll,
    blockExtJuristic,
    blockExtThaiTransport,
    blockExtMeetingRoom,
    blockExtHistory,
    blockExtIncidents,
  ]),
];

/**
 * `ops` — Cargo CS / Purchasing operator (legacy Cargo/CSPurchasing).
 * Cargo operational queues, no finance back-office, no HR.
 *
 * R1 (sidebar IA restructure): regrouped to legacy section order
 * (Cargo & Freight → Cargo → Learning → Extension). No item changes.
 */
const menuOps: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    // Section merged 2026-05-20 ค่ำ (see menuSuper comment). Second
    // batch (same date) consolidated wallet/purchasing/forwarder/QA
    // to leaves + Cargo/Freight × mode dropdown.
    header: "Cargo & Freight",
    items: [
      itemQAAll,
      { labelKey: "userCargo.searchTop", href: "/admin/customers?focus=search", icon: "Search" },
      itemWalletAll,
      itemPurchasingAll,
      blockForwarderImport,
      blockPayment,
      // Phase 2 — driver-runs sales-only side not yet live.
      { labelKey: "report.titleDriver", href: "/admin/driver-runs", icon: "BarChart3", phase: 2 },
    ],
  },
  learningSection,
  extensionSection([blockExtJuristic, blockExtThaiTransport, blockExtIncidents]),
];

/**
 * `accounting` — Accounting back-office (legacy CargoAndFreight/Accounting).
 * The money modules: wallet, withdrawal approvals, both accounting systems.
 */
const menuAccounting: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    // Section merged 2026-05-20 ค่ำ (see menuSuper comment). Second
    // batch (same date) consolidated wallet + report to single leaves.
    header: "Cargo & Freight",
    items: [blockWithdrawalList, itemWalletAll, blockPayment, itemReportsAll, blockAccounting],
  },
  { header: "Settings", items: [blockSettingsCargo] },
  learningSection,
  extensionSection([blockExtJuristic, blockExtIncidents]),
];

/**
 * `sales_admin` — Cargo Sales / Sales manager (legacy Cargo/SaleCargo).
 * Customer book + sell pipeline + sales commission, light finance.
 *
 * R1 (sidebar IA restructure): regrouped to legacy section headers
 * (Cargo & Freight → Cargo → Learning → Extension). No item changes —
 * `manageCustomers.titleSales` + `withdrawal.titleSales` are surfaced
 * under Cargo & Freight because legacy `OOP/CargoAndFreight/menu-user.php`
 * + `menu-withdrawal-list.php` live in that section.
 */
const menuSalesAdmin: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    header: "Cargo & Freight",
    items: [
      {
        labelKey: "manageCustomers.titleSales",
        icon: "Users",
        badge: "corporatePending",
        children: [
          { labelKey: "userCargo.search",     href: "/admin/customers?focus=search", icon: "Search" },
          { labelKey: "userCargo.all",        href: "/admin/customers",             icon: "Users" },
          // Phase 2 — customer approval queue is QA-like, soon-to-launch.
          { labelKey: "userCargo.pending",    href: "/admin/customers/pending",     icon: "Clock", badge: "customerPending", phase: 2 },
          { labelKey: "userCargo.vip",        href: "/admin/customers?group=vip",   icon: "User" },
          { labelKey: "userCargo.corporate",  href: "/admin/customers?group=corporate", icon: "Building2", badge: "corporatePending" },
          { labelKey: "userCargo.recentlyActive", href: "/admin/customers/recently-active", icon: "Activity" },
          // Phase 2 — sales-rep transfer is QA-like ops (already Phase 2 in blockQA).
          { labelKey: "userCargo.transferRep", href: "/admin/customers/transfer-rep", icon: "ArrowRightLeft", phase: 2 },
          // Phase 2 — team-leaders bonus tool aligns with sales-only commissions.
          { labelKey: "userCargo.teamLeaders", href: "/admin/team-leaders",         icon: "Coins", phase: 2 },
        ],
      },
      {
        labelKey: "withdrawal.titleSales",
        icon: "Banknote",
        badge: "salesPayout",
        children: [
          // Phase 2 — sales-only commissions / payouts (not live to customers).
          { labelKey: "withdrawal.salesBonus",   href: "/admin/sales-payouts",     icon: "BadgePercent", badge: "salesPayout", phase: 2 },
          { labelKey: "withdrawal.forwarderComm", href: "/admin/forwarder-sales",  icon: "Receipt", phase: 2 },
        ],
      },
      // — operational items below appended after the 2026-05-20 ค่ำ
      //   section merge (previously a separate "Cargo" section). Second
      //   batch (same date) consolidated wallet/purchasing/report to leaves.
      itemWalletAll,
      itemPurchasingAll,
      { ...itemReportsAll, labelKey: "report.titleSales" },
      // Phase 2 — Marketing/broadcasts/bookings post-launch features per 2026-05-20 brief.
      { labelKey: "broadcasts.title", href: "/admin/broadcasts", icon: "BellRing",      phase: 2 },
      { labelKey: "bookings.title",   href: "/admin/bookings",   icon: "CalendarCheck", badge: "bookingsPending", phase: 2 },
    ],
  },
  learningSection,
  extensionSection([blockExtJuristic, blockExtIncidents]),
];

/**
 * `warehouse` — Cargo Warehouse worker (legacy Cargo/Warehouse/Warehouse.php).
 * A short, focused menu — the warehouse worker's exact familiar tree.
 */
const menuWarehouse: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    // Section header standardised to "Cargo & Freight" everywhere
    // (2026-05-20 ค่ำ ภูม merge — Pacred = 1 company).
    header: "Cargo & Freight",
    items: [
      { labelKey: "userCargo.searchTop", href: "/admin/customers?focus=search", icon: "Search" },
      {
        labelKey: "forwarder.titleWarehouse",
        icon: "Package",
        badge: "forwarderArrived",
        children: [
          { labelKey: "forwarder.search",      href: "/admin/forwarders",                   icon: "Search" },
          { labelKey: "forwarder.searchMulti", href: "/admin/forwarders/bulk-search",       icon: "Search" },
          { labelKey: "forwarder.listAll",     href: "/admin/forwarders",                   icon: "Package" },
          { labelKey: "forwarder.whHistory",   href: "/admin/forwarders/warehouse-history", icon: "PackageCheck", badge: "forwarderWhError" },
          { labelKey: "forwarder.listPrepare", href: "/admin/forwarders?q=6",               icon: "Truck", badge: "forwarderDelivery" },
          // Phase 2 — driver-runs sales-only side not yet live.
          { labelKey: "forwarder.assignDriver", href: "/admin/drivers",                     icon: "Truck", badge: "driverItems", phase: 2 },
          { labelKey: "forwarder.combineBill", href: "/admin/forwarders/combine-bill",      icon: "Printer" },
        ],
      },
      // Option C (ภูม 2026-05-20 ค่ำ) — point at the faithful port of legacy
      // `report-cnt.php`. Spine page at `/admin/warehouse/containers` retired
      // (tombstoned · redirects to /admin/report-cnt).
      { labelKey: "warehouse.containers", href: "/admin/report-cnt", icon: "Package" },
      // Phase 2 — warehouse bulletin aligns with QA queues.
      { labelKey: "warehouse.bulletin",   href: "/admin/warehouse/bulletin",       icon: "ClipboardCheck", phase: 2 },
      // QA inspection module (P0 #2 rebuild · 2026-05-21) — un-phase-gated for
      // the warehouse role because PCS_Cargo_Guidebook_TH.md L441-454 lists
      // pre-shipment QA as a daily warehouse duty (สีถูก / ไซส์ถูก / ของแท้).
      // Live to all warehouse staff; not just super.
      { labelKey: "warehouse.qaInspect",  href: "/admin/warehouse/qa-inspections", icon: "ShieldAlert" },
      blockBarcode,
    ],
  },
  learningSection,
  extensionSection([blockExtThaiTransport, blockExtIncidents]),
];

/**
 * `driver` — Cargo Driver (legacy Cargo/Warehouse/Driver.php · doc lines
 * 1005-1034).
 *
 * 2026-05-20 ค่ำ (Agent ZZ · per audit CF-1 + ภูม brief): un-phase-gated the
 * three driver leaves. Previously every item was tagged `phase: 2/4` which —
 * combined with the "Phase 2+ = super only" rule — meant a real driver
 * login saw an EMPTY menu (only Dashboard + Learning + Extension chrome,
 * nothing operational). Drivers now see their daily essentials by default.
 *
 * Note: the driver UI behind these URLs is still being built; the routes
 * themselves may render placeholder content. Visibility is correct now.
 */
const menuDriver: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    // Section header standardised to "Cargo & Freight" everywhere
    // (2026-05-20 ค่ำ ภูม merge — Pacred = 1 company).
    header: "Cargo & Freight",
    items: [
      // 2026-05-23 (Wave 10 · Agent C) — mobile work-list FIRST. This is the
      // page drivers open on their phone: today's deliveries + load/deliver/
      // fail buttons. Self-row enforcement built into requireAdmin path so
      // a driver only sees their own batch.
      { labelKey: "driver.work",      href: "/admin/drivers/work",            icon: "Smartphone", badge: "driverItems" },
      // Phase 1 — operational driver items (CF-1 fix · ZZ 2026-05-20 ค่ำ).
      { labelKey: "driver.toDeliver", href: "/admin/driver-runs",             icon: "Truck", badge: "driverItems" },
      { labelKey: "driver.history",   href: "/admin/driver-runs?tab=history", icon: "Truck"                       },
      { labelKey: "driver.barcode",   href: "/admin/barcode/driver",          icon: "Barcode"                     },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/**
 * `sales` — Cargo Sales **Staff** (legacy Cargo/SaleCargo/Sales.php ·
 * doc lines 792-870 · role #30). Agent ZZ 2026-05-20 ค่ำ.
 *
 * DISTINCT from `sales_admin` (= Cargo Sales **Manager** #29, lines 780-788)
 * which inherits this menu PLUS approval rights. The Staff tier sees the
 * operational customer + wallet + purchasing + forwarder + payment + report
 * menu but NOT the per-account-allowlist marketing settings (notify / popup)
 * — which the legacy file gates to `admin_mew / admin_fogus` only (doc line
 * 852, currently not modelled in Pacred — flagged for พี่เดฟ in the plan doc).
 *
 * Shape mirrors `menuSalesAdmin` with two trims:
 *   - DROPS the `bookings` + `broadcasts` Pacred-extension items (those
 *     remain Manager-tier · `sales_admin`).
 *   - DROPS the `userCargo.transferRep` + `userCargo.teamLeaders` leaves
 *     (Manager-tier approval / configuration).
 */
const menuSales: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    header: "Cargo & Freight",
    items: [
      {
        labelKey: "manageCustomers.titleSales",
        icon: "Users",
        badge: "corporatePending",
        children: [
          { labelKey: "userCargo.search",     href: "/admin/customers?focus=search", icon: "Search" },
          { labelKey: "userCargo.all",        href: "/admin/customers",             icon: "Users" },
          { labelKey: "userCargo.vip",        href: "/admin/customers?group=vip",   icon: "User" },
          { labelKey: "userCargo.corporate",  href: "/admin/customers?group=corporate", icon: "Building2", badge: "corporatePending" },
          { labelKey: "userCargo.recentlyActive", href: "/admin/customers/recently-active", icon: "Activity" },
        ],
      },
      {
        labelKey: "withdrawal.titleSales",
        icon: "Banknote",
        badge: "salesPayout",
        children: [
          { labelKey: "withdrawal.salesBonus", href: "/admin/sales-payouts", icon: "BadgePercent", badge: "salesPayout", phase: 2 },
        ],
      },
      itemWalletAll,
      itemPurchasingAll,
      { ...itemReportsAll, labelKey: "report.titleSales" },
    ],
  },
  learningSection,
  extensionSection([blockExtJuristic, blockExtIncidents]),
];

/**
 * `qa` — QA & QC staff (legacy doc role #5, lines 358-382). Agent ZZ
 * 2026-05-20 ค่ำ · audit CF-2 fix.
 *
 * Before this role existed, the 12 SLA-breach queues (`itemQAAll` → `/admin/qa`)
 * plus the sales-rep transfer tool (`/admin/customers/transfer-rep`) were
 * visible to `super` only — meaning a real QA staffer had to be granted
 * `super` (over-privileged: HR, accounting, settings). This menu carves
 * out the minimum QA workspace.
 *
 * The 12 SLA-breach sub-queues continue to live inside the `/admin/qa` hub's
 * page top-menubar (per ภูม brief 2026-05-20 ค่ำ — Pacred-is-one-company
 * consolidation); the sidebar surface stays one leaf.
 */
const menuQa: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Cargo & Freight",
    items: [
      // QA hub (12 SLA-breach queues live in this page's top-menubar) —
      // un-phase-gated for the `qa` role specifically. `itemQAAll` keeps
      // `phase: 2` for non-QA roles via the menu file precedence.
      { labelKey: "qa.title", href: "/admin/qa", icon: "ShieldAlert" },
      // Pre-shipment QA inspection module (P0 #2 rebuild · 2026-05-21).
      // The faithful port of legacy ตรวจสอบสินค้า workflow per
      // PCS_Cargo_Guidebook_TH.md L441-454 — record verdict (pass/fail/
      // hold/fake_product) + photos + blacklist flag.
      { labelKey: "warehouse.qaInspect", href: "/admin/warehouse/qa-inspections", icon: "ClipboardCheck" },
      // Sales-rep reassignment tool (doc line 230 + 1295).
      { labelKey: "userCargo.transferRep", href: "/admin/customers/transfer-rep", icon: "ArrowRightLeft" },
      // Read-only customer search — QA needs to look up a customer to investigate.
      { labelKey: "userCargo.searchTop", href: "/admin/customers?focus=search", icon: "Search" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

// ════════════════════════════════════════════════════════════════
// FREIGHT ROLE MENUS — stubs per doc CompanyType 2 (roles #16-28)
// ════════════════════════════════════════════════════════════════
// Per ภูม "ห้ามเดา" rule + audit CF-5: the legacy doc enumerates Freight
// role NAMES + section headers ONLY — never the per-role sidebar item
// trees ("[Full Export Operations Access]" placeholder for every role).
// These stubs reproduce that exact spec:
//   - Dashboard (always)
//   - The doc's listed item(s) (only `จัดการลูกค้า Freight` + the
//     `รายงานรับรู้รายได้ Freight` are concretely named in the doc for
//     Manager-tier roles · everything else is the placeholder)
//   - Learning + Extension chrome (faithful — every Freight role lists these)
//
// When พี่เดฟ extends the doc with the real per-role menu trees, each
// stub becomes a hand-assembled MenuSection like menuWarehouse — DO NOT
// guess items from the table at the top of the doc.

/** Doc role #16 — Freight Sales Manager (lines 588-600).
 *  Items concretely named in doc: จัดการลูกค้า Freight · รายงานรับรู้รายได้
 *  Freight · ออกรายงาน. The deeper sub-items are NOT enumerated in the doc.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightSalesManager: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight",
    items: [
      { labelKey: "manageCustomers.freightAll", href: "/admin/customers?segment=freight", icon: "Users" },
      { labelKey: "accFreight.title",           href: "/admin/accounting/freight",        icon: "Landmark" },
      { ...itemReportsAll, labelKey: "report.titleSales" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #17 — Freight Sales (lines 604-614). Doc enumerates ONE item:
 *  จัดการลูกค้า Freight. No deeper sub-items.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightSales: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight",
    items: [
      { labelKey: "manageCustomers.freightAll", href: "/admin/customers?segment=freight", icon: "Users" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #18 — Export Manager (lines 618-630). Doc lists section header
 *  "Freight - Export" + `[Full Export Operations Access]` placeholder +
 *  จัดการลูกค้า Freight + รายงานรับรู้รายได้ Freight.
 *  TODO: needs menu enumeration · ask พี่เดฟ for the full Export ops tree. */
const menuFreightExportManager: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Export",
    items: [
      // TODO: needs menu enumeration · doc says [Full Export Operations Access]
      { labelKey: "freightExportOps.placeholder", href: "/admin/forwarders?segment=freight-export", icon: "Truck" },
      { labelKey: "manageCustomers.freightAll", href: "/admin/customers?segment=freight", icon: "Users" },
      { labelKey: "accFreight.title",           href: "/admin/accounting/freight",        icon: "Landmark" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #19 — CS / Doc Export (lines 634-644). Doc shows `[Export CS
 *  Operations]` placeholder · no items enumerated.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightExportCs: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Export",
    items: [
      // TODO: needs menu enumeration · doc says [Export CS Operations]
      { labelKey: "freightExportOps.csPlaceholder", href: "/admin/forwarders?segment=freight-export&role=cs", icon: "Truck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #20 — Shipping Doc Export (lines 648-658). Doc shows `[Export
 *  Shipping Document Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightExportDoc: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Export",
    items: [
      // TODO: needs menu enumeration · doc says [Export Shipping Document Operations]
      { labelKey: "freightExportOps.docPlaceholder", href: "/admin/forwarders?segment=freight-export&role=doc", icon: "FileText" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #21 — Shipping Clearance (Export) (lines 662-672). Doc shows
 *  `[Export Clearance Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightExportClearance: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Export",
    items: [
      // TODO: needs menu enumeration · doc says [Export Clearance Operations]
      { labelKey: "freightExportOps.clearancePlaceholder", href: "/admin/forwarders?segment=freight-export&role=clearance", icon: "ClipboardCheck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #22 — Shipping Clearance (Import & Export) (lines 676-686). Doc
 *  shows section header "Freight" + `[Both Import & Export Clearance Access]`
 *  placeholder. Single PHP file shared between dept=2 sec=7 and dept=3 sec=13.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightClearanceBoth: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight",
    items: [
      // TODO: needs menu enumeration · doc says [Both Import & Export Clearance Access]
      { labelKey: "freightClearance.bothPlaceholder", href: "/admin/forwarders?segment=freight", icon: "ClipboardCheck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #23 — Messenger (Export Dept) (lines 690-700). Doc shows
 *  `[Messenger/Delivery Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightExportMessenger: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Export",
    items: [
      // TODO: needs menu enumeration · doc says [Messenger/Delivery Operations]
      { labelKey: "freightMessenger.exportPlaceholder", href: "/admin/forwarders?segment=freight-export&role=messenger", icon: "Truck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #24 — Import Manager (lines 704-716). Doc lists section header
 *  "Freight - Import" + `[Full Import Operations Access]` + จัดการลูกค้า
 *  Freight + รายงานรับรู้รายได้ Freight.
 *  TODO: needs menu enumeration · ask พี่เดฟ for the full Import ops tree. */
const menuFreightImportManager: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Import",
    items: [
      // TODO: needs menu enumeration · doc says [Full Import Operations Access]
      { labelKey: "freightImportOps.placeholder", href: "/admin/forwarders?segment=freight-import", icon: "Truck" },
      { labelKey: "manageCustomers.freightAll", href: "/admin/customers?segment=freight", icon: "Users" },
      { labelKey: "accFreight.title",           href: "/admin/accounting/freight",        icon: "Landmark" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #25 — CS & Doc Import (lines 720-730). Doc shows `[Import CS
 *  Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightImportCs: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Import",
    items: [
      // TODO: needs menu enumeration · doc says [Import CS Operations]
      { labelKey: "freightImportOps.csPlaceholder", href: "/admin/forwarders?segment=freight-import&role=cs", icon: "Truck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #26 — Shipping Doc Import (lines 734-744). Doc shows `[Import
 *  Shipping Document Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightImportDoc: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Import",
    items: [
      // TODO: needs menu enumeration · doc says [Import Shipping Document Operations]
      { labelKey: "freightImportOps.docPlaceholder", href: "/admin/forwarders?segment=freight-import&role=doc", icon: "FileText" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #27 — Shipping Clearance (Import) (lines 748-758). Doc shows
 *  `[Import Clearance Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightImportClearance: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Import",
    items: [
      // TODO: needs menu enumeration · doc says [Import Clearance Operations]
      { labelKey: "freightImportOps.clearancePlaceholder", href: "/admin/forwarders?segment=freight-import&role=clearance", icon: "ClipboardCheck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #28 — Messenger (Import Dept) (lines 762-772). Doc shows
 *  `[Messenger/Delivery Operations]` placeholder.
 *  TODO: needs menu enumeration · ask พี่เดฟ. */
const menuFreightImportMessenger: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Import",
    items: [
      // TODO: needs menu enumeration · doc says [Messenger/Delivery Operations]
      { labelKey: "freightMessenger.importPlaceholder", href: "/admin/forwarders?segment=freight-import&role=messenger", icon: "Truck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/**
 * `interpreter` — ล่ามจีน (V-H1 commission portal). Minimal: their
 * commission history + the shared learning/extension sections.
 */
const menuInterpreter: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    // Section header standardised to "Cargo & Freight" everywhere
    // (2026-05-20 ค่ำ ภูม merge — Pacred = 1 company).
    header: "Cargo & Freight",
    items: [
      // Phase 2 — interpreter commissions sales-only side not yet live.
      { labelKey: "interpreter.commissions", href: "/admin/commissions", icon: "BadgePercent", badge: "interpreterPayout", phase: 2 },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

const ROLE_MENUS: Record<AdminRole, MenuSection[]> = {
  super:       menuSuper,
  ops:         menuOps,
  accounting:  menuAccounting,
  sales_admin: menuSalesAdmin,
  sales:       menuSales,
  qa:          menuQa,
  warehouse:   menuWarehouse,
  driver:      menuDriver,
  interpreter: menuInterpreter,
  // Freight roles (#16-28) — STUB menus per Agent ZZ 2026-05-20 ค่ำ.
  // Each is a faithful placeholder of the legacy doc's section header +
  // the few items the doc concretely names. Deeper item trees are TODO
  // (the legacy doc shows "[Full ... Access]" placeholders only). DO NOT
  // guess items here — see TODO comments on each menu definition.
  freight_sales_manager:    menuFreightSalesManager,
  freight_sales:            menuFreightSales,
  freight_export_manager:   menuFreightExportManager,
  freight_export_cs:        menuFreightExportCs,
  freight_export_doc:       menuFreightExportDoc,
  freight_export_clearance: menuFreightExportClearance,
  freight_clearance_both:   menuFreightClearanceBoth,
  freight_export_messenger: menuFreightExportMessenger,
  freight_import_manager:   menuFreightImportManager,
  freight_import_cs:        menuFreightImportCs,
  freight_import_doc:       menuFreightImportDoc,
  freight_import_clearance: menuFreightImportClearance,
  freight_import_messenger: menuFreightImportMessenger,
};

/**
 * Returns the purpose-built menu for an admin's role set, faithful to the
 * legacy per-role PHP menu files.
 *
 * Legacy gives each admin EXACTLY ONE menu (the company/department/section
 * triple is single-valued). Pacred admins can hold multiple roles. Rule:
 *  - `super` present       → the full CEO menu (super outranks all).
 *  - otherwise              → the menu of the *highest-privilege* role held,
 *                             by the fixed precedence below. This keeps each
 *                             staffer on a single coherent legacy tree
 *                             rather than a merged Frankenstein menu.
 *
 * 2026-05-20 ค่ำ (Agent ZZ): precedence extended to cover the 13 Freight
 * roles + `sales` Staff + `qa`. Manager-tier roles rank above Staff-tier
 * within the same dept (mirrors legacy approval-rights inheritance).
 * Cargo roles outrank Freight roles ONLY because Cargo is the launched
 * revenue path; this is a Pacred-internal tie-breaker, not a legacy rule.
 */
const ROLE_PRECEDENCE: AdminRole[] = [
  "super",
  "accounting",
  "qa",                          // QA outranks ops (audit reach)
  "ops",
  "sales_admin",                 // Cargo Sales Manager (#29) — has approval
  "sales",                       // Cargo Sales Staff   (#30) — no approval
  "warehouse",
  "driver",
  "interpreter",
  // Freight Mgrs first, then Staff in dept order (Sales → Export → Import).
  "freight_sales_manager",
  "freight_sales",
  "freight_export_manager",
  "freight_export_cs",
  "freight_export_doc",
  "freight_export_clearance",
  "freight_clearance_both",
  "freight_export_messenger",
  "freight_import_manager",
  "freight_import_cs",
  "freight_import_doc",
  "freight_import_clearance",
  "freight_import_messenger",
];

export function menuForRoles(roles: AdminRole[]): MenuSection[] {
  if (roles.includes("super")) return ROLE_MENUS.super;
  for (const r of ROLE_PRECEDENCE) {
    if (roles.includes(r)) return ROLE_MENUS[r];
  }
  // No recognised role — empty menu (the layout guard already 404s
  // non-admins, so this is just a defensive fallback).
  return [];
}

/** The role whose menu is being shown — for the sidebar role badge. */
export function primaryRole(roles: AdminRole[]): AdminRole | null {
  if (roles.includes("super")) return "super";
  for (const r of ROLE_PRECEDENCE) {
    if (roles.includes(r)) return r;
  }
  return null;
}

/** Every badge key referenced anywhere in the menus — used to size the
 *  batched count query (compute only what a menu can show). */
export const ALL_BADGE_KEYS: BadgeKey[] = [
  "walletTopup", "walletWithdraw", "walletAll", "shopPending", "shopAwaitPay",
  "shopOrdered", "shopNote", "forwarderArrived", "forwarderDelivery",
  "forwarderCredit", "forwarderNote", "forwarderWhError", "driverItems",
  "yuanPending", "cntDrawMoney", "shopPayout", "salesPayout",
  "interpreterPayout", "withdrawalAll", "customerPending", "corporatePending",
  "contactMessages", "refundsPending", "bookingsPending", "incidents",
];
