import { NextResponse } from "next/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/payment-due-count → { count }
 *
 * Live (uncached) count of the customer's items awaiting payment across every
 * service — the number on the "ชำระ" FloatingTabs badge. The FloatingTabs
 * client fetches this so the badge shows on EVERY page (public marketing site
 * + protected portal), not only where the protected layout seeds it
 * server-side, and stays real-time (re-fetched on navigation / focus).
 *
 * "ต้องชำระ" per service — same definition as lib/legacy/pcs-chrome.ts
 * `countPaymentDue` + the /payment-due page:
 *   order    → tb_header_order  hstatus  = "2"  (รอชำระเงิน)
 *   import   → tb_forwarder     fstatus  = "5"  (รอชำระเงิน)
 *   payment  → tb_payment       paystatus = "1" (รอดำเนินการ)
 *
 * Not signed in / no member code → { count: 0 }. Read-only; `tb_*` is
 * RLS-locked to service_role so the counts run through the admin client,
 * scoped to this user's member code.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getCurrentUserWithProfile();
  const memberCode = data?.profile?.member_code ?? "";
  if (!memberCode) {
    return NextResponse.json({ count: 0 });
  }

  const admin = createAdminClient();
  const [order2, fwd5, pay1] = await Promise.all([
    admin
      .from("tb_header_order")
      .select("*", { count: "exact", head: true })
      .eq("userid", memberCode)
      .eq("hstatus", "2"),
    admin
      .from("tb_forwarder")
      .select("*", { count: "exact", head: true })
      .eq("userid", memberCode)
      .eq("fstatus", "5"),
    admin
      .from("tb_payment")
      .select("*", { count: "exact", head: true })
      .eq("userid", memberCode)
      .eq("paystatus", "1"),
  ]);

  const count =
    (order2.count ?? 0) + (fwd5.count ?? 0) + (pay1.count ?? 0);

  return NextResponse.json({ count });
}
