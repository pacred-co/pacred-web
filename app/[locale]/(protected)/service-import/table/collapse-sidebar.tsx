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
    // `pcs-sidebar-rail` (not `-collapsed` / `-peek`): the sidebar shrinks to a
    // 60px icon rail and slides the full menu back out on hover, tucking away
    // on mouse-leave (ปอน 2026-06-09 "เห็นไอคอน เอาเมาส์ชี้แล้วกางเต็ม").
    document.body.classList.add("pcs-sidebar-rail");
    // When the sticky pay-bar is on screen, flag the body so the global
    // FloatingTabs lifts its LINE bubble ABOVE the pay-bar (globals.css
    // `body.has-import-paybar .pacred-line-bubble`) — without this the green
    // LINE bubble (z-51) piled on top of the pay-bar's "ชำระเงิน" button
    // (ปอน 2026-06-08: "โดน line ทับ"). Same flag forwarder-interactivity sets
    // on /service-import.
    if (hasPayBar) document.body.classList.add("has-import-paybar");
    return () => {
      document.body.classList.remove("pcs-sidebar-rail");
      document.body.classList.remove("has-import-paybar");
    };
  }, [hasPayBar]);
  return null;
}
