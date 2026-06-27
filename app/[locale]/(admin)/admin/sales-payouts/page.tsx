/**
 * /admin/sales-payouts — the FAITHFUL pending-payout queue (P0-23 · ADR-0020).
 *
 * REPOINTED 2026-05-31 from the DEAD rebuilt `sales_payouts` table (empty on
 * prod · `actions/admin/sales-payouts.ts` is the dead twin) onto the legacy
 * `tb_user_sales_admin_pay` family via `getPendingSalesPayoutsTb()`.
 *
 * The customer earn→withdraw path (`actions/commissions-tb.ts`) inserts a
 * `tb_user_sales_admin_pay` row at status='2' when an agent requests a
 * commission withdrawal. THIS page is the queue of those pending requests;
 * the admin clicks a row → `[id]` detail → uploads the bank-transfer slip →
 * status flips '2'→'3'. Faithful to `pcs-admin/report-user-sales-history.php`
 * LIST mode (L79-81 · `WHERE status=2`).
 *
 * Reachable from: the accounting + sales-admin dashboards (both link
 * /admin/sales-payouts) and the DISBURSEMENT_MENUBAR (≤3 clicks · §0d).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { getPendingSalesPayoutsTb } from "@/actions/admin/sales-payouts-tb";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportSalesPayoutsAll } from "@/actions/admin/export/sales-payouts";

export const dynamic = "force-dynamic";

export default async function AdminSalesPayoutsPage() {
  // W-1 (gap-admin H-1): page-level role gate. Exposes sales-rep bank
  // accounts + commission payouts via createAdminClient (RLS-bypass) —
  // accounting + sales_admin (super implicit).
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Commission payout amount = money-internal (owner 2026-06-18): visible only
  // to ultra/accounting/pricing. Page stays reachable; amount column + CSV are
  // dropped at the data layer for everyone else (incl. super, sales_admin).
  const showMoney = canViewProfit(roles);

  // CSV columns mirror the on-screen table (amount only when cost-allowed).
  const CSV_COLS: CsvCol[] = [
    { key: "date", label: "วันที่ทำรายการ" },
    { key: "userIDMain", label: "รหัสตัวแทนขาย" },
    { key: "adminCreate", label: "ผู้ทำรายการ" },
    ...(showMoney ? [{ key: "amount", label: "จำนวนเงิน" } as CsvCol] : []),
    { key: "status", label: "สถานะ" },
  ];

  const res = await getPendingSalesPayoutsTb();
  const rows = res.ok ? (res.data ?? []) : [];

  // Map the displayed rows to flat CSV rows (same keys as CSV_COLS).
  const csvRows: CsvRow[] = rows.map((r) => ({
    date: r.date ? new Date(r.date).toLocaleString("th-TH") : "",
    userIDMain: r.userIDMain ?? "",
    adminCreate: r.adminCreate ?? "",
    ...(showMoney ? { amount: Number(r.amount).toFixed(2) } : {}),
    status: "รอดำเนินการ",
  }));

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/sales-payouts" />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
            <h1 className="mt-1 text-2xl font-bold">อนุมัติเงินลูกค้าตัวแทน (Sales Payouts)</h1>
            <p className="mt-1 text-xs text-muted">
              คำขอเบิกส่วนแบ่งจากลูกค้าตัวแทน ที่รอจ่ายเงิน (สถานะ รอดำเนินการ) — กดรายการเพื่อดูบัญชีรับโอน + แนบสลิปจ่ายเงิน
            </p>
          </div>
          <CsvButton
            rows={csvRows}
            cols={CSV_COLS}
            filename="sales-payouts.csv"
            fetchAll={async () => {
              "use server";
              return exportSalesPayoutsAll();
            }}
          />
        </div>

        {!res.ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดรายการไม่สำเร็จ: {res.error}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีคำขอรอจ่ายเงิน</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">วันที่ทำรายการ</th>
                    <th className="px-4 py-3">รหัสตัวแทนขาย</th>
                    <th className="px-4 py-3">ผู้ทำรายการ</th>
                    {showMoney && <th className="px-4 py-3 text-right">จำนวนเงิน</th>}
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">ตัวเลือก</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {r.date ? new Date(r.date).toLocaleString("th-TH") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{r.userIDMain}</td>
                      <td className="px-4 py-3 text-xs font-mono">{r.adminCreate ?? "—"}</td>
                      {showMoney && (
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          ฿{Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          รอดำเนินการ
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/sales-payouts/${r.id}`}
                          className="inline-block rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                        >
                          แก้ไขข้อมูลและดูรายละเอียด
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
