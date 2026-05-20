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
import { usePathname } from "next/navigation";
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
  Printer, Calculator, BadgeCheck, ShieldAlert, UserCheck, ChevronDown,
  ChevronRight, type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@/lib/auth/require-admin";
import {
  menuForRoles, primaryRole, type BadgeCounts, type MenuItem, type MenuSection,
} from "@/lib/admin/sidebar-menu";

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
  BadgeCheck, ShieldAlert, UserCheck,
};

function Icon({ name, active }: { name?: string; active: boolean }) {
  const Cmp = name ? ICONS[name] : undefined;
  if (!Cmp) return <span className="w-[18px] h-[18px] shrink-0" />;
  return <Cmp className={`w-[18px] h-[18px] shrink-0 ${active ? "text-white" : "text-white/55"}`} />;
}

// ── Role badge label (legacy nameAdminType + dept/section). ────────────
const ROLE_LABEL_KEY: Record<AdminRole, string> = {
  super:       "role.super",
  ops:         "role.ops",
  accounting:  "role.accounting",
  sales_admin: "role.salesAdmin",
  warehouse:   "role.warehouse",
  driver:      "role.driver",
  interpreter: "role.interpreter",
};

/** Does any descendant href match the current path? Used to auto-open. */
function subtreeHasActive(item: MenuItem, pathname: string): boolean {
  if (item.href && hrefMatches(item.href, pathname)) return true;
  return (item.children ?? []).some((c) => subtreeHasActive(c, pathname));
}

/** Path-match ignoring locale prefix + query string.
 *
 * IMPORTANT: exact match only. A previous startsWith-based version
 * (pre-2026-05-20) made every leaf under /admin/forwarders/X also
 * highlight the /admin/forwarders parent + its siblings — clicking
 * "ประวัติเข้าโกดังไทย" highlighted ทุก item ใน "บริการฝากนำเข้า"
 * (ภูมิ-flagged bug). Use exact match: a leaf highlights ONLY when its
 * own href is the active path; parent dropdowns still auto-open via
 * `subtreeHasActive` (which uses this same matcher recursively).
 *
 * Locale: next/navigation's usePathname() returns the locale-prefixed
 * path ("/en/admin/...") for non-default locales. Strip the 2-letter
 * prefix so the comparison is locale-agnostic (TH default = no prefix
 * so the strip is a no-op).
 */
function hrefMatches(href: string, pathname: string): boolean {
  const base = href.split("?")[0];
  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  return stripped === base;
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
  item, depth, counts, pathname, t, onNavigate,
}: {
  item: MenuItem;
  depth: number;
  counts: BadgeCounts;
  pathname: string;
  t: (k: string) => string;
  onNavigate: () => void;
}) {
  const hasChildren = !!item.children?.length;
  const active = item.href ? hrefMatches(item.href, pathname) : false;
  const branchActive = subtreeHasActive(item, pathname);
  const [open, setOpen] = useState(branchActive);

  const badgeVal = item.badge ? counts[item.badge] ?? 0 : 0;
  // Indentation grows with depth (legacy nested <ul> visual nesting).
  const padLeft = depth === 0 ? "pl-3" : depth === 1 ? "pl-7" : "pl-10";
  const rowClasses = `group flex items-center gap-2.5 rounded-md ${padLeft} pr-2 py-2 text-[13px] transition-colors ${
    active
      ? "bg-primary-600 text-white font-semibold"
      : "text-white/75 hover:bg-white/10 hover:text-white"
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
            ? <ChevronDown className={`${badgeVal > 0 ? "ml-1.5" : "ml-auto"} w-3.5 h-3.5 opacity-60 shrink-0`} />
            : <ChevronRight className={`${badgeVal > 0 ? "ml-1.5" : "ml-auto"} w-3.5 h-3.5 opacity-60 shrink-0`} />}
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
    <div className="px-4 py-4 border-b border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 w-full text-left rounded-lg hover:bg-white/5 px-1 py-1 transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-600 text-white font-bold text-sm shrink-0">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white truncate">{adminLabel}</span>
          {roleKey && (
            <span className="block text-[11px] text-white/55 truncate">{t(roleKey)}</span>
          )}
        </span>
        {open
          ? <ChevronDown className="w-4 h-4 text-white/50 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-white/50 shrink-0" />}
      </button>
      {open && (
        <div className="mt-2 space-y-0.5">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            <User className="w-4 h-4" />
            <span>{t("account.profile")}</span>
          </Link>
          <Link href="/admin/settings" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            <Settings className="w-4 h-4" />
            <span>{t("account.settings")}</span>
          </Link>
          <Link href="/logout" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-white/70 hover:bg-white/10 hover:text-white transition-colors">
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
  const t = useTranslations("pcsAdminNav");
  const [openMobile, setOpenMobile] = useState(false);

  // Per-role purpose-built menu — faithful to the legacy per-role .php.
  const sections: MenuSection[] = menuForRoles(roles);
  const role = primaryRole(roles);
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
        Dark fixed accordion sidebar — the owner's reference is the legacy
        PCS dark `menu-fixed menu-dark menu-accordion`
        (docs/research/d1-fidelity-admin.md §1.3 — "Default to dark to
        match"). Slate-950 base, primary-600 accents.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform lg:translate-x-0
          bg-slate-950 text-white border-r border-white/10 shadow-xl
          ${openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-black tracking-tight text-white">PR</h2>
            <span className="text-[10px] uppercase tracking-widest text-white/45">Admin</span>
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
                <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-widest text-white/35 font-bold">
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
                    t={t}
                    onNavigate={closeMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-2.5 py-3 border-t border-white/10">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="block rounded-md px-3 py-2 text-xs text-white/55 hover:bg-white/10 hover:text-white transition-colors"
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
