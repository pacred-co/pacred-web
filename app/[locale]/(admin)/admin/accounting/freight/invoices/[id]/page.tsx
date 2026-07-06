import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  freightInvoiceTotalThb,
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
  FREIGHT_PAYMENT_METHOD_LABEL,
  type FreightInvoicePaymentStatus,
  type FreightPaymentMethod,
} from "@/lib/validators/freight-payment";
import { FreightInvoiceActions } from "./freight-invoice-actions";

/**
 * Freight ใบแจ้งหนี้ — admin DETAIL.
 *
 * Shows the frozen header (parties + logistics snapshot), the value block
 * (goods / duty / VAT / WHT), the line items, and the payment ledger.
 * Action buttons (issue / cancel / record-payment / void-payment) live in
 * the client component and go through the EXISTING freight invoice actions
 * behind a §0f confirm dialog. A print link to the Commercial Invoice PDF
 * (/api/freight-invoice/[id]) is surfaced when the invoice is issued.
 *
 * §0e: reads CANONICAL freight_invoices / freight_invoice_lines /
 *      freight_invoice_payments only. §0c: { data, error } on every read.
 */

export const dynamic = "force-dynamic";

const DOC_STATUS_BADGE: Record<string, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  issued:    "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};
const DOC_STATUS_LABEL: Record<string, string> = {
  draft:     "ร่าง",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};
const PAY_STATUS_BADGE: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "bg-amber-50 text-amber-700 border-amber-200",
  partial:  "bg-orange-50 text-orange-700 border-orange-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  overpaid: "bg-purple-50 text-purple-700 border-purple-200",
};

type Invoice = {
  id:                   string;
  invoice_no:           string | null;
  status:               string;
  payment_status:       FreightInvoicePaymentStatus | null;
  freight_shipment_id:  string;
  profile_id:           string;
  consignee_name_snapshot:    string | null;
  consignee_address_snapshot: string | null;
  consignee_tax_id_snapshot:  string | null;
  consignee_branch_snapshot:  string | null;
  shipper_name_snapshot:      string | null;
  transport_mode_snapshot:    string | null;
  container_code_snapshot:    string | null;
  bl_no_snapshot:             string | null;
  port_loading_snapshot:      string | null;
  port_discharge_snapshot:    string | null;
  incoterm_snapshot:          string | null;
  commercial_value_usd:  number | null;
  exchange_rate:         number | null;
  commercial_value_thb:  number | null;
  duty_thb:              number | null;
  vat_thb:               number | null;
  vat_plan_label:        string | null;
  notes:                 string | null;
  issued_at:             string | null;
  cancelled_at:          string | null;
  cancellation_reason:   string | null;
  created_at:            string;
};

type Line = {
  id:             string;
  position:       number;
  description:    string;
  qty:            number;
  unit:           string;
  unit_price_usd: number;
  amount_usd:     number;
  hs_code:        string | null;
};

type Payment = {
  id:         string;
  method:     FreightPaymentMethod;
  amount_thb: number;
  paid_at:    string;
  bank_ref:   string | null;
  status:     "recorded" | "voided";
  notes:      string | null;
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function usd(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default async function AdminFreightInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin([
    "super",
    "accounting",
    "freight_sales_manager",
    "freight_sales",
    "freight_export_doc",
    "freight_import_doc",
    "freight_clearance_both",
  ]);

  const { id } = await params;
  const admin = createAdminClient();

  const { data: invoice, error: invErr } = await admin
    .from("freight_invoices")
    .select(`
      id, invoice_no, status, payment_status, freight_shipment_id, profile_id,
      consignee_name_snapshot, consignee_address_snapshot, consignee_tax_id_snapshot, consignee_branch_snapshot,
      shipper_name_snapshot, transport_mode_snapshot, container_code_snapshot, bl_no_snapshot,
      port_loading_snapshot, port_discharge_snapshot, incoterm_snapshot,
      commercial_value_usd, exchange_rate, commercial_value_thb, duty_thb, vat_thb, vat_plan_label,
      notes, issued_at, cancelled_at, cancellation_reason, created_at
    `)
    .eq("id", id)
    .maybeSingle<Invoice>();
  if (invErr) {
    console.error(`[freight_invoices detail] failed`, { code: invErr.code, message: invErr.message });
    throw new Error(`โหลดใบแจ้งหนี้ไม่สำเร็จ: ${invErr.message}`);
  }
  if (!invoice) notFound();

  const [{ data: shipment, error: shipErr }, { data: profile, error: profErr }, { data: rawLines, error: linesErr }, { data: rawPays, error: paysErr }, { data: whtRow, error: whtErr }] =
    await Promise.all([
      admin.from("freight_shipments").select("job_no").eq("id", invoice.freight_shipment_id).maybeSingle<{ job_no: string | null }>(),
      admin.from("profiles").select("member_code, first_name, last_name, company_name").eq("id", invoice.profile_id).maybeSingle<{ member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null }>(),
      admin.from("freight_invoice_lines").select("id, position, description, qty, unit, unit_price_usd, amount_usd, hs_code").eq("freight_invoice_id", id).order("position", { ascending: true }),
      admin.from("freight_invoice_payments").select("id, method, amount_thb, paid_at, bank_ref, status, notes").eq("freight_invoice_id", id).order("paid_at", { ascending: false }),
      admin.from("withholding_tax_entries").select("wht_amount_thb, cert_status").eq("freight_invoice_id", id).maybeSingle<{ wht_amount_thb: number | null; cert_status: string | null }>(),
    ]);
  if (shipErr)  console.error(`[freight_shipments detail] failed`, { code: shipErr.code, message: shipErr.message });
  if (profErr)  console.error(`[profiles detail] failed`, { code: profErr.code, message: profErr.message });
  if (linesErr) console.error(`[freight_invoice_lines list] failed`, { code: linesErr.code, message: linesErr.message });
  if (paysErr)  console.error(`[freight_invoice_payments list] failed`, { code: paysErr.code, message: paysErr.message });
  // withholding_tax_entries may not key a freight invoice yet (V-A6 was
  // cargo-only) — a read error here is non-fatal; the WHT row simply shows —.
  if (whtErr)   console.error(`[withholding_tax_entries lookup] failed (non-fatal)`, { code: whtErr.code, message: whtErr.message });

  const lines = ((rawLines ?? []) as unknown as Line[]).map((l) => ({
    ...l,
    qty: Number(l.qty),
    unit_price_usd: Number(l.unit_price_usd),
    amount_usd: Number(l.amount_usd),
  }));
  const payments = ((rawPays ?? []) as unknown as Payment[]).map((p) => ({ ...p, amount_thb: Number(p.amount_thb) }));

  const total = freightInvoiceTotalThb({
    commercial_value_thb: invoice.commercial_value_thb,
    duty_thb: invoice.duty_thb,
    vat_thb: invoice.vat_thb,
  });
  const paid = payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount_thb, 0);
  const outstanding = Math.max(0, total - paid);

  const customer = profile?.company_name ?? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ?? "—";

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
      <Link href="/admin/accounting/freight/invoices" className="text-xs text-primary-600 hover:underline">
        ← กลับไปรายการใบแจ้งหนี้
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{invoice.invoice_no ?? "(ใบแจ้งหนี้ร่าง)"}</h1>
          <p className="text-xs text-muted mt-1">
            ลูกค้า {customer}{profile?.member_code ? ` · ${profile.member_code}` : ""} ·{" "}
            งานขนส่ง{" "}
            <Link href={`/admin/freight/shipments/${invoice.freight_shipment_id}`} className="text-primary-600 hover:underline">
              {shipment?.job_no ?? "—"}
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${DOC_STATUS_BADGE[invoice.status] ?? ""}`}>
            {DOC_STATUS_LABEL[invoice.status] ?? invoice.status}
          </span>
          {invoice.status === "issued" && invoice.payment_status && (
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${PAY_STATUS_BADGE[invoice.payment_status] ?? ""}`}>
              {FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[invoice.payment_status]}
            </span>
          )}
        </div>
      </header>

      {invoice.status === "cancelled" && invoice.cancellation_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          ใบแจ้งหนี้นี้ถูกยกเลิก{invoice.cancelled_at ? ` เมื่อ ${new Date(invoice.cancelled_at).toLocaleString("th-TH")}` : ""} ·
          เหตุผล: {invoice.cancellation_reason}
        </div>
      )}

      {/* Action bar (client) */}
      <FreightInvoiceActions
        invoiceId={invoice.id}
        status={invoice.status}
        invoiceNo={invoice.invoice_no}
        hasLines={lines.length > 0}
        outstanding={outstanding}
      />

      {/* Print link (issued only — the PDF route renders frozen snapshot) */}
      {invoice.status !== "draft" && (
        <a
          href={`/api/freight-invoice/${invoice.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt"
        >
          📄 ดู / พิมพ์ Commercial Invoice (PDF)
        </a>
      )}

      {/* Parties + logistics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">ผู้รับสินค้า (Consignee)</h2>
          <p className="text-sm font-medium">{invoice.consignee_name_snapshot ?? customer}</p>
          {invoice.consignee_address_snapshot && <p className="text-xs text-muted whitespace-pre-line">{invoice.consignee_address_snapshot}</p>}
          {invoice.consignee_tax_id_snapshot && <p className="text-xs text-muted">เลขผู้เสียภาษี: {invoice.consignee_tax_id_snapshot}</p>}
          {invoice.consignee_branch_snapshot && <p className="text-xs text-muted">สาขา: {invoice.consignee_branch_snapshot}</p>}
        </section>
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">การขนส่ง (Logistics)</h2>
          <dl className="text-xs space-y-1">
            <Row2 k="โหมด" v={invoice.transport_mode_snapshot} />
            <Row2 k="Container" v={invoice.container_code_snapshot} />
            <Row2 k="B/L" v={invoice.bl_no_snapshot} />
            <Row2 k="ต้นทาง → ปลายทาง" v={[invoice.port_loading_snapshot, invoice.port_discharge_snapshot].filter(Boolean).join(" → ") || null} />
            <Row2 k="Incoterm" v={invoice.incoterm_snapshot} />
          </dl>
        </section>
      </div>

      {/* Value block */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">มูลค่า + ภาษี (Value block · ตรึงตอนออกใบ)</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <Row3 k="มูลค่าสินค้า (USD)" v={usd(invoice.commercial_value_usd)} />
          <Row3 k="เรทแลกเปลี่ยน" v={invoice.exchange_rate != null ? Number(invoice.exchange_rate).toFixed(4) : "—"} />
          <Row3 k="มูลค่าสินค้า (THB)" v={thb(invoice.commercial_value_thb)} />
          <Row3 k="อากรขาเข้า (Duty)" v={thb(invoice.duty_thb)} />
          <Row3 k={`VAT${invoice.vat_plan_label ? ` · ${invoice.vat_plan_label}` : ""}`} v={thb(invoice.vat_thb)} />
          <Row3 k="หัก ณ ที่จ่าย (WHT)" v={whtRow?.wht_amount_thb != null ? `${thb(whtRow.wht_amount_thb)}${whtRow.cert_status ? ` (${whtRow.cert_status})` : ""}` : "—"} />
        </dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm font-bold">ยอดรวมที่ต้องชำระ</span>
          <span className="text-lg font-bold text-primary-600 font-mono">{thb(total)}</span>
        </div>
        {invoice.status === "issued" && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>ชำระแล้ว {thb(paid)} · คงค้าง <strong className={outstanding > 0 ? "text-amber-600" : "text-green-600"}>{thb(outstanding)}</strong></span>
          </div>
        )}
      </section>

      {/* Line items */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-x-auto scrollbar-x-visible">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted px-4 pt-4 pb-2">รายการสินค้า (Line items)</h2>
        {lines.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-muted">ยังไม่มีรายการสินค้า — เพิ่มจากหน้างานขนส่งก่อนออกใบแจ้งหนี้</p>
        ) : (
          <table className="w-full text-sm min-w-[560px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 w-8">#</th>
                <th className="px-3 py-2">รายละเอียด</th>
                <th className="px-3 py-2 text-right">จำนวน</th>
                <th className="px-3 py-2 text-right">ราคา/หน่วย (USD)</th>
                <th className="px-3 py-2 text-right">รวม (USD)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted">{l.position}</td>
                  <td className="px-3 py-2">
                    {l.description}
                    {l.hs_code && <span className="ml-2 font-mono text-[11px] text-muted">HS {l.hs_code}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{l.qty.toLocaleString()} {l.unit}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{usd(l.unit_price_usd)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{usd(l.amount_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Payment ledger */}
      {invoice.status === "issued" && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-x-auto scrollbar-x-visible">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted px-4 pt-4 pb-2">ประวัติการชำระเงิน (Payment ledger)</h2>
          {payments.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-muted">ยังไม่มีการชำระเงิน</p>
          ) : (
            <table className="w-full text-sm min-w-[560px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">วันที่</th>
                  <th className="px-3 py-2">วิธี</th>
                  <th className="px-3 py-2 text-right">จำนวน</th>
                  <th className="px-3 py-2">อ้างอิง</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={`border-t border-border ${p.status === "voided" ? "opacity-50 line-through" : ""}`}>
                    <td className="px-3 py-2 text-xs">{new Date(p.paid_at).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-xs">{FREIGHT_PAYMENT_METHOD_LABEL[p.method] ?? p.method}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(p.amount_thb)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{p.bank_ref ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{p.status === "voided" ? "ยกเลิก" : "บันทึกแล้ว"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {invoice.notes && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-1">หมายเหตุ</h2>
          <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
        </section>
      )}
    </main>
  );
}

function Row2({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium">{v ?? "—"}</dd>
    </div>
  );
}
function Row3({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-mono">{v}</dd>
    </div>
  );
}
