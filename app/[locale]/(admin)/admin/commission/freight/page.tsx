import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { canViewProfit } from "@/lib/admin/money-visibility";
import {
  getFreightCommissionState,
  adminListCommissionAccruals,
  adminListCommissionWithdrawals,
} from "@/actions/admin/freight-commission";
import { FreightCommissionClient } from "./freight-commission-client";

/**
 * /admin/commission/freight — WAVE 6 · the FREIGHT staff-commission ledger +
 * withdrawal queue + rate-tier review. 💰 MONEY-CRITICAL · ships DORMANT.
 *
 * The whole system is gated by business_config commission.freight_enabled
 * (default OFF · mig 0167). While OFF the page renders a prominent
 * "DORMANT — รอ owner ยืนยัน rate + เปิดใช้" banner and accruals no-op; the
 * ledger + queue are still viewable (history), so an accountant can inspect.
 *
 * RBAC: super/accounting/sales_admin + the freight roles can VIEW/approve;
 * the PAID flip + the tier-RATE confirm (is_owner_confirmed) are super-only
 * (enforced in the actions + the UI hides those affordances for non-super). The
 * actions are the single source of truth on RBAC — this page gates the broad
 * view set and passes `canPay`/`canConfirmTiers` for UI affordance only.
 */

export const dynamic = "force-dynamic";

export default async function AdminFreightCommissionPage() {
  const { roles } = await requireAdmin([
    "super", "accounting", "sales_admin", "pricing", "interpreter",
    "freight_sales_manager", "freight_sales", "freight_import_manager", "freight_export_manager",
  ]);
  // PAID flip = god roles (ultra + super) — the explicit money-out gate · mirror
  // the action. (ACTION gate, not money-visibility → isGodRole, NOT canViewProfit.)
  const canPay = isGodRole(roles);
  // Approve/reject = god roles + accounting.
  const canApprove = isGodRole(roles) || roles.includes("accounting");
  // Confirm a commission tier RATE (is_owner_confirmed) = god roles (the owner
  // sign-off gate · mirror adminSetFreightCommissionTierConfirmed).
  const canConfirmTiers = isGodRole(roles);
  // Commission AMOUNTS (base/accrued · gross/WHT/net) = money-internal (owner
  // 2026-06-18): only ultra/accounting/pricing. Drives the amount columns in the
  // client; super keeps approve/pay reach but does NOT see the money figures.
  const canViewMoney = canViewProfit(roles);

  const [stateRes, accrualsRes, withdrawalsRes] = await Promise.all([
    getFreightCommissionState(),
    adminListCommissionAccruals("all"),
    adminListCommissionWithdrawals("all"),
  ]);

  const state = stateRes.ok && stateRes.data
    ? stateRes.data
    : { enabled: false, tiers: [], anyTierPending: false };
  const rawAccruals = accrualsRes.ok && accrualsRes.data ? accrualsRes.data : [];
  const rawWithdrawals = withdrawalsRes.ok && withdrawalsRes.data ? withdrawalsRes.data : [];
  const loadFailed = !stateRes.ok || !accrualsRes.ok || !withdrawalsRes.ok;

  // DATA-LAYER money hide (owner 2026-06-18): when the viewer cannot see money
  // internals, zero the commission AMOUNT fields server-side so the real figures
  // never reach the client payload. WHT % left in place (it's a rate, also shown
  // in the rate-tier config table). The client also drops the amount columns.
  const accruals = canViewMoney
    ? rawAccruals
    : rawAccruals.map((a) => ({ ...a, baseThb: 0, accruedAmountThb: 0 }));
  const withdrawals = canViewMoney
    ? rawWithdrawals
    : rawWithdrawals.map((w) => ({ ...w, grossThb: 0, whtThb: 0, netThb: 0 }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
        <h1 className="mt-1 text-2xl font-bold">ค่าคอมมิชชั่น Freight (Commission)</h1>
        <p className="text-xs text-muted max-w-3xl">
          ระบบสะสมค่าคอมมิชชั่นพนักงานฝั่ง Freight (เฟรท 1% · พิธีการ 5% · เอกสาร 5% − หัก ณ ที่จ่าย 3%
          · เหมา 20฿/ชิปเมนต์ EK/AIR) + คิวอนุมัติ/จ่ายเงินเบิก. การจ่ายไม่อัตโนมัติ — ต้องอนุมัติแล้ว super
          กดยืนยันจ่ายเองทุกครั้ง.
        </p>
      </header>

      <FreightCommissionClient
        enabled={state.enabled}
        anyTierPending={state.anyTierPending}
        tiers={state.tiers}
        accruals={accruals}
        withdrawals={withdrawals}
        canPay={canPay}
        canApprove={canApprove}
        canConfirmTiers={canConfirmTiers}
        canViewMoney={canViewMoney}
        loadFailed={loadFailed}
      />
    </main>
  );
}
