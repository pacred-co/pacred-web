"use client";

/**
 * <PageTopMenubar>
 *
 * Reusable horizontal top menu-bar with N-level nested dropdowns. Modelled
 * on the legacy PCS Cargo `acc-system-cargo.php` header-menu (purple
 * gradient bar · hover-or-click to open · sub-menus open to the right with
 * a chevron · 3-4 levels deep). NEW component (not a faithful PHP port) —
 * uses Tailwind utilities, NOT the `.pcs-legacy` scope.
 *
 * Owner brief 2026-05-20 night:
 *   - Pacred sidebar is too crowded — purchasing dropdown + forwarder
 *     dropdown have 6+10 sub-items each
 *   - Legacy `acc-system-cargo.php` instead uses a clean **TOP** menubar
 *     with cascading dropdowns to surface the same depth without bloating
 *     the sidebar
 *   - This component is the reusable React equivalent — hand any
 *     `MenubarItem[]` tree in and it renders. Each consuming page wires
 *     its own tree (e.g. CARGO_MENUBAR in `/admin/accounting/cargo`).
 *
 * Interaction model:
 *   - HOVER opens dropdowns (CSS `group-hover`) — fast desktop UX
 *   - CLICK pins the dropdown open (React state) — supports touch + a
 *     "linger after mouse leaves" pattern
 *   - Pinned dropdown closes on: click outside, click on a leaf link,
 *     Escape key
 *   - Keyboard: Tab walks every focusable; Enter/Space opens a parent;
 *     Escape closes the open chain
 *   - `aria-expanded` + `aria-haspopup` on every parent button for SR
 *
 * Mobile strategy:
 *   - Admin is desktop-primary (per ADR-0002 + the sidebar is hidden on
 *     mobile too). Below `md:` we render a single horizontal-scroll row
 *     of TOP items only — leaf links + a static "เปิดบนเดสก์ท็อปเพื่อใช้
 *     เมนูย่อย" caption. No 3-level cascade on phones — it doesn't fit
 *     and admin staff don't use it from mobile.
 *
 * Visual: indigo→purple gradient bar (evokes the legacy purple header) ·
 * white text · large click areas · subtle shadow.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── Public types ────────────────────────────────────────────────────────────

export type MenubarItem = {
  label: string;
  /** Leaf link. Omit for a pure parent (header only — keyboard Space opens). */
  href?: string;
  /** Nested children open in a cascading sub-dropdown. */
  children?: MenubarItem[];
};

export type PageTopMenubarProps = {
  items: MenubarItem[];
  /** Optional · highlight the active leaf (exact match on `href`). */
  activeHref?: string;
};

// ── Component ───────────────────────────────────────────────────────────────

export function PageTopMenubar({ items, activeHref }: PageTopMenubarProps) {
  // Which TOP item (by index) is currently "pinned" open via click. Hover
  // is handled by pure CSS `group-hover:` — this state is only the
  // click-to-pin layer for touch + keyboard.
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close pinned dropdown when the user clicks outside the menubar.
  useEffect(() => {
    if (pinnedIndex === null) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setPinnedIndex(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pinnedIndex]);

  // Esc closes any pinned dropdown.
  useEffect(() => {
    if (pinnedIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinnedIndex(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pinnedIndex]);

  const closeAll = useCallback(() => setPinnedIndex(null), []);

  return (
    <nav
      ref={rootRef}
      aria-label="ระบบบัญชี — เมนูหลัก"
      className="rounded-xl shadow-md bg-gradient-to-r from-indigo-600 via-purple-600 to-purple-700 text-white"
    >
      {/* Desktop · md+ — full cascading menubar */}
      <ul className="hidden md:flex flex-wrap items-stretch">
        {items.map((item, i) => (
          <TopItem
            key={`${item.label}-${i}`}
            item={item}
            activeHref={activeHref}
            isPinned={pinnedIndex === i}
            onPin={() => setPinnedIndex(pinnedIndex === i ? null : i)}
            onLeafClick={closeAll}
          />
        ))}
      </ul>

      {/* Mobile · <md — top-items only, horizontal scroll, no cascades */}
      <ul className="md:hidden flex overflow-x-auto whitespace-nowrap">
        {items.map((item, i) => {
          // Pick first leaf href (recurse) for the mobile shortcut link.
          const fallbackHref = item.href ?? findFirstLeafHref(item);
          const active = fallbackHref === activeHref;
          if (fallbackHref) {
            return (
              <li key={`${item.label}-${i}`} className="shrink-0">
                <Link
                  href={fallbackHref}
                  className={`block px-4 py-3 text-sm font-medium transition-colors ${
                    active ? "bg-white/20" : "hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={`${item.label}-${i}`} className="shrink-0">
              <span className="block px-4 py-3 text-sm font-medium opacity-70">
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="md:hidden px-4 py-1.5 text-[11px] text-white/70 italic border-t border-white/10">
        เมนูย่อยทั้งหมดใช้ได้บนเดสก์ท็อป
      </p>
    </nav>
  );
}

// ── Top-level item (level 0) ────────────────────────────────────────────────

function TopItem({
  item,
  activeHref,
  isPinned,
  onPin,
  onLeafClick,
}: {
  item: MenubarItem;
  activeHref?: string;
  isPinned: boolean;
  onPin: () => void;
  onLeafClick: () => void;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = !!item.href && item.href === activeHref;

  // Pure leaf (no children) — render a Link.
  if (!hasChildren) {
    return (
      <li className="flex">
        <Link
          href={item.href ?? "#"}
          onClick={onLeafClick}
          className={`flex items-center px-4 py-3 text-sm font-semibold transition-colors ${
            isActive ? "bg-white/20" : "hover:bg-white/10"
          }`}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  // Parent with children — hover OR click toggles a dropdown.
  return (
    <li className="group relative flex">
      <button
        type="button"
        onClick={onPin}
        aria-haspopup="true"
        aria-expanded={isPinned}
        className={`flex items-center gap-1 px-4 py-3 text-sm font-semibold transition-colors ${
          isPinned ? "bg-white/20" : "hover:bg-white/10"
        }`}
      >
        <span>{item.label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
      </button>

      {/* Level-1 dropdown panel — opens below this top-item.
         Visible when: pinned (click) OR group-hover (mouse over). */}
      <DropdownPanel
        open={isPinned}
        side="below"
        className={`${isPinned ? "block" : "hidden group-hover:block"}`}
      >
        {item.children!.map((child, idx) => (
          <NestedItem
            key={`${child.label}-${idx}`}
            item={child}
            depth={1}
            activeHref={activeHref}
            onLeafClick={onLeafClick}
          />
        ))}
      </DropdownPanel>
    </li>
  );
}

// ── Nested item (level 1+) — renders right-cascading sub-menus ─────────────

function NestedItem({
  item,
  depth,
  activeHref,
  onLeafClick,
}: {
  item: MenubarItem;
  depth: number;
  activeHref?: string;
  onLeafClick: () => void;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = !!item.href && item.href === activeHref;

  if (!hasChildren) {
    return (
      <li>
        <Link
          href={item.href ?? "#"}
          onClick={onLeafClick}
          className={`block px-4 py-2 text-sm transition-colors ${
            isActive
              ? "bg-purple-100 text-purple-900 font-semibold"
              : "text-gray-800 hover:bg-purple-50 hover:text-purple-900"
          }`}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  // Parent — open cascading sub-menu to the right.
  return (
    <li className="group/sub relative">
      {/* Parent row — clickable if it has its own href, else inert header */}
      {item.href ? (
        <Link
          href={item.href}
          onClick={onLeafClick}
          aria-haspopup="true"
          className="flex items-center justify-between px-4 py-2 text-sm text-gray-800 hover:bg-purple-50 hover:text-purple-900"
        >
          <span>{item.label}</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          aria-haspopup="true"
          className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-800 hover:bg-purple-50 hover:text-purple-900"
        >
          <span>{item.label}</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </button>
      )}

      {/* Sub-dropdown — opens to the right on hover/focus. Depth-aware
          offset so deep cascades don't overlap their parents. */}
      <DropdownPanel
        open={false}
        side="right"
        className="hidden group-hover/sub:block group-focus-within/sub:block"
        depth={depth}
      >
        {item.children!.map((child, idx) => (
          <NestedItem
            key={`${child.label}-${idx}`}
            item={child}
            depth={depth + 1}
            activeHref={activeHref}
            onLeafClick={onLeafClick}
          />
        ))}
      </DropdownPanel>
    </li>
  );
}

// ── Dropdown panel chrome (white rounded card with shadow) ─────────────────

function DropdownPanel({
  open,
  side,
  className = "",
  depth = 0,
  children,
}: {
  open: boolean;
  side: "below" | "right";
  className?: string;
  depth?: number;
  children: React.ReactNode;
}) {
  // Position: level-1 sits below the top button; level-2+ sits to the
  // right of its parent <li>. The `top-full` / `left-full` puts it
  // exactly flush, and `min-w-[14rem]` gives Thai labels enough room.
  const positionCls =
    side === "below"
      ? "absolute top-full left-0 mt-0.5"
      : "absolute top-0 left-full ml-0.5";

  // depth used only for documentation — width is uniform.
  void depth;

  return (
    <ul
      role={open ? "menu" : undefined}
      className={`${positionCls} z-50 min-w-[14rem] max-w-[20rem] rounded-lg border border-gray-200 bg-white py-1 text-gray-800 shadow-xl ${className}`}
    >
      {children}
    </ul>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Walk the tree to find the first leaf with an href (used for mobile fallback). */
function findFirstLeafHref(item: MenubarItem): string | undefined {
  if (item.href) return item.href;
  if (!item.children) return undefined;
  for (const child of item.children) {
    const found = findFirstLeafHref(child);
    if (found) return found;
  }
  return undefined;
}
