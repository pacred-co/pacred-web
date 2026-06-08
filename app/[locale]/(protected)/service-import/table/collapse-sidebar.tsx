"use client";

import { useEffect } from "react";

/**
 * Collapse the desktop left sidebar WHILE this page is mounted (ปอน 2026-06-08:
 * "ในคอมให้พับแถบซ้ายไปเลย" — the แบบตาราง view is wide, so it should reclaim
 * the sidebar's width to show the full table without horizontal scroll).
 *
 * Adds `body.pcs-sidebar-peek` on mount and removes it on unmount, so the
 * effect is scoped to this route only — every other protected page keeps the
 * sidebar EXPANDED by default (ปอน 2026-06-08 "กางค้างไว้ พอกดหน้าตารางให้หุบ").
 * legacy-overrides.css wires the peek mode: the sidebar tucks to a thin left
 * rail (translateX(calc(-100% + 16px))) and drops the 280px left-padding from
 * `.pcs-content-pad` so content fills edge-to-edge; moving the mouse over the
 * rail slides the full menu back out as an overlay (`:hover` → translateX(0))
 * and it tucks away again on mouse-leave. Desktop @media only — on mobile the
 * sidebar is `display:none` already, so the class is a no-op there.
 */
export function CollapseSidebar({ hasPayBar = false }: { hasPayBar?: boolean }) {
  useEffect(() => {
    // `pcs-sidebar-peek` (not `-collapsed`): the sidebar tucks to a thin left
    // rail and slides back out on hover, tucking away on mouse-leave (ปอน
    // 2026-06-08 "หุบไว้ แต่เอาเมาส์ชี้ๆ แล้วออกมาได้"). legacy-overrides.css
    // wires the peek + :hover overlay; content still gets full width.
    document.body.classList.add("pcs-sidebar-peek");
    // When the sticky pay-bar is on screen, flag the body so the global
    // FloatingTabs lifts its LINE bubble ABOVE the pay-bar (globals.css
    // `body.has-import-paybar .pacred-line-bubble`) — without this the green
    // LINE bubble (z-51) piled on top of the pay-bar's "ชำระเงิน" button
    // (ปอน 2026-06-08: "โดน line ทับ"). Same flag forwarder-interactivity sets
    // on /service-import.
    if (hasPayBar) document.body.classList.add("has-import-paybar");
    return () => {
      document.body.classList.remove("pcs-sidebar-peek");
      document.body.classList.remove("has-import-paybar");
    };
  }, [hasPayBar]);
  return null;
}
