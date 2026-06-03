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
import { DeclarationCreateButton } from "./declaration-create-button";
import { ValueBlockEditor } from "./value-block-editor";
import {
  CUSTOMS_DECLARATION_STATUS_LABEL,
  CUSTOMS_DECLARATION_TYPE_LABEL,
  type CustomsDeclarationStatus,
  type CustomsDeclarationType,
} from "@/lib/validators/customs-declaration";
import { WorkItemThread } from "@/components/admin/work-item-thread";

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

const CD_STATUS_BADGE: Record<CustomsDeclarationStatus, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  accepted:  "bg-amber-50 text-amber-700 border-amber-200",
  released:  "bg-green-50 text-green-700 border-green-200",
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

// (thb / usd display helpers moved into ValueBlockEditor in G3 — page no
// longer renders the value block inline.)

export default async function AdminFreightShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const { id } = await params;
  const admin = createAdminClient();

  const { data: header, error: headerErr } = await admin
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
  if (headerErr) {
    console.error(`[freight/shipments/[id] header lookup] id=${id}`, {
      code: headerErr.code, message: headerErr.message, details: headerErr.details, hint: headerErr.hint,
    });
    throw new Error(`Failed to load freight_shipments (${headerErr.code}): ${headerErr.message}`);
  }
  if (!header) notFound();

  // Parties.
  const { data: partiesRaw, error: partiesErr } = await admin
    .from("freight_parties")
    .select("id, role, name, address, tax_id, branch")
    .eq("freight_shipment_id", id);
  if (partiesErr) {
    console.error(`[freight/shipments/[id] parties lookup] id=${id}`, {
      code: partiesErr.code, message: partiesErr.message, details: partiesErr.details, hint: partiesErr.hint,
    });
    throw new Error(`Failed to load freight_parties (${partiesErr.code}): ${partiesErr.message}`);
  }
  const parties = (partiesRaw ?? []) as PartyData[];

  // Invoice (latest non-cancelled, or first if all cancelled).
  // payment_status + value-block figures (V-E7) come along so the payment
  // panel can show the receipt total without a second round-trip.
  const { data: invoicesRaw, error: invoicesErr } = await admin
    .from("freight_invoices")
    .select(`
      id, status, invoice_no, issued_at, cancelled_at, cancellation_reason, notes,
      payment_status, fully_paid_at,
      commercial_value_thb, duty_thb, vat_thb
    `)
    .eq("freight_shipment_id", id)
    .order("created_at", { ascending: false });
  if (invoicesErr) {
    console.error(`[freight/shipments/[id] invoices lookup] id=${id}`, {
      code: invoicesErr.code, message: invoicesErr.message, details: invoicesErr.details, hint: invoicesErr.hint,
    });
    throw new Error(`Failed to load freight_invoices (${invoicesErr.code}): ${invoicesErr.message}`);
  }
  type InvoiceRaw = InvoiceData & {
    commercial_value_thb: number | null;
    duty_thb:             number | null;
    vat_thb:              number | null;
  };
  const invoicesAll = (invoicesRaw ?? []) as unknown as InvoiceRaw[];
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
    const { data: linesRaw, error: linesErr } = await admin
      .from("freight_invoice_lines")
      .select("id, position, marks, description, qty, unit, unit_price_usd, amount_usd, cartons, gross_weight_kg, hs_code")
      .eq("freight_invoice_id", activeInvoice.id)
      .order("position", { ascending: true });
    if (linesErr) {
      console.error(`[freight/shipments/[id] invoice lines lookup] invoiceId=${activeInvoice.id}`, {
        code: linesErr.code, message: linesErr.message, details: linesErr.details, hint: linesErr.hint,
      });
      throw new Error(`Failed to load freight_invoice_lines (${linesErr.code}): ${linesErr.message}`);
    }
    lines = (linesRaw ?? []) as LineItemData[];
  }

  // Payment ledger (V-E7) — only meaningful once the active invoice is issued.
  let paymentPanel: PaymentPanelData | null = null;
  if (activeRaw && activeRaw.status === "issued") {
    const { data: paymentsRaw, error: paymentsErr } = await admin
      .from("freight_invoice_payments")
      .select("id, method, amount_thb, paid_at, slip_storage_path, bank_ref, status, void_reason, recorded_by_admin_id, notes, created_at")
      .eq("freight_invoice_id", activeRaw.id)
      .order("paid_at", { ascending: false });
    if (paymentsErr) {
      console.error(`[freight/shipments/[id] payments lookup] invoiceId=${activeRaw.id}`, {
        code: paymentsErr.code, message: paymentsErr.message, details: paymentsErr.details, hint: paymentsErr.hint,
      });
      throw new Error(`Failed to load freight_invoice_payments (${paymentsErr.code}): ${paymentsErr.message}`);
    }
    const payments = ((paymentsRaw ?? []) as unknown as PaymentLedgerRow[]).map((p) => ({
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
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("member_code, first_name, last_name, email, phone, company_name, account_type, tax_id")
    .eq("id", header.profile_id)
    .maybeSingle<{
      member_code: string | null; first_name: string | null; last_name: string | null;
      email: string | null; phone: string | null; company_name: string | null;
      account_type: string | null; tax_id: string | null;
    }>();
  if (profileErr) {
    console.error(`[freight/shipments/[id] profile lookup] profileId=${header.profile_id}`, {
      code: profileErr.code, message: profileErr.message, details: profileErr.details, hint: profileErr.hint,
    });
    throw new Error(`Failed to load profiles (${profileErr.code}): ${profileErr.message}`);
  }

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
    const { data: wht, error: whtErr } = await admin
      .from("withholding_tax_entries")
      .select("id, cert_status, gross_invoice_thb, wht_base_thb, wht_rate_pct, wht_amount_thb, net_expected_thb, cert_number, cert_storage_path, cert_received_at, waived_reason, waived_at")
      .eq("freight_invoice_id", activeInvoice.id)
      .limit(1)
      .maybeSingle<WhtRow>();
    if (whtErr) {
      console.error(`[freight/shipments/[id] wht lookup] invoiceId=${activeInvoice.id}`, {
        code: whtErr.code, message: whtErr.message, details: whtErr.details, hint: whtErr.hint,
      });
      throw new Error(`Failed to load withholding_tax_entries (${whtErr.code}): ${whtErr.message}`);
    }
    whtEntry = wht ?? null;
  }
  const whtSuggestedGross = Number(
    invoicesAll.find((i) => i.id === activeInvoice?.id)?.commercial_value_thb ?? 0,
  );

  // V-E11 — customs declarations for this shipment (all rows, list newest
  // first; non-cancelled active row controls the "create" CTA visibility).
  type CdRow = {
    id:                       string;
    declaration_no:           string | null;
    status:                   CustomsDeclarationStatus;
    declaration_type:         CustomsDeclarationType;
    customs_office:           string | null;
    customs_control_no:       string | null;
    total_declared_value_thb: number | null;
    total_duty_thb:           number | null;
    total_vat_thb:            number | null;
    submitted_at:             string | null;
    created_at:               string;
  };
  const { data: cdRowsRaw, error: cdRowsErr } = await admin
    .from("customs_declarations")
    .select(`
      id, declaration_no, status, declaration_type, customs_office, customs_control_no,
      total_declared_value_thb, total_duty_thb, total_vat_thb, submitted_at, created_at
    `)
    .eq("freight_shipment_id", id)
    .order("created_at", { ascending: false });
  if (cdRowsErr) {
    console.error(`[freight/shipments/[id] customs declarations lookup] id=${id}`, {
      code: cdRowsErr.code, message: cdRowsErr.message, details: cdRowsErr.details, hint: cdRowsErr.hint,
    });
    throw new Error(`Failed to load customs_declarations (${cdRowsErr.code}): ${cdRowsErr.message}`);
  }
  const cdRows = (cdRowsRaw ?? []) as unknown as CdRow[];
  const activeCd = cdRows.find((c) => c.status !== "cancelled") ?? null;

  // IC-1 — find the work_item that indexes this shipment so the thread
  // panel can render below.  May be null if no work_item exists yet.
  const { data: workItem, error: workItemErr } = await admin
    .from("work_items")
    .select("id")
    .eq("entity_type", "freight_shipment")
    .eq("entity_ref", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (workItemErr) {
    console.error(`[freight/shipments/[id] work_items lookup] id=${id}`, {
      code: workItemErr.code, message: workItemErr.message, details: workItemErr.details, hint: workItemErr.hint,
    });
    throw new Error(`Failed to load work_items (${workItemErr.code}): ${workItemErr.message}`);
  }

  // Audit.
  const { data: auditRaw, error: auditErr } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, payload, admin_id, admin:profiles!admin_id ( member_code, first_name, last_name )")
    .eq("target_type", "freight_shipment")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (auditErr) {
    console.error(`[freight/shipments/[id] audit log lookup] id=${id}`, {
      code: auditErr.code, message: auditErr.message, details: auditErr.details, hint: auditErr.hint,
    });
    throw new Error(`Failed to load admin_audit_log (${auditErr.code}): ${auditErr.message}`);
  }
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

      {/* G3 (V-E1.1) — value-block inline editor (closes the "read-only"
          gap; admin can edit + server recomputes derived per ADR-0016). */}
      <ValueBlockEditor
        data={{
          id:                          header.id,
          commercial_value_thb:        header.commercial_value_thb,
          duty_thb:                    header.duty_thb,
          vat_thb:                     header.vat_thb,
          commercial_value_usd:        header.commercial_value_usd,
          exchange_rate:               header.exchange_rate,
          rate_date:                   header.rate_date,
          declared_customs_value_thb:  header.declared_customs_value_thb,
          declared_value_basis:        header.declared_value_basis,
          hs_code:                     header.hs_code,
          duty_rate_pct:               header.duty_rate_pct,
          vat_base_thb:                header.vat_base_thb,
          vat_plan_label:              header.vat_plan_label,
          form_e_applied:              header.form_e_applied ?? false,
        }}
        editable={!["delivered", "cancelled"].includes(header.status)}
      />

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

      {/* V-E11 — Customs declaration (ใบขนสินค้า) panel */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">📋 ใบขนสินค้า (V-E11)</h2>
          {!activeCd && header.status !== "cancelled" && (
            <DeclarationCreateButton
              shipmentId={header.id}
              allowedToCreate={isSuperOrAccounting}
            />
          )}
        </div>
        {cdRows.length === 0 ? (
          <p className="text-xs text-muted">
            ยังไม่มีใบขนสินค้าสำหรับงานนี้{!isSuperOrAccounting && " — ต้องเป็น super หรือ accounting จึงจะสร้างได้"}
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {cdRows.map((cd) => (
              <li key={cd.id} className="flex items-baseline gap-2 flex-wrap">
                <Link href={`/admin/freight/declarations/${cd.id}`} className="font-mono text-primary-600 hover:underline">
                  {cd.declaration_no ?? "(ร่าง)"}
                </Link>
                <span className="text-muted">·</span>
                <span>{CUSTOMS_DECLARATION_TYPE_LABEL[cd.declaration_type]}</span>
                <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] ${CD_STATUS_BADGE[cd.status]}`}>
                  {CUSTOMS_DECLARATION_STATUS_LABEL[cd.status]}
                </span>
                {cd.customs_control_no && (
                  <span className="font-mono text-[10px] text-muted">ศุลฯ #{cd.customs_control_no}</span>
                )}
                <span className="text-[10px] text-muted">
                  {cd.submitted_at
                    ? `ยื่น ${new Date(cd.submitted_at).toLocaleDateString("th-TH")}`
                    : `สร้าง ${new Date(cd.created_at).toLocaleDateString("th-TH")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      {/* IC-1 — internal per-job chat thread (work_item_messages). */}
      {workItem ? (
        <WorkItemThread workItemId={workItem.id} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-4 text-center">
          <p className="text-sm text-muted">
            ยังไม่มี work-item สำหรับงานนี้ — สร้างก่อนเริ่มแชท
          </p>
          <Link
            href={`/admin/board?entity_type=freight_shipment&entity_ref=${id}`}
            className="mt-2 inline-block text-xs text-primary-600 hover:underline"
          >
            → ไปสร้างที่กระดานงาน
          </Link>
        </div>
      )}
    </main>
  );
}
