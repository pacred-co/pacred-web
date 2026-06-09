"use client";

/* eslint-disable @next/next/no-img-element */
import { useContext, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  ArrowRightLeft,
  ShoppingCart,
  Ship,
  Plane,
  FileText,
  Home,
  ReceiptText,
  Wallet,
  CreditCard,
  Users,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AccordionGroup } from "./pcs-left-menu-accordion";

/**
 * Redesigned customer sidebar — card + list rendering (owner 2026-06-09,
 * "เรียง+ดีไซน์ตามภาพ"). Two surfaces:
 *   - <ServiceCard>  → the "บริการหลัก" colored tiles (icon-tile + title +
 *     subtitle + chevron). Expandable when it has sub-links (preserves §0d
 *     reachability for sidebar-only sub-pages e.g. ประเมินราคา / ใบเสร็จ /
 *     ติดตามตู้); a plain navigating card when given an `href` and no children.
 *   - <MenuRow>      → the "เมนูอื่นๆ" list rows (outline icon + label +
 *     badge + chevron). Expandable (wallet / credit / agent) or navigating.
 *
 * Icons are clean lucide glyphs (NOT the legacy PCS-branded PNGs) — matches
 * the reference design AND drops the "PCS cargo" brand leak the big PNG icons
 * carried. Both share the AccordionGroup context so only ONE section is open
 * at a time (no provider → falls back to local state).
 */

// string → lucide glyph (a Server Component can't pass a function across the
// RSC boundary, so the parent passes a key and we resolve it here).
const ICONS: Record<string, LucideIcon> = {
  grid: LayoutGrid,
  transfer: ArrowRightLeft,
  cart: ShoppingCart,
  ship: Ship,
  plane: Plane,
  customs: FileText,
  home: Home,
  receipt: ReceiptText,
  wallet: Wallet,
  credit: CreditCard,
  agent: Users,
  address: MapPin,
};

export type SidebarIconKey = keyof typeof ICONS;

/** A sub-link revealed inside an expandable ServiceCard / MenuRow. Rendered as
 *  children by the (server) parent so the next-intl <Link> tree is preserved. */
export function CardSubLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg py-2 pl-3 pr-2 text-[13px] text-muted hover:bg-gray-50 hover:text-foreground"
    >
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
      <span className="flex-1">{children}</span>
    </Link>
  );
}

/** A coming-soon sub-row (greyed, non-navigating). */
export function CardSubComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="flex cursor-not-allowed select-none items-center gap-2 rounded-lg py-2 pl-3 pr-2 text-[13px] text-gray-400">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
      <span className="flex-1">{children}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide">soon</span>
    </div>
  );
}

// ── shared open/close state (group-aware) ──────────────────────────────────
function useDisclosure(id: string) {
  const group = useContext(AccordionGroup);
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.openId === id : localOpen;
  const toggle = () => (group ? group.toggle(id) : setLocalOpen((v) => !v));
  return { open, toggle };
}

// ════════════════════════════════════════════════════════════════════════
// บริการหลัก — colored service card
// ════════════════════════════════════════════════════════════════════════
export function ServiceCard({
  iconKey,
  iconBg,
  iconColor,
  title,
  subtitle,
  href,
  badge,
  comingSoon = false,
  children,
}: {
  iconKey: SidebarIconKey;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  href?: string;
  badge?: ReactNode;
  comingSoon?: boolean;
  children?: ReactNode;
}) {
  const Icon = ICONS[iconKey];
  const { open, toggle } = useDisclosure(`card:${title}`);
  const expandable = !!children && !comingSoon;

  const tile = (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
    >
      <Icon className={`h-[22px] w-[22px] ${iconColor}`} aria-hidden />
    </span>
  );

  const body = (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-semibold text-foreground">
        {title}
      </span>
      <span className="block truncate text-[11px] text-muted">{subtitle}</span>
    </span>
  );

  const rowClass =
    "flex w-full items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100";

  // 1) Expandable card (has sub-links → preserves reachability)
  if (expandable) {
    return (
      <div
        className={`overflow-hidden rounded-2xl border border-border bg-white ${
          open ? "ring-1 ring-red-100" : ""
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100"
        >
          {tile}
          {body}
          {badge}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden" aria-hidden={!open}>
            <div className="space-y-0.5 border-t border-border px-2 py-1.5">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2) Coming-soon (greyed, non-navigating)
  if (comingSoon) {
    return (
      <div
        className={`${rowClass} cursor-not-allowed select-none opacity-70`}
        aria-disabled
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className={`h-[22px] w-[22px] ${iconColor}`} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-gray-500">
            {title}
          </span>
          <span className="block truncate text-[11px] text-gray-400">
            {subtitle}
          </span>
        </span>
        {badge}
      </div>
    );
  }

  // 3) Plain navigating card
  return (
    <Link href={href ?? "#"} className={rowClass}>
      {tile}
      {body}
      {badge}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════════
// เมนูอื่นๆ — simple list row
// ════════════════════════════════════════════════════════════════════════
export function MenuRow({
  iconKey,
  iconImg,
  label,
  href,
  badge,
  iconColor = "text-muted",
  comingSoon = false,
  children,
}: {
  iconKey?: SidebarIconKey;
  iconImg?: string;
  label: string;
  href?: string;
  badge?: ReactNode;
  iconColor?: string;
  comingSoon?: boolean;
  children?: ReactNode;
}) {
  const Icon = iconKey ? ICONS[iconKey] : null;
  const { open, toggle } = useDisclosure(`row:${label}`);
  const expandable = !!children && !comingSoon;

  // iconImg (a PNG, e.g. the original Pacred service icons) takes precedence
  // over the lucide glyph. The `pcs-icon` class makes legacy-overrides.css
  // render it greyscale by default and full-color on hover / when the row is
  // open (owner 2026-06-09: "เทาไว้ พอกดจิ้มแล้วมีสี"). Coming-soon stays a
  // flat disabled grey (no hover colour).
  const iconEl = iconImg ? (
    <img
      src={iconImg}
      alt=""
      className={`h-6 w-6 shrink-0 object-contain ${comingSoon ? "opacity-40 grayscale" : "pcs-icon"}`}
    />
  ) : Icon ? (
    <Icon
      className={`h-[18px] w-[18px] shrink-0 ${comingSoon ? "text-gray-400" : iconColor}`}
      aria-hidden
    />
  ) : null;

  const inner = (
    <>
      {iconEl}
      <span
        className={`flex-1 truncate text-sm font-medium ${
          comingSoon ? "text-gray-400" : "text-foreground"
        }`}
      >
        {label}
      </span>
      {badge}
    </>
  );

  // `pcs-menu-row` is the hook legacy-overrides.css uses to collapse each row
  // to an icon-only rail under `body.pcs-sidebar-rail` (the wide table view).
  const rowClass =
    "pcs-menu-row flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100";

  // coming-soon → greyed, non-navigating (no chevron)
  if (comingSoon) {
    return (
      <div className={`${rowClass} cursor-not-allowed select-none opacity-80`} aria-disabled>
        {inner}
      </div>
    );
  }

  if (expandable) {
    return (
      // `nav-item`/`open` let legacy-overrides.css colour the .pcs-icon on
      // hover and while the row is open (grey → colour).
      <div className={`nav-item ${open ? "open" : ""}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={rowClass}
        >
          {inner}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>
        <div
          className={`pcs-rail-submenu grid transition-[grid-template-rows] duration-300 ease-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden" aria-hidden={!open}>
            <div className="space-y-0.5 px-3 pb-1.5">{children}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link href={href ?? "#"} className={rowClass}>
      {inner}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
