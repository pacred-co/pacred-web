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
 *
 * ─────────────────────────────────────────────────────────────────
 * G4 — per-role sidebar filter layer (Wave 26 · 2026-05-28 ดึก)
 * ─────────────────────────────────────────────────────────────────
 * Per `docs/research/legacy-deep-dive/_SYNTHESIS.md` §3 G4 + ภูม decision
 * #5 ("sidebar รก · fix per-role filter ก่อนเปิดได้เลย"), this module
 * carries the canonical per-role menus consumed by the admin sidebar
 * (`components/sections/admin-sidebar.tsx`).
 *
 * Filtering happens in TWO layers (legacy-faithful + Pacred-pragmatic):
 *  1. Per-role assembly (THIS file): `menuForRoles()` picks ONE
 *     purpose-built menu by precedence — `super` → `manager` →
 *     `accounting` → `qa` → `ops` → `sales_admin` → `sales` →
 *     `warehouse` → `driver` → `interpreter` → freight_* roles.
 *     Each menu is hand-assembled in §"PER-ROLE MENUS" below.
 *  2. Phase gating (admin-sidebar.tsx · `filterByPhase`): leaves
 *     tagged `phase: 2/3/4` are hidden from everyone except `super`.
 *     Allows soft-launching post-MVP features (QA queues · marketing ·
 *     extensions) to super-only while role menus stay stable.
 *
 * `menuForRolesUnion()` is the Pacred-only multi-role escape hatch:
 *  - Default behaviour (`menuForRoles`) = legacy-faithful single-menu pick.
 *  - Union behaviour = a staffer with e.g. `['warehouse', 'driver']`
 *    sees the dedup'd join of both menus (each section's items merged
 *    by `labelKey`). Use ONLY for the rare admin holding >1 role.
 *
 * `super` users get a "show all" escape hatch in the sidebar UI that
 * forces them onto `menuSuper` regardless of which role's view they
 * have currently selected (component-level toggle · state below).
 *
 * Per-role spec (ภูม brief §4 + synthesis §3 G4):
 *  - super:        ALL (CEO sidebar · full toolbox)
 *  - manager:      super minus HR-only + billing config + admin grants
 *  - accounting:   wallet · yuan · reports · accounting · disbursements
 *  - warehouse:    forwarders (?q=3) · forwarder-action · cnt-hs · driver
 *  - driver:       drivers/work · barcode scanner (mobile-first)
 *  - sales_admin:  customers · forwarders (?q=1) · reports · transfer-rep
 *  - sales:        same as sales_admin minus approval rights
 *  - interpreter:  service-orders · cart · cnt-hs initiate · customers
 *  - qa:           the 11 QA follow-up queues + customer search
 *  - ops:          generic catch-all (forwarders · customers · reports)
 *  - freight_*:    Freight-only items (NO cargo items mixed in)
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

/** Cache tag for the admin sidebar badge counts (see
 *  `actions/admin/sidebar-counts.ts`). Lives here, not in the
 *  `"use server"` action file — that file may only export async functions.
 *  Call `revalidateTag(ADMIN_SIDEBAR_COUNTS_TAG)` from any Server Action
 *  that changes a queue depth to refresh the badges before the 60 s TTL. */
export const ADMIN_SIDEBAR_COUNTS_TAG = "admin-sidebar-counts";

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

/** Flat top-level shortcut to the most-used barcode screen — บันทึกสินค้า
 *  เข้าโกดัง (USB scanner intake = legacy `barcode-d-import.php` =
 *  `/admin/barcode/driver/import`).
 *
 *  2026-05-30 (Wave 29 #5 · Agent A): ภูม flagged that the import-intake
 *  page (warehouse staff's daily-most-used scanner) was buried 2 levels
 *  deep inside `blockBarcode > "บันทึกเข้าโกดังไทย" > "by scanner"`.
 *  Legacy `include/pages/left-menu/OOP/Cargo/menu-barcode.php` puts the
 *  same destination at TOP-LEVEL flat (line 10 of that file) for the
 *  warehouse / driver / cs / CEO role sidebars. We promote it here as a
 *  shared peer of `warehouse.containers` in `menuWarehouse`/`menuDriver`/
 *  `menuSuper`. The deeper `blockBarcode` toolbox stays — this is just
 *  the one-click shortcut for the high-traffic action. */
const itemBarcodeRecordIntakeFlat: MenuItem = {
  labelKey: "barcode.recordIntakeFlat",
  href: "/admin/barcode/driver/import",
  icon: "ScanLine",
};

/** 2026-06-09 (W10 · Theme 7 Phase 1) — China-warehouse worker-app block.
 *  The scanner-first ops app over the cargo spine (tb_forwarder /
 *  tb_forwarder_item / warehouse_sack): receive → measure → sack → load →
 *  depart → arrive → follow. Reference:
 *  docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md.
 *  Reachable for super/warehouse/ops/manager (the actions themselves
 *  re-gate every fstatus flip via the G5 transition matrix). 🔒 WHO holds
 *  the warehouse role = China-team RBAC sign-off (owner-blocked); the menu +
 *  pages ship built and role-gated. */
const blockWarehouseWorker: MenuItem = {
  labelKey: "warehouseWorker.title",
  icon: "Boxes",
  children: [
    { labelKey: "warehouseWorker.dashboard", href: "/admin/warehouse/worker",          icon: "LayoutDashboard" },
    { labelKey: "warehouseWorker.intake",    href: "/admin/warehouse/worker/intake",   icon: "ScanLine" },
    { labelKey: "warehouseWorker.measure",   href: "/admin/warehouse/worker/measure",  icon: "Calculator" },
    { labelKey: "warehouseWorker.sacks",     href: "/admin/warehouse/worker/sacks",    icon: "Boxes" },
    { labelKey: "warehouseWorker.shipping",  href: "/admin/warehouse/worker/shipping", icon: "Truck" },
    { labelKey: "warehouseWorker.follow",    href: "/admin/warehouse/worker/follow",   icon: "PackageCheck" },
  ],
};

/** legacy OOP/Cargo/menu-barcode.php — สแกนบาร์โค้ด (nested)
 *
 *  2026-05-20 ค่ำ (Wave 2D · Option A) — Phase 4 tags removed; barcode is
 *  Phase 1 because it's the faithful port of legacy daily-use scanners
 *  (`barcode-c-*.php` + `barcode-d-*.php`). Each item below was a `?mode=…`
 *  placeholder; now points at the real routes built by Wave 2B agents.
 *  Driver leaves = USB handheld scanner UI; Cargo leaves = mobile camera UI.
 *
 *  TODO Wave 30: rename axis — legacy uses camera (mobile) vs USB scanner
 *  (device), NOT cargo vs driver. Per Agent A audit 2026-05-30 (Wave 29 #5
 *  Pacred barcode sidebar fix). The current `cargo/*` + `driver/*` route
 *  segments are misleading: legacy `barcode-c-*.php` (mobile camera) and
 *  `barcode-d-*.php` (USB device scanner) split by INPUT DEVICE, not by
 *  business role. ~4 hr refactor with redirect stubs for the 8 routes
 *  + 16 navigation references (sidebar · forwarders top-menubar · etc.). */
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
    // Wave 29 #215 (2026-05-30): flattened per legacy menu-barcode.php L10
    // ("บันทึกสินค้าเข้าโกดัง" is a FLAT single link in legacy — no scanner/
    // camera split). The camera variant `/admin/barcode/cargo/import` is
    // still reachable via the "ค้นหารายการฝากนำเข้า → ด้วยกล้อง" parent
    // group (Pacred maps that to the same scan-handler); legacy doesn't
    // expose it twice in the menu either.
    {
      labelKey: "barcode.recordIntake",   // บันทึกสินค้าเข้าโกดัง (type=4)
      href: "/admin/barcode/driver/import",
      icon: "PackageCheck",
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

/** 2026-06-08 (เดฟ · freight revenue unlock) — the inbound Freight RFQ
 *  leads-inbox (/admin/freight/leads). The public /freight-quote wizard writes
 *  RFQ leads to the singular `freight_quote` table; this is the staff surface
 *  that views/triages/converts them (was orphaned — only a CRM head-count proxy
 *  read them). Single leaf · sales-funnel ownership (super/ops/sales_admin +
 *  freight sales). Phase 1 — the page + actions gate RBAC themselves. */
const itemFreightLeads: MenuItem = {
  labelKey: "accFreight.leads",
  href: "/admin/freight/leads",
  icon: "Inbox",
};

/** 2026-06-09 (เดฟ · freight net-margin unlock) — the China-side freight COST
 *  table maintenance (/admin/freight/rates → migration 0145 `tb_freight_rate`).
 *  The rate engine (lib/freight/rate-engine.ts + lib/freight/rate-lookup.ts)
 *  reads this admin-maintained cost so EXW/CFR quotes show TRUE net margin
 *  instead of only "กำไรขั้นต้น" (gross). The table was empty on prod because
 *  there was no write-path — this leaf + actions/admin/freight-rates.ts is it.
 *  Single leaf · super/ops write · accounting read (the page + actions gate
 *  RBAC themselves; the table RLS mirrors super/ops write, super/ops/accounting
 *  read). */
const itemFreightCostRates: MenuItem = {
  labelKey: "accFreight.costRates",
  href: "/admin/freight/rates",
  icon: "HandCoins",
};

/** 2026-06-09 (เดฟ · tax-invoice P3) — the CARGO ใบขนรวม (consolidated customs
 *  declaration) Docs surface. A cargo import (ฝากสั่งซื้อ / ฝากนำเข้า) is a
 *  Freight-LCL job where Pacred issues ONE ใบขนรวม under the shipping-company
 *  name; this surface lists cargo declarations + arrived-in-TH forwarders that
 *  need one, and lets the Docs role review/adjust the per-line มูลค่าสำแดง
 *  (defaults from cost · mig 0158/0161/0162). Reuses the same customs_declarations
 *  model as Freight. Single leaf · super/accounting/freight_import_doc(Docs)/
 *  pricing — the page + actions gate RBAC themselves. P3 = capture/surface only
 *  (no issuance / money / comms). */
const itemCargoDeclarations: MenuItem = {
  labelKey: "accFreight.cargoDeclarations",
  href: "/admin/accounting/cargo-declarations",
  icon: "ClipboardList",
};

/** 2026-06-09 (W4 · freight ops cockpit) — the AX-JOB unified
 *  PRICING→SALES→DOC→ACC Kanban board (/admin/freight/operations). A
 *  read-mostly layer over the existing freight spine (freight_shipments);
 *  manages per-stage status + section assignment + checklist + an operator
 *  P&L snapshot. The page + actions gate RBAC themselves (super + freight
 *  section roles + ops/accounting/sales_admin/pricing). NO money mutation. */
const itemFreightOperations: MenuItem = {
  labelKey: "freightOps.title",
  href: "/admin/freight/operations",
  icon: "Kanban",
};

/** 2026-06-09 (W6 · freight commission ledger) — the FREIGHT staff-commission
 *  accrual + withdrawal queue (/admin/commission/freight · migration 0167). 💰
 *  Ships DORMANT behind business_config commission.freight_enabled (default OFF)
 *  — while OFF the page shows a "รอ owner ยืนยัน rate + เปิดใช้" banner + accrual
 *  no-ops. Surfaces the commission ledger + the approval/pay queue + the seeded
 *  rate tiers (PENDING owner confirm). The page + actions gate RBAC themselves
 *  (super/accounting/sales_admin + the freight roles); the PAID flip is super-only.
 *  phase: 2 → super sees it in the sidebar; accounting reaches it here + the page
 *  gates the full role set. */
const itemFreightCommission: MenuItem = {
  labelKey: "freightCommission.title",
  href: "/admin/commission/freight",
  icon: "BadgePercent",
  phase: 2,
};

/** 2026-06-09 (W9 · tax-invoice P4) — the CARGO tax-doc 4-role WORKSPACE
 *  (/admin/pricing/taxdoc-workspace). Carries the THREE numbers
 *  (SELLING ≠ COST ≠ DECLARED) through the FOUR roles (CS → Pricing → Docs →
 *  Account) over the tb_cargo_taxdoc_job spine (mig 0161). Read + advance
 *  workflow only — NO money / issuance / comms. Account stage gated on
 *  CS + Pricing done. The page + actions gate RBAC themselves
 *  (super + sales/pricing/freight_import_doc/accounting/ops). */
const itemTaxdocWorkspace: MenuItem = {
  labelKey: "taxdocWorkspace.title",
  href: "/admin/pricing/taxdoc-workspace",
  icon: "ReceiptText",
};

/** 2026-06-09 (W11 · customs doc-kit) — the customs-brokerage document toolkit
 *  (/admin/accounting/customs-doc-kit). DOC-GENERATION + advisory only:
 *  DO-release LOI per carrier (ZIM/RCL/COSCO/HEDE/FUJIT/UPS/...) + ZIM Split-DO
 *  + the customs-letter kit (45-day waiver · POA · amend · lost-doc) →
 *  stateless PDF generator · Form-E/ACFTA eligibility (advisory) · HS-code
 *  AI-assist (stub unless endpoint set). 🔒 NETBAY e-filing HARD-BLOCKED (no
 *  creds) — manual filing until then. NO money / NO auto-filing. The page +
 *  actions gate RBAC themselves (super/accounting/freight_*_doc/pricing). */
const itemCustomsDocKit: MenuItem = {
  labelKey: "customsDocKit.title",
  href: "/admin/accounting/customs-doc-kit",
  icon: "FileSignature",
};

/** legacy pcs-admin menu L162-167 — "อัปเดตฝากนำเข้า" (top-level group)
 *  Combines BOTH Wave 17 P1 streams into the single legacy parent:
 *   - P1-1+2 — MOMO + CargoCenter (manualUpdate sub-page only · Phase B
 *     scope; dashboard/updateAPI/APICheckSM/hisAutomation deferred Phase C
 *     pending upstream token + retry design)
 *   - P1-3..6 — "ปรับรายการ Sheet" sub-group holding the 4 per-carrier
 *     manual-entry forms (CTT/Sang/MK/MX). Despite the legacy filename
 *     pattern these are NOT Google-Sheets API consumers — they are manual
 *     forwarder-entry forms (one per warehouse code 1..4). All 4 share
 *     one client component (CarrierManualForm) parameterised via
 *     lib/carrier/registry.ts.
 */
const blockApiForwarderUpdate: MenuItem = {
  labelKey: "apiForwarderUpdate.title",
  icon: "Wand2",
  children: [
    { labelKey: "apiForwarderUpdate.momo", href: "/admin/api-forwarder-momo", icon: "Truck" },
    { labelKey: "apiForwarderUpdate.cn",   href: "/admin/api-forwarder-cn",   icon: "Truck" },
    // 2026-05-25 (Wave 18-A · orphan wiring) — surface MOMO LCL sack tracking
    // (Gap #6) and CargoThai PO sync (Gap #4) under the legacy "อัปเดตฝากนำเข้า"
    // parent. Both pages existed since dave-pacred merge but had no sidebar
    // entry — staff could only reach them by URL typing. i18n keys
    // `forwarder.momoLclSack` + `forwarder.cargothaiSync` already live in both
    // messages files; we reference them here.
    { labelKey: "forwarder.momoLclSack",   href: "/admin/momo-lcl",  icon: "Barcode" },
    { labelKey: "forwarder.cargothaiSync", href: "/admin/cargothai", icon: "RefreshCw" },
    {
      labelKey: "apiSheets.adjustGroup",
      icon: "SlidersHorizontal",
      children: [
        { labelKey: "apiSheets.ctt",  href: "/admin/api-sheets-ctt",  icon: "Package" },
        { labelKey: "apiSheets.sang", href: "/admin/api-sheets-sang", icon: "Package" },
        { labelKey: "apiSheets.mk",   href: "/admin/api-sheets-mk",   icon: "Package" },
        { labelKey: "apiSheets.mx",   href: "/admin/api-sheets-mx",   icon: "Package" },
      ],
    },
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
// Wave 28 (2026-05-29 · ภูม flagged fix): landing changed from /cargo → root
// /admin/accounting hub so staff sees the full top-menubar (รายรับ/รายจ่าย/
// ผู้ติดต่อ/การเงิน/การบัญชี dropdowns) + the card grid. Invoice navigation
// flows through the menubar "รายรับ → ใบแจ้งหนี้ → ฝากนำเข้า แบบเรทราคา /
// ฝากนำเข้า แบบรายการ" leaves — wired to /admin/accounting/forwarder-invoice
// in accounting-menubar.ts (Wave 28 leaf-href fix).
const blockAccounting: MenuItem = {
  labelKey: "accounting.title",
  href: "/admin/accounting",
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
    { labelKey: "settingsCargo.promos",    href: "/admin/settings/promos",           icon: "Megaphone" },
    {
      labelKey: "settingsCargo.rates",
      icon: "SlidersHorizontal",
      children: [
        { labelKey: "settingsCargo.rateGeneral", href: "/admin/rates/general", icon: "Users" },
        // rateVip removed 2026-06-01 (Wave-A §0e) — it pointed at /admin/rates/vip which
        // wrote the DEAD rebuilt `rate_vip`; the live VIP-group editor is rateCustomUser
        // below (→ tb_rate_vip_*). /admin/rates/vip now redirects there.
        { labelKey: "settingsCargo.rateCustomUser", href: "/admin/rates/custom-user", icon: "Users" },
        { labelKey: "settingsCargo.rateCustomHs",   href: "/admin/rates/custom-hs",   icon: "Users" },
      ],
    },
    // 2026-06-05 (LANE C) — repointed from the /admin/settings/business-config
    // placeholder to the faithful VIP-tier CRUD page (port of legacy
    // settings-vip.php → tb_co + auto-seeded tb_rate_vip_kg/cbm).
    { labelKey: "settingsCargo.vipTiers",  href: "/admin/settings/vip-tiers",        icon: "Users" },
    {
      labelKey: "settingsCargo.system",
      icon: "Activity",
      children: [
        { labelKey: "settingsCargo.crons",        href: "/admin/system/crons",         icon: "Clock" },
        { labelKey: "settingsCargo.systemNotifs", href: "/admin/system/notifications", icon: "BellRing" },
        // 2026-06-04 (reachability audit §0d) — notification DISPATCH monitor
        // (failed/pending pushes + one-click retry · companion to systemNotifs
        // above). Was orphan (no inbound link · URL-only). Page gates super/ops.
        { labelKey: "settingsCargo.notifyDispatch", href: "/admin/notifications/dispatch", icon: "Send" },
        { labelKey: "settingsCargo.pcsSync",      href: "/admin/system/pcs-sync",      icon: "Database" },
        // 2026-06-04 (reachability audit §0d) — PCS→Pacred customer migration
        // (one-shot launch-week backfill tool · super-only). Was orphan
        // (no inbound link · URL-only).
        { labelKey: "settingsCargo.pcsCustomerMigration", href: "/admin/migration/pcs-customers", icon: "DatabaseZap" },
        { labelKey: "settingsCargo.csvImports",   href: "/admin/csv-imports",          icon: "Upload" },
      ],
    },
    {
      labelKey: "settingsCargo.tools",
      icon: "Wrench",
      children: [
        // 2026-06-04 (reachability audit §0d) — global admin search (U4-1 ·
        // member_code/f_no/h_no/job_no/invoice_no across all entities). Was
        // orphan (no inbound link · URL-only). Page gates super/ops/accounting/
        // sales_admin — placed under super's Settings→tools toolbox.
        { labelKey: "settingsCargo.globalSearch", href: "/admin/search",                icon: "Search" },
        // 2026-06-09 (goldmine activation) — China product-category / search-demand
        // lookup over tb_api_china_hs (~77k rows: keyword + 1688/taobao/tmall links
        // + resolved category names). Was a pure dead table — nothing read it.
        // READ-ONLY reference tool. Page gates super/ops/sales_admin/sales.
        { labelKey: "settingsCargo.chinaCategory", href: "/admin/tools/china-category", icon: "Boxes" },
        { labelKey: "settingsCargo.orgEmail",    href: "/admin/organization-email",    icon: "MessageCircle" },
        { labelKey: "settingsCargo.orgChannels", href: "/admin/organization-channels", icon: "Smartphone" },
        // 2026-06-04 (reachability audit §0d) — org_contacts CRUD (V-G5 · feeds
        // the public /contact page). Was orphan (no inbound link · URL-only ·
        // only referenced in code comments). Same org-config family as orgEmail
        // / orgChannels above. Page gates super/accounting/sales_admin.
        { labelKey: "settingsCargo.orgContacts", href: "/admin/settings/contacts",     icon: "Contact" },
        { labelKey: "settingsCargo.adminUsers",  href: "/admin/admins",                icon: "UserCog" },
        { labelKey: "settingsCargo.partners",    href: "/admin/partners",              icon: "Handshake" },
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
 *  The 11 SLA-breach sub-queues live in the page top-menubar on /admin/qa
 *  for non-QA roles. QA role itself sees the expanded `blockQAQueues`
 *  parent below (Wave 26 · 2026-05-28 ดึก).
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

/** Wave 26 (2026-05-28 ดึก) — ตรวจสอบคุณภาพ (QA) parent block for the QA
 *  role's sidebar. Lists the 11 SLA-breach queues that legacy `QAAndQC.php`
 *  enumerated (`Your Work Cargo` section L17-83). Source: `docs/research/
 *  legacy-deep-dive/04-staff-workflow-by-role.md` §2.3.
 *
 *  Non-QA roles continue to see only the `itemQAAll` single leaf —
 *  the 11 queues surface via the page top-menubar on /admin/qa.
 *  This keeps Pacred-is-one-company sidebar slim for everyone except
 *  the role that actually lives in these queues all day. */
const blockQAQueues: MenuItem = {
  labelKey: "qa.queuesTitle",
  icon: "ShieldAlert",
  children: [
    { labelKey: "qa.queues.payShopOver1d",      href: "/admin/qa/pay-shop-over-1d",      icon: "Clock" },
    { labelKey: "qa.queues.payFwdOver2d",       href: "/admin/qa/pay-fwd-over-2d",       icon: "Clock" },
    { labelKey: "qa.queues.orderCancellations", href: "/admin/qa/order-cancellations",   icon: "Ban" },
    { labelKey: "qa.queues.creditOverdue",      href: "/admin/qa/credit-overdue",        icon: "AlertCircle" },
    { labelKey: "qa.queues.orderOver10min",     href: "/admin/qa/order-over-10min",      icon: "AlertCircle" },
    { labelKey: "qa.queues.chnShopOver2d",      href: "/admin/qa/chn-shop-over-2d",      icon: "AlertCircle" },
    { labelKey: "qa.queues.chnWhOver2d",        href: "/admin/qa/chn-wh-over-2d",        icon: "AlertCircle" },
    { labelKey: "qa.queues.transitOverdue",     href: "/admin/qa/transit-overdue",       icon: "AlertCircle" },
    { labelKey: "qa.queues.ownerlessGoods",     href: "/admin/qa/ownerless-goods",       icon: "AlertCircle" },
    { labelKey: "qa.queues.prepareOverdue",     href: "/admin/qa/prepare-overdue",       icon: "AlertCircle" },
    { labelKey: "qa.queues.newClientNoContact", href: "/admin/qa/new-client-no-contact", icon: "AlertCircle" },
  ],
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
// 2026-05-30 (เดฟ · owner directive) — demoted phase 4 → phase 1 (launch-critical).
// Legacy `users/corporation` (juristic review) was reachable by CEO/Manager/QA/
// Accounting/ITDT — i.e. the customer-facing ops roles, not super-only. There are
// real pending juristic customers in prod awaiting approval, so the staff who do
// the review (ops/accounting/sales/manager — the roles whose Extension block carries
// this item) must see the menu. No `phase` tag = phase 1 = visible to all admin staff.
const blockExtJuristic: MenuItem = {
  labelKey: "extension.juristicCheck", href: "/admin/juristic-check", icon: "ClipboardCheck",
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
// 2026-06-01 (เดฟ · Wave C BI) — the exec cockpit (แดชบอร์ดผู้บริหาร · MTD
// revenue/profit · orders funnel · wallet total · AR · cold-leads · top
// carriers/warehouses — all reading LIVE tb_*). A leadership at-a-glance
// dashboard, so it lives in the Extension drawer next to the KPI dashboard
// (same exec-analytics family). phase: 2 → super sees it in the sidebar; the
// finance roles (accounting/manager) also reach it + the AR-aging report via
// the reports-hub "BI / ผู้บริหาร" menubar group. The page gates RBAC to
// super/accounting itself.
const blockExtCockpit: MenuItem = {
  labelKey: "extension.cockpit", href: "/admin/reports/cockpit", icon: "Gauge", phase: 2,
};
// 2026-06-09 (เดฟ · marketing/CRM North-Star) — lead-source attribution
// dashboard (แหล่งที่มาของลูกค้า · which acquisition channel drives leads →
// orders → revenue, all from LIVE tb_users.userregisterwith/userrecom ⨝
// tb_forwarder). The data was captured but no page surfaced it → marketing
// was blind. Lives in the Extension drawer next to the exec cockpit (same
// exec/marketing-analytics family). phase: 2 → super sees it in the sidebar;
// finance roles also reach it via the reports-hub "BI / ผู้บริหาร" menubar.
// The page gates RBAC to super/accounting itself.
const blockExtLeadSource: MenuItem = {
  labelKey: "extension.leadSource", href: "/admin/reports/lead-source", icon: "Megaphone", phase: 2,
};
const blockExtContactMessages: MenuItem = {
  labelKey: "extension.contactMessages", href: "/admin/contact-messages",
  icon: "MessageSquare", badge: "contactMessages", phase: 2,
};
// 2026-06-01 (เดฟ · CEO opening-day §6) — the acquisition CALL-QUEUE. Sales+CS
// work this list top-down to phone the 6,936 never-activated cold leads
// (tb_users.userActive='') + the big-PCS owners. It's the revenue-now surface
// the CEO asked to "START NOW", so phase 1 (visible to all admin staff — the
// /admin/leads action itself gates RBAC to super/sales/ops). Lives in the
// Extension "customer comms / CRM" family next to contactMessages.
const blockExtLeads: MenuItem = {
  labelKey: "extension.leads", href: "/admin/leads", icon: "PhoneCall",
};
// 2026-05-31 sitting-H-fix #5 (ภูม): blockExtTaxInvoices DELETED. ใบกำกับภาษี
// ขาย belongs in the accounting headmenu "รายรับ" (PEAK structure · per
// `lib/admin/accounting-menubar.ts`), not in the sidebar Extension drawer.
// The page itself (/admin/tax-invoices) is unchanged + reachable via the
// menubar + the accounting dashboard Stat-card link.
// 2026-06-01 (เดฟ · P1 ต่อยอด) — LINE inbox / CRM dashboard. Reads ปอน's
// Cloudflare-Worker-captured LINE OA data (Podeng_customers_line +
// Podeng_line_messages). A monitoring/CRM surface, so it lives in the
// Extension drawer next to contactMessages (the website lead funnel) — same
// "customer comms" family. phase: 2 → super-only for now, matching the rest of
// the comms/CRM extensions until the broader launch.
const blockExtLineInbox: MenuItem = {
  labelKey: "extension.lineInbox", href: "/admin/line-inbox", icon: "MessageCircle", phase: 2,
};
// 2026-06-01 (เดฟ · CEO opening-day · CRM core) — the omni-inbox + customer-360 +
// sales-rep routing hub ("ลูกค้าคนนี้ เซลไหนดูแล"). The CEO's scale-blocker #1.
// Reads ปอน's LINE data (Podeng_*) + tb_users/tb_wallet/tb_forwarder/lead_call_log;
// the ONE write is tb_users.adminIDSale (rep routing). Lives in the Extension
// "customer comms / CRM" family next to leads + lineInbox. phase 1 so all admin
// staff can reach it — actions/admin/crm.ts gates RBAC (super/manager/sales/ops).
const blockExtCrm: MenuItem = {
  labelKey: "extension.crm", href: "/admin/crm", icon: "MessageSquare",
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
      // 2026-06-08 (เดฟ · freight revenue unlock) — inbound Freight RFQ inbox.
      itemFreightLeads,
      // 2026-06-09 (W4 · freight ops cockpit) — AX-JOB PRICING→SALES→DOC→ACC board.
      itemFreightOperations,
      // 2026-06-09 (เดฟ · freight net-margin unlock) — China freight cost rates.
      itemFreightCostRates,
      // 2026-06-09 (เดฟ · tax-invoice P3) — CARGO ใบขนรวม (consolidated customs decl).
      itemCargoDeclarations,
<<<<<<< HEAD
      // 2026-06-09 (W6 · freight commission ledger) — accrual + withdrawal queue
      // (DORMANT behind commission.freight_enabled).
      itemFreightCommission,
      // 2026-06-09 (W9 · tax-invoice P4) — CARGO tax-doc 4-role workspace (3 numbers).
      itemTaxdocWorkspace,
      // 2026-06-09 (W11 · customs doc-kit) — DO-LOI/Form-E/HS-assist toolkit.
      itemCustomsDocKit,
      blockApiForwarderUpdate,
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
      // 2026-05-30 (Wave 29 #5 · Agent A) — promote the daily-most-used
      // barcode screen (USB scanner intake = `barcode-d-import.php`) to
      // top-level flat, matching legacy menu-barcode.php line 10. The
      // deeper blockBarcode toolbox stays as the comprehensive nested menu.
      itemBarcodeRecordIntakeFlat,
      // 2026-06-09 (W10 · Theme 7 P1) — China-warehouse worker app (super peek).
      blockWarehouseWorker,
      // re-sweep A2 #8/#17 — print all box labels for a scanned cabinet
      // (faithful port of legacy `printAll.php`).
      { labelKey: "warehouse.printLabels", href: "/admin/printAll", icon: "Printer" },
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
    blockExtCockpit,
    blockExtLeadSource,
    blockExtWorkboard,
    blockExtInbox,
    blockExtLeads,
    blockExtCrm,
    blockExtContactMessages,
    blockExtLineInbox,
    blockExtBroadcasts,
    // 2026-05-31 sitting-H-fix #5 (ภูม): blockExtTaxInvoices removed from
    // the sidebar Extension section. PEAK structure places ใบกำกับภาษีขาย
    // under "รายรับ" headmenu (CARGO_MENUBAR · accounting-menubar.ts) — the
    // sidebar entry was a parallel orphan. The page itself
    // (/admin/tax-invoices) stays live and reachable via the menubar +
    // /admin/accounting accounting-dashboard Stat-card link.
    blockExtWithdrawalsAll,
    blockExtJuristic,
    blockExtThaiTransport,
    blockExtMeetingRoom,
    blockExtHistory,
    blockExtIncidents,
  ]),
];

/**
 * `manager` — Cargo Manager (Wave 26 · 2026-05-28 ดึก · synthesis §6 D6).
 *
 * Per ภูม decision: Manager has cnt-payment approval + cross-team supervision
 * + full operational reach across Cargo & Freight ops. Manager does NOT see:
 *  - HR block (admin hire/fire / org chart / corporate assets) — `blockHr`
 *  - Settings section (rates / business-config / admins / system / tools) —
 *    `blockSettingsCargo`. This is where billing config + admin role grants
 *    live; only `super` configures the system.
 *
 * Everything else mirrors `menuSuper` — same operational queues, same
 * extension toolbox (Phase 2/3/4 items still hidden by `filterByPhase`
 * unless manager is also super, which the precedence rules out).
 */
const menuManager: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Cargo & Freight",
    items: [
      // NOTE: `blockHr` intentionally dropped — manager doesn't own HR.
      itemQAAll,
      { labelKey: "warehouse.qaInspect", href: "/admin/warehouse/qa-inspections", icon: "ClipboardCheck" },
      itemCustomersAll,
      blockWithdrawalList,
      itemWalletAll,
      itemPurchasingAll,
      blockForwarderImport,
      // 2026-06-08 (เดฟ · freight revenue unlock) — inbound Freight RFQ inbox.
      itemFreightLeads,
      // 2026-06-09 (W4 · freight ops cockpit) — AX-JOB PRICING→SALES→DOC→ACC board.
      itemFreightOperations,
      // 2026-06-09 (W6 · freight commission ledger · DORMANT).
      itemFreightCommission,
      blockApiForwarderUpdate,
      { labelKey: "forwarder.assignDriver", href: "/admin/drivers", icon: "Truck", badge: "driverItems" },
      { labelKey: "forwarder.driverWork", href: "/admin/drivers/work", icon: "Smartphone" },
      // 2026-05-30 (Wave 29 #5 · Agent A) — flat barcode-intake shortcut.
      // Matches the menuSuper / menuWarehouse / menuDriver placement.
      itemBarcodeRecordIntakeFlat,
      // 2026-06-09 (W10 · Theme 7 P1) — China-warehouse worker app.
      blockWarehouseWorker,
      // re-sweep A2 #8/#17 — print all box labels for a scanned cabinet
      // (faithful port of legacy `printAll.php`).
      { labelKey: "warehouse.printLabels", href: "/admin/printAll", icon: "Printer" },
      blockPayment,
      itemReportsAll,
      blockAccounting,
    ],
  },
  // NOTE: Settings section intentionally dropped — manager doesn't configure
  // rates / billing / role grants. Use super for those.
  learningSection,
  extensionSection([
    blockExtKpi,
    blockExtCockpit,
    blockExtLeadSource,
    blockExtWorkboard,
    blockExtInbox,
    blockExtLeads,
    blockExtCrm,
    blockExtContactMessages,
    blockExtLineInbox,
    blockExtBroadcasts,
    // 2026-05-31 sitting-H-fix #5 (ภูม): blockExtTaxInvoices removed from
    // the sidebar Extension section. PEAK structure places ใบกำกับภาษีขาย
    // under "รายรับ" headmenu (CARGO_MENUBAR · accounting-menubar.ts) — the
    // sidebar entry was a parallel orphan. The page itself
    // (/admin/tax-invoices) stays live and reachable via the menubar +
    // /admin/accounting accounting-dashboard Stat-card link.
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
      // 2026-06-08 (เดฟ · freight revenue unlock) — inbound Freight RFQ inbox.
      itemFreightLeads,
      // 2026-06-09 (W4 · freight ops cockpit) — AX-JOB PRICING→SALES→DOC→ACC board.
      itemFreightOperations,
      // 2026-06-09 (เดฟ · freight net-margin unlock) — China freight cost rates.
      itemFreightCostRates,
      blockApiForwarderUpdate,
      // 2026-06-09 (W10 · Theme 7 P1) — China-warehouse worker app (ops oversee).
      blockWarehouseWorker,
      blockPayment,
      // Phase 2 — driver-runs sales-only side not yet live.
      { labelKey: "report.titleDriver", href: "/admin/driver-runs", icon: "BarChart3", phase: 2 },
    ],
  },
  learningSection,
  extensionSection([blockExtLeads, blockExtCrm, blockExtJuristic, blockExtThaiTransport, blockExtIncidents]),
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
    items: [
      blockWithdrawalList,
      itemWalletAll,
      blockPayment,
      itemReportsAll,
      blockAccounting,
      // 2026-06-09 (เดฟ · freight net-margin unlock) — accounting has read access
      // to the China freight cost rates (RLS: super/ops/accounting read · the page
      // disables write controls for non-super/ops roles).
      itemFreightCostRates,
      // 2026-06-09 (เดฟ · tax-invoice P3) — CARGO ใบขนรวม (accounting reviews the
      // declared/duty/VAT before PEAK + ใบกำกับ issuance).
      itemCargoDeclarations,
<<<<<<< HEAD
      // 2026-06-09 (W9 · tax-invoice P4) — accounting owns the ACCOUNT (close-out)
      // stage of the CARGO tax-doc 4-role workspace (PEAK + ใบกำกับ readiness).
      itemTaxdocWorkspace,
      // 2026-06-09 (W11 · customs doc-kit) — accounting/Docs generate DO-LOI +
      // customs letters + Form-E/HS advisory.
      itemCustomsDocKit,
      // 2026-06-09 (W4 · freight ops cockpit) — accounting owns the ACC stage
      // (P&L close) on the AX-JOB board.
      itemFreightOperations,
      // 2026-06-09 (W6 · freight commission ledger) — accounting approves/pays the
      // commission withdrawals (DORMANT behind commission.freight_enabled).
      itemFreightCommission,
    ],
  },
  { header: "Settings", items: [blockSettingsCargo] },
  learningSection,
  // 2026-06-01 (เดฟ · Wave C BI) — accounting gets the exec cockpit (finance
  // headline: MTD revenue/profit · AR · wallet liability). phase:2 in-sidebar.
  extensionSection([blockExtCockpit, blockExtLeadSource, blockExtJuristic, blockExtIncidents]),
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
          // Wave 28 (2026-05-29 · ภูม flagged): phase:2 demoted — now launch-critical.
          // E2E loop step 2 = sales picks up new customer · ALL admin roles must see this.
          { labelKey: "userCargo.pending",    href: "/admin/customers/pending",     icon: "Clock", badge: "customerPending" },
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
      // 2026-06-09 (W9 · tax-invoice P4) — CS owns the CS (selling) stage of
      // the CARGO tax-doc 4-role workspace (choose doc-mode · confirm selling).
      itemTaxdocWorkspace,
      // Phase 2 — Marketing/broadcasts/bookings post-launch features per 2026-05-20 brief.
      { labelKey: "broadcasts.title", href: "/admin/broadcasts", icon: "BellRing",      phase: 2 },
      { labelKey: "bookings.title",   href: "/admin/bookings",   icon: "CalendarCheck", badge: "bookingsPending", phase: 2 },
    ],
  },
  learningSection,
  // 2026-06-01 (CEO §6) — sales reps live in the acquisition call-queue.
  extensionSection([blockExtLeads, blockExtCrm, blockExtJuristic, blockExtIncidents]),
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
          // 2026-06-03 (ภูม flag · R-2 close-out): รวมบิลสินค้า + ใบวางบิล ย้ายไป
          // "ระบบบัญชี → รายรับ" topmenubar (CARGO_MENUBAR · accounting-menubar.ts).
          // ตาม PEAK pattern · ภูม flag screenshot 2026-06-03. The leaves are
          // surfaced via /admin/accounting topmenu + quick-access cards now.
          // The /admin/forwarders/combine-bill route itself stays live (just
          // not in this sidebar block) — accessed via accounting hub instead.
          // 2026-06-02 (poom-wave §6 · ภูม) — TH-transport batch reader (296
          // legacy batches · 643 forwarders) · MVP read-only · brief §6.
          { labelKey: "forwarder.tranTh",      href: "/admin/forwarders/tran-th",          icon: "Truck" },
        ],
      },
      blockApiForwarderUpdate,
      // 2026-06-09 (W10 · Theme 7 P1) — China-warehouse worker app. THE
      // daily ops tool for warehouse staff (receive/measure/sack/load/track).
      blockWarehouseWorker,
      // Option C (ภูม 2026-05-20 ค่ำ) — point at the faithful port of legacy
      // `report-cnt.php`. Spine page at `/admin/warehouse/containers` retired
      // (tombstoned · redirects to /admin/report-cnt).
      { labelKey: "warehouse.containers", href: "/admin/report-cnt", icon: "Package" },
      // re-sweep A2 #8/#17 — warehouse "scan a cabinet → print all box labels"
      // (faithful port of legacy `printAll.php` box-label modes). The guide
      // page accepts `?cabinet=` so report-cnt can deep-link to it per row.
      { labelKey: "warehouse.printLabels", href: "/admin/printAll", icon: "Printer" },
      // 2026-05-30 (Wave 29 #5 · Agent A) — flat barcode-intake shortcut.
      // The warehouse role uses this daily (legacy `barcode-d-import.php`).
      // The deeper blockBarcode toolbox below also keeps it, two levels in;
      // this is the one-click promotion to match legacy menu-barcode.php L10.
      itemBarcodeRecordIntakeFlat,
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
      // 2026-06-08 (ภูม warehouse-handoff round 2): removed the two
      // `driver.toDeliver` + `driver.history` leaves that pointed at
      // `/admin/driver-runs`. That page still reads the rebuilt-empty
      // `forwarder_driver` table (0 rows on prod) instead of the live
      // `tb_forwarder_driver_item` (29,782 rows), so drivers would land
      // there and see "no work" forever. `/admin/drivers/work` already
      // implements the same workflow correctly (filters by member_code
      // → tb_forwarder_driver.fdadminid → tb_forwarder_driver_item) and
      // includes a "done" tab covering history. Keeping the broken URL
      // accessible (Phase gate also un-blocked round 2) for the sales/
      // accounting disbursement view via menuSales — they read its
      // disbursement menubar — but drivers no longer have a leaf that
      // sends them there.
      // 2026-05-30 (Wave 29 #5 · Agent A) — flat barcode-intake shortcut.
      // The driver role scans intake daily (legacy `barcode-d-import.php`).
      // Replaces the prior `driver.barcode` leaf which pointed at the orphan
      // `/admin/barcode/driver` hub page (deleted in this commit · was reading
      // the abandoned `forwarders` rebuilt table).
      itemBarcodeRecordIntakeFlat,
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
      // QA hub (11 SLA-breach queues live in this page's top-menubar) —
      // un-phase-gated for the `qa` role specifically. `itemQAAll` keeps
      // `phase: 2` for non-QA roles via the menu file precedence.
      { labelKey: "qa.title", href: "/admin/qa", icon: "ShieldAlert" },
      // Wave 26 (2026-05-28 ดึก) — expanded 11-queue parent for QA staff.
      // Legacy `QAAndQC.php` `Your Work Cargo` section. Each leaf is a
      // dedicated `/admin/qa/<slug>` page with SLA filter pre-applied.
      blockQAQueues,
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
      // 2026-06-08 (เดฟ · freight revenue unlock) — inbound RFQ leads inbox is
      // the freight sales team's primary acquisition surface.
      itemFreightLeads,
      itemFreightOperations,
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
      // 2026-06-08 (เดฟ · freight revenue unlock) — inbound RFQ leads inbox.
      itemFreightLeads,
      itemFreightOperations,
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
      itemFreightOperations,
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
      itemFreightOperations,
      // TODO: needs menu enumeration · doc says [Export CS Operations]
      { labelKey: "freightExportOps.csPlaceholder", href: "/admin/forwarders?segment=freight-export&role=cs", icon: "Truck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #20 — Shipping Doc Export (lines 648-658).
 *
 * Phase 2 ops-workflow audit unlock (2026-06-05 · `docs/research/ops-workflow-audit-2026-06-05.md` §28):
 * The Doc role's tools were already BUILT (customs-declaration CRUD + PDF · tax-invoice ·
 * receipts · billing-run · freight-invoice PDFs) but locked behind super/accounting.
 * Wired here as a Doc-specific sidebar so a `freight_export_doc` user can reach
 * the doc-issuance workspace in ≤3 clicks (AGENTS.md §0d reachability rule).
 *
 * Customer search leaf is intentional — Doc needs to look up a customer to
 * locate which freight shipment / cabinet a declaration belongs to.
 */
const menuFreightExportDoc: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Export",
    items: [
      // W4 — the ops cockpit (DOC is a core stage owner).
      itemFreightOperations,
      // Primary workspace — customs declarations (V-E11 · ใบขนสินค้า).
      { labelKey: "accFreight.declarations", href: "/admin/freight/declarations", icon: "ClipboardCheck" },
      // 2026-06-09 (W11 · customs doc-kit) — DO-LOI per carrier + customs letters
      // + Form-E/HS advisory (Docs role owns issuance of these draft documents).
      itemCustomsDocKit,
      // Freight shipments — Doc pivots from a shipment to create its declaration.
      { labelKey: "freightExportOps.placeholder", href: "/admin/freight/shipments", icon: "Truck" },
      // Customer lookup — find the shipment owner / cabinet context.
      { labelKey: "userCargo.searchTop", href: "/admin/customers?focus=search", icon: "Search" },
      // Tax documents — issuance is part of Doc workflow.
      { labelKey: "extension.taxInvoices", href: "/admin/tax-invoices", icon: "FileText" },
      // Receipts (ใบเสร็จ) explorer — Doc references after payment.
      { labelKey: "accounting.forwarderInvoice", href: "/admin/accounting/receipts", icon: "Receipt" },
      // Billing run (ใบวางบิล) — Doc creates the bill doc; mark-paid stays accounting-only.
      { labelKey: "forwarder.billingRun", href: "/admin/billing-run", icon: "Banknote" },
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
      itemFreightOperations,
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
      itemFreightOperations,
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
      itemFreightOperations,
      // TODO: needs menu enumeration · doc says [Import CS Operations]
      { labelKey: "freightImportOps.csPlaceholder", href: "/admin/forwarders?segment=freight-import&role=cs", icon: "Truck" },
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

/** Doc role #26 — Shipping Doc Import (lines 734-744).
 *
 * Phase 2 ops-workflow audit unlock (2026-06-05 · `docs/research/ops-workflow-audit-2026-06-05.md` §28).
 * Mirror of `menuFreightExportDoc` — same tools, import-side framing. The
 * underlying admin surfaces are shared (customs declarations · tax-invoice ·
 * receipts · billing-run) — both Doc roles see the same canonical lists.
 */
const menuFreightImportDoc: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Freight - Import",
    items: [
      // W4 — the ops cockpit (DOC is a core stage owner).
      itemFreightOperations,
      // Primary workspace — customs declarations (V-E11 · ใบขนสินค้า).
      { labelKey: "accFreight.declarations", href: "/admin/freight/declarations", icon: "ClipboardCheck" },
      // 2026-06-09 (เดฟ · tax-invoice P3) — CARGO ใบขนรวม (the Docs role owns
      // the consolidated cargo declaration + per-line มูลค่าสำแดง).
      itemCargoDeclarations,
<<<<<<< HEAD
      // 2026-06-09 (W9 · tax-invoice P4) — Docs owns the DOCS (declared/ใบขน)
      // stage of the CARGO tax-doc 4-role workspace.
      itemTaxdocWorkspace,
      // 2026-06-09 (W11 · customs doc-kit) — DO-LOI per carrier + customs letters
      // + Form-E/HS advisory (Docs role generates these draft documents).
      itemCustomsDocKit,
      // Freight shipments — Doc pivots from a shipment to create its declaration.
      { labelKey: "freightImportOps.placeholder", href: "/admin/freight/shipments", icon: "Truck" },
      // Customer lookup — find the shipment owner / cabinet context.
      { labelKey: "userCargo.searchTop", href: "/admin/customers?focus=search", icon: "Search" },
      // Tax documents — issuance is part of Doc workflow.
      { labelKey: "extension.taxInvoices", href: "/admin/tax-invoices", icon: "FileText" },
      // Receipts (ใบเสร็จ) explorer — Doc references after payment.
      { labelKey: "accounting.forwarderInvoice", href: "/admin/accounting/receipts", icon: "Receipt" },
      // Billing run (ใบวางบิล) — Doc creates the bill doc; mark-paid stays accounting-only.
      { labelKey: "forwarder.billingRun", href: "/admin/billing-run", icon: "Banknote" },
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

/**
 * `pricing` — Cargo Pricing (P2 · tax-invoice platform · 2026-06-09). Captures
 * the COST number (PEAK stock-in basis) on import-forwarder + shop-order lines.
 * Reaches the two cargo cost surfaces; the dedicated Pricing workspace + job
 * board lands in P4.
 */
const menuPricing: MenuSection[] = [
  { header: "", items: [itemDashboard] },
  {
    header: "Cargo & Freight",
    items: [
      // 2026-06-09 (W9 · tax-invoice P4) — the 4-role workspace lands FIRST
      // (the Pricing role's daily home: capture COST + advance the job).
      itemTaxdocWorkspace,
      { labelKey: "forwarderImport.title", href: "/admin/forwarders",    icon: "Package" },
      { labelKey: "purchasing.title",      href: "/admin/service-orders", icon: "ShoppingCart" },
      // 2026-06-09 (เดฟ · tax-invoice P3) — pricing captures COST + DECLARED;
      // the cargo ใบขนรวม surfaces the per-line declared value (defaults from cost).
      itemCargoDeclarations,
    ],
  },
  learningSection,
  extensionSection([blockExtIncidents]),
];

const ROLE_MENUS: Record<AdminRole, MenuSection[]> = {
  super:       menuSuper,
  // 2026-05-28 ดึก — Wave 26 · `manager` role added by migration 0118.
  // Per ภูม decision #5 (synthesis §6 D6 · "sidebar รก · fix per-role filter
  // ก่อนเปิดได้เลย") — Cargo Manager has cnt-payment approval + cross-team
  // supervision + full operational reach EXCEPT HR block + Settings section
  // (rates / billing / admin grants belong to super only). See `menuManager`
  // definition above.
  manager:     menuManager,
  ops:         menuOps,
  accounting:  menuAccounting,
  sales_admin: menuSalesAdmin,
  sales:       menuSales,
  qa:          menuQa,
  warehouse:   menuWarehouse,
  driver:      menuDriver,
  interpreter: menuInterpreter,
  // 2026-06-09 — P2 · `pricing` role (tax-invoice platform · COST capture).
  pricing:     menuPricing,
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
  // 2026-05-28 ดึก — Wave 26 · manager outranks accounting/qa/ops.
  // Approval-rights inheritance: super → manager → accounting → qa → ops.
  "manager",
  "accounting",
  "pricing",                     // Cargo Pricing — COST capture (ranks below accounting)
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

// ──────────────────────────────────────────────────────────────
// Multi-role union — Pacred-only escape hatch (Wave 26 · G4)
// ──────────────────────────────────────────────────────────────
// Legacy assigns each admin EXACTLY ONE menu. Pacred allows an admin
// to hold multiple roles (e.g. a sales lead also tagged `qa` during a
// QA staffing gap). `menuForRoles` keeps legacy-faithful single-pick;
// this function returns the dedup'd UNION of every held role's menu,
// keeping each section once and merging items by labelKey.
//
// Use when the role badge is misleading (multi-hat staffer) AND the
// staffer needs to see everything they can act on — not the rare case.
// Default sidebar consumer keeps using `menuForRoles` for the slim
// legacy-faithful single menu.

/** Sections + items deduped by header + labelKey. Item children preserved
 *  as-is from the higher-precedence role's copy (no per-leaf merging). */
export function menuForRolesUnion(roles: AdminRole[]): MenuSection[] {
  if (roles.includes("super")) return ROLE_MENUS.super;
  if (roles.length === 0) return [];

  // Pick all in-precedence-order so the highest-rank menu sets section order.
  const ordered = ROLE_PRECEDENCE.filter((r) => roles.includes(r));
  if (ordered.length === 0) return [];
  if (ordered.length === 1) return ROLE_MENUS[ordered[0]];

  const sectionByHeader = new Map<string, MenuSection>();
  const seenLabels = new Set<string>(); // per-section dedupe via composite key

  for (const r of ordered) {
    for (const sec of ROLE_MENUS[r]) {
      if (!sectionByHeader.has(sec.header)) {
        sectionByHeader.set(sec.header, { header: sec.header, items: [] });
      }
      const target = sectionByHeader.get(sec.header)!;
      for (const item of sec.items) {
        const key = `${sec.header}::${item.labelKey}`;
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);
        target.items.push(item);
      }
    }
  }
  return Array.from(sectionByHeader.values()).filter((s) => s.items.length > 0);
}

/** Returns `menuSuper` (the CEO toolbox) — used by the super-only
 *  "show all" toggle in the sidebar component to escape role-filtering. */
export function menuShowAll(): MenuSection[] {
  return ROLE_MENUS.super;
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
