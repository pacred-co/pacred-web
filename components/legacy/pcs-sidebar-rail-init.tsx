"use client";

import { useEffect } from "react";

/**
 * Collapse the desktop customer sidebar to a 60px ICON RAIL on EVERY protected
 * page (owner 2026-07-31 "ทำ left sidebar ให้เหมือนหลังบ้าน admin ที่พับเข้าไป · ทั้ง
 * Pacred · respond แบบ admin"). Direct mirror of <CollapseAdminSidebar>: adds
 * `body.pcs-sidebar-rail` on mount (default = collapsed rail, honoring the saved
 * pin choice) and removes it on unmount. The rail CSS — 60px icon rail, hover
 * slides the full 260px menu out as an overlay, `.pcs-content-pad` keeps a 68px
 * gutter — already lives in `public/legacy/pcs/legacy-overrides.css`
 * (`body.pcs-sidebar-rail`). Desktop (md+) @media only; on mobile the sidebar is
 * `display:none`, so the class is a no-op there.
 *
 * Mounted ONCE in the (protected) layout so the rail applies platform-wide (the
 * old floating <PcsSidebarToggle> is retired). Do NOT also toggle this class
 * per-page — a page-scoped instance's unmount-cleanup would strip the class when
 * navigating away (the /service-import/table <CollapseSidebar> was updated to
 * stop touching it for exactly this reason).
 */
/** localStorage key for the rail pin/collapse preference — shared with the
 *  sidebar's pin toggle (<PcsSidebarPin>). "1" = collapsed rail · "0" = pinned open. */
export const PCS_SIDEBAR_RAIL_KEY = "pcs-sidebar-rail";

export function PcsSidebarRailInit() {
  useEffect(() => {
    // Default = collapsed icon rail (like admin); honor the saved pin choice the
    // user made by clicking the pin toggle (so a pinned-open bar stays open
    // across reloads).
    let rail = true;
    try {
      const pref = localStorage.getItem(PCS_SIDEBAR_RAIL_KEY);
      if (pref !== null) rail = pref === "1";
    } catch {
      /* localStorage blocked (private mode) → fall back to the rail default */
    }
    document.body.classList.toggle("pcs-sidebar-rail", rail);
    return () => document.body.classList.remove("pcs-sidebar-rail");
  }, []);
  return null;
}
