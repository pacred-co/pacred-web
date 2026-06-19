import { redirect } from "next/navigation";

/**
 * `/wallet/deposit` — RETIRED (2026-06-19 · owner).
 *
 * The customer "เติมเงิน" (wallet top-up) flow was removed platform-wide:
 * customers now pay each service directly by slip (ฝากนำเข้า / ฝากสั่งซื้อ /
 * ฝากโอนหยวน), accounting verifies the slip (2-layer review) and ตัดจ่าย — no
 * pre-funded wallet balance. The wallet itself stays (statement / withdraw /
 * refunds / history), only the SELF top-up entry is gone.
 *
 * This route is kept as a graceful redirect so any stale link, bookmark, or
 * cached client lands on the wallet statement instead of a 404. The legacy
 * deposit form (legacy-deposit-form.tsx) + the customer deposit server actions
 * (actions/wallet.ts::createDeposit / submitLegacyWalletDeposit) are no longer
 * reachable from any UI (orphaned; a future cleanup may delete them). They only
 * ever wrote a PENDING row that still requires an admin slip-approve, so there
 * is no self-credit path.
 *
 * Admin manual-credit (actions/admin/wallet-hs.ts::adminCreateWalletHsManual)
 * and admin approval of any historical pending top-up slips are UNAFFECTED.
 */
export const dynamic = "force-dynamic";

export default function WalletDepositRetired() {
  redirect("/wallet");
}
