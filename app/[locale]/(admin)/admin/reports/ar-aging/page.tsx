import { redirect } from "next/navigation";

// 2026-06-02 — AR-aging DEDUP (CLAUDE.md §PM-5 follow-up · reconciled with ภูม sitting-I v4).
// Two AR-aging pages existed. CANONICAL = /admin/accounting/ar-aging — ภูม's accounting-lane
// cockpit, ACTIVELY developed (rep-attribution + customer drill-down + CARGO_MENUBAR + CSV export).
// This reports-side BI page now redirects there so leadership + accounting reach ONE cockpit.
// NOTE: the broader outstanding calc this page used (fstatus=5 ∪ fcredit-unpaid via
// calcForwarderOutstanding — actions/admin/reports-ar.ts, kept) is the reference for ภูม's
// documented Phase-2 "tighter actual-unpaid"; ภูม's canonical currently uses fstatus=5-only (MVP).
export default function ArAgingReportRedirect() {
  redirect("/admin/accounting/ar-aging");
}
