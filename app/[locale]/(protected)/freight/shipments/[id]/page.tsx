import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { LINE_OA, CONTACT } from "@/components/seo/site";
import { CustomerWhtUploadPanel } from "@/components/customer-wht-upload-panel";
import { Home, ChevronRight, Package, FileText, Download, MessageCircle } from "lucide-react";
import {
  FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODE_LABEL,
  FREIGHT_INVOICE_STATUS_LABEL,
  type FreightShipmentStatus,
  type FreightTransportMode,
  type FreightInvoiceStatus,
} from "@/lib/validators/freight-shipment";
import {
  freightInvoiceTotalThb,
  computeInvoicePaymentStatus,
  roundThb,
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
  type FreightInvoicePaymentStatus,
} from "@/lib/validators/freight-payment";
import { resolvePaymentAccount } from "@/lib/payment/bank-accounts";
import { FreightJourney } from "../../_components/freight-journey";
import { FreightPayNotify } from "../../_components/freight-pay-notify";

/**
 * V-E1.2 — /freight/shipments/[id] customer detail view.
 *
 * Read-only: header + parties + value-block summary + invoice card with
 * 4 PDF download buttons (CI / PL / Form E / D/O) + payment status +
 * WHT info banner with optional self-upload.
 *
 * RLS scopes freight_shipments / freight_parties / freight_invoices /
 * freight_invoice_payments / withholding_tax_entries to profile_id =
 * auth.uid() automatically (migrations 0050/0051/0052/0053).
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

const PAYMENT_STATUS_BADGE: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "bg-gray-50 text-gray-600 border-gray-200",
  partial:  "bg-amber-50 text-amber-700 border-amber-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  overpaid: "bg-purple-50 text-purple-700 border-purple-200",
};

type ShipmentHeader = {
  id:                          string;
  job_no:                      string | null;
  status:                      FreightShipmentStatus;
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
  commercial_value_thb:        number | null;
  duty_thb:                    number | null;
  vat_thb:                     number | null;
  vat_plan_label:              string | null;
  form_e_applied:              boolean;
  notes:                       string | null;
  cancelled_reason:            string | null;
  created_at:                  string;
  confirmed_at:                string | null;
  delivered_at:                string | null;
  // Rich journey axis (mig 0233) — the customer journey derives from these.
  journey_status:              string | null;
  issue_flag:                  string | null;
  atd_at:                      string | null;
  etd_at:                      string | null;
  departed_at:                 string | null;
  th_cleared_at:               string | null;
  ata_at:                      string | null;
  arrived_th_warehouse_at:     string | null;
};

type PartyRow = {
  id:      string;
  role:    string;
  name:    string;
  address: string;
  tax_id:  string | null;
  branch:  string | null;
};

type InvoiceRow = {
  id:                   string;
  status:               FreightInvoiceStatus;
  invoice_no:           string | null;
  issued_at:            string | null;
  payment_status:       FreightInvoicePaymentStatus;
  fully_paid_at:        string | null;
  commercial_value_thb: number | null;
  duty_thb:             number | null;
  vat_thb:              number | null;
  cancellation_reason:  string | null;
};

type PaymentRow = {
  id:         string;
  amount_thb: number;
  status:     "recorded" | "voided";
};

type WhtRow = {
  id:                 string;
  cert_status:        "pending" | "received" | "waived";
  wht_rate_pct:       number;
  wht_amount_thb:     number;
  net_expected_thb:   number;
  gross_invoice_thb:  number;
};

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function CustomerFreightShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("customerFreight");
  const sb = await createClient();

  // Header.
  const { data: header, error: headerErr } = await sb
    .from("freight_shipments")
    .select(`
      id, job_no, status, transport_mode, container_code, carrier_container_no,
      bl_no, vessel_voyage, port_loading, port_discharge, place_delivery, incoterm,
      payment_term, origin_country, commercial_value_thb, duty_thb, vat_thb,
      vat_plan_label, form_e_applied, notes, cancelled_reason, created_at,
      confirmed_at, delivered_at,
      journey_status, issue_flag, atd_at, etd_at, departed_at,
      th_cleared_at, ata_at, arrived_th_warehouse_at
    `)
    .eq("id", id)
    .maybeSingle<ShipmentHeader>();
  if (headerErr) {
    console.error(`[freight_shipments lookup] failed`, { code: headerErr.code, message: headerErr.message, details: headerErr.details, hint: headerErr.hint });
    throw new Error(`Failed to load freight_shipments (${headerErr.code ?? "unknown"}): ${headerErr.message}`);
  }
  if (!header) notFound();

  // Parties.
  const { data: partiesRaw, error: partiesRawErr } = await sb
    .from("freight_parties")
    .select("id, role, name, address, tax_id, branch")
    .eq("freight_shipment_id", id)
    .returns<PartyRow[]>();
  if (partiesRawErr) {
    console.error(`[freight_parties list] failed`, { code: partiesRawErr.code, message: partiesRawErr.message });
  }
  const parties = partiesRaw ?? [];
  const shipper   = parties.find((p) => p.role === "shipper")   ?? null;
  const consignee = parties.find((p) => p.role === "consignee") ?? null;

  // Invoice (latest non-cancelled, else newest).
  const { data: invoicesRaw, error: invoicesRawErr } = await sb
    .from("freight_invoices")
    .select(`
      id, status, invoice_no, issued_at, payment_status, fully_paid_at,
      commercial_value_thb, duty_thb, vat_thb, cancellation_reason
    `)
    .eq("freight_shipment_id", id)
    .order("created_at", { ascending: false })
    .returns<InvoiceRow[]>();
  if (invoicesRawErr) {
    console.error(`[freight_invoices list] failed`, { code: invoicesRawErr.code, message: invoicesRawErr.message });
  }
  const allInvoices = invoicesRaw ?? [];
  const activeInvoice = allInvoices.find((i) => i.status !== "cancelled") ?? allInvoices[0] ?? null;

  // Payment ledger summary (only for issued invoices — others have no payments).
  let paidThb = 0;
  let totalThb = 0;
  let outstandingThb = 0;
  let paymentStatus: FreightInvoicePaymentStatus = "unpaid";
  if (activeInvoice && activeInvoice.status === "issued") {
    const { data: paymentsRaw, error: paymentsRawErr } = await sb
      .from("freight_invoice_payments")
      .select("id, amount_thb, status")
      .eq("freight_invoice_id", activeInvoice.id)
      .returns<PaymentRow[]>();
    if (paymentsRawErr) {
      console.error(`[freight_invoice_payments list] failed`, { code: paymentsRawErr.code, message: paymentsRawErr.message });
    }
    paidThb = roundThb(
      (paymentsRaw ?? [])
        .filter((p) => p.status === "recorded")
        .reduce((s, p) => s + Number(p.amount_thb), 0),
    );
    totalThb = freightInvoiceTotalThb({
      commercial_value_thb: activeInvoice.commercial_value_thb,
      duty_thb:             activeInvoice.duty_thb,
      vat_thb:              activeInvoice.vat_thb,
    });
    outstandingThb = roundThb(Math.max(0, totalThb - paidThb));
    paymentStatus  = computeInvoicePaymentStatus(paidThb, totalThb);
  }

  // V-A6 / U2-3: WHT info banner — exists when admin created a wht entry
  // for the active invoice. RLS already scopes withholding_tax_entries.
  let whtEntry: WhtRow | null = null;
  if (activeInvoice) {
    const { data: wht, error: whtErr } = await sb
      .from("withholding_tax_entries")
      .select("id, cert_status, wht_rate_pct, wht_amount_thb, net_expected_thb, gross_invoice_thb")
      .eq("freight_invoice_id", activeInvoice.id)
      .limit(1)
      .maybeSingle<WhtRow>();
    if (whtErr) {
      console.error(`[withholding_tax_entries list] failed`, { code: whtErr.code, message: whtErr.message });
    }
    whtEntry = wht ?? null;
  }

  const valueBlockTotal = freightInvoiceTotalThb({
    commercial_value_thb: header.commercial_value_thb,
    duty_thb:             header.duty_thb,
    vat_thb:              header.vat_thb,
  });

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/freight" className="hover:text-primary-600">Freight</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/freight/shipments" className="hover:text-primary-600">{t("breadcrumbShipments")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium font-mono">{header.job_no ?? "—"}</span>
        </nav>

        {/* Header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  {t("jobLabel")} <span className="font-mono">{header.job_no ?? "—"}</span>
                </h1>
                <p className="text-xs text-muted mt-1">
                  {FREIGHT_TRANSPORT_MODE_LABEL[header.transport_mode]} ·{" "}
                  {t("createdOn", { date: new Date(header.created_at).toLocaleDateString("th-TH") })}
                </p>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
              {FREIGHT_SHIPMENT_STATUS_LABEL[header.status]}
            </span>
          </div>
        </div>

        {/* Customer journey stepper — DERIVES from the rich journey_status (mig
            0233, the SOT the admin drives), falling back to the 6-state status
            when unset. Customer-visible stages only; a held job (issue_flag) or
            cancelled shows a friendly note, never the raw 'cancelled' label nor
            an internal-step label. The raw cancelled_reason / issue_note stay
            admin-internal — not surfaced to the customer here. */}
        <FreightJourney
          status={header.status}
          journeyStatus={header.journey_status}
          issueFlag={header.issue_flag}
          timestamps={{
            created_at:              header.created_at,
            confirmed_at:            header.confirmed_at,
            atd_at:                  header.atd_at,
            etd_at:                  header.etd_at,
            departed_at:             header.departed_at,
            th_cleared_at:           header.th_cleared_at,
            ata_at:                  header.ata_at,
            arrived_th_warehouse_at: header.arrived_th_warehouse_at,
            delivered_at:            header.delivered_at,
          }}
        />

        {/* Logistics block */}
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
          <h2 className="font-bold text-sm mb-2">{t("logisticsHeading")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
            {header.container_code       && <p>Container: <span className="font-mono">{header.container_code}</span></p>}
            {header.carrier_container_no && <p>Carrier no: <span className="font-mono">{header.carrier_container_no}</span></p>}
            {header.bl_no                && <p>B/L: <span className="font-mono">{header.bl_no}</span></p>}
            {header.vessel_voyage        && <p>Vessel: {header.vessel_voyage}</p>}
            {header.port_loading         && <p>{t("portLoading")}: {header.port_loading}</p>}
            {header.port_discharge       && <p>{t("portDischarge")}: {header.port_discharge}</p>}
            {header.place_delivery       && <p>{t("placeDelivery")}: {header.place_delivery}</p>}
            {header.incoterm             && <p>Incoterm: <span className="font-mono">{header.incoterm}</span></p>}
            {header.payment_term         && <p>Payment: {header.payment_term}</p>}
            <p>Origin: {header.origin_country}</p>
          </div>
        </section>

        {/* Parties */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">📦 {t("partiesHeading")}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface-alt/30 p-4 space-y-1">
              <p className="text-xs font-bold uppercase text-muted">{t("shipperLabel")}</p>
              {shipper ? (
                <>
                  <p className="font-medium">{shipper.name}</p>
                  <p className="text-xs whitespace-pre-line text-muted">{shipper.address}</p>
                </>
              ) : (
                <p className="text-xs text-muted italic">{t("noData")}</p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-surface-alt/30 p-4 space-y-1">
              <p className="text-xs font-bold uppercase text-muted">{t("consigneeLabel")}</p>
              {consignee ? (
                <>
                  <p className="font-medium">{consignee.name}</p>
                  <p className="text-xs whitespace-pre-line text-muted">{consignee.address}</p>
                  {consignee.tax_id && (
                    <p className="text-xs">
                      {t("taxId")}: <span className="font-mono">{consignee.tax_id}</span>
                    </p>
                  )}
                  {consignee.branch && <p className="text-xs">{t("branch")}: {consignee.branch}</p>}
                </>
              ) : (
                <p className="text-xs text-muted italic">{t("noData")}</p>
              )}
            </div>
          </div>
        </section>

        {/* Value-block summary (customer view — simplified, no USD/rate detail) */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">📊 {t("valueHeading")}</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-muted">{t("commercialValue")}</td>
                <td className="py-1 text-right font-mono">{thb(header.commercial_value_thb)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted">{t("duty")}</td>
                <td className="py-1 text-right font-mono">{thb(header.duty_thb)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted">{t("vat7")}</td>
                <td className="py-1 text-right font-mono">{thb(header.vat_thb)}</td>
              </tr>
              <tr className="border-t-2 border-black text-base font-bold">
                <td className="py-2">{t("landedCost")}</td>
                <td className="py-2 text-right font-mono text-primary-700">{thb(valueBlockTotal)}</td>
              </tr>
            </tbody>
          </table>
          {header.vat_plan_label && (
            <p className="mt-2 text-[11px] text-muted">VAT plan: {header.vat_plan_label}</p>
          )}
          {header.form_e_applied && (
            <p className="mt-1 text-[11px] text-green-700">✓ Form E (ASEAN-China FTA) applied</p>
          )}
        </section>

        {/* Invoice card with 4 PDF download buttons */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-sm inline-flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-600" />
              Commercial Invoice
              {activeInvoice?.invoice_no && (
                <span className="font-mono text-xs">{activeInvoice.invoice_no}</span>
              )}
              {activeInvoice && (
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${INV_STATUS_BADGE[activeInvoice.status]}`}>
                  {FREIGHT_INVOICE_STATUS_LABEL[activeInvoice.status]}
                </span>
              )}
            </h2>
          </div>

          {!activeInvoice ? (
            <p className="p-5 text-center text-sm text-muted">
              {t("noInvoice")}
            </p>
          ) : activeInvoice.status === "draft" ? (
            <p className="p-6 text-center text-sm text-amber-700">
              {t("invoiceDraft")}
            </p>
          ) : (
            <>
              {/* PDF download buttons (CI / PL / Form E / D/O) */}
              <div className="p-5 border-b border-border bg-surface-alt/20">
                <p className="text-xs text-muted mb-2">📥 {t("downloadPdf")}</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/freight-invoice/${activeInvoice.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50"
                  >
                    <Download className="w-3.5 h-3.5" /> Commercial Invoice (USD)
                  </a>
                  <a
                    href={`/api/freight-invoice/${activeInvoice.id}/packing-list`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
                  >
                    <Download className="w-3.5 h-3.5" /> Packing List
                  </a>
                  <a
                    href={`/api/freight-invoice/${activeInvoice.id}/form-e`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
                  >
                    <Download className="w-3.5 h-3.5" /> Form E
                  </a>
                  <a
                    href={`/api/freight-invoice/${activeInvoice.id}/do-letter`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
                  >
                    <Download className="w-3.5 h-3.5" /> D/O Letter
                  </a>
                </div>
              </div>

              {activeInvoice.cancellation_reason && (
                <div className="px-5 py-3 border-b border-red-200 bg-red-50 text-xs text-red-800">
                  <strong>{t("cancelledLabel")}</strong> {activeInvoice.cancellation_reason}
                </div>
              )}

              {/* Payment summary (only when invoice issued) */}
              {activeInvoice.status === "issued" && (
                <>
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-bold inline-flex items-center gap-2">
                      💰 {t("paymentHeading")}
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${PAYMENT_STATUS_BADGE[paymentStatus]}`}>
                        {FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[paymentStatus]}
                      </span>
                    </p>
                    {activeInvoice.fully_paid_at && (
                      <p className="text-[11px] text-muted">
                        {t("fullyPaidOn", { date: new Date(activeInvoice.fully_paid_at).toLocaleDateString("th-TH") })}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-border text-center text-xs">
                    <div className="bg-white dark:bg-surface px-3 py-3">
                      <p className="text-muted">{t("totalAmount")}</p>
                      <p className="mt-1 font-mono font-bold">{thb(totalThb)}</p>
                    </div>
                    <div className="bg-white dark:bg-surface px-3 py-3">
                      <p className="text-muted">{t("paidAmount")}</p>
                      <p className="mt-1 font-mono font-bold text-green-700">{thb(paidThb)}</p>
                    </div>
                    <div className="bg-white dark:bg-surface px-3 py-3">
                      <p className="text-muted">{t("outstandingAmount")}</p>
                      <p className={`mt-1 font-mono font-bold ${outstandingThb > 0 ? "text-amber-700" : "text-muted"}`}>
                        {thb(outstandingThb)}
                      </p>
                    </div>
                  </div>
                  {outstandingThb > 0 && (
                    <div className="border-t border-border p-5">
                      {/* แจ้งชำระเงิน — destination resolved by the bank-accounts
                          SOT. Freight (no customer ใบกำกับ) → SERVICE account
                          (PromptPay นิติ, ไม่ออกใบกำกับ) per resolvePaymentAccount
                          rule (c); a ใบกำกับ job would route to TRADING + VAT 7%. */}
                      <FreightPayNotify
                        account={resolvePaymentAccount({ issuesTaxInvoice: false })}
                        outstandingThb={outstandingThb}
                        jobNo={header.job_no ?? "—"}
                        lineOaUrl={LINE_OA.addFriendUrl}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>

        {/* WHT info banner (V-A6 / U2-3) */}
        {whtEntry && (
          <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 space-y-2">
            <h2 className="font-bold text-sm text-amber-900">
              📋 {t("whtHeading")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-sm text-amber-900">
              <p>{t("whtGross")}: <span className="font-mono">{thb(Number(whtEntry.gross_invoice_thb))}</span></p>
              <p>{t("whtRate")}: <span className="font-mono">{Number(whtEntry.wht_rate_pct)}%</span></p>
              <p>{t("whtAmount")}: <span className="font-mono">−{thb(Number(whtEntry.wht_amount_thb))}</span></p>
              <p>
                <strong>{t("whtNet")}: </strong>
                <span className="font-mono font-bold">{thb(Number(whtEntry.net_expected_thb))}</span>
              </p>
            </div>
            {whtEntry.cert_status === "pending" && (
              <>
                <p className="text-xs text-amber-800 mt-1">
                  ⚠️ {t("whtPending")}
                </p>
                <CustomerWhtUploadPanel whtEntryId={whtEntry.id} />
              </>
            )}
            {whtEntry.cert_status === "received" && (
              <p className="text-xs text-green-700">✅ {t("whtReceived")}</p>
            )}
            {whtEntry.cert_status === "waived" && (
              <p className="text-xs text-gray-700">ℹ️ {t("whtWaived")}</p>
            )}
          </section>
        )}

        {/* Notes (admin notes if any) */}
        {header.notes && (
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
            <h2 className="font-bold text-sm mb-1">{t("notesHeading")}</h2>
            <p className="text-xs whitespace-pre-line text-muted">{header.notes}</p>
          </section>
        )}

        {/* Contact CTA */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-4 text-sm">
          <p className="text-foreground">{t("questionsAboutJob")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={LINE_OA.addFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-xs font-bold hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4" /> {t("contactTeam")}
            </a>
            <a
              href={`tel:${CONTACT.phoneCompanyDisplay}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-alt"
            >
              📞 {CONTACT.phoneCompanyDisplay}
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
