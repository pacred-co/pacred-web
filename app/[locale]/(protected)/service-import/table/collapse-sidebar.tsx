"use client";

import { useEffect } from "react";

/**
 * Collapse the desktop left sidebar WHILE this page is mounted (ปอน 2026-06-08:
 * "ในคอมให้พับแถบซ้ายไปเลย" — the แบบตาราง view is wide, so it should reclaim
 * the sidebar's width to show the full table without horizontal scroll).
 *
 * Adds `body.pcs-sidebar-collapsed` on mount and removes it on unmount, so the
 * effect is scoped to this route only — every other protected page keeps the
 * sidebar expanded by default. The class is the SAME flag <PcsSidebarToggle>
 * flips, and legacy-overrides.css already wires it: it slides the sidebar
 * off-screen (translateX(-100%)) and drops the 280px left-padding from
 * `.pcs-content-pad` so content fills edge-to-edge (desktop @media only — on
 * mobile the sidebar is `display:none` already, so the class is a no-op there).
 * The user can still re-open the sidebar via the toggle; this only sets the
 * page's INITIAL state.
 */
export function CollapseSidebar({ hasPayBar = false }: { hasPayBar?: boolean }) {
  useEffect(() => {
    document.body.classList.add("pcs-sidebar-collapsed");
    // When the sticky pay-bar is on screen, flag the body so the global
    // FloatingTabs lifts its LINE bubble ABOVE the pay-bar (globals.css
    // `body.has-import-paybar .pacred-line-bubble`) — without this the green
    // LINE bubble (z-51) piled on top of the pay-bar's "ชำระเงิน" button
    // (ปอน 2026-06-08: "โดน line ทับ"). Same flag forwarder-interactivity sets
    // on /service-import.
    if (hasPayBar) document.body.classList.add("has-import-paybar");
    return () => {
      document.body.classList.remove("pcs-sidebar-collapsed");
      document.body.classList.remove("has-import-paybar");
    };
  }, [hasPayBar]);
  return null;
}
