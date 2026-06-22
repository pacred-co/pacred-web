import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import {
  QUOTE_STATUS_LABEL, TRANSPORT_MODE_LABEL,
  type QuoteStatus, type TransportMode, type Incoterm,
} from "@/lib/validators/freight-quote";
import { QuoteDetailClient, type QuoteDetailData, type LineItem } from "./quote-detail-client";

/**
 * V-E6 — /admin/freight/quotes/[id]
 *
 * Quote detail view: header + line items (inline edit when draft) +
 * status-aware action buttons (submit/approve/reject/send/accept/expire/
 * convert) + audit timeline.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<QuoteStatus, string> = {
  draft:            "bg-gray-50 text-gray-600 border-gray-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved:         "bg-blue-50 text-blue-700 border-blue-200",
  sent:             "bg-purple-50 text-purple-700 border-purple-200",
  accepted:         "bg-green-50 text-green-700 border-green-200",
  rejected:         "bg-red-50 text-red-700 border-red-200",
  expired:          "bg-gray-100 text-gray-500 border-gray-200",
};

type HeaderRow = {
  id:                     string;
  quote_no:               string;
  status:                 QuoteStatus;
  profile_id:             string | null;
  buyer_name_snapshot:    string;
  buyer_tax_id_snapshot:  string | null;
  buyer_contact_snapshot: string | null;
  transport_mode:         TransportMode;
  port_loading:           string | null;
  port_discharge:         string | null;
  place_delivery:         string | null;
  incoterm:               Incoterm | null;
  currency:               string;
  subtotal:               number;
  vat_pct:                number;
  vat_amount:             number;
  total:                  number;
  valid_until:            string | null;
  notes:                  string | null;
  approved_at:            string | null;
  rejected_reason:        string | null;
  rejected_at:            string | null;
  sent_at:                string | null;
  accepted_at:            string | null;
  expired_at:             string | null;
  created_at:             string;
  updated_at:             string;
  converted_to_shipment_id: string | null;
};

type ItemRow = {
  id:             string;
  position:       number;
  description:    string;
  quantity:       number;
  unit:           string;
  unit_price_thb: number;
  line_total_thb: number;
  note:           string | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminFreightQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const { id } = await params;

  const admin = createAdminClient();

  const { data: header, error: headerErr } = await admin
    .from("freight_quotes")
    .select(`
      id, quote_no, status, profile_id, buyer_name_snapshot, buyer_tax_id_snapshot,
      buyer_contact_snapshot, transport_mode, port_loading, port_discharge,
      place_delivery, incoterm, currency, subtotal, vat_pct, vat_amount, total,
      valid_until, notes, approved_at, rejected_reason, rejected_at, sent_at,
      accepted_at, expired_at, created_at, updated_at, converted_to_shipment_id
    `)
    .eq("id", id)
    .maybeSingle<HeaderRow>();
  if (headerErr) {
    console.error(`[freight_quotes lookup] failed`, { code: headerErr.code, message: headerErr.message, details: headerErr.details, hint: headerErr.hint });
    throw new Error(`Failed to load freight_quotes (${headerErr.code ?? "unknown"}): ${headerErr.message}`);
  }
  if (!header) notFound();

  const { data: itemsRaw, error: itemsRawErr } = await admin
    .from("freight_quote_items")
    .select("id, position, description, quantity, unit, unit_price_thb, line_total_thb, note")
    .eq("freight_quote_id", id)
    .order("position", { ascending: true });
  if (itemsRawErr) {
    console.error(`[freight_quote_items list] failed`, { code: itemsRawErr.code, message: itemsRawErr.message });
  }
  const items = (itemsRaw ?? []) as unknown as ItemRow[];

  // Audit trail rows for this quote.
  const { data: auditRaw, error: auditRawErr } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, payload, admin_id, admin:profiles!admin_id ( member_code, first_name, last_name )")
    .eq("target_type", "freight_quote")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (auditRawErr) {
    console.error(`[admin_audit_log list] failed`, { code: auditRawErr.code, message: auditRawErr.message });
  }
  type AuditRaw = {
    id: string; action: string; created_at: string; payload: unknown;
    admin: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
  };
  const audit = ((auditRaw ?? []) as unknown as AuditRaw[]).map((a) => ({
    id:      a.id,
    action:  a.action,
    created_at: a.created_at,
    admin:   Array.isArray(a.admin) ? a.admin[0] ?? null : a.admin,
  }));

  const isSuper       = isGodRole(roles);

  const detailData: QuoteDetailData = {
    id:                       header.id,
    quote_no:                 header.quote_no,
    status:                   header.status,
    transport_mode:           header.transport_mode,
    vat_pct:                  Number(header.vat_pct),
    subtotal:                 Number(header.subtotal),
    vat_amount:               Number(header.vat_amount),
    total:                    Number(header.total),
    converted_to_shipment_id: header.converted_to_shipment_id,
    isSuper,
  };
  const lineItems: LineItem[] = items.map((it) => ({
    id:             it.id,
    position:       it.position,
    description:    it.description,
    quantity:       Number(it.quantity),
    unit:           it.unit,
    unit_price_thb: Number(it.unit_price_thb),
    line_total_thb: Number(it.line_total_thb),
    note:           it.note,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/freight/quotes" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            ใบเสนอราคา <span className="font-mono">{header.quote_no}</span>
          </h1>
          <p className="text-xs text-muted">
            สร้าง {new Date(header.created_at).toLocaleString("th-TH")}
            {header.approved_at && <> · อนุมัติ {new Date(header.approved_at).toLocaleString("th-TH")}</>}
            {header.sent_at     && <> · ส่ง {new Date(header.sent_at).toLocaleString("th-TH")}</>}
            {header.accepted_at && <> · ตอบรับ {new Date(header.accepted_at).toLocaleString("th-TH")}</>}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
          {QUOTE_STATUS_LABEL[header.status]}
        </span>
      </div>

      {/* Buyer + Logistics blocks (read-only — editing is via header form, V-E6.1) */}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2">ผู้ซื้อ</h2>
          <p className="font-medium">{header.buyer_name_snapshot}</p>
          {header.buyer_tax_id_snapshot && (
            <p className="text-xs">เลขผู้เสียภาษี: <span className="font-mono">{header.buyer_tax_id_snapshot}</span></p>
          )}
          {header.buyer_contact_snapshot && (
            <p className="text-xs whitespace-pre-line">{header.buyer_contact_snapshot}</p>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
          <h2 className="font-bold text-sm mb-2">โลจิสติกส์</h2>
          <p>ขนส่ง: {TRANSPORT_MODE_LABEL[header.transport_mode]}</p>
          {header.port_loading   && <p>ต้นทาง: {header.port_loading}</p>}
          {header.port_discharge && <p>ปลายทาง: {header.port_discharge}</p>}
          {header.place_delivery && <p>ส่งมอบ: {header.place_delivery}</p>}
          {header.incoterm       && <p>Incoterm: <span className="font-mono">{header.incoterm}</span></p>}
          {header.valid_until    && <p>หมดอายุ: {new Date(header.valid_until).toLocaleDateString("th-TH")}</p>}
        </section>
      </div>

      {/* Rejected reason banner */}
      {header.status === "rejected" && header.rejected_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>ปฏิเสธ:</strong> {header.rejected_reason}
        </div>
      )}

      {/* Items + Actions (client-managed) */}
      <QuoteDetailClient data={detailData} items={lineItems} />

      {/* Totals */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-muted">มูลค่าก่อน VAT</td>
              <td className="py-1 text-right font-mono">{thb(header.subtotal)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted">VAT {Number(header.vat_pct)}%</td>
              <td className="py-1 text-right font-mono">{thb(header.vat_amount)}</td>
            </tr>
            <tr className="border-t-2 border-black text-base font-bold">
              <td className="py-2">รวมทั้งสิ้น</td>
              <td className="py-2 text-right font-mono text-primary-700">{thb(header.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {header.notes && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-1">หมายเหตุ</h2>
          <p className="text-xs whitespace-pre-line">{header.notes}</p>
        </section>
      )}

      {/* Audit timeline */}
      {audit.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">📜 Audit timeline</h2>
          <ul className="space-y-1.5 text-xs">
            {audit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-muted whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="font-medium">{a.action}</span>
                <span className="text-muted">
                  by {a.admin?.member_code ?? "—"}
                  {a.admin?.first_name && ` (${a.admin.first_name}${a.admin.last_name ? " " + a.admin.last_name : ""})`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
