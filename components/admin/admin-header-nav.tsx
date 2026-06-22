"use client";

/**
 * Admin header nav slot — lets individual pages inject their top-nav items
 * directly into the fixed red header bar, instead of rendering a separate
 * sticky bar below it.
 *
 * Usage:
 *   // In a page (Server or Client Component):
 *   <AdminHeaderNavInject items={MY_MENUBAR} activeHref="/admin/foo?x=1" />
 *
 *   // AdminLayout already renders <AdminHeaderNavDisplay> in the header.
 *   // Injected items appear there automatically; cleared on route change.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@/i18n/navigation";
import { ChevronDown } from "lucide-react";
import type { MenubarItem } from "./page-top-menubar";

// ── Context ───────────────────────────────────────────────────────────────────

type State = { items: MenubarItem[]; activeHref?: string };
type CtxValue = State & {
  setNav: (items: MenubarItem[], activeHref?: string) => void;
  clearNav: () => void;
};

const Ctx = createContext<CtxValue>({
  items: [],
  setNav: () => {},
  clearNav: () => {},
});

export function AdminHeaderNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ items: [] });
  const setNav = useCallback(
    (items: MenubarItem[], activeHref?: string) => setState({ items, activeHref }),
    [],
  );
  const clearNav = useCallback(() => setState({ items: [] }), []);
  return (
    <Ctx.Provider value={{ ...state, setNav, clearNav }}>{children}</Ctx.Provider>
  );
}

// ── Inject ────────────────────────────────────────────────────────────────────

/** Renders nothing — just registers the page's nav items into the header slot.
 *  Clears automatically when the page unmounts (route change). */
export function AdminHeaderNavInject({
  items,
  activeHref,
}: {
  items: MenubarItem[];
  activeHref?: string;
}) {
  const { setNav, clearNav } = useContext(Ctx);
  useEffect(() => {
    setNav(items, activeHref);
    return clearNav;
  }, [items, activeHref, setNav, clearNav]);
  return null;
}

// ── Display ───────────────────────────────────────────────────────────────────

/** Rendered once in AdminLayout's header — displays whatever the active page
 *  injected. Returns null (takes no space) when no page has registered items. */
export function AdminHeaderNavDisplay() {
  const { items, activeHref } = useContext(Ctx);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const rootRef = useRef<HTMLUListElement | null>(null);

  // Close pinned dropdown on outside click.
  useEffect(() => {
    if (pinnedIdx === null) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinnedIdx(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pinnedIdx]);

  // Esc closes pinned dropdown.
  useEffect(() => {
    if (pinnedIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinnedIdx(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pinnedIdx]);

  if (!items.length) return null;

  return (
    <ul
      ref={rootRef}
      // lg:pl-64 — starts items right after the fixed sidebar (w-64 = 256px).
      // The header's px-4 adds 16 px before this, giving a small breathing gap.
      // hidden md:flex — admin is desktop-primary; mobile has in-page chips.
      className="hidden md:flex items-stretch lg:pl-64"
    >
      {items.map((item, i) => {
        const isActive = !!item.href && item.href === activeHref;
        const isPinned = pinnedIdx === i;
        const hasKids = !!item.children?.length;

        if (!hasKids) {
          return (
            <li key={i} className="flex">
              <Link
                href={item.href ?? "#"}
                onClick={() => setPinnedIdx(null)}
                className={`flex items-center px-4 h-14 text-sm font-semibold text-white transition-colors ${
                  isActive ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        }

        // Parent with one level of children.
        return (
          <li key={i} className="group relative flex">
            <button
              type="button"
              onClick={() => setPinnedIdx(isPinned ? null : i)}
              aria-haspopup="true"
              aria-expanded={isPinned}
              className={`flex items-center gap-1 px-4 h-14 text-sm font-semibold text-white transition-colors ${
                isPinned ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              {item.label}
              <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
            </button>
            <ul
              className={`absolute top-full left-0 z-50 min-w-[14rem] rounded-lg border border-gray-200 bg-white py-1 text-gray-800 shadow-xl ${
                isPinned ? "block" : "hidden group-hover:block"
              }`}
            >
              {item.children!.map((child, j) => (
                <li key={j}>
                  <Link
                    href={child.href ?? "#"}
                    onClick={() => setPinnedIdx(null)}
                    className={`flex items-center px-4 py-2 text-sm transition-colors ${
                      child.href === activeHref
                        ? "bg-primary-50 text-primary-900 font-semibold"
                        : "text-gray-800 hover:bg-primary-50 hover:text-primary-900"
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
