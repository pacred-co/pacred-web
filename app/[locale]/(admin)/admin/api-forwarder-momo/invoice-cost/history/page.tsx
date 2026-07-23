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

      {/* ตารางสไตล์เดียวกับหน้ารายการมอบงานคนขับ (owner 2026-07-23: "อยากได้แบบหน้าที่ส่งรูป
          ไปให้ ดูอ่านง่ายสบายตา") — แถวโปร่ง · ชื่อเอกสารตัวหนาสีแบรนด์ + แจงรายละเอียดใต้ชื่อ ·
          สถานะเป็นแคปซูลมีจุดสี · ปุ่มเป็น pill outline สีตามงาน. */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">ยังไม่มีการตัดจ่ายบิล MOMO</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/60 text-xs text-muted">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold [&>th]:whitespace-nowrap">
                  <th className="text-center">วันที่ตัดจ่าย</th>
                  <th className="text-left">เอกสารตัดจ่าย</th>
                  <th className="text-center">ผู้ทำรายการ</th>
                  <th className="text-right">ยอดที่จ่าย</th>
                  <th className="text-center">หลักฐาน</th>
                  <th className="text-center">สถานะ</th>
                  <th className="text-center">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border align-middle ${
                      r.status === "void" ? "bg-gray-50/80 text-muted" : i % 2 === 1 ? "bg-surface-alt/25" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap text-muted">
                      {formatThaiDateTime(r.createdAt)}
                    </td>

                    {/* หัวแถว = แจงรายละเอียดของเอกสารให้ครบ (owner: "ให้มีรายละเอียดของทั้ง
                        เอกสารแจงอยู่ตรงหัวแถว เหมือนเดิม เอามาแจงให้ครบ") */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/api-forwarder-momo/invoice-cost/history/${r.id}`}
                        className={`font-mono text-base font-bold ${
                          r.status === "void" ? "text-muted line-through" : "text-primary-600 hover:underline"
                        }`}
                      >
                        {r.docNo}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        ใบแจ้งหนี้ MOMO : <span className="font-medium text-foreground">{r.invoiceNo || "—"}</span>
                        {r.invoiceDate && <> · ลงวันที่ {r.invoiceDate}</>}
                      </div>
                      <div className="text-xs text-muted">
                        จำนวนรายการ : {r.lineCount} แทรคกิ้ง
                        {r.status === "void" && r.voidReason && (
                          <> · <span className="text-red-700">เหตุผลยกเลิก : {r.voidReason}</span></>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                      <span className="font-medium text-foreground">{r.createdBy ?? "-"}</span>
                    </td>

                    <td className="px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                      ฿{baht(r.totalThb)}
                    </td>

                    {/* หลักฐาน 2 ชนิด แยกกัน — ใบเสร็จ MOMO (REC) กับ สลิปการโอน */}
                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={r.receiptCount > 0 ? "text-emerald-700 font-medium" : "text-muted"}>
                          {r.receiptCount > 0 ? `🧾 ใบเสร็จ ${r.receiptCount}` : "🧾 ยังไม่มีใบเสร็จ"}
                        </span>
                        <span className={r.slipCount > 0 ? "text-emerald-700 font-medium" : "text-muted"}>
                          {r.slipCount > 0 ? `📎 สลิป ${r.slipCount}` : "📎 ยังไม่มีสลิป"}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {r.status === "void" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> ยกเลิกแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ตัดจ่ายแล้ว
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <Link
                        href={`/admin/api-forwarder-momo/invoice-cost/history/${r.id}`}
                        className="inline-flex items-center rounded-full border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        ดูรายละเอียด
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
