"use client";

import { useEffect } from "react";

/**
 * Collapse the desktop admin sidebar to a 64px ICON RAIL (ปอน 2026-06-11 · owner
 * "พับ sidebar เหลือไอคอน · hover แล้วกางออก เหมือนหน้าบ้านลูกค้า"). The page reclaims
 * the sidebar's width; hovering the rail slides the full menu out AND pushes the
 * page content along with it (content "ขยับตาม" the sidebar, not overlaid).
 *
 * Adds `body.admin-sidebar-rail` on mount, removes on unmount. The CSS that wires
 * the rail lives in app/globals.css (`body.admin-sidebar-rail`). Desktop (lg+)
 * @media only — on mobile the admin sidebar is an off-canvas drawer, so the class
 * is a no-op there. Mirrors the customer-side <CollapseSidebar> (`pcs-sidebar-rail`).
 *
 * 2026-06-13 (owner "ทำให้ left sidebar responsive เหมือนหน้านำเข้าทุกหน้า"): this is
 * now mounted ONCE in the (admin) layout, so the rail applies to EVERY admin page
 * (previously page-scoped to /admin/forwarders/[fNo]). Do NOT also mount it per-page
 * — a second instance's unmount-cleanup would strip the class when navigating away.
 */
/** localStorage key for the rail pin/collapse preference (shared with the PR
 *  brand toggle in <AdminSidebar>). "1" = collapsed rail · "0" = pinned open. */
export const ADMIN_SIDEBAR_RAIL_KEY = "admin-sidebar-rail";

export function CollapseAdminSidebar() {
  useEffect(() => {
    // Default = collapsed icon rail; honor the saved pin/collapse choice the
    // user made by clicking the PR brand logo (so a pinned-open bar "ค้างไว้"
    // across reloads). 2026-06-13 (owner "กดปุ่ม pr แล้วแถบขึ้นค้างไว้").
    let rail = true;
    try {
      const pref = localStorage.getItem(ADMIN_SIDEBAR_RAIL_KEY);
      if (pref !== null) rail = pref === "1";
    } catch {
      /* localStorage blocked (private mode) → fall back to the rail default */
    }
    document.body.classList.toggle("admin-sidebar-rail", rail);
    return () => document.body.classList.remove("admin-sidebar-rail");
  }, []);
  return null;
}
