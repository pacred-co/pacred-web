import { redirect } from "next/navigation";

// 2026-06-02 — AR-aging DEDUP (CLAUDE.md §PM-5 follow-up). There were two
// AR-aging pages: this accounting twin (tb_forwarder.fstatus='5' only · top-20
// + rep-attribution) and /admin/reports/ar-aging (the richer Wave-C BI version:
// fstatus='5' ∪ fcredit-unpaid · calcForwarderOutstanding faithful calc · debtor
// phones · top-50 · cap-safe). Canonical = /admin/reports/ar-aging; this twin's
// only unique view (rep-attribution via tb_sales_report) was FOLDED INTO it
// (reports-ar.ts → topReps). Redirect so any old link/bookmark + the accounting
// menubar entry land on the unified page. (actions/admin/ar-aging.ts is now
// orphaned — removed in the same change.)
export default function AccountingArAgingRedirect() {
  redirect("/admin/reports/ar-aging");
}
