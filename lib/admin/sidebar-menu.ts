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
  | "shopWalletPayout"   // tb_shop_transactions kind=withdraw status=pending — เบิกกระเป๋าร้าน (G7)
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
// Menu item shape. Mirrors a legacy `<li class="nav-item">`.
//  - `badge`    → live-count pill key (legacy badgeMenu($count))
//  - `children` → nested accordion (legacy `<ul class="menu-content">`)
//  - `icon`     → lucide icon name (resolved in the component)
//  - `labelKey` → i18n key under the `pcsAdminNav` namespace
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

/** legacy OOP/Cargo/menu-wallet.php — กระเป๋าสตางค์ */
const blockWallet: MenuItem = {
  labelKey: "wallet.title",
  icon: "Wallet",
  badge: "walletAll",
  children: [
    { labelKey: "wallet.all",      href: "/admin/wallet",           icon: "Wallet" },
    { labelKey: "wallet.payUser",  href: "/admin/wallet/pay-user",  icon: "HandCoins" },
    { labelKey: "wallet.history",  href: "/admin/wallet/history",   icon: "History" },
    { labelKey: "wallet.withdraw", href: "/admin/wallet?kind=withdraw&status=pending", icon: "ArrowRightLeft", badge: "walletWithdraw" },
    { labelKey: "wallet.deposit",  href: "/admin/wallet?kind=deposit&status=pending",  icon: "BadgeCheck",     badge: "walletTopup" },
    { labelKey: "wallet.add",      href: "/admin/wallet/add",       icon: "Plus" },
  ],
};

/** legacy OOP/Cargo/menu-purchasing.php — บริการฝากสั่งสินค้า */
const blockPurchasing: MenuItem = {
  labelKey: "purchasing.title",
  icon: "ShoppingCart",
  badge: "shopPending",
  children: [
    { labelKey: "purchasing.search",   href: "/admin/service-orders",        icon: "Search" },
    { labelKey: "purchasing.all",      href: "/admin/service-orders",        icon: "Layers" },
    { labelKey: "purchasing.pending",  href: "/admin/service-orders?q=1",    icon: "Clock", badge: "shopPending" },
    { labelKey: "purchasing.cart",     href: "/admin/service-orders/cart",   icon: "ShoppingCart" },
    { labelKey: "purchasing.cartAdd",  href: "/admin/service-orders/cart/add", icon: "Plus" },
    { labelKey: "purchasing.note",     href: "/admin/service-orders?q=note", icon: "MessageSquare", badge: "shopNote" },
  ],
};

/** legacy OOP/Cargo/menu-barcode.php — สแกนบาร์โค้ด (nested) */
const blockBarcode: MenuItem = {
  labelKey: "barcode.title",
  icon: "Barcode",
  children: [
    {
      labelKey: "barcode.searchImport",
      icon: "Search",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode?mode=scan-all",   icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode?mode=camera-all", icon: "Camera" },
      ],
    },
    { labelKey: "barcode.recordIntake", href: "/admin/barcode?mode=intake", icon: "PackageCheck" },
    {
      labelKey: "barcode.searchPrepare",
      icon: "Package",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode?mode=scan-prepare",   icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode?mode=camera-prepare", icon: "Camera" },
      ],
    },
    {
      labelKey: "barcode.scanFromBox",
      icon: "Printer",
      children: [
        { labelKey: "barcode.byScanner", href: "/admin/barcode?mode=scan-box",   icon: "ScanLine" },
        { labelKey: "barcode.byCamera",  href: "/admin/barcode?mode=camera-box", icon: "Camera" },
      ],
    },
  ],
};

/** legacy OOP/Cargo/menu-forwarder.php — บริการฝากนำเข้า */
const blockForwarder: MenuItem = {
  labelKey: "forwarder.title",
  icon: "Package",
  badge: "forwarderArrived",
  children: [
    { labelKey: "forwarder.search",      href: "/admin/forwarders",             icon: "Search" },
    { labelKey: "forwarder.searchMulti", href: "/admin/forwarders/bulk-search", icon: "Search" },
    {
      labelKey: "forwarder.list",
      icon: "Package",
      badge: "forwarderDelivery",
      children: [
        { labelKey: "forwarder.listAll",     href: "/admin/forwarders",      icon: "Package" },
        { labelKey: "forwarder.listPrepare", href: "/admin/forwarders?q=6",  icon: "Truck",  badge: "forwarderDelivery" },
        { labelKey: "forwarder.listCredit",  href: "/admin/forwarders?q=c",  icon: "Package", badge: "forwarderCredit" },
        { labelKey: "forwarder.listAdd",     href: "/admin/forwarders/new",  icon: "PackagePlus" },
      ],
    },
    { labelKey: "forwarder.note",          href: "/admin/forwarders?q=note",               icon: "MessageSquare", badge: "forwarderNote" },
    { labelKey: "forwarder.checkCntCost",  href: "/admin/forwarders/container-cost-check", icon: "Calculator" },
    { labelKey: "forwarder.momoLclSack",   href: "/admin/momo-lcl",                        icon: "Barcode" },
    { labelKey: "forwarder.cntReport",     href: "/admin/containers",                      icon: "Truck" },
    { labelKey: "forwarder.whHistory",     href: "/admin/forwarders/warehouse-history",    icon: "PackageCheck", badge: "forwarderWhError" },
    { labelKey: "forwarder.assignDriver",  href: "/admin/drivers",                         icon: "Truck", badge: "driverItems" },
    { labelKey: "forwarder.combineBill",   href: "/admin/forwarders/combine-bill",         icon: "Printer" },
    blockBarcode,
  ],
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

/** legacy OOP/Cargo/menu-report.php — ออกรายงาน */
const blockReport: MenuItem = {
  labelKey: "report.title",
  icon: "BarChart3",
  children: [
    { labelKey: "report.shop",      href: "/admin/reports/monthly-orders",  icon: "BarChart3" },
    { labelKey: "report.forwarder", href: "/admin/reports/forwarder-volume", icon: "Package" },
    { labelKey: "report.payment",   href: "/admin/reports",                 icon: "Wallet" },
    { labelKey: "report.salesRep",  href: "/admin/reports/sales-by-rep",    icon: "BarChart3" },
    { labelKey: "report.allUser",   href: "/admin/reports/user-sales-history", icon: "BarChart3" },
    { labelKey: "report.byCode",    href: "/admin/reports/hs-code-revenue", icon: "BarChart3" },
    { labelKey: "report.driver",    href: "/admin/driver-runs",             icon: "Truck" },
    { labelKey: "report.web",       href: "/admin/kpi",                     icon: "Activity" },
  ],
};

/** legacy OOP/Cargo/menu-acc.php — รายงานรับรู้รายได้ Cargo */
const blockAccCargo: MenuItem = {
  labelKey: "accCargo.title",
  href: "/admin/accounting",
  icon: "Landmark",
  children: [
    { labelKey: "accCargo.inOut",     href: "/admin/accounting",                  icon: "BarChart3" },
    { labelKey: "accCargo.topup",     href: "/admin/wallet?kind=deposit&status=pending", icon: "BarChart3" },
    { labelKey: "accCargo.shop",      href: "/admin/reports/monthly-orders",      icon: "BarChart3" },
    {
      labelKey: "accCargo.forwarder",
      icon: "BarChart3",
      children: [
        { labelKey: "accCargo.invoice", href: "/admin/freight/declarations", icon: "Printer" },
        { labelKey: "accCargo.receipt", href: "/admin/tax-invoices",         icon: "Printer" },
        { labelKey: "accCargo.total",   href: "/admin/reports/forwarder-volume", icon: "BarChart3" },
      ],
    },
    { labelKey: "accCargo.payment",   href: "/admin/yuan-payments",               icon: "BarChart3" },
    { labelKey: "accCargo.containerPay", href: "/admin/accounting/container-payments", icon: "Receipt" },
    { labelKey: "accCargo.withdraw",  href: "/admin/wallet?kind=withdraw&status=pending", icon: "BarChart3" },
    { labelKey: "accCargo.refund",    href: "/admin/refunds",                     icon: "BarChart3", badge: "refundsPending" },
  ],
};

/** legacy OOP/Cargo/menu-settings.php — ตั้งค่าระบบ Cargo */
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
  ],
};

/** legacy OOP/Cargo/menu-user.php — สมาชิก (Cargo customer list block) */
const blockUserCargo: MenuItem = {
  labelKey: "userCargo.title",
  icon: "Users",
  badge: "corporatePending",
  children: [
    { labelKey: "userCargo.search",     href: "/admin/customers?focus=search", icon: "Search" },
    { labelKey: "userCargo.all",        href: "/admin/customers",              icon: "Users" },
    { labelKey: "userCargo.general",    href: "/admin/customers?group=general", icon: "User" },
    { labelKey: "userCargo.vip",        href: "/admin/customers?group=vip",   icon: "User" },
    { labelKey: "userCargo.svip",       href: "/admin/customers?group=svip",  icon: "User" },
    { labelKey: "userCargo.corporate",  href: "/admin/customers?group=corporate", icon: "Building2", badge: "corporatePending" },
    { labelKey: "userCargo.credit",     href: "/admin/customers?group=credit", icon: "User" },
    { labelKey: "userCargo.comparison", href: "/admin/customers?group=comparison", icon: "User" },
  ],
};

/** legacy OOP/Cargo/menu-QAAndQC.php — 11 SLA-breach queues */
const blockQA: MenuItem = {
  labelKey: "qa.title",
  icon: "ShieldAlert",
  children: [
    { labelKey: "qa.payShopOver1d",      href: "/admin/reports/pending-payments?sla=shop-1d",     icon: "AlertTriangle" },
    { labelKey: "qa.payFwdOver2d",       href: "/admin/reports/pending-payments?sla=forwarder-2d", icon: "AlertTriangle" },
    { labelKey: "qa.orderCancelled",     href: "/admin/reports/monthly-orders?sla=cancelled",     icon: "AlertTriangle" },
    { labelKey: "qa.creditOverdue",      href: "/admin/reports/credit-pending?sla=overdue",       icon: "AlertTriangle" },
    { labelKey: "qa.orderOver10min",     href: "/admin/reports/monthly-orders?sla=pending-10min", icon: "AlertTriangle" },
    { labelKey: "qa.chnShopOver2d",      href: "/admin/reports/monthly-orders?sla=chn-dispatch-2d", icon: "AlertTriangle" },
    { labelKey: "qa.chnWhOver2d",        href: "/admin/reports/containers-awaiting-th?sla=chn-wh-2d", icon: "AlertTriangle" },
    { labelKey: "qa.transitOverdue",     href: "/admin/reports/containers-awaiting-th?sla=transit", icon: "AlertTriangle" },
    { labelKey: "qa.ownerlessGoods",     href: "/admin/forwarders?q=ownerless",                   icon: "AlertTriangle" },
    { labelKey: "qa.prepareOverdue",     href: "/admin/forwarders?q=prepare-overdue",             icon: "AlertTriangle" },
    { labelKey: "qa.newClientNoContact", href: "/admin/customers/recently-active?sla=no-contact-2d", icon: "AlertTriangle" },
    { labelKey: "qa.transferSalesRep",   href: "/admin/customers/transfer-rep",                   icon: "ArrowRightLeft" },
  ],
};

/** legacy OOP/CargoAndFreight/menu-hr-manage-human-resource.php */
const blockHrHumanResource: MenuItem = {
  labelKey: "hr.title",
  icon: "Building2",
  children: [
    { labelKey: "hr.orgChartImage", href: "/admin/hr/org-chart",   icon: "Network" },
    { labelKey: "hr.orgChartTable", href: "/admin/hr/org-table",   icon: "ListOrdered" },
    {
      labelKey: "hr.recruitment",
      icon: "UserPlus",
      children: [
        { labelKey: "hr.recruitPost",       href: "/admin/hr/recruitment/new", icon: "UserPlus" },
        { labelKey: "hr.recruitApplicants", href: "/admin/hr/recruitment",     icon: "Users" },
      ],
    },
    {
      labelKey: "hr.people",
      icon: "Users",
      children: [
        { labelKey: "hr.peopleAll",     href: "/admin/hr/employees",          icon: "Users" },
        { labelKey: "hr.peopleAudit",   href: "/admin/hr/audit",              icon: "ClipboardCheck" },
        { labelKey: "hr.peoplePolicies", href: "/admin/hr/policies",          icon: "FileText" },
      ],
    },
    {
      labelKey: "hr.attendance",
      icon: "CalendarClock",
      children: [
        { labelKey: "hr.attendanceBoard",  href: "/admin/hr/attendance",        icon: "CalendarClock" },
        { labelKey: "hr.attendanceLeaves", href: "/admin/hr/attendance/leaves", icon: "CalendarClock" },
        { labelKey: "hr.training",         href: "/admin/hr/training",          icon: "GraduationCap" },
      ],
    },
  ],
};

/** legacy OOP/CargoAndFreight/menu-hr-manage-corporate-assets.php */
const blockHrCorporateAssets: MenuItem = {
  labelKey: "assets.title",
  icon: "Boxes",
  children: [
    { labelKey: "assets.maintenance", href: "/admin/inventory?tab=maintenance", icon: "Wrench" },
    { labelKey: "assets.purchasing",  href: "/admin/inventory?tab=purchasing",  icon: "ShoppingBag" },
    { labelKey: "assets.stock",       href: "/admin/inventory",                 icon: "Boxes" },
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
        { labelKey: "withdrawal.shopWallet",  href: "/admin/shop-payouts",                   icon: "Wallet", badge: "shopWalletPayout" },
        { labelKey: "withdrawal.cntCost",     href: "/admin/accounting/disbursements?kind=container_lease", icon: "Truck", badge: "cntDrawMoney" },
        { labelKey: "withdrawal.thaiFreight", href: "/admin/accounting/disbursements?kind=trucking", icon: "Truck" },
        { labelKey: "withdrawal.agentCustomer", href: "/admin/reports/user-sales-history",   icon: "Users" },
        { labelKey: "withdrawal.salesBonus",  href: "/admin/sales-payouts",                  icon: "BadgePercent", badge: "salesPayout" },
        { labelKey: "withdrawal.interpreterBonus", href: "/admin/commissions",               icon: "BadgePercent", badge: "interpreterPayout" },
        { labelKey: "withdrawal.driver",      href: "/admin/driver-runs",                    icon: "Truck" },
      ],
    },
    { labelKey: "withdrawal.freight", href: "/admin/forwarder-sales", icon: "Banknote" },
  ],
};

/** legacy OOP/CargoAndFreight/menu-user.php — จัดการลูกค้า (Cargo+Freight) */
const blockUserCargoAndFreight: MenuItem = {
  labelKey: "manageCustomers.title",
  icon: "Users",
  badge: "corporatePending",
  children: [
    { ...blockUserCargo, labelKey: "manageCustomers.cargo" },
    {
      labelKey: "manageCustomers.freight",
      icon: "Users",
      children: [
        { labelKey: "manageCustomers.freightAll", href: "/admin/customers?segment=freight", icon: "Users" },
      ],
    },
  ],
};

/** legacy OOP/Freight/menu-acc.php — ระบบบัญชี Freight */
const blockAccFreight: MenuItem = {
  labelKey: "accFreight.title",
  icon: "Landmark",
  children: [
    { labelKey: "accFreight.ledger",   href: "/admin/accounting/reconcile", icon: "BarChart3" },
    {
      labelKey: "accFreight.income",
      icon: "BarChart3",
      children: [
        { labelKey: "accFreight.quotation", href: "/admin/freight/quotes",       icon: "Receipt", badge: "bookingsPending" },
        { labelKey: "accFreight.invoice",   href: "/admin/freight/shipments",    icon: "Receipt" },
        { labelKey: "accFreight.receipt",   href: "/admin/tax-invoices",         icon: "Receipt" },
        { labelKey: "accFreight.wht",       href: "/admin/accounting/closing",   icon: "Receipt" },
        { labelKey: "accFreight.overview",  href: "/admin/reports",              icon: "BarChart3" },
      ],
    },
    { labelKey: "accFreight.declarations", href: "/admin/freight/declarations", icon: "ClipboardCheck" },
  ],
};

// ── Learning section blocks — legacy OOP/Learning/* ──────────────
const blockLearningRegulations: MenuItem = {
  labelKey: "learning.regulations", href: "/admin/learning?topic=regulations", icon: "ScrollText",
};
const blockLearningTraining: MenuItem = {
  labelKey: "learning.training",
  icon: "GraduationCap",
  children: [
    { labelKey: "learning.businessPlan", href: "/admin/learning?topic=business-plan", icon: "FileText" },
    { labelKey: "learning.culture",      href: "/admin/learning?topic=culture",       icon: "FileText" },
    { labelKey: "learning.jobFlow",      href: "/admin/learning?topic=job-flow",      icon: "FileText" },
  ],
};
const blockLearningNewsfeed: MenuItem = {
  labelKey: "learning.newsfeed", href: "/admin/learning?topic=newsfeed", icon: "Newspaper",
};
const blockLearningTos: MenuItem = {
  labelKey: "learning.tos", href: "/admin/settings/tos-versions", icon: "FileText",
};

// ── Extension section blocks — legacy OOP/Extension/* ────────────
const blockExtJuristic: MenuItem = {
  labelKey: "extension.juristicCheck", href: "/admin/juristic-check", icon: "ClipboardCheck",
};
const blockExtThaiTransport: MenuItem = {
  labelKey: "extension.thaiTransport", href: "/admin/carriers", icon: "Truck",
};
const blockExtMeetingRoom: MenuItem = {
  labelKey: "extension.meetingRoom", href: "/admin/hr/attendance?tab=meeting-room", icon: "CalendarCheck",
};
const blockExtHistory: MenuItem = {
  labelKey: "extension.history", href: "/admin/audit", icon: "Save",
};
const blockExtIncidents: MenuItem = {
  labelKey: "extension.incidents", href: "/admin/incidents", icon: "AlertTriangle", badge: "incidents",
};

// ── Dashboard item — legacy 3-way All/Freight/Cargo switch ───────
const itemDashboard: MenuItem = {
  labelKey: "dashboard.title",
  href: "/admin",
  icon: "LayoutDashboard",
  children: [
    { labelKey: "dashboard.all",     href: "/admin?c=all",     icon: "LayoutDashboard" },
    { labelKey: "dashboard.freight", href: "/admin?c=freight", icon: "LayoutDashboard" },
    { labelKey: "dashboard.cargo",   href: "/admin?c=cargo",   icon: "LayoutDashboard" },
  ],
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
    header: "Cargo & Freight",
    items: [
      { labelKey: "hrGroup.title", icon: "UserCheck", children: [blockHrHumanResource, blockHrCorporateAssets] },
      { ...blockQA, labelKey: "qa.titleGroup" },
      blockUserCargoAndFreight,
      blockWithdrawalList,
    ],
  },
  { header: "Freight", items: [blockAccFreight] },
  {
    header: "Cargo",
    items: [blockWallet, blockPurchasing, blockForwarder, blockPayment, blockReport, blockAccCargo],
  },
  { header: "Settings", items: [blockSettingsCargo] },
  learningSection,
  extensionSection([blockExtJuristic, blockExtThaiTransport, blockExtMeetingRoom, blockExtHistory, blockExtIncidents]),
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
  { header: "Cargo & Freight", items: [{ ...blockQA, labelKey: "qa.titleGroup" }] },
  {
    header: "Cargo",
    items: [
      { labelKey: "userCargo.searchTop", href: "/admin/customers?focus=search", icon: "Search" },
      blockWallet,
      blockPurchasing,
      blockForwarder,
      blockPayment,
      { labelKey: "report.titleDriver", href: "/admin/driver-runs", icon: "BarChart3" },
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
  { header: "Cargo & Freight", items: [blockWithdrawalList] },
  { header: "Freight", items: [blockAccFreight] },
  {
    header: "Cargo",
    items: [blockWallet, blockPayment, blockReport, blockAccCargo],
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
          { labelKey: "userCargo.pending",    href: "/admin/customers/pending",     icon: "Clock", badge: "customerPending" },
          { labelKey: "userCargo.vip",        href: "/admin/customers?group=vip",   icon: "User" },
          { labelKey: "userCargo.corporate",  href: "/admin/customers?group=corporate", icon: "Building2", badge: "corporatePending" },
          { labelKey: "userCargo.recentlyActive", href: "/admin/customers/recently-active", icon: "Activity" },
          { labelKey: "userCargo.transferRep", href: "/admin/customers/transfer-rep", icon: "ArrowRightLeft" },
          { labelKey: "userCargo.teamLeaders", href: "/admin/team-leaders",         icon: "Coins" },
        ],
      },
      {
        labelKey: "withdrawal.titleSales",
        icon: "Banknote",
        badge: "salesPayout",
        children: [
          { labelKey: "withdrawal.salesBonus",   href: "/admin/sales-payouts",     icon: "BadgePercent", badge: "salesPayout" },
          { labelKey: "withdrawal.forwarderComm", href: "/admin/forwarder-sales",  icon: "Receipt" },
        ],
      },
    ],
  },
  {
    header: "Cargo",
    items: [
      blockWallet,
      blockPurchasing,
      { ...blockReport, labelKey: "report.titleSales" },
      { labelKey: "broadcasts.title", href: "/admin/broadcasts", icon: "BellRing" },
      { labelKey: "bookings.title",   href: "/admin/bookings",   icon: "CalendarCheck", badge: "bookingsPending" },
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
    header: "Cargo",
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
          { labelKey: "forwarder.assignDriver", href: "/admin/drivers",                     icon: "Truck", badge: "driverItems" },
          { labelKey: "forwarder.combineBill", href: "/admin/forwarders/combine-bill",      icon: "Printer" },
        ],
      },
      { labelKey: "warehouse.containers", href: "/admin/warehouse/containers", icon: "Package" },
      { labelKey: "warehouse.bulletin",   href: "/admin/warehouse/bulletin",   icon: "ClipboardCheck" },
      { labelKey: "warehouse.qaInspect",  href: "/admin/warehouse/qa-inspections", icon: "ShieldAlert" },
      blockBarcode,
    ],
  },
  learningSection,
  extensionSection([blockExtThaiTransport, blockExtIncidents]),
];

/**
 * `driver` — Cargo Driver (legacy Cargo/Warehouse/Driver.php).
 * The shortest menu — just the driver's own delivery jobs.
 */
const menuDriver: MenuSection[] = [
  { header: "", items: [{ labelKey: "dashboard.title", href: "/admin", icon: "LayoutDashboard" }] },
  {
    header: "Cargo",
    items: [
      { labelKey: "driver.toDeliver", href: "/admin/driver-runs",        icon: "Truck", badge: "driverItems" },
      { labelKey: "driver.history",   href: "/admin/driver-runs?tab=history", icon: "Truck" },
      { labelKey: "driver.barcode",   href: "/admin/barcode/driver",     icon: "Barcode" },
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
    header: "Cargo",
    items: [
      { labelKey: "interpreter.commissions", href: "/admin/commissions", icon: "BadgePercent", badge: "interpreterPayout" },
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
  warehouse:   menuWarehouse,
  driver:      menuDriver,
  interpreter: menuInterpreter,
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
 */
const ROLE_PRECEDENCE: AdminRole[] = [
  "super", "accounting", "ops", "sales_admin", "warehouse", "driver", "interpreter",
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
