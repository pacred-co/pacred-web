/**
 * /admin/billing-run/[id] — รายละเอียดใบวางบิล (R-2)
 *
 * Shows the header + line items + payment/cancel actions + print link.
 * Per AGENTS.md §0d each action has a clear button (≤3 clicks from sidebar).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { getInvoiceDetail } from "@/actions/admin/billing-run";
import { BillingRunActions } from "./billing-run-actions";

export const dynamic = "force-dynamic";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function BillingRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles can view +
  // create billing-run invoices (doc issuance); mark-paid + cancel stay
  // accounting-only (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"]);
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();

  const res = await getInvoiceDetail(invoiceId);
  if (!res.ok) {
    if (res.error === "not_found") notFound();
    return (
      <main className="p-6 lg:p-8 space-y-4">
        <h1 className="text-xl font-bold">ใบวางบิล #{invoiceId}</h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          ไม่สามารถโหลดข้อมูลได้: {res.error}
        </div>
      </main>
    );
  }

  const { header, items } = res.data!;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>ใบวางบิล {header.doc_no} | PR Admin</title>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/billing-run" className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1 font-mono">
            {header.doc_no}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            ลูกค้า: <Link href={`/admin/customers/${header.userid}`} className="text-primary-600 hover:underline">{header.userid}</Link> · ออก {header.date_issued} · ครบกำหนด {header.date_due}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {header.status === "issued" && header.is_overdue && (
            <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-3 py-1 text-sm font-medium">⚠️ เลยกำหนดแล้ว</span>
          )}
          {header.status === "issued" && !header.is_overdue && (
            <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 text-sm font-medium">รอชำระเงิน</span>
          )}
          {header.status === "paid" && (
            <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-sm font-medium">✓ ชำระแล้ว</span>
          )}
          {header.status === "cancelled" && (
            <span className="rounded-full bg-stone-50 text-stone-600 border border-stone-200 px-3 py-1 text-sm">✕ ยกเลิก</span>
          )}
          <Link
            href={`/admin/billing-run/${invoiceId}/print`}
            target="_blank"
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm hover:bg-surface-alt"
          >
            🖨 พิมพ์ใบวางบิล
          </Link>
        </div>
      </header>

      {/* Money summary card */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-white to-amber-50/20 dark:from-surface dark:to-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs text-muted">ยอดรวมทั้งสิ้น</div>
            <div className="text-3xl font-bold text-amber-700">฿{thbFmt(header.total_thb)}</div>
          </div>
          <div className="text-xs text-muted text-right">
            <div>Subtotal ฿{thbFmt(header.subtotal_thb)}</div>
            <div>+ CHN ฿{thbFmt(header.delivery_chn_thb)} + TH ฿{thbFmt(header.delivery_th_thb)} + อื่นๆ ฿{thbFmt(header.other_thb)}</div>
            <div>− ส่วนลด ฿{thbFmt(header.discount_thb)}</div>
          </div>
        </div>
      </section>

      {/* Buyer info */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3">ข้อมูลผู้ซื้อ</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted">ชื่อ</div>
            <div className="font-medium">{header.buyer_name || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">ประเภท</div>
            <div className="font-medium">{header.is_juristic ? "นิติบุคคล" : "บุคคลธรรมดา"}</div>
          </div>
          {header.is_juristic && (
            <>
              <div>
                <div className="text-xs text-muted">เลขประจำตัวผู้เสียภาษี</div>
                <div className="font-mono">{header.buyer_tax_id || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted">สาขา</div>
                <div>{header.buyer_branch || "—"}</div>
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <div className="text-xs text-muted">ที่อยู่</div>
            <div>{header.buyer_address || "—"}</div>
          </div>
        </div>
      </section>

      {/* Line items */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-sm">รายการฝากนำเข้า ({items.length} รายการ)</h3>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/60 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
                <th className="px-3 py-2 text-left">รหัสพัสดุ</th>
                <th className="px-3 py-2 text-right">กล่อง</th>
                <th className="px-3 py-2 text-right">น้ำหนัก</th>
                <th className="px-3 py-2 text-right">CBM</th>
                <th className="px-3 py-2 text-center">วันที่</th>
                <th className="px-3 py-2 text-right">จำนวนเงิน (฿)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/admin/forwarders/${it.forwarder_id}`} className="text-primary-600 hover:underline">
                      #{it.forwarder_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{it.forwarder?.ftrackingchn ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{it.forwarder?.famount ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{it.forwarder?.fweight ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{it.forwarder?.fvolume ?? "—"}</td>
                  <td className="px-3 py-2 text-center text-xs text-muted">{it.forwarder?.fdate ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{thbFmt(it.amount_thb)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-alt/40 font-bold">
                <td colSpan={6} className="px-3 py-2 text-right text-sm">รวมค่าขนส่งรายการ (Subtotal)</td>
                <td className="px-3 py-2 text-right">฿{thbFmt(header.subtotal_thb)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Note */}
      {header.note_for_customer && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <h3 className="font-bold text-sm mb-2">หมายเหตุสำหรับลูกค้า</h3>
          <p className="text-sm whitespace-pre-wrap">{header.note_for_customer}</p>
        </section>
      )}

      {/* Audit trail */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm text-xs">
        <h3 className="font-bold text-sm mb-2">ประวัติ</h3>
        <div className="space-y-1.5 text-muted">
          <div>📄 ออกเอกสาร: {header.issued_at.slice(0, 16).replace("T", " ")} โดย {header.issued_by}</div>
          {header.paid_at && (
            <div className="text-emerald-700">✓ ชำระแล้ว: {header.paid_at.slice(0, 16).replace("T", " ")} โดย {header.paid_by} · {header.payment_method} {header.payment_reference && `(${header.payment_reference})`}</div>
          )}
          {header.cancelled_at && (
            <div className="text-stone-600">✕ ยกเลิก: {header.cancelled_at.slice(0, 16).replace("T", " ")} โดย {header.cancelled_by} · เหตุผล: {header.cancel_reason}</div>
          )}
        </div>
      </section>

      {/* Mark-paid + cancel actions */}
      <BillingRunActions
        invoiceId={header.id}
        docNo={header.doc_no}
        status={header.status}
        totalThb={header.total_thb}
        customerId={header.userid}
      />
    </main>
  );
}
