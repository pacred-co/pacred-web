"use client";

/**
 * D1 Phase B — admin sidebar, faithful to legacy PCS Cargo.
 *
 * The legacy sidebar is NOT one flat array filtered by a role enum. It is a
 * per-role hand-built menu (the company/department/section triple selects
 * one of ~22 purpose-built menu files), grouped under fixed EN section
 * headers (Cargo & Freight / Freight / Cargo / Settings / Learning /
 * Extension), with a live-count badge on nearly every queue item.
 *
 * This component reproduces that shape:
 *  - menu structure + per-role assembly → `lib/admin/sidebar-menu.ts`
 *  - live-count badges (legacy badgeMenu)  → `actions/admin/sidebar-counts.ts`
 *  - nested accordion (legacy menu-accordion) → recursive <MenuRow>
 *  - avatar + adminID + role badge at top   → <SidebarHeader>
 *
 *   Audit source: docs/research/d1-fidelity-admin.md §1
 */

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, Coins, Wallet, Users, User,
  BadgePercent, Settings, Languages, Menu, X, BarChart3, Building2,
  ClipboardCheck, UserCog, Clock, MessageSquare, MessageCircle, Activity,
  ArrowRightLeft, Receipt, Truck, Upload, BellRing, Bell, Search, Kanban,
  Inbox, AlertTriangle, CalendarCheck, CalendarClock, GraduationCap,
  FileText, Newspaper, ScrollText, Boxes, Wrench, ShoppingBag, HandCoins,
  PackagePlus, PackageCheck, UserPlus, Plus, History, Landmark, Layers,
  SlidersHorizontal, Network, ListOrdered, Barcode, ScanLine, Camera,
  Printer, Calculator, BadgeCheck, ShieldAlert, UserCheck, Wand2, RefreshCw,
  Banknote, KanbanSquare, Smartphone, Save,
  Ban, AlertCircle, Database, DatabaseZap, Send, Contact, Gauge, PhoneCall, Megaphone, Handshake,
  ChevronDown, ChevronRight, type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@/lib/auth/require-admin";
import {
  menuForRoles, menuShowAll, primaryRole,
  type BadgeCounts, type MenuItem, type MenuSection,
} from "@/lib/admin/sidebar-menu";

// ──────────────────────────────────────────────────────────────
// Phase-gated visibility (2026-05-20 night owner brief).
//
// Tag rule (in `lib/admin/sidebar-menu.ts`):
//   undefined / 1 = visible to all admin staff
//   2 / 3 / 4     = visible to `super` only
//
// Parent items are NOT tagged — a parent's effective phase is the
// MIN of its remaining (post-filter) children's phases. If every
// child of a parent is filtered out, the parent is dropped too.
//
// This is purely a UI visibility filter; route-level enforcement is
// the responsibility of `lib/admin/phase-access.ts` (`canAccessRoute`),
// which the (admin) layout / per-page guards consume.
// ──────────────────────────────────────────────────────────────
function filterByPhase(items: MenuItem[], role: AdminRole | null): MenuItem[] {
  if (role === "super") return items; // super sees everything
  return items
    .map((item): MenuItem | null => {
      const hasOriginalChildren = !!item.children?.length;
      const childrenFiltered = hasOriginalChildren
        ? filterByPhase(item.children!, role)
        : undefined;

      // A parent's "effective phase" = MIN of its surviving children's phases.
      // If the parent originally had children but ALL got filtered out, treat
      // the parent as gone too (Infinity). For a true leaf (never had any
      // children), default to its own phase or 1.
      const effectivePhase = hasOriginalChildren
        ? (childrenFiltered!.length === 0
            ? Infinity
            : Math.min(...childrenFiltered!.map((c) => c.phase ?? 1)))
        : (item.phase ?? 1);

      // An explicit `phase` on the item itself always wins. Otherwise the
      // effective (child-derived for parents · 1-default for leaves) phase
      // decides.
      const myPhase = item.phase ?? effectivePhase;
      if (myPhase > 1) return null;
      return { ...item, children: childrenFiltered };
    })
    .filter((x): x is MenuItem => x !== null);
}

// ── Icon-name → component map. Menu items carry icon NAMES (strings) so
//    `lib/admin/sidebar-menu.ts` stays a plain non-JSX module. ──────────
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Package, ShoppingCart, Coins, Wallet, Users, User,
  BadgePercent, Settings, Languages, BarChart3, Building2, ClipboardCheck,
  UserCog, Clock, MessageSquare, MessageCircle, Activity, ArrowRightLeft,
  Receipt, Truck, Upload, BellRing, Bell, Search, Kanban, Inbox,
  AlertTriangle, CalendarCheck, CalendarClock, GraduationCap, FileText,
  Newspaper, ScrollText, Boxes, Wrench, ShoppingBag, HandCoins, PackagePlus,
  PackageCheck, UserPlus, Plus, History, Landmark, Layers, SlidersHorizontal,
  Network, ListOrdered, Barcode, ScanLine, Camera, Printer, Calculator,
  BadgeCheck, ShieldAlert, UserCheck, Wand2, RefreshCw,
  // 2026-05-27 (Wave 22 Agent M finding) — these 4 were referenced from
  // lib/admin/sidebar-menu.ts but missing from this map → Icon() silently
  // returned a blank 18×18 spacer (visually = "icon missing"). Added all 4.
  Banknote,        // รายการเบิกเงิน parent + 5 sub-items
  KanbanSquare,    // /admin/board workboard
  Smartphone,      // driver mobile leaves + super
  Save,            // extension / audit
  // Wave 26 (2026-05-28 ดึก) — 11 QA queue leaves under blockQAQueues.
  Ban,             // order-cancellations
  AlertCircle,     // 8 alert queues that don't otherwise have an icon
  // 2026-06-01 (เดฟ) — Wave C BI cockpit + the leads call-queue. Both icon
  // names were referenced from sidebar-menu.ts but absent here → blank spacer.
  Gauge,           // blockExtCockpit — /admin/reports/cockpit
  PhoneCall,       // blockExtLeads — /admin/leads (pre-existing miss, fixed here)
  // 2026-06-01 (เดฟ) — promo-banner manager (/admin/settings/promos).
  Megaphone,       // settingsCargo.promos
  // 2026-06-02 (เดฟ) — partner directory (/admin/partners · staff-CRUD gap §PM-6).
  Handshake,       // settingsCargo.partners
  // 2026-06-02 (ภูม) — /admin/system/pcs-sync dashboard
  Database,        // PCS↔Pacred Sync settings page
  // 2026-06-04 (reachability audit §0d) — 3 orphan admin tools wired into
  // Settings (system + tools subgroups). Icon names were referenced from
  // sidebar-menu.ts but absent here → would render a blank spacer.
  DatabaseZap,     // settingsCargo.pcsCustomerMigration — /admin/migration/pcs-customers
  Send,            // settingsCargo.notifyDispatch — /admin/notifications/dispatch
  Contact,         // settingsCargo.orgContacts — /admin/settings/contacts
};

function Icon({ name, active }: { name?: string; active: boolean }) {
  if (!name) return <span className="w-[18px] h-[18px] shrink-0" />;
  const Cmp = ICONS[name];
  if (!Cmp) {
    // Dev-only warning so the next icon name we forget to register is
    // surfaced immediately instead of silently rendering a blank spacer.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[admin-sidebar] unknown icon name '${name}' — add to ICONS map in components/sections/admin-sidebar.tsx`);
    }
    return <span className="w-[18px] h-[18px] shrink-0" />;
  }
  return <Cmp className={`w-[18px] h-[18px] shrink-0 ${active ? "text-white" : "text-muted"}`} />;
}

// ── Role badge label (legacy nameAdminType + dept/section). ────────────
// 2026-05-20 ค่ำ — extended to cover the 8 new roles added by migration
// 0091 (sales + qa + 13 freight_*). i18n keys under `role.*` are added
// in messages/th.json + en.json by Agent ZZ in the same wave.
const ROLE_LABEL_KEY: Record<AdminRole, string> = {
  super:       "role.super",
  // 2026-05-28 ดึก — Wave 26 · `manager` role added by migration 0118.
  // G4 (synthesis §3) added a dedicated role.manager i18n key + the
  // separate `menuManager` (super menu minus HR + Settings) in
  // lib/admin/sidebar-menu.ts.
  manager:     "role.manager",
  ops:         "role.ops",
  accounting:  "role.accounting",
  sales_admin: "role.salesAdmin",
  sales:       "role.sales",
  qa:          "role.qa",
  warehouse:   "role.warehouse",
  driver:      "role.driver",
  interpreter: "role.interpreter",
  freight_sales_manager:    "role.freightSalesManager",
  freight_sales:            "role.freightSales",
  freight_export_manager:   "role.freightExportManager",
  freight_export_cs:        "role.freightExportCs",
  freight_export_doc:       "role.freightExportDoc",
  freight_export_clearance: "role.freightExportClearance",
  freight_clearance_both:   "role.freightClearanceBoth",
  freight_export_messenger: "role.freightExportMessenger",
  freight_import_manager:   "role.freightImportManager",
  freight_import_cs:        "role.freightImportCs",
  freight_import_doc:       "role.freightImportDoc",
  freight_import_clearance: "role.freightImportClearance",
  freight_import_messenger: "role.freightImportMessenger",
};

/** Does any descendant href match the current path? Used to auto-open. */
function subtreeHasActive(item: MenuItem, pathname: string, search: string): boolean {
  if (item.href && hrefMatches(item.href, pathname, search)) return true;
  return (item.children ?? []).some((c) => subtreeHasActive(c, pathname, search));
}

/** Path + query-string match (locale-agnostic).
 *
 * Two ภูม-flagged bugs this matcher closes:
 *
 * Bug A (2026-05-20 morning): `startsWith`-based matching highlighted
 *   every leaf under `/admin/forwarders/X` whenever any sibling page
 *   was open (the entire "บริการฝากนำเข้า" subtree lit up). Fixed by
 *   moving to **exact** path equality — leaves highlight ONLY when
 *   their own href is the active route; parent dropdowns still open
 *   via `subtreeHasActive` (the recursive matcher).
 *
 * Bug B (2026-05-20 afternoon): URL = `/admin/wallet?kind=withdraw&
 *   status=pending` lit up FIVE sidebar items at once (walletAll +
 *   wallet.deposit + wallet.withdraw + accCargo.topup + accCargo.withdraw)
 *   because `usePathname()` strips the query string — everything sharing
 *   the same bare pathname matched. Fixed by **including the query
 *   string in the comparison**: every key in the href's query must be
 *   present + equal in the current URL's query; a query-less href
 *   only matches a query-less URL.
 *
 * Locale: next/navigation's usePathname() returns the locale-prefixed
 * path ("/en/admin/...") for non-default locales. Strip the 2-letter
 * prefix so the comparison is locale-agnostic (TH default = no prefix
 * so the strip is a no-op).
 */
function hrefMatches(href: string, pathname: string, currentSearch: string): boolean {
  const [hrefBase, hrefQuery = ""] = href.split("?");
  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  if (stripped !== hrefBase) return false;

  const currentParams = new URLSearchParams(currentSearch);
  if (hrefQuery === "") {
    // A bare href ("ทั้งหมด") matches ONLY a bare URL. If the user is
    // on /admin/wallet?kind=withdraw, the bare "/admin/wallet" item
    // should NOT light up — wallet.withdraw owns that view.
    return currentParams.toString() === "";
  }

  // A href-with-query matches only when every key it declares is
  // present + equal in the current URL.
  const hrefParams = new URLSearchParams(hrefQuery);
  for (const [key, value] of hrefParams) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

// ── A red count pill — the legacy badgeMenu($n). ───────────────────────
function CountBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-primary-600 text-white text-[10px] font-bold leading-none">
      {value > 999 ? "999+" : value}
    </span>
  );
}

// ── One menu row — recursive (handles nested accordion). ───────────────
function MenuRow({
  item, depth, counts, pathname, search, t, onNavigate,
}: {
  item: MenuItem;
  depth: number;
  counts: BadgeCounts;
  pathname: string;
  search: string;
  t: (k: string) => string;
  onNavigate: () => void;
}) {
  const hasChildren = !!item.children?.length;
  const active = item.href ? hrefMatches(item.href, pathname, search) : false;
  const branchActive = subtreeHasActive(item, pathname, search);
  const [open, setOpen] = useState(branchActive);

  const badgeVal = item.badge ? counts[item.badge] ?? 0 : 0;
  // Indentation grows with depth (legacy nested <ul> visual nesting).
  const padLeft = depth === 0 ? "pl-3" : depth === 1 ? "pl-7" : "pl-10";
  const rowClasses = `group flex items-center gap-2.5 rounded-md ${padLeft} pr-2 py-2 text-[13px] transition-colors ${
    active
      ? "bg-primary-600 text-white font-semibold shadow-sm"
      : "text-foreground/75 hover:bg-primary-50 hover:text-primary-700"
  }`;

  // Accordion parent (no own href, or a parent with children).
  if (hasChildren) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${rowClasses} w-full text-left`}
          aria-expanded={open}
        >
          <Icon name={item.icon} active={active} />
          <span className="truncate">{t(item.labelKey)}</span>
          {badgeVal > 0 && <CountBadge value={badgeVal} />}
          {open
            ? <ChevronDown className={`${badgeVal > 0 ? "ml-1.5" : "ml-auto"} w-3.5 h-3.5 opacity-50 shrink-0`} />
            : <ChevronRight className={`${badgeVal > 0 ? "ml-1.5" : "ml-auto"} w-3.5 h-3.5 opacity-50 shrink-0`} />}
        </button>
        {open && (
          <ul className="mt-0.5 space-y-0.5">
            {item.children!.map((child, i) => (
              <MenuRow
                key={child.href ?? `${child.labelKey}-${i}`}
                item={child}
                depth={depth + 1}
                counts={counts}
                pathname={pathname}
                search={search}
                t={t}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // Leaf link.
  return (
    <li>
      <Link href={item.href ?? "#"} onClick={onNavigate} className={rowClasses}>
        <Icon name={item.icon} active={active} />
        <span className="truncate">{t(item.labelKey)}</span>
        <CountBadge value={badgeVal} />
      </Link>
    </li>
  );
}

// ── Sidebar header — avatar + adminID + role badge (legacy itop). ──────
function SidebarHeader({
  adminLabel, roleKey, t,
}: {
  adminLabel: string;
  roleKey: string | null;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const initial = adminLabel.trim().charAt(0).toUpperCase() || "P";
  return (
    <div className="px-4 py-4 border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 w-full text-left rounded-lg hover:bg-surface-alt px-1 py-1 transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-600 text-white font-bold text-sm shrink-0">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground truncate">{adminLabel}</span>
          {roleKey && (
            <span className="block text-[11px] text-muted truncate">{t(roleKey)}</span>
          )}
        </span>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted shrink-0" />}
      </button>
      {open && (
        <div className="mt-2 space-y-0.5">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-foreground/70 hover:bg-primary-50 hover:text-primary-700 transition-colors">
            <User className="w-4 h-4" />
            <span>{t("account.profile")}</span>
          </Link>
          <Link href="/admin/settings" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-foreground/70 hover:bg-primary-50 hover:text-primary-700 transition-colors">
            <Settings className="w-4 h-4" />
            <span>{t("account.settings")}</span>
          </Link>
          <Link href="/logout" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-foreground/70 hover:bg-primary-50 hover:text-primary-700 transition-colors">
            <ArrowRightLeft className="w-4 h-4" />
            <span>{t("account.logout")}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export function AdminSidebar({
  roles,
  counts = {},
  adminLabel = "Admin",
}: {
  roles: AdminRole[];
  /** Live-count badges, resolved server-side (getSidebarCounts). */
  counts?: BadgeCounts;
  /** The signed-in admin's display name / member code for the header. */
  adminLabel?: string;
}) {
  const pathname = usePathname() ?? "";
  // useSearchParams() is the current URL's query string — needed by
  // hrefMatches to disambiguate sidebar items that share a pathname
  // but carry different ?kind= / ?status= / ?group= carriers (ภูม
  // 2026-05-20 Bug B). Strip leading "?" for clean construction.
  const search = useSearchParams()?.toString() ?? "";
  const t = useTranslations("pcsAdminNav");
  const [openMobile, setOpenMobile] = useState(false);

  // G4 — super-only "show all" toggle (Wave 26 · 2026-05-28 ดึก).
  // Sidebar defaults to the staffer's role-filtered menu; `super` users
  // can flip this to expose the full CEO toolbox even when their role
  // would normally show a narrower menu (e.g. when super wears a
  // sales/warehouse hat for a day). Non-super never sees the toggle.
  const isSuper = roles.includes("super");
  const [showAll, setShowAll] = useState(false);

  // Per-role purpose-built menu — faithful to the legacy per-role .php.
  // After role-routing, apply the Phase-gate filter (2026-05-20 brief): items
  // tagged `phase: 2/3/4` are hidden from everyone except `super`.
  const role = primaryRole(roles);
  // When `super` ticks "Show all menus", swap to the full CEO toolbox
  // regardless of any in-page role simulation. Non-super never reaches
  // this branch (showAll always false for them).
  const rawSections: MenuSection[] = (isSuper && showAll)
    ? menuShowAll()
    : menuForRoles(roles);
  const sections: MenuSection[] = rawSections.map((sec) => ({
    ...sec,
    items: filterByPhase(sec.items, role),
  }));
  const roleKey = role ? ROLE_LABEL_KEY[role] : null;

  const closeMobile = () => setOpenMobile(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpenMobile((v) => !v)}
        className="lg:hidden fixed top-3 left-3 z-[60] inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors"
        aria-label="Menu"
      >
        {openMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/*
        White accordion sidebar (ภูม brief 2026-05-23 — "เปลี่ยนสี Sidebar
        เป็นสีขาว ทำให้สมูทๆ ตัดกับหน้าทำงานข้างๆ"). Light surface keeps the
        rail visually distinct from the main content via the right-edge
        border + soft shadow; active item stays in Pacred primary-red so the
        brand cue carries through.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform lg:translate-x-0
          bg-white text-foreground border-r border-border shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]
          ${openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-black tracking-tight text-primary-600">PR</h2>
            <span className="text-[10px] uppercase tracking-widest text-muted">Admin</span>
          </div>
        </div>

        {/* Avatar + adminID + role badge — legacy itop block */}
        <SidebarHeader adminLabel={adminLabel} roleKey={roleKey} t={t} />

        {/*
          Per-role nested-accordion menu, grouped by the 6 fixed legacy
          EN section headers (Cargo & Freight · Freight · Cargo · Settings ·
          Learning · Extension — header text is rendered verbatim, no i18n,
          per ภูม Q1 decision 2026-05-19 "EN ตาม legacy · zero retraining").
          Empty sections (zero items) are suppressed so e.g. a Warehouse
          worker never sees a Freight divider with nothing under it.
        */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3">
          {sections.filter((sec) => sec.items.length > 0).map((sec, si) => (
            <div key={sec.header || `sec-${si}`} className="space-y-0.5">
              {sec.header && (
                <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-widest text-muted/70 font-bold">
                  {sec.header}
                </p>
              )}
              <ul className="space-y-0.5">
                {sec.items.map((item, ii) => (
                  <MenuRow
                    key={item.href ?? `${item.labelKey}-${ii}`}
                    item={item}
                    depth={0}
                    counts={counts}
                    pathname={pathname}
                    search={search}
                    t={t}
                    onNavigate={closeMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-2.5 py-3 border-t border-border space-y-1">
          {/* G4 — super-only escape hatch (Wave 26 · 2026-05-28 ดึก). Lets a
              super admin flip between their role's slim menu and the full
              CEO toolbox without re-login. Non-super never sees this row. */}
          {isSuper && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="block w-full text-left rounded-md px-3 py-2 text-xs text-muted hover:bg-primary-50 hover:text-primary-700 transition-colors"
              aria-pressed={showAll}
            >
              {showAll ? t("showRole") : t("showAll")}
            </button>
          )}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="block rounded-md px-3 py-2 text-xs text-muted hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            {t("backToCustomer")}
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {openMobile && (
        <div
          onClick={closeMobile}
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
        />
      )}
    </>
  );
}
