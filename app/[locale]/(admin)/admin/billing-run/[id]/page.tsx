/**
 * /admin/billing-run/[id] — รายละเอียดใบวางบิล (R-2)
 *
 * Shows the header + line items + payment/cancel actions + print link.
 * Per AGENTS.md §0d each action has a clear button (≤3 clicks from sidebar).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { getInvoiceDetail, getBillingRunDuplicateWarnings } from "@/actions/admin/billing-run";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { isGodRole } from "@/lib/admin/god-role";
import { Explain, GUIDE } from "@/components/ui/tooltip";
import { BillingRunActions } from "./billing-run-actions";
import { BillingRunDeliveryAddressEditor } from "./billing-run-delivery-address-editor";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerAddressRows } from "@/lib/legacy/customer-address-options";

export const dynamic = "force-dynamic";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * วัน-เวลา แบบไทย 24 ชม (Asia/Bangkok) — ใช้กับ paid_at ที่ตอนนี้เก็บเวลาจริง
 * (ตรวจ 2 รอบ + เวลารับชำระ 24 ชม). timestamptz จาก Postgres = UTC → แปลงเป็น
 * เวลาไทยเพื่อโชว์เวลานาฬิกาที่พนักงานคีย์. fallback = raw slice ถ้า parse ไม่ได้.
 */
function fmtThaiDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
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
  // ภูม 2026-06-29 — sales/sales_admin can reach the page to UPLOAD a payment
  // slip; the settle/confirm (ตัดจ่าย) stays accounting-only — gated both in
  // BillingRunActions (canSettle) AND in the markBillingRunPaid action itself.
  const { roles } = await requireAdmin([
    "super", "accounting", "sales", "sales_admin", "ops", "freight_export_doc", "freight_import_doc",
  ]);
  // canSettle MUST match the markBillingRunPaid gate: withAdmin(["super","accounting"])
  // passes the god-nav tiers (ultra/super/normies via isGodRole) + accounting. A raw
  // super-only check hid the settle form from ultra (caught on browser-verify).
  const canSettle = isGodRole(roles) || roles.includes("accounting");
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

  // Customer saved-address rows for the reusable <CustomerAddressPicker> on the
  // "แก้ที่อยู่จัดส่ง (บนใบ)" editor (ship-to snapshot · DISPLAY-only).
  const custAddresses = await loadCustomerAddressRows(createAdminClient(), header.userid);

  // Sign EVERY slip (multi · ภูม 2026-06-30) via the service-role client so any
  // accounting admin can view slips the SALES uploaded (private "slips" bucket,
  // stored under the uploader's uid — an anon client could only sign its own).
  const slipPaths = header.slip_paths.length > 0
    ? header.slip_paths
    : header.slip_path ? [header.slip_path] : []; // legacy single-path fallback
  const slipSignedUrls = (
    await Promise.all(slipPaths.map((p) => getSignedBucketUrl("slips", p)))
  ).filter((u): u is string => !!u);

  // Step-3 "ตรวจสลิปซ้ำ" (owner spec §2) — read-only warning of OTHER already-paid
  // bills for the SAME customer + SAME total (possible เวียนเทียน). Only fetched
  // for the accounting viewer on an still-open bill (the only context that can
  // settle); DISPLAY-only, no mutation. Fail-soft: any error → no warning shown
  // (the settle action itself remains the hard guard).
  let dupWarnings: Array<{ id: number; doc_no: string; total_thb: number; paid_at: string | null }> = [];
  if (canSettle && header.status === "issued") {
    const dupRes = await getBillingRunDuplicateWarnings(invoiceId);
    if (dupRes.ok) dupWarnings = dupRes.data!.matches;
  }

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
            <div className="text-xs text-muted">
              {header.wht_amount > 0 ? (
                <Explain label="ยอดชำระสุทธิ (หลังหัก ณ ที่จ่าย)" def={GUIDE.bill_net_payable} />
              ) : (
                <Explain label="ยอดรวมทั้งสิ้น" def={GUIDE.bill_gross} />
              )}
            </div>
            <div className="text-3xl font-bold text-amber-700">
              ฿{thbFmt(header.wht_amount > 0 ? header.net_payable : header.total_thb)}
            </div>
            {header.wht_amount > 0 && (
              <div className="text-xs text-muted mt-1">
                รวม ฿{thbFmt(header.total_thb)} <span className="text-red-600">
                  <Explain label={`− หัก ณ ที่จ่าย 1% ฿${thbFmt(header.wht_amount)}`} def={GUIDE.wht_1pct_bill} />
                </span>
              </div>
            )}
          </div>
          <div className="text-xs text-muted text-right">
            <div>Subtotal ฿{thbFmt(header.subtotal_thb)}</div>
            {header.mao_fee_thb > 0 && (
              <div>
                <Explain label={`+ ค่าส่งเหมาๆ (PCSF) ฿${thbFmt(header.mao_fee_thb)}`} def={GUIDE.mao_fee} align="right" />
              </div>
            )}
            <div>+ CHN ฿{thbFmt(header.delivery_chn_thb)} + TH ฿{thbFmt(header.delivery_th_thb)} + อื่นๆ ฿{thbFmt(header.other_thb)}</div>
            <div>− ส่วนลด ฿{thbFmt(header.discount_thb)}</div>
            {header.wht_amount > 0 && (
              <div className="text-red-600">− WHT 1% ฿{thbFmt(header.wht_amount)}</div>
            )}
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
            <div className="text-xs text-muted">ที่อยู่ (ออกบิล/ภาษี)</div>
            <div>{header.buyer_address || "—"}</div>
          </div>
        </div>
        <BillingRunDeliveryAddressEditor
          invoiceId={header.id}
          customerId={header.userid}
          addresses={custAddresses}
          currentDelivery={header.delivery_address}
        />
      </section>

      {/* Line items */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-sm">รายการฝากนำเข้า ({items.length} รายการ)</h3>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
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
            <div className="text-emerald-700">✓ ชำระแล้ว: {fmtThaiDateTime(header.paid_at)} น. โดย {header.paid_by} · {header.payment_method} {header.payment_reference && `(${header.payment_reference})`}</div>
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
        netPayable={header.net_payable}
        whtAmount={header.wht_amount}
        isJuristic={header.is_juristic}
        customerId={header.userid}
        canSettle={canSettle}
        slipSignedUrls={slipSignedUrls}
        slipStatus={header.slip_status}
        slipReviewedAt={header.slip_reviewed_at}
        slipUploadedBy={header.slip_uploaded_by}
        slipUploadedAt={header.slip_uploaded_at}
        dupWarnings={dupWarnings}
      />
    </main>
  );
}
