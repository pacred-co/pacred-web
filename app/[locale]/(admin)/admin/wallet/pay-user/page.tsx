import { requireAdmin } from "@/lib/auth/require-admin";
import { PayUserClient } from "./pay-user-client";

/**
 * P0-19 — จ่ายแทนลูกค้า (admin pay-on-behalf).
 *
 * Faithful port of legacy `pcs-admin/pay-users.php`. Staff take a phone/LINE
 * customer's wallet payment for their unpaid orders — two lanes:
 *   • ฝากสั่ง (shop · paymentOrder) — debit `tb_wallet` + `tb_wallet_hs`
 *     (type='2') + flip `tb_header_order.hStatus` 2→3.
 *   • ฝากนำเข้า (forwarder · paymentForwarderNew · Phase 2) — debit
 *     `tb_wallet` + `tb_wallet_hs` (type='4'/typeNew='6'/typeService='2') +
 *     flip `tb_forwarder.fStatus` 5→6 (credit rows: fCredit→'' instead).
 *     Pricing (PCSF เหมาๆ ฿50 + corporate 1%) via
 *     lib/forwarder/forwarder-debit-total.ts.
 * The wallet contract is shared with the customer self-pay path (ADR-0018)
 * so the THB charged is identical.
 *
 * Was a redirect stub to `/admin/wallet?kind=order_payment` (which itself
 * landed in the rebuilt-table wallet family) — now a real working tool.
 *
 * Phase-3 follow-up (flagged in actions/admin/pay-user.ts): the
 * insufficient-balance slip-top-up path (pay-users.php L342 / L561).
 */
export const dynamic = "force-dynamic";

export default async function AdminWalletPayUserPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">จ่ายแทนลูกค้า</h1>
        <p className="mt-1 text-sm text-gray-500">
          รับชำระค่าฝากสั่งซื้อ + ฝากนำเข้าจากลูกค้าที่ติดต่อทางโทรศัพท์/LINE — ตัดจากกระเป๋าเงินของลูกค้า
        </p>
      </header>
      <PayUserClient />
    </div>
  );
}
