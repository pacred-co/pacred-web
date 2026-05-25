/**
 * /admin/accounting/cargo — redirect to /admin/accounting.
 *
 * Wave 20 fix (2026-05-26) — ภูม flagged: sidebar "ระบบบัญชี" was landing
 * here (a static card-grid hub) but the actual PEAK-style accounting
 * dashboard with real ฿ numbers was on /admin/accounting. Pi-Pop wants
 * ONE unified accounting landing — the dashboard wrapped in this hub's
 * chrome (PageTopMenubar + AccountingSegmentPills).
 *
 * Resolution: the chrome + content now live together on /admin/accounting.
 * This route preserves back-compat (any external link to /accounting/cargo
 * lands the user in the right place) and the sidebar's "ระบบบัญชี" target
 * has been updated to /admin/accounting in lib/admin/sidebar config.
 *
 * The shared menubar/cards config lives at
 * `lib/admin/accounting-menubar.ts` and is consumed by both this redirect
 * (for any deep-links that still want cargo-context) and the dashboard.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminAccountingCargoRedirect() {
  redirect("/admin/accounting");
}
