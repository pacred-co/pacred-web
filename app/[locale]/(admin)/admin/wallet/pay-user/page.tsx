import { requireAdmin } from "@/lib/auth/require-admin";
import { PayUserClient } from "./pay-user-client";

/**
 * P0-19 — จ่ายแทนลูกค้า (admin pay-on-behalf).
 *
 * Faithful port of legacy `pcs-admin/pay-users.php` (shop-order leg). Staff
 * take a phone/LINE customer's wallet payment for their unpaid ฝากสั่ง
 * orders: debit `tb_wallet` + write `tb_wallet_hs` (type='2') + flip
 * `tb_header_order.hStatus` 2→3. The wallet contract is shared with the
 * customer self-pay path (ADR-0018) so the THB charged is identical.
 *
 * Was a redirect stub to `/admin/wallet?kind=order_payment` (which itself
 * landed in the rebuilt-table wallet family) — now a real working tool.
 *
 * Phase-2 follow-ups (flagged in actions/admin/pay-user.ts): the forwarder
 * leg (paymentForwarderNew, fStatus 5→6) + the insufficient-balance
 * slip-top-up path.
 */
export const dynamic = "force-dynamic";

export default async function AdminWalletPayUserPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">จ่ายแทนลูกค้า</h1>
        <p className="mt-1 text-sm text-gray-500">
          รับชำระค่าฝากสั่งซื้อจากลูกค้าที่ติดต่อทางโทรศัพท์/LINE — ตัดจากกระเป๋าเงินของลูกค้า
        </p>
      </header>
      <PayUserClient />
    </div>
  );
}
