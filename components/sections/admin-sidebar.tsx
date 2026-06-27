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

import { createContext, useContext, useState } from "react";
import Image from "next/image";
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
  ClipboardList, ReceiptText, FileSignature, Ship, BookMarked,
  Rocket, PanelLeft,
  ChevronDown, ChevronRight, type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";
import {
  menuForStaffer, menuShowAll, primaryRole,
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
  if (role && isGodRole([role])) return items; // ultra + super see everything
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
  // 2026-06-09 (เดฟ · tax-invoice P3) — CARGO ใบขนรวม leaf
  // (accFreight.cargoDeclarations · /admin/accounting/cargo-declarations).
  ClipboardList,
  // 2026-06-09 (W9 · tax-invoice P4) — the CARGO tax-doc 4-role workspace leaf
  // (taxdocWorkspace.title · /admin/pricing/taxdoc-workspace).
  ReceiptText,
  // 2026-06-09 (W11 · customs doc-kit) — customs-letter/Form-E/HS-assist leaf
  // (customsDocKit.title · /admin/accounting/customs-doc-kit).
  FileSignature,
  // 2026-06-10 (ปอน · sidebar IA regroup) — บริการ → ส่งออก/Freight wrapper.
  Ship,
  // 2026-06-12 (เดฟ · คลัง HS) — HS-code duty library leaf
  // (accFreight.hsLibrary · /admin/accounting/hs-library).
  BookMarked,
  // 2026-06-12 (เดฟ · Go-Live Control Panel) — super-only owner switchboard
  // (settingsCargo.goLive · /admin/settings/go-live).
  Rocket,
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
  ultra:       "role.ultra",   // Ultra Admin Z (mig 0189)
  super:       "role.super",
  normies:     "role.normies", // 2026-06-27 (ปอน) — god-nav, money-blind tier
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
  pricing:     "role.pricing",
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
  // Owner 2026-06-19: badges must "เด้ง · จูงสายตา" — bright red, bigger, ring halo
  // + shadow so staff can't miss there's work waiting (was a dim small pill).
  return (
    <span className="admin-count-badge ml-auto inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-extrabold leading-none ring-2 ring-red-200 shadow-sm">
      {value > 999 ? "999+" : value}
    </span>
  );
}

/**
 * A parent's EFFECTIVE badge = its own count + the sum of every descendant's
 * count — so a COLLAPSED parent still shows there's work inside it without the
 * staff having to expand it (owner 2026-06-19: "อยู่ในหัวข้อย่อย แต่หัวข้อใหญ่
 * ไม่เห็นแจ้งเตือนถ้าไม่กดขยาย"). Sums over item.children = the rendered tree.
 */
function rollupBadge(item: MenuItem, counts: BadgeCounts): number {
  let total = item.badge ? counts[item.badge] ?? 0 : 0;
  for (const c of item.children ?? []) total += rollupBadge(c, counts);
  return total;
}

// One-open-at-a-time group for the top-level (depth-0) accordions — opening a
// section auto-collapses the previous (owner 2026-06-05 · "ไม่รกตา"). Nested
// accordions (depth ≥ 1) keep their own local state.
const AdminAccordionCtx = createContext<{ openId: string | null; toggle: (id: string) => void } | null>(null);

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
  // Depth-0 accordions share the group (one open at a time · auto-close others);
  // nested accordions (depth ≥ 1) keep their own local state.
  const group = useContext(AdminAccordionCtx);
  const rowId = item.href ?? item.labelKey ?? "";
  const [localOpen, setLocalOpen] = useState(branchActive);
  const open = depth === 0 && group ? group.openId === rowId : localOpen;
  const handleToggle = () =>
    depth === 0 && group ? group.toggle(rowId) : setLocalOpen((v) => !v);

  // A parent shows its ROLLED-UP count (own + all descendants) so a collapsed
  // section still flags work inside; a leaf shows just its own.
  const badgeVal = hasChildren
    ? rollupBadge(item, counts)
    : (item.badge ? counts[item.badge] ?? 0 : 0);
  // Indentation grows with depth (legacy nested <ul> visual nesting).
  // depth ≥ 3 happens under the CLASS wrappers (e.g. ACC → รายการเบิกเงิน →
  // Pacred → leaves) — one more step so tier 3/4 don't share an indent.
  const padLeft =
    depth === 0 ? "pl-3" : depth === 1 ? "pl-7" : depth === 2 ? "pl-10" : "pl-[52px]";
  const rowClasses = `group relative flex items-center gap-2.5 rounded-md ${padLeft} pr-2 py-2 text-[13px] transition-colors ${
    active
      ? "bg-primary-600 text-white font-semibold shadow-sm"
      : "text-foreground/75 hover:bg-primary-50 hover:text-primary-700"
  }`;

  // Coming-soon placeholder — a named group scaffold with no destination yet
  // (ปอน 2026-06-10 · Logistics taxonomy). Muted, non-clickable, tagged
  // "เร็วๆนี้" so the future structure is visible without a dead link (§0d).
  if (item.comingSoon) {
    return (
      <li>
        <div className={`flex items-center gap-2.5 rounded-md ${padLeft} pr-2 py-2 text-[13px] text-muted/50 cursor-default select-none`}>
          <Icon name={item.icon} active={false} />
          <span className="truncate">{t(item.labelKey)}</span>
          <span className="ml-auto text-[11px] text-muted/60 font-medium">{t("comingSoon")}</span>
        </div>
      </li>
    );
  }

  // Accordion parent (no own href, or a parent with children).
  if (hasChildren) {
    return (
      <li>
        <button
          type="button"
          onClick={handleToggle}
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
        {/* smooth grid 0fr→1fr reveal — adapts to any sub-list height */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden" aria-hidden={!open}>
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
          </div>
        </div>
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
  adminLabel, adminAvatar, roleKey, t,
}: {
  adminLabel: string;
  adminAvatar?: string | null;
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
        {adminAvatar && adminAvatar.trim() ? (
          // The admin's uploaded avatar (profiles.avatar_url · same image set in
          // /admin/admins/[id]/edit). Falls back to the initial when unset.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={adminAvatar}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-primary-200"
          />
        ) : (
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-600 text-white font-bold text-sm shrink-0">
            {initial}
          </span>
        )}
        <span className="admin-rail-hide min-w-0 flex-1">
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
        <div className="admin-rail-hide mt-2 space-y-0.5">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-foreground/70 hover:bg-primary-50 hover:text-primary-700 transition-colors">
            <User className="w-4 h-4" />
            <span>{t("account.profile")}</span>
          </Link>
          <Link href="/admin/settings" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-foreground/70 hover:bg-primary-50 hover:text-primary-700 transition-colors">
            <Settings className="w-4 h-4" />
            <span>{t("account.settings")}</span>
          </Link>
          {/* Logout = POST to /auth/signout (clears the Supabase session +
              impersonation cookie, redirects home). The old `<Link href="/logout">`
              404'd — there is no /logout route; signout is a POST route, same as
              the customer navbar (2026-06-08 fix). */}
          <form action="/auth/signout" method="post" className="block">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] text-foreground/70 hover:bg-primary-50 hover:text-primary-700 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{t("account.logout")}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AdminSidebar({
  roles,
  workspaceRole = null,
  counts = {},
  adminLabel = "Admin",
  adminAvatar = null,
}: {
  roles: AdminRole[];
  /** The staffer's POSITION workspace_role (ปอน 2026-06-27) — scopes the menu
   *  when set. null = no position → full/role menu (back-compat). */
  workspaceRole?: AdminRole | null;
  /** Live-count badges, resolved server-side (getSidebarCounts). */
  counts?: BadgeCounts;
  /** The signed-in admin's display name / member code for the header. */
  adminLabel?: string;
  /** The signed-in admin's uploaded avatar (profiles.avatar_url) for the header. */
  adminAvatar?: string | null;
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
  // "Show all" oversight toggle = ultra/super ONLY (ปอน 2026-06-27). NOT normies:
  // a position-scoped normies must not be able to escape their workspace via the
  // toggle. (isGodRole still includes normies elsewhere for action back-compat.)
  const isSuper = roles.includes("ultra") || roles.includes("super");
  const [showAll, setShowAll] = useState(false);

  // Per-role purpose-built menu — faithful to the legacy per-role .php.
  // After role-routing, apply the Phase-gate filter (2026-05-20 brief): items
  // tagged `phase: 2/3/4` are hidden from everyone except `super`.
  // Effective role for the Phase filter + role badge: a position-scoped staffer
  // (non-oversight WITH a workspace_role) is filtered as their WORKSPACE role, so
  // their position's menu renders coherently; everyone else = their primary role.
  const role = (!isSuper && workspaceRole) ? workspaceRole : primaryRole(roles);
  // When `super` ticks "Show all menus", swap to the full CEO toolbox
  // regardless of any in-page role simulation. Otherwise the menu is
  // position-scoped (menuForStaffer): ultra/super = full · has-position = that
  // workspace · no-position = role menu (normies → full, back-compat).
  const rawSections: MenuSection[] = (isSuper && showAll)
    ? menuShowAll()
    : menuForStaffer(roles, workspaceRole);
  const sections: MenuSection[] = rawSections.map((sec) => ({
    ...sec,
    items: filterByPhase(sec.items, role),
  }));
  const roleKey = role ? ROLE_LABEL_KEY[role] : null;

  // One-open-at-a-time for the depth-0 accordions (owner 2026-06-05): the
  // branch-active section opens on first load, then opening any section
  // auto-collapses the previous one. id = the depth-0 item's href ?? labelKey.
  const initialOpenAccordion = (() => {
    for (const sec of sections) {
      for (const it of sec.items) {
        if (it.children?.length && subtreeHasActive(it, pathname, search)) {
          return it.href ?? it.labelKey ?? null;
        }
      }
    }
    return null;
  })();
  const [openAccordion, setOpenAccordion] = useState<string | null>(initialOpenAccordion);
  const accordionGroup = {
    openId: openAccordion,
    toggle: (id: string) => setOpenAccordion((cur) => (cur === id ? null : id)),
  };

  const closeMobile = () => setOpenMobile(false);

  // Pin / collapse the desktop icon rail (owner 2026-06-13 "กดปุ่ม pr แล้วแถบ
  // ขึ้นค้างไว้"): clicking the PR brand logo toggles body.admin-sidebar-rail
  // (rail ⇄ full) and persists the choice so a pinned-open bar stays open
  // across navigations + reloads. Desktop-only effect (mobile = drawer · the
  // class is a no-op under lg) so it's harmless to toggle there.
  const togglePinRail = () => {
    const rail = document.body.classList.toggle("admin-sidebar-rail");
    try {
      localStorage.setItem("admin-sidebar-rail", rail ? "1" : "0");
    } catch {
      /* localStorage blocked → in-session toggle still works via the class */
    }
  };

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
      {/* 2026-06-11 (ปอน · owner "ยก left sidebar ขึ้นไปทับ nav bar"): top-0 (เดิม top-14)
          + z-[70] (เหนือ header z-[60]) → แถบข้างพาดขึ้นถึงบนสุด คลุมทับมุมซ้ายของ nav bar
          (โลโก้ PR Admin อยู่มุมบนซ้าย · แถบแดงเหลือเฉพาะฝั่งขวาที่มีปุ่ม EN/theme). */}
      {/* owner 2026-06-11 "ไม่เอาเส้นขอบขาวคั่น nav bar กับ sidebar · เป็นเนื้อเดียวกัน":
          เอา border-r (เส้นขาวขอบขวา) ออก เหลือเงานุ่มๆ → แถบแดงด้านบนต่อเนื่องกับ nav bar. */}
      <aside
        className={`admin-sidebar fixed top-0 bottom-0 left-0 z-[70] w-64 flex flex-col transition-transform lg:translate-x-0
          bg-white text-foreground shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]
          ${openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand — red bar เนื้อเดียวกับ nav bar (ไม่มีเส้นขอบขาวคั่น). โลโก้ขนาดกลาง (ไม่เต็มแถบ):
            F (PRADMIN) ตอนกาง · H (PR ย่อ) ตอนพับ rail · object-cover ตัด whitespace ของไฟล์.
            owner 2026-06-11: "รูปเล็กลง · ไม่เอาเส้นขอบขาว · เนื้อเดียวกับ nav bar". */}
        {/* owner 2026-06-11 "PRADMIN ตอนเต็ม ชิดซ้าย · ไม่โดนตัด/ทับ": F โลโก้ชิดซ้าย (ml-4)
            + กล่องสูง h-12 (เดิม h-9 ทำให้ object-cover ตัดหัว A badge ทิ้ง) → โลโก้เต็มไม่โดนกิน.
            H (rail) ยังกึ่งกลาง (mx-auto). */}
        {/* Brand bar — TWO behaviours kept separate (ปอน/owner 2026-06-19
            "กดที่ไอคอน แล้วไปหน้า dashboard", keeping the owner's 2026-06-13 pin):
              · the LOGO is a Link → /admin (Dashboard).
              · the rail PIN toggle (gang/pin the sidebar open ⇄ collapse back to
                the icon rail, persisted via togglePinRail) moves to a small button
                on the right — it shows while the bar is expanded/hovered
                (admin-rail-hide) so it never collides with the logo's navigation. */}
        <div className="h-14 shrink-0 bg-[#B91C1C] flex items-center overflow-hidden">
          {/* Logo → Dashboard (/admin) */}
          <Link
            href="/admin"
            onClick={closeMobile}
            aria-label="ไปหน้า Dashboard"
            title="ไปหน้า Dashboard"
            className="flex items-center flex-1 min-w-0 h-full hover:brightness-110 transition-[filter]"
          >
            {/* F — full logo (expanded) · ชิดซ้าย · กล่องสูงพอให้โลโก้ไม่โดนตัด */}
            <div className="admin-rail-hide relative h-12 w-[150px] ml-4">
              <Image
                src="/images/hero-section/icon-draf/LOGOADMINPACREDF.png"
                alt="PR Admin"
                fill
                sizes="150px"
                priority
                className="object-cover object-center"
              />
            </div>
            {/* H — compact logo (rail collapsed) · กึ่งกลาง */}
            <div className="admin-rail-only relative h-9 w-9 mx-auto">
              <Image
                src="/images/hero-section/icon-draf/LOGOADMINPACREDH.png"
                alt="PR"
                fill
                sizes="36px"
                priority
                className="object-cover object-center"
              />
            </div>
          </Link>
          {/* Rail pin / collapse toggle — separate from the logo so the logo can
              navigate. admin-rail-hide → hidden while the rail is collapsed-and-
              unhovered, appears on hover / when pinned open. */}
          <button
            type="button"
            onClick={togglePinRail}
            aria-label="ปักหมุด/ย่อเมนู"
            title="ปักหมุดเมนูให้กางค้าง / ย่อกลับเป็นแถบไอคอน"
            className="admin-rail-hide mr-2 ml-1 inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-md text-white/80 hover:text-white hover:bg-white/15 transition-colors"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar + adminID + role badge — legacy itop block */}
        <SidebarHeader adminLabel={adminLabel} adminAvatar={adminAvatar} roleKey={roleKey} t={t} />

        {/*
          Per-role nested-accordion menu, grouped by the 6 fixed legacy
          EN section headers (Cargo & Freight · Freight · Cargo · Settings ·
          Learning · Extension — header text is rendered verbatim, no i18n,
          per ภูม Q1 decision 2026-05-19 "EN ตาม legacy · zero retraining").
          Empty sections (zero items) are suppressed so e.g. a Warehouse
          worker never sees a Freight divider with nothing under it.
        */}
        <AdminAccordionCtx.Provider value={accordionGroup}>
        <nav className="flex-1 overflow-y-auto scrollbar-hidden px-2.5 py-3 space-y-3">
          {sections.filter((sec) => sec.items.length > 0).map((sec, si) => (
            <div key={sec.header || `sec-${si}`} className="space-y-0.5">
              {sec.header && (
                <p className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-widest text-muted/70 font-bold">
                  {sec.header}
                </p>
              )}
              <ul className="space-y-0.5">
                {sec.items.map((item, ii) => (
                  <MenuRow
                    key={`${ii}-${item.href ?? item.labelKey ?? ""}`}
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
        </AdminAccordionCtx.Provider>

        <div className="admin-rail-hide px-2.5 py-3 border-t border-border space-y-1">
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
