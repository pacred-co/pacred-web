import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODE_LABEL,
  FREIGHT_INVOICE_STATUS_LABEL,
  type FreightShipmentStatus, type FreightTransportMode,
  type FreightInvoiceStatus,
} from "@/lib/validators/freight-shipment";
import {
  computeInvoicePaymentStatus,
  freightInvoiceTotalThb,
  roundThb,
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
} from "@/lib/validators/freight-payment";
import {
  ShipmentDetailClient,
  type ShipmentDetailData, type PartyData, type InvoiceData, type LineItemData,
  type PaymentPanelData, type PaymentLedgerRow,
} from "./shipment-detail-client";

/**
 * V-E1 — /admin/freight/shipments/[id]
 *
 * Detail view: header + value block + parties + invoice + line items + audit
 * timeline + status-aware action buttons.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<FreightShipmentStatus, string> = {
  draft:       "bg-gray-50 text-gray-600 border-gray-200",
  confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  cleared:     "bg-purple-50 text-purple-700 border-purple-200",
  delivered:   "bg-green-50 text-green-700 border-green-200",
  cancelled:   "bg-red-50 text-red-700 border-red-200",
};

const INV_STATUS_BADGE: Record<FreightInvoiceStatus, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  issued:    "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

type Header = {
  id:                          string;
  job_no:                      string | null;
  status:                      FreightShipmentStatus;
  profile_id:                  string;
  transport_mode:              FreightTransportMode;
  container_code:              string | null;
  carrier_container_no:        string | null;
  bl_no:                       string | null;
  vessel_voyage:               string | null;
  port_loading:                string | null;
  port_discharge:              string | null;
  place_delivery:              string | null;
  incoterm:                    string | null;
  payment_term:                string | null;
  origin_country:              string;
  commercial_value_usd:        number | null;
  exchange_rate:               number | null;
  rate_source:                 string | null;
  rate_date:                   string | null;
  commercial_value_thb:        number | null;
  declared_customs_value_thb:  number | null;
  declared_value_basis:        string | null;
  hs_code:                     string | null;
  duty_rate_pct:               number | null;
  duty_thb:                    number | null;
  vat_base_thb:                number | null;
  vat_thb:                     number | null;
  vat_plan_label:              string | null;
  form_e_applied:              boolean;
  source_quote_id:             string | null;
  notes:                       string | null;
  cancelled_reason:            string | null;
  created_at:                  string;
};

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function usd(n: number | null): string {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default async function AdminFreightShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const { id } = await params;
  const admin = createAdminClient();

  const { data: header } = await admin
    .from("freight_shipments")
    .select(`
      id, job_no, status, profile_id, transport_mode, container_code, carrier_container_no,
      bl_no, vessel_voyage, port_loading, port_discharge, place_delivery, incoterm,
      payment_term, origin_country,
      commercial_value_usd, exchange_rate, rate_source, rate_date, commercial_value_thb,
      declared_customs_value_thb, declared_value_basis, hs_code, duty_rate_pct, duty_thb,
      vat_base_thb, vat_thb, vat_plan_label, form_e_applied,
      source_quote_id, notes, cancelled_reason, created_at
    `)
    .eq("id", id)
    .maybeSingle<Header>();
  if (!header) notFound();

  // Parties.
  const { data: partiesRaw } = await admin
    .from("freight_parties")
    .select("id, role, name, address, tax_id, branch")
    .eq("freight_shipment_id", id);
  const parties = (partiesRaw ?? []) as PartyData[];

  // Invoice (latest non-cancelled, or first if all cancelled).
  // payment_status + value-block figures (V-E7) come along so the payment
  // panel can show the receipt total without a second round-trip.
  const { data: invoicesRaw } = await admin
    .from("freight_invoices")
    .select(`
      id, status, invoice_no, issued_at, cancelled_at, cancellation_reason, notes,
      payment_status, fully_paid_at,
      commercial_value_thb, duty_thb, vat_thb
    `)
    .eq("freight_shipment_id", id)
    .order("created_at", { ascending: false });
  type InvoiceRaw = InvoiceData & {
    commercial_value_thb: number | null;
    duty_thb:             number | null;
    vat_thb:              number | null;
  };
  const invoicesAll = (invoicesRaw ?? []) as InvoiceRaw[];
  const invoices: InvoiceData[] = invoicesAll.map((i) => ({
    id:                  i.id,
    status:              i.status,
    invoice_no:          i.invoice_no,
    issued_at:           i.issued_at,
    cancelled_at:        i.cancelled_at,
    cancellation_reason: i.cancellation_reason,
    notes:               i.notes,
    payment_status:      i.payment_status ?? "unpaid",
    fully_paid_at:       i.fully_paid_at ?? null,
  }));
  const activeRaw     = invoicesAll.find((i) => i.status !== "cancelled") ?? null;
  const activeInvoice = invoices.find((i) => i.status !== "cancelled") ?? null;

  // Lines (for active invoice only).
  let lines: LineItemData[] = [];
  if (activeInvoice) {
    const { data: linesRaw } = await admin
      .from("freight_invoice_lines")
      .select("id, position, marks, description, qty, unit, unit_price_usd, amount_usd, cartons, gross_weight_kg, hs_code")
      .eq("freight_invoice_id", activeInvoice.id)
      .order("position", { ascending: true });
    lines = (linesRaw ?? []) as LineItemData[];
  }

  // Payment ledger (V-E7) — only meaningful once the active invoice is issued.
  let paymentPanel: PaymentPanelData | null = null;
  if (activeRaw && activeRaw.status === "issued") {
    const { data: paymentsRaw } = await admin
      .from("freight_invoice_payments")
      .select("id, method, amount_thb, paid_at, slip_storage_path, bank_ref, status, void_reason, recorded_by_admin_id, notes, created_at")
      .eq("freight_invoice_id", activeRaw.id)
      .order("paid_at", { ascending: false });
    const payments = ((paymentsRaw ?? []) as PaymentLedgerRow[]).map((p) => ({
      ...p,
      amount_thb: Number(p.amount_thb),
    }));
    const paidThb = roundThb(
      payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount_thb, 0),
    );
    const totalThb = freightInvoiceTotalThb({
      commercial_value_thb: activeRaw.commercial_value_thb,
      duty_thb:             activeRaw.duty_thb,
      vat_thb:              activeRaw.vat_thb,
    });
    paymentPanel = {
      invoiceId:       activeRaw.id,
      invoiceNo:       activeRaw.invoice_no,
      payments,
      paidThb,
      totalThb,
      outstandingThb:  roundThb(Math.max(0, totalThb - paidThb)),
      paymentStatus:   computeInvoicePaymentStatus(paidThb, totalThb),
    };
  }

  // Customer.
  const { data: profile } = await admin
    .from("profiles")
    .select("member_code, first_name, last_name, email, phone, company_name, account_type, tax_id")
    .eq("id", header.profile_id)
    .maybeSingle<{
      member_code: string | null; first_name: string | null; last_name: string | null;
      email: string | null; phone: string | null; company_name: string | null;
      account_type: string | null; tax_id: string | null;
    }>();

  // U2-3 — WHT entry for the active invoice (mirror tax_invoices side).
  type WhtRow = {
    id:                 string;
    cert_status:        "pending" | "received" | "waived";
    gross_invoice_thb:  number;
    wht_base_thb:       number;
    wht_rate_pct:       number;
    wht_amount_thb:     number;
    net_expected_thb:   number;
    cert_number:        string | null;
    cert_storage_path:  string | null;
    cert_received_at:   string | null;
    waived_reason:      string | null;
    waived_at:          string | null;
  };
  let whtEntry: WhtRow | null = null;
  if (activeInvoice) {
    const { data: wht } = await admin
      .from("withholding_tax_entries")
      .select("id, cert_status, gross_invoice_thb, wht_base_thb, wht_rate_pct, wht_amount_thb, net_expected_thb, cert_number, cert_storage_path, cert_received_at, waived_reason, waived_at")
      .eq("freight_invoice_id", activeInvoice.id)
      .limit(1)
      .maybeSingle<WhtRow>();
    whtEntry = wht ?? null;
  }
  const whtSuggestedGross = Number(
    invoicesAll.find((i) => i.id === activeInvoice?.id)?.commercial_value_thb ?? 0,
  );

  // Audit.
  const { data: auditRaw } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, payload, admin_id, admin:profiles!admin_id ( member_code, first_name, last_name )")
    .eq("target_type", "freight_shipment")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  type AuditRaw = {
    id: string; action: string; created_at: string;
    admin: { member_code: string | null; first_name: string | null } | { member_code: string | null; first_name: string | null }[] | null;
  };
  const audit = ((auditRaw ?? []) as unknown as AuditRaw[]).map((a) => ({
    id: a.id, action: a.action, created_at: a.created_at,
    admin: Array.isArray(a.admin) ? a.admin[0] ?? null : a.admin,
  }));

  const isSuperOrAccounting = roles.includes("super") || roles.includes("accounting");

  const detailData: ShipmentDetailData = {
    id:                         header.id,
    job_no:                     header.job_no,
    status:                     header.status,
    isSuperOrAccounting,
    commercial_value_usd:       header.commercial_value_usd,
    exchange_rate:              header.exchange_rate,
    declared_customs_value_thb: header.declared_customs_value_thb,
    declared_value_basis:       header.declared_value_basis,
    hs_code:                    header.hs_code,
    duty_rate_pct:              header.duty_rate_pct,
    vat_base_thb:               header.vat_base_thb,
    vat_plan_label:             header.vat_plan_label,
    form_e_applied:             header.form_e_applied,
    rate_date:                  header.rate_date,
  };

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/freight/shipments" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            งาน <span className="font-mono">{header.job_no ?? "—"}</span>
          </h1>
          <p className="text-xs text-muted">
            {FREIGHT_TRANSPORT_MODE_LABEL[header.transport_mode]} ·{" "}
            สร้าง {new Date(header.created_at).toLocaleString("th-TH")}
            {header.source_quote_id && (
              <> · ↗ มาจาก <Link href={`/admin/freight/quotes/${header.source_quote_id}`} className="text-primary-500 hover:underline">quotation</Link></>
            )}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
          {FREIGHT_SHIPMENT_STATUS_LABEL[header.status]}
        </span>
      </div>

      {/* Customer */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
        <h2 className="font-bold text-sm mb-2">ลูกค้า</h2>
        <p className="text-sm">
          {profile?.company_name ?? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ?? "—"}
          {profile?.member_code && <span className="ml-2 font-mono text-xs text-muted">({profile.member_code})</span>}
        </p>
        {profile?.email && <p className="text-xs text-muted">✉️ {profile.email}</p>}
        {profile?.phone && <p className="text-xs text-muted">📞 {profile.phone}</p>}
        {profile?.account_type === "juristic" && profile.tax_id && (
          <p className="text-xs">เลขผู้เสียภาษี: <span className="font-mono">{profile.tax_id}</span></p>
        )}
      </section>

      {/* Logistics */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
        <h2 className="font-bold text-sm mb-2">โลจิสติกส์</h2>
        <div className="grid grid-cols-2 gap-y-1">
          {header.container_code       && <p>Container: <span className="font-mono">{header.container_code}</span></p>}
          {header.carrier_container_no && <p>Carrier no: <span className="font-mono">{header.carrier_container_no}</span></p>}
          {header.bl_no                && <p>B/L: <span className="font-mono">{header.bl_no}</span></p>}
          {header.vessel_voyage        && <p>Vessel: {header.vessel_voyage}</p>}
          {header.port_loading         && <p>From: {header.port_loading}</p>}
          {header.port_discharge       && <p>To: {header.port_discharge}</p>}
          {header.place_delivery       && <p>Delivery: {header.place_delivery}</p>}
          {header.incoterm             && <p>Incoterm: <span className="font-mono">{header.incoterm}</span></p>}
          {header.payment_term         && <p>Payment: {header.payment_term}</p>}
          <p>Origin: {header.origin_country}</p>
        </div>
      </section>

      {/* Cancelled reason */}
      {header.status === "cancelled" && header.cancelled_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>ยกเลิก:</strong> {header.cancelled_reason}
        </div>
      )}

      {/* Value block (read-only display — edit via separate flow in V-E1.1) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1 text-xs">
        <h2 className="font-bold text-sm mb-2">📊 Value block (ADR-0016)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1">
          <p>Commercial value USD: <span className="font-mono">{usd(header.commercial_value_usd)}</span></p>
          <p>Exchange rate: <span className="font-mono">{header.exchange_rate ?? "—"}</span></p>
          <p>Rate date: <span className="font-mono">{header.rate_date ?? "—"}</span></p>
          <p>Commercial THB: <span className="font-mono">{thb(header.commercial_value_thb)}</span></p>
          <p>Declared customs THB: <span className="font-mono text-amber-700">{thb(header.declared_customs_value_thb)}</span></p>
          <p>HS code: <span className="font-mono">{header.hs_code ?? "—"}</span></p>
          <p>Duty: <span className="font-mono">{header.duty_rate_pct ?? "—"}% / {thb(header.duty_thb)}</span></p>
          <p>VAT base: <span className="font-mono">{thb(header.vat_base_thb)}</span></p>
          <p>VAT 7%: <span className="font-mono">{thb(header.vat_thb)}</span></p>
          <p>VAT plan: {header.vat_plan_label ?? "—"}</p>
          <p>Form E: {header.form_e_applied ? "✓ applied" : "—"}</p>
        </div>
        {header.declared_value_basis && (
          <p className="mt-2 text-amber-800 italic">📝 {header.declared_value_basis}</p>
        )}
        <p className="mt-1 text-[10px] text-muted">
          ⚠️ commercial_value_usd × exchange_rate = commercial_value_thb (frozen at issuance) ·
          declared_customs_value_thb แก้ได้เฉพาะ super/accounting (ADR-0016 Q3) ·
          ตอนนี้ <strong>read-only</strong> — แก้ผ่าน update action (V-E1.1 จะมี inline form)
        </p>
      </section>

      {/* Parties + Invoice + Lines + Payments + WHT + Actions (client-managed) */}
      <ShipmentDetailClient
        data={detailData}
        parties={parties}
        activeInvoice={activeInvoice}
        lines={lines}
        allInvoices={invoices}
        paymentPanel={paymentPanel}
        whtEntry={whtEntry}
        whtSuggestedGross={whtSuggestedGross}
      />

      {/* Audit timeline */}
      {audit.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">📜 Audit timeline</h2>
          <ul className="space-y-1.5 text-xs">
            {audit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-muted whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="font-medium">{a.action}</span>
                <span className="text-muted">by {a.admin?.member_code ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-muted">
        💡 invoice status: {invoices.map((i) => (
          <span key={i.id} className={`mr-1 inline-block rounded-full border px-1.5 py-0.5 ${INV_STATUS_BADGE[i.status]}`}>
            {i.invoice_no ?? "(no #)"} · {FREIGHT_INVOICE_STATUS_LABEL[i.status]}
            {i.status === "issued" && ` · ${FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[i.payment_status]}`}
          </span>
        ))}
      </p>
    </main>
  );
}
