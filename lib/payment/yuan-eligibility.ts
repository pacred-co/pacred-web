import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ฝากโอน (yuan-transfer) eligibility gate — faithful port of legacy
 * `pcs-admin/../payment.php` L256-276.
 *
 * A customer may create a ฝากโอน only when BOTH hold:
 *   1. No PENDING-juristic row — `tb_corporate.corporatestatus='1'` absent
 *      (a pending juristic account shows the "นิติบุคคล รอตรวจสอบ" block).
 *   2. Has used BOTH paid services — a paid shop order
 *      (`tb_header_order.hstatus` 4 or 5) AND a paid forwarder
 *      (`tb_forwarder.fstatus` 6 or 7).
 *
 * The list page `service-payment/page.tsx` already enforces this on render
 * (hides the create form otherwise). This helper is the SERVER-SIDE backstop
 * so a deep-link straight to `/service-payment/add` can't bypass the gate.
 * It replicates the page logic EXACTLY — a customer who can see the form on
 * the page will pass here (same query, same data) → no over-block; only the
 * deep-link bypass is closed.
 *
 * @returns null when eligible, or a Thai error string when blocked.
 */
export async function checkYuanPaymentEligibility(memberCode: string): Promise<string | null> {
  const admin = createAdminClient();
  const [corp, fwd, hdr] = await Promise.all([
    admin.from("tb_corporate").select("id").eq("userid", memberCode).eq("corporatestatus", "1"),
    // legacy `fStatus>5` — single-digit varchar, lexical == numeric → .gt('5') = '6'/'7'
    admin.from("tb_forwarder").select("id").eq("userid", memberCode).gt("fstatus", "5"),
    admin.from("tb_header_order").select("hstatus").eq("userid", memberCode),
  ]);

  // (1) pending juristic → blocked
  if ((corp.data?.length ?? 0) > 0) {
    return "บัญชีนิติบุคคลอยู่ระหว่างตรวจสอบ — ยังใช้บริการฝากชำระสินค้าไม่ได้ กรุณาติดต่อทีมงาน";
  }

  // (2) must have used BOTH services (legacy `if(!usedShop || !usedForwarder)`)
  const usedForwarder = (fwd.data?.length ?? 0) > 0;
  const usedShop = (hdr.data ?? []).some((r) => {
    const h = Number((r as { hstatus: string | null }).hstatus);
    return h > 3 && h !== 6; // hstatus 4 or 5
  });
  if (!usedShop || !usedForwarder) {
    return "ต้องมีประวัติใช้บริการฝากสั่งซื้อและฝากนำเข้าที่ชำระเงินแล้วก่อน จึงจะใช้บริการฝากชำระสินค้าได้";
  }

  return null;
}
