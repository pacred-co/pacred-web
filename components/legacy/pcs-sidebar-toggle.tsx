"use client";

import { useEffect, useSyncExternalStore } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";

/**
 * Toggle button that collapses / expands the left sidebar on desktop.
 *
 * Visual is a small square pill anchored just under the NavBar+SearchBar
 * top chrome (top: 152px), to the left edge of the page. Icon swaps between
 * `PanelLeft` (closed → open) and `PanelLeftClose` (open → close) so the
 * affordance reads at a glance. State persists in localStorage so the
 * choice survives navigation/refresh. ปอน 2026-05-24 (rebuilt — the
 * earlier chevron-on-the-edge variant was hard to spot).
 *
 * Hidden < md (the sidebar itself is hidden on mobile via the override
 * stylesheet, so there's nothing to toggle).
 *
 * Persistence via useSyncExternalStore — React 19 canonical pattern for
 * subscribing to external state (localStorage here). Avoids the
 * react-hooks/set-state-in-effect cascade that the older
 * useState+useEffect-hydrate pattern triggers.
 */

const STORAGE_KEY = "pcs-sidebar-collapsed";
// Same-tab updates fire this synthetic event because the native `storage`
// event only fires in OTHER tabs.
const SAME_TAB_EVENT = "pcs-sidebar-change";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(SAME_TAB_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SAME_TAB_EVENT, callback);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

// SSR default — sidebar visible (not collapsed). The client snapshot may
// differ on hydration; suppressHydrationWarning on the button lets React
// swap the class without throwing.
function getServerSnapshot(): boolean {
  return false;
}

export function PcsSidebarToggle() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // DOM-only side effect: keep body.pcs-sidebar-collapsed in sync so the
  // sidebar layout CSS can react. Not a state update.
  useEffect(() => {
    document.body.classList.toggle("pcs-sidebar-collapsed", collapsed);
  }, [collapsed]);

  function toggle() {
    const next = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* localStorage may be unavailable (private mode, quota, etc.) */
    }
    // Re-trigger the snapshot for this tab (the storage event only fires
    // cross-tab, so without this the toggle wouldn't propagate locally).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(SAME_TAB_EVENT));
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "เปิดแถบเมนู" : "ปิดแถบเมนู"}
      aria-pressed={collapsed}
      title={collapsed ? "เปิดแถบเมนู" : "ปิดแถบเมนู"}
      // Initial className may differ between SSR (collapsed=false) and
      // client hydration (collapsed=true from localStorage). React swaps
      // it on the first commit; suppressing the warning avoids a noisy
      // hydration error for what's a deliberate persisted-UI state.
      suppressHydrationWarning
      className={[
        // Hidden on mobile (sidebar doesn't render there)
        "hidden md:inline-flex",
        // Fixed beneath the chrome (NavBar 56 + SearchBar ~84 + ~12 buffer)
        "fixed top-[152px] z-[55]",
        // Slides with the sidebar — sits at the inner edge when open,
        // anchors to the page edge when collapsed.
        collapsed ? "left-3" : "left-[268px]",
        "transition-[left] duration-300 ease-out",
        // Glossy circular pill
        "h-10 w-10 items-center justify-center",
        "rounded-full bg-white",
        "border border-border",
        "shadow-[0_2px_6px_rgba(15,23,42,0.10),0_8px_18px_rgba(15,23,42,0.10)]",
        "hover:shadow-[0_3px_10px_rgba(15,23,42,0.14),0_14px_26px_rgba(15,23,42,0.14)]",
        "hover:-translate-y-0.5",
        "text-muted hover:text-primary-600",
        "active:translate-y-0 active:scale-95",
        "transition-[transform,box-shadow,color,left]",
        "cursor-pointer",
      ].join(" ")}
    >
      {collapsed ? (
        <PanelLeft className="h-5 w-5" strokeWidth={2.2} />
      ) : (
        <PanelLeftClose className="h-5 w-5" strokeWidth={2.2} />
      )}
    </button>
  );
}
