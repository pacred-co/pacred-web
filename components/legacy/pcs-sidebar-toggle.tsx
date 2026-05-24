"use client";

import { useEffect, useState } from "react";
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
 */
export function PcsSidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore persisted state on mount + sync the body class. Defer the
  // `mounted` flag by one tick so the icon doesn't flash the wrong glyph
  // before localStorage is read.
  useEffect(() => {
    const saved =
      typeof window !== "undefined" &&
      localStorage.getItem("pcs-sidebar-collapsed") === "1";
    setCollapsed(saved);
    document.body.classList.toggle("pcs-sidebar-collapsed", saved);
    setMounted(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      document.body.classList.toggle("pcs-sidebar-collapsed", next);
      try {
        localStorage.setItem("pcs-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* localStorage may be unavailable (private mode, quota, etc.) */
      }
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "เปิดแถบเมนู" : "ปิดแถบเมนู"}
      aria-pressed={collapsed}
      title={collapsed ? "เปิดแถบเมนู" : "ปิดแถบเมนู"}
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
      style={{ visibility: mounted ? "visible" : "hidden" }}
    >
      {collapsed ? (
        <PanelLeft className="h-5 w-5" strokeWidth={2.2} />
      ) : (
        <PanelLeftClose className="h-5 w-5" strokeWidth={2.2} />
      )}
    </button>
  );
}
