"use client";

import { useEffect } from "react";

/**
 * Shrink the desktop left sidebar to an ICON RAIL WHILE this page is mounted
 * (ปอน 2026-06-09: "ไม่หุบสมบูรณ์ ให้เห็นไอคอนซ้าย" — the แบบตาราง view is wide,
 * so the sidebar collapses to a 60px icon rail to reclaim width while the menu
 * icons stay visible/clickable).
 *
 * Adds `body.pcs-sidebar-rail` on mount and removes it on unmount, so the
 * effect is scoped to this route only — every other protected page keeps the
 * sidebar EXPANDED by default. legacy-overrides.css wires the rail mode: the
 * sidebar shrinks to 60px showing only the menu icons (`.pcs-rail-hide` /
 * `.pcs-menu-row` hooks), `.pcs-content-pad` keeps a 68px gutter; moving the
 * mouse over the rail slides the full 260px menu out as an overlay (`:hover`)
 * and it tucks back to the rail on mouse-leave. Desktop @media only — on mobile
 * the sidebar is `display:none` already, so the class is a no-op there.
 */
export function CollapseSidebar({ hasPayBar = false }: { hasPayBar?: boolean }) {
  useEffect(() => {
    // NOTE (owner 2026-07-31): the `pcs-sidebar-rail` icon rail is now the
    // GLOBAL default — <PcsSidebarRailInit> mounts it once in the (protected)
    // layout for every page. This page must NOT add/remove that class itself:
    // its unmount-cleanup would strip the layout-owned rail when navigating away
    // (the class stays removed until a full reload). So this component now only
    // manages the pay-bar flag.
    //
    // When the sticky pay-bar is on screen, flag the body so the global
    // FloatingTabs lifts its LINE bubble ABOVE the pay-bar (globals.css
    // `body.has-import-paybar .pacred-line-bubble`) — without this the green
    // LINE bubble (z-51) piled on top of the pay-bar's "ชำระเงิน" button
    // (ปอน 2026-06-08: "โดน line ทับ"). Same flag forwarder-interactivity sets
    // on /service-import.
    if (!hasPayBar) return;
    document.body.classList.add("has-import-paybar");
    return () => {
      document.body.classList.remove("has-import-paybar");
    };
  }, [hasPayBar]);
  return null;
}
