"use client";

import { useEffect } from "react";

/**
 * Collapse the desktop admin sidebar to a 64px ICON RAIL while this page is
 * mounted (ปอน 2026-06-11 · owner "พอมาหน้านี้พับ sidebar เหลือไอคอน · hover แล้ว
 * กางออก เหมือนหน้าบ้านลูกค้า"). Wide admin pages (e.g. the forwarder detail with
 * its Excel-style table) reclaim the sidebar's width; hovering the rail slides the
 * full menu out as an overlay (content never shifts).
 *
 * Adds `body.admin-sidebar-rail` on mount, removes on unmount — so the rail is
 * scoped to THIS route only; every other admin page keeps the full sidebar. The
 * CSS that wires the rail lives in app/globals.css (`body.admin-sidebar-rail`).
 * Desktop (lg+) @media only — on mobile the admin sidebar is an off-canvas drawer,
 * so the class is a no-op there. Mirrors the customer-side <CollapseSidebar>
 * (`pcs-sidebar-rail`) on /service-import/table.
 */
export function CollapseAdminSidebar() {
  useEffect(() => {
    document.body.classList.add("admin-sidebar-rail");
    return () => document.body.classList.remove("admin-sidebar-rail");
  }, []);
  return null;
}
