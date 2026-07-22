/**
 * /admin/api-forwarder-momo/invoice-cost/history — ประวัติการตัดจ่ายบิล MOMO.
 *
 * owner 2026-07-22: "พอกดตัดบิล MOMO นี้ก็มีรันเอกสารไว้ให้สามารถดูประวัติ และ ดูอ้างอิงได้".
 * Lists every settlement (MCS…) newest-first · click a row → the detail (lines · slip ·
 * void). Gated to the cost roles (ultra/accounting/pricing). Read-only page.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { Link } from "@/i18n/navigation";
import { listMomoInvoiceSettlements } from "@/actions/admin/momo-invoice-settlement";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";

export const dynamic = "force-dynamic";

const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MomoSettlementHistoryPage() {
  const { roles } = await requireAdmin();
  if (!canViewCostProfit(roles)) notFound();

  const res = await listMomoInvoiceSettlements({ limit: 200 });
  const rows = res.ok && res.data ? res.data.rows : [];
  const loadError = res.ok ? null : res.error;

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin/momo-containers" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo/invoice-cost" className="hover:text-primary-600">บิลต้นทุน</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ประวัติการตัดจ่าย</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · MOMO · ตัดจ่าย</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติการตัดจ่ายบิล MOMO</h1>
          <p className="mt-1.5 text-sm text-muted">
            ทุกครั้งที่ตัดจ่ายบิล MOMO ระบบออกเลขเอกสาร (MCS…) เก็บไว้ที่นี่ — กดเข้าดูรายละเอียด แนบสลิปย้อนหลัง หรือยกเลิกได้.
          </p>
        </div>
        <Link
          href="/admin/api-forwarder-momo/invoice-cost"
          className="shrink-0 rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface-alt"
        >
          ← กลับไปหน้าบิลต้นทุน
        </Link>
      </header>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          โหลดประวัติไม่สำเร็จ: {loadError}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">ยังไม่มีการตัดจ่ายบิล MOMO</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">เลขเอกสาร</th>
                  <th className="px-2 py-2 text-left">ใบแจ้งหนี้ MOMO</th>
                  <th className="px-2 py-2 text-right">ยอดรวม</th>
                  <th className="px-2 py-2 text-right">รายการ</th>
                  <th className="px-2 py-2 text-center">สลิป</th>
                  <th className="px-2 py-2 text-left">สถานะ</th>
                  <th className="px-2 py-2 text-left">ผู้ทำ / วันที่</th>
                  <th className="px-2 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-border align-top ${r.status === "void" ? "bg-gray-50 text-muted" : ""}`}>
                    <td className="px-2 py-2 font-mono font-medium">{r.docNo}</td>
                    <td className="px-2 py-2">{r.invoiceNo || "—"}</td>
                    <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">฿{baht(r.totalThb)}</td>
                    <td className="px-2 py-2 text-right">{r.lineCount}</td>
                    <td className="px-2 py-2 text-center">{r.slipCount > 0 ? `📎 ${r.slipCount}` : "—"}</td>
                    <td className="px-2 py-2">
                      {r.status === "void" ? (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700">ยกเลิกแล้ว</span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">ตัดจ่ายแล้ว</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-muted">
                      {r.createdBy ?? "-"}
                      <div>{formatThaiDateTime(r.createdAt)}</div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Link
                        href={`/admin/api-forwarder-momo/invoice-cost/history/${r.id}`}
                        className="rounded-full border border-border px-3 py-1 text-[11px] font-medium hover:bg-surface-alt"
                      >
                        ดู / แนบสลิป →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
