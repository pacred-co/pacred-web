/**
 * /admin/report-cnt/pay — RETIRED (2026-05-25 ค่ำ · Wave 17 ux-fix)
 *
 * Previously a separate page where admin re-selected unpaid containers
 * + filled a payment form. ภูม noted this was wrong UX: legacy lets
 * admin tick on the list itself + opens an AJAX modal in-place — no
 * extra navigation. So the flow now lives at /admin/report-cnt (the
 * list) with <CntListTable> (checkboxes) + <CntPaymentModal> (in-page).
 *
 * Wording also corrected here: "บันทึกรายการจ่ายเงินตู้" was wrong
 * (implies fait accompli) — should be "ทำรายการเบิกเงินค่าตู้" (filing
 * a pending withdrawal request that needs manager approval).
 *
 * This file keeps the URL alive as a legacy fallback (bookmarks, old
 * links from cnt-hs, etc.) and just redirects to the new flow.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CntPaymentLegacyRedirect() {
  // Land users on the succeed tab (the only place containers can be billed)
  redirect("/admin/report-cnt?page=succeed");
}
