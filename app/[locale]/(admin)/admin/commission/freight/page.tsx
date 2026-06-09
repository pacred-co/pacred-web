import { requireAdmin } from "@/lib/auth/require-admin";
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
 * the PAID flip is super-only (enforced in the action + the UI hides Pay for
 * non-super). The actions are the single source of truth on RBAC — this page
 * gates the broad view set and passes `canPay` for UI affordance only.
 */

export const dynamic = "force-dynamic";

export default async function AdminFreightCommissionPage() {
  const { roles } = await requireAdmin([
    "super", "accounting", "sales_admin", "pricing", "interpreter",
    "freight_sales_manager", "freight_sales", "freight_import_manager", "freight_export_manager",
  ]);
  // PAID flip = super only (the explicit money-out gate · mirror the action).
  const canPay = roles.includes("super");
  // Approve/reject = super + accounting.
  const canApprove = roles.includes("super") || roles.includes("accounting");

  const [stateRes, accrualsRes, withdrawalsRes] = await Promise.all([
    getFreightCommissionState(),
    adminListCommissionAccruals("all"),
    adminListCommissionWithdrawals("all"),
  ]);

  const state = stateRes.ok && stateRes.data
    ? stateRes.data
    : { enabled: false, tiers: [], anyTierPending: false };
  const accruals = accrualsRes.ok && accrualsRes.data ? accrualsRes.data : [];
  const withdrawals = withdrawalsRes.ok && withdrawalsRes.data ? withdrawalsRes.data : [];
  const loadFailed = !stateRes.ok || !accrualsRes.ok || !withdrawalsRes.ok;

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
        loadFailed={loadFailed}
      />
    </main>
  );
}
