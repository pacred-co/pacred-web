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
      // 2026-05-23 — re-themed from indigo→purple to Pacred red gradient
      // to match the customer-side brand (per podeng). The legacy doc
      // commentary "purple bar" is historic — we kept the cascading-dropdown
      // behaviour, only the colours changed.
      className="rounded-xl shadow-md bg-gradient-to-r from-primary-600 via-primary-700 to-primary-800 text-white"
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
  //
  // 2026-06-02 sitting-I-fix (ภูม flagged "Submenu Panel ผิด · เป็นหลายอัน"):
  // The L1 dropdown owns an `activeChildIdx` state — only ONE L2 child can be
  // "active" (i.e. show its sub-panel) at a time. Hovering a sibling L2 row
  // (`onMouseEnter`) reassigns activeChildIdx to that row, which causes the
  // previous L2 sub-panel to hide instantly. This fixes the cascade-cursor
  // trap where overlapping absolute panels would let the wrong L2 submenu
  // "stick" while user tried to hover a sibling.
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
      <DropdownPanelWithActiveChild
        isPinned={isPinned}
        side="below"
        items={item.children!}
        depth={1}
        activeHref={activeHref}
        onLeafClick={onLeafClick}
      />
    </li>
  );
}

/**
 * Internal helper: a DropdownPanel that owns the "activeChildIdx" state for
 * its NestedItem children, ensuring at most ONE child sub-panel is visible
 * at a time. This is the sitting-I-fix for the cascade-cursor trap.
 *
 * Used at L1 (TopItem children) AND L2+ (NestedItem children) — same
 * coordination problem at every level.
 */
function DropdownPanelWithActiveChild({
  isPinned,
  side,
  items,
  depth,
  activeHref,
  onLeafClick,
}: {
  isPinned:    boolean;
  side:        "below" | "right";
  items:       MenubarItem[];
  depth:       number;
  activeHref?: string;
  onLeafClick: () => void;
}) {
  const [activeChildIdx, setActiveChildIdx] = useState<number | null>(null);

  // 2026-06-02 sitting-I-fix #2: visibility differs by depth.
  //   L1 (depth=1) — opens on hover of the TopItem `group` OR when pinned.
  //   L2+         — opens ONLY when this parent says we're active (isPinned).
  //                 No CSS group-hover here — that's what caused all
  //                 sibling L2 panels to open simultaneously when L1 was
  //                 hovered (the "cascade trap" ภูม flagged).
  const visibilityCls =
    depth === 1
      ? (isPinned ? "block" : "hidden group-hover:block")
      : (isPinned ? "block" : "hidden");

  return (
    <DropdownPanel
      open={isPinned}
      side={side}
      depth={depth}
      className={visibilityCls}
      onMouseLeave={() => setActiveChildIdx(null)}
    >
      {items.map((child, idx) => (
        <NestedItem
          key={`${child.label}-${idx}`}
          item={child}
          depth={depth}
          activeHref={activeHref}
          onLeafClick={() => {
            setActiveChildIdx(null);
            onLeafClick();
          }}
          isActiveFromParent={activeChildIdx === idx}
          onActivateFromParent={() => setActiveChildIdx(idx)}
        />
      ))}
    </DropdownPanel>
  );
}

// ── Nested item (level 1+) — renders right-cascading sub-menus ─────────────

function NestedItem({
  item,
  depth,
  activeHref,
  onLeafClick,
  isActiveFromParent,
  onActivateFromParent,
}: {
  item: MenubarItem;
  depth: number;
  activeHref?: string;
  onLeafClick: () => void;
  /**
   * Parent-controlled active flag (sitting-I fix). When the parent renders
   * this NestedItem via DropdownPanelWithActiveChild, it sets this to true
   * for the ONE child that's currently active and false for the rest.
   * Undefined = root-level call (NestedItem isn't being coordinated by a
   * parent — falls back to local hover-only behaviour).
   */
  isActiveFromParent?:   boolean;
  /** Parent-controlled "activate me" callback — fires on mouseEnter the row. */
  onActivateFromParent?: () => void;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive    = !!item.href && item.href === activeHref;
  const showSubPanel = isActiveFromParent === true;

  if (!hasChildren) {
    return (
      <li onMouseEnter={onActivateFromParent}>
        <Link
          href={item.href ?? "#"}
          onClick={onLeafClick}
          className={`block px-4 py-2 text-sm transition-colors ${
            isActive
              ? "bg-primary-50 text-primary-900 font-semibold"
              : "text-gray-800 hover:bg-primary-50 hover:text-primary-900"
          }`}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  // Parent — open cascading sub-menu to the right.
  //
  // 2026-06-02 sitting-I-fix (ภูม flagged "เป็นหลายอัน"): visibility is now
  // PARENT-CONTROLLED via `isActiveFromParent`. The parent's
  // `DropdownPanelWithActiveChild` tracks `activeChildIdx` and ensures only
  // ONE sibling submenu is visible at a time. `onMouseEnter` on this row
  // tells the parent "I'm the active one now" — instantly hiding the
  // previously-active sibling's submenu. Wave-28 click-pin behaviour is
  // dropped (the parent state covers both hover and intentional clicks).
  return (
    <li
      className="relative"
      onMouseEnter={onActivateFromParent}
    >
      {/* Parent row — clickable if it has its own href, else click toggles
          the activation (so non-href parents are keyboard/click-accessible). */}
      {item.href ? (
        <Link
          href={item.href}
          onClick={onLeafClick}
          aria-haspopup="true"
          aria-expanded={showSubPanel}
          className="flex items-center justify-between px-4 py-2 text-sm text-gray-800 hover:bg-primary-50 hover:text-primary-900"
        >
          <span>{item.label}</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onActivateFromParent}
          aria-haspopup="true"
          aria-expanded={showSubPanel}
          className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-800 hover:bg-primary-50 hover:text-primary-900"
        >
          <span>{item.label}</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </button>
      )}

      {/* Sub-dropdown — parent-controlled visibility (sitting-I fix). The
          NESTED DropdownPanelWithActiveChild then tracks its OWN
          activeChildIdx so this chain repeats at L3, L4, ... */}
      <DropdownPanelWithActiveChild
        isPinned={showSubPanel}
        side="right"
        items={item.children!}
        depth={depth + 1}
        activeHref={activeHref}
        onLeafClick={onLeafClick}
      />
    </li>
  );
}

// ── Dropdown panel chrome (white rounded card with shadow) ─────────────────

function DropdownPanel({
  open,
  side,
  className = "",
  depth = 0,
  onMouseLeave,
  children,
}: {
  open: boolean;
  side: "below" | "right";
  className?: string;
  depth?: number;
  /** 2026-06-02 sitting-I-fix: clear the parent's activeChildIdx so submenus close. */
  onMouseLeave?: () => void;
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
      onMouseLeave={onMouseLeave}
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
