import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  CUSTOMS_DECLARATION_STATUS_LABEL,
  CUSTOMS_DECLARATION_TYPE_LABEL,
  CUSTOMS_OFFICE_LABEL,
  type CustomsDeclarationStatus,
  type CustomsDeclarationType,
  type CustomsOffice,
} from "@/lib/validators/customs-declaration";
import {
  DeclarationDetailClient,
  type DeclarationDetailData,
  type DeclarationLineData,
} from "./declaration-detail-client";

/**
 * V-E11 — /admin/freight/declarations/[id]
 *
 * Detail view: header (with editable fields in draft) + line-item table
 * (inline edit in draft) + status-aware action buttons + audit timeline.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<CustomsDeclarationStatus, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  accepted:  "bg-amber-50 text-amber-700 border-amber-200",
  released:  "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

type Header = {
  id:                         string;
  declaration_no:             string | null;
  status:                     CustomsDeclarationStatus;
  declaration_type:           CustomsDeclarationType;
  freight_shipment_id:        string;
  declared_at:                string | null;
  submitted_at:               string | null;
  accepted_at:                string | null;
  released_at:                string | null;
  cancelled_at:               string | null;
  cancelled_reason:           string | null;
  customs_office:             string | null;
  customs_control_no:         string | null;
  broker_name:                string | null;
  broker_license_no:          string | null;
  ship_or_truck_arrival_date: string | null;
  port_of_entry:              string | null;
  paid_through_promptpay:     boolean;
  total_declared_value_thb:   number | null;
  total_duty_thb:             number | null;
  total_vat_thb:              number | null;
  total_other_taxes_thb:      number | null;
  notes:                      string | null;
  created_at:                 string;
};

type Shipment = {
  job_no:               string | null;
  transport_mode:       string | null;
  container_code:       string | null;
  carrier_container_no: string | null;
  bl_no:                string | null;
  profile_id:           string;
};

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminCustomsDeclarationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const { id } = await params;
  const admin = createAdminClient();

  const { data: header } = await admin
    .from("customs_declarations")
    .select(`
      id, declaration_no, status, declaration_type, freight_shipment_id,
      declared_at, submitted_at, accepted_at, released_at,
      cancelled_at, cancelled_reason,
      customs_office, customs_control_no, broker_name, broker_license_no,
      ship_or_truck_arrival_date, port_of_entry, paid_through_promptpay,
      total_declared_value_thb, total_duty_thb, total_vat_thb, total_other_taxes_thb,
      notes, created_at
    `)
    .eq("id", id)
    .maybeSingle<Header>();
  if (!header) notFound();

  const { data: shipment } = await admin
    .from("freight_shipments")
    .select("job_no, transport_mode, container_code, carrier_container_no, bl_no, profile_id")
    .eq("id", header.freight_shipment_id)
    .maybeSingle<Shipment>();

  const { data: customer } = await admin
    .from("profiles")
    .select("member_code, first_name, last_name, company_name, email, phone, tax_id, account_type")
    .eq("id", shipment?.profile_id ?? "")
    .maybeSingle<{
      member_code: string | null; first_name: string | null; last_name: string | null;
      company_name: string | null; email: string | null; phone: string | null;
      tax_id: string | null; account_type: string | null;
    }>();

  const { data: linesRaw } = await admin
    .from("customs_declaration_lines")
    .select(`
      id, position, hs_code, description, country_of_origin, qty, unit,
      gross_weight_kg, net_weight_kg, declared_value_thb,
      duty_rate_pct, duty_thb, vat_thb, fta_applied, notes
    `)
    .eq("declaration_id", id)
    .order("position", { ascending: true });
  const lines = (linesRaw ?? []) as DeclarationLineData[];

  // Audit timeline.
  const { data: auditRaw } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, payload, admin_id, admin:profiles!admin_id ( member_code, first_name, last_name )")
    .eq("target_type", "customs_declaration")
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

  const detailData: DeclarationDetailData = {
    id:                         header.id,
    declaration_no:             header.declaration_no,
    status:                     header.status,
    declaration_type:           header.declaration_type,
    freight_shipment_id:        header.freight_shipment_id,
    customs_office:             header.customs_office,
    customs_control_no:         header.customs_control_no,
    broker_name:                header.broker_name,
    broker_license_no:          header.broker_license_no,
    ship_or_truck_arrival_date: header.ship_or_truck_arrival_date,
    port_of_entry:              header.port_of_entry,
    paid_through_promptpay:     header.paid_through_promptpay,
    total_other_taxes_thb:      header.total_other_taxes_thb,
    notes:                      header.notes,
  };

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/freight/declarations" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            ใบขนสินค้า <span className="font-mono">{header.declaration_no ?? "(ร่าง)"}</span>
          </h1>
          <p className="text-xs text-muted">
            {CUSTOMS_DECLARATION_TYPE_LABEL[header.declaration_type]} ·{" "}
            สร้าง {new Date(header.created_at).toLocaleString("th-TH")} · งาน{" "}
            {shipment?.job_no ? (
              <Link href={`/admin/freight/shipments/${header.freight_shipment_id}`} className="font-mono text-primary-500 hover:underline">
                {shipment.job_no}
              </Link>
            ) : "—"}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
          {CUSTOMS_DECLARATION_STATUS_LABEL[header.status]}
        </span>
      </div>

      {/* PDF download — works for draft (admin preview) and all other states */}
      <div className="flex gap-2">
        <a
          href={`/api/customs-declaration/${header.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
        >
          📄 ดาวน์โหลด PDF ใบขนฯ
        </a>
        <Link
          href={`/admin/freight/shipments/${header.freight_shipment_id}`}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
        >
          ↗ ไปหน้างาน (shipment)
        </Link>
      </div>

      {/* Customer + shipment summary */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 text-xs space-y-1">
        <h2 className="font-bold text-sm mb-2">งาน + ลูกค้า</h2>
        <p>
          งาน: <span className="font-mono">{shipment?.job_no ?? "—"}</span>
          {shipment?.transport_mode && ` · ขนส่ง: ${shipment.transport_mode}`}
        </p>
        {(shipment?.container_code || shipment?.carrier_container_no || shipment?.bl_no) && (
          <p className="font-mono text-[11px]">
            {shipment?.container_code       && `Container ${shipment.container_code} · `}
            {shipment?.carrier_container_no && `Carrier ${shipment.carrier_container_no} · `}
            {shipment?.bl_no                && `B/L ${shipment.bl_no}`}
          </p>
        )}
        <p>
          ลูกค้า:{" "}
          {customer?.company_name
            ?? `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim()
            ?? "—"}
          {customer?.member_code && <span className="ml-2 font-mono text-[10px] text-muted">({customer.member_code})</span>}
        </p>
        {customer?.email && <p className="text-muted">✉️ {customer.email}</p>}
        {customer?.phone && <p className="text-muted">📞 {customer.phone}</p>}
        {customer?.account_type === "juristic" && customer.tax_id && (
          <p>เลขผู้เสียภาษี: <span className="font-mono">{customer.tax_id}</span></p>
        )}
      </section>

      {/* Cancelled reason */}
      {header.status === "cancelled" && header.cancelled_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>ยกเลิก:</strong> {header.cancelled_reason}
        </div>
      )}

      {/* Read-only summary for non-draft */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1 text-xs">
        <h2 className="font-bold text-sm mb-2">📋 ยอดรวม</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-1">
          <p>ราคารวมสำแดง: <span className="font-mono">{thb(header.total_declared_value_thb)}</span></p>
          <p>อากรขาเข้า: <span className="font-mono">{thb(header.total_duty_thb)}</span></p>
          <p>VAT 7%: <span className="font-mono">{thb(header.total_vat_thb)}</span></p>
          <p>ภาษีอื่นๆ: <span className="font-mono">{thb(header.total_other_taxes_thb)}</span></p>
        </div>
        <p className="mt-2 text-[10px] text-muted">
          ⚠️ คำนวนต่อบรรทัด: duty = declared × duty_rate% · vat = (declared + duty) × 7% (Thai customs convention)
        </p>
      </section>

      {/* Editable header + line CRUD + status actions */}
      <DeclarationDetailClient data={detailData} lines={lines} />

      {/* Lifecycle timestamps */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1 text-xs">
        <h2 className="font-bold text-sm mb-2">เหตุการณ์ (Lifecycle)</h2>
        <p>ร่าง: <span className="font-mono">{header.declared_at  ? new Date(header.declared_at).toLocaleString("th-TH")  : "—"}</span></p>
        <p>ยื่นแล้ว: <span className="font-mono">{header.submitted_at ? new Date(header.submitted_at).toLocaleString("th-TH") : "—"}</span></p>
        <p>ตรวจรับ: <span className="font-mono">{header.accepted_at  ? new Date(header.accepted_at).toLocaleString("th-TH")  : "—"}</span></p>
        <p>ตรวจปล่อย: <span className="font-mono">{header.released_at  ? new Date(header.released_at).toLocaleString("th-TH")  : "—"}</span></p>
        {header.cancelled_at && (
          <p className="text-red-700">ยกเลิก: <span className="font-mono">{new Date(header.cancelled_at).toLocaleString("th-TH")}</span></p>
        )}
        {header.customs_office && (
          <p className="mt-2">
            ด่าน: <span className="font-mono">{CUSTOMS_OFFICE_LABEL[header.customs_office as CustomsOffice] ?? header.customs_office}</span>
          </p>
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
    </main>
  );
}
