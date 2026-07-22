/**
 * /admin/api-forwarder-momo/invoice-cost/history/[id] — one MOMO settlement (ตัดจ่าย) doc.
 *
 * owner 2026-07-22: "ดูประวัติ และ ดูอ้างอิงได้ และต้องมีช่องไว้ใส่สลิปย้อนหลังได้ด้วย".
 * Shows the header + every settled line (tracking / ตู้ / จำนวนเงิน · link to each forwarder),
 * the attached slips, a retroactive slip-upload box, and a void action. Gated cost roles.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { Link } from "@/i18n/navigation";
import { getMomoInvoiceSettlement } from "@/actions/admin/momo-invoice-settlement";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { SlipImage } from "@/components/admin/slip-image";
import { MomoSettlementActions } from "./settlement-actions";

export const dynamic = "force-dynamic";

const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MomoSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { roles } = await requireAdmin();
  if (!canViewCostProfit(roles)) notFound();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const res = await getMomoInvoiceSettlement({ id });
  if (!res.ok || !res.data) notFound();
  const s = res.data;

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin/momo-containers" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo/invoice-cost/history" className="hover:text-primary-600">ประวัติการตัดจ่าย</Link>
        <span>›</span>
        <span className="text-foreground font-medium font-mono">{s.docNo}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-mono">{s.docNo}</h1>
            {s.status === "void" ? (
              <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">ยกเลิกแล้ว</span>
            ) : (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">ตัดจ่ายแล้ว</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            ใบแจ้งหนี้ MOMO: <strong>{s.invoiceNo || "—"}</strong> · {s.lineCount} รายการ · รวม{" "}
            <strong className="text-foreground">฿{baht(s.totalThb)}</strong>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            ตัดจ่ายโดย {s.paidBy ?? s.createdBy ?? "-"} · {formatThaiDateTime(s.paidAt ?? s.createdAt)}
            {s.note && <> · หมายเหตุ: {s.note}</>}
          </p>
          {s.status === "void" && (
            <p className="mt-1 text-[12px] text-red-700">
              ยกเลิกโดย {s.voidBy ?? "-"} · {formatThaiDateTime(s.voidAt)} · เหตุผล: {s.voidReason ?? "—"}
            </p>
          )}
        </div>
        <Link
          href="/admin/api-forwarder-momo/invoice-cost/history"
          className="shrink-0 rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface-alt"
        >
          ← กลับไปประวัติ
        </Link>
      </header>

      {/* รายการที่ตัดจ่าย — ลิงก์กลับไปที่ชิปเม้น/แทรคกิ้ง (owner: "ลิงค์กลับไปที่ ชิปเม้น แทรคกิ้ง") */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">รายการที่ตัดจ่าย ({s.lines.length})</h2>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs">
            <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-2 text-left">แทรคกิ้ง</th>
                <th className="px-2 py-2 text-left">ตู้</th>
                <th className="px-2 py-2 text-right">จำนวนเงิน</th>
                <th className="px-2 py-2 text-left">ต้นทุน</th>
                <th className="px-2 py-2 text-right">ชิปเม้น</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.fid} className="border-t border-border">
                  <td className="px-2 py-2 font-mono">{l.tracking}</td>
                  <td className="px-2 py-2 font-mono">{l.cabinet ?? "—"}</td>
                  <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">฿{baht(l.amountThb)}</td>
                  <td className="px-2 py-2 text-[11px]">
                    {l.costWritten ? (
                      <span className="text-green-700">✓ ลงต้นทุนแล้ว</span>
                    ) : (
                      <span className="text-muted">— (ตอนตัดจ่ายยังไม่ลงต้นทุน)</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/admin/forwarders/${l.fid}`} className="text-primary-600 hover:underline" title="เปิดชิปเม้น/รายการนำเข้านี้">
                      #{l.fid} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* สลิป (ย้อนหลังได้) + ยกเลิก */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold">สลิปการโอน (แนบย้อนหลังได้)</h2>
        {s.slipUrls.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {s.slipUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-40">
                <SlipImage src={url} className="h-40 w-40 rounded-lg border border-border object-cover" pdfMode="tile" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted">ยังไม่มีสลิปแนบ — อัปโหลดด้านล่างเพื่อเก็บเป็นหลักฐานย้อนหลัง</p>
        )}
        <MomoSettlementActions settlementId={s.id} docNo={s.docNo} isVoid={s.status === "void"} />
      </section>
    </main>
  );
}
