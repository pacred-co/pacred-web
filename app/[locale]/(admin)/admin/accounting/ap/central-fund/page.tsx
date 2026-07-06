/**
 * /admin/accounting/ap/central-fund — กองกลางโกดังจีน (CNY imprest float · I).
 *
 * Spec §4.3: the ¥/เรท/฿/หาร2 (TTP↔PCS) table + running ¥ balance, top-up vs
 * spend rows visually split. READ-only in Slice 1 (the ¥-float top-up/spend
 * record write path is Slice 2).
 *
 * Auth — finance-only: accounting + super + ultra (RLS mirror mig 0239).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { PageHeader } from "@/components/admin/page-header";

import { formatThaiDate } from "@/lib/utils/thai-datetime";
import { listApCentralFund } from "@/lib/admin/ap-disbursement";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ApCentralFundPage() {
  await requireAdmin(["accounting"]); // super + ultra admitted via isGodRole

  const admin = createAdminClient();
  const { rows, error } = await listApCentralFund(admin, { fundKey: "china_warehouse" });

  const totalCny = rows.reduce((s, r) => s + r.amount_cny, 0);
  const totalThb = rows.reduce((s, r) => s + r.amount_thb, 0);

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/ap" />
      <main className="space-y-5 p-6 lg:p-8">
        <PageHeader
          eyebrow="ADMIN · ACCOUNTING · AP"
          title="กองกลางโกดังจีน (¥ imprest float)"
          subtitle="เงินสำรองหมุนเวียนหยวน (ค่าเช่า/แรงงาน/OT/กล้อง) · ¥ × เรท = ฿ · หาร 2 (TTP↔PCS) · ยอดคงเหลือ ¥ วิ่ง"
          actions={
            <Link
              href="/admin/accounting/ap"
              className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ← AP Ledger
            </Link>
          }
        />

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
          หน้าอ่านอย่างเดียว (เฟส 1) — การบันทึกเติม/เบิกกองกลาง (¥) จะเปิดในเฟส 2.
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error}
          </div>
        )}

        {/* Σ strip */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <p className="text-xs text-gray-500">รายการ</p>
            <p className="mt-1 text-lg font-semibold">{rows.length} รายการ</p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <p className="text-xs text-gray-500">รวมหยวน</p>
            <p className="mt-1 font-mono text-lg font-semibold text-blue-700">¥{fmt2(totalCny)}</p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <p className="text-xs text-gray-500">รวมบาท</p>
            <p className="mt-1 font-mono text-lg font-semibold text-primary-700">฿{fmt2(totalThb)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white scrollbar-x-visible">
          <table className="w-full min-w-[760px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
            <thead>
              <tr className="border-b border-black/10 bg-gray-50 text-left text-[11px] uppercase text-gray-500">
                <th className="px-3 py-2.5">วันที่</th>
                <th className="px-3 py-2.5">รายการ</th>
                <th className="px-3 py-2.5 text-right">ยอด (¥)</th>
                <th className="px-3 py-2.5 text-right">เรท</th>
                <th className="px-3 py-2.5 text-right">ยอด (฿)</th>
                <th className="px-3 py-2.5 text-right">หาร 2 (฿)</th>
                <th className="px-3 py-2.5 text-right">คงเหลือ (¥)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-400">
                    ยังไม่มีรายการกองกลาง
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isTopup = r.amount_cny >= 0;
                return (
                  <tr key={r.id} className={isTopup ? "" : "bg-rose-50/40"}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                      {formatThaiDate(r.txn_date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-foreground">{r.item_label}</span>
                      {r.note && <span className="ml-1 text-[11px] text-gray-400">· {r.note}</span>}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono ${
                        isTopup ? "text-green-700" : "text-rose-700"
                      }`}
                    >
                      {isTopup ? "+" : ""}¥{fmt2(r.amount_cny)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{r.fx_rate.toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">฿{fmt2(r.amount_thb)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                      {r.split_thb != null ? `฿${fmt2(r.split_thb)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      {r.balance_cny != null ? `¥${fmt2(r.balance_cny)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
