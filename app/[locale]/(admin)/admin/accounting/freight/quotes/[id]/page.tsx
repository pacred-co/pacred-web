import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin, getAdminRoles, hasRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QUOTE_STATUS_LABEL,
  TRANSPORT_MODE_LABEL,
  type QuoteStatus,
  type TransportMode,
} from "@/lib/validators/freight-quote";
import { QuoteStatusActions } from "./quote-status-actions";

/**
 * /admin/accounting/freight/quotes/[id] — Freight ใบเสนอราคา detail.
 *
 * Reads the quote header (`freight_quotes`) + its line items
 * (`freight_quote_items`) — the canonical freight backend. Surfaces the buyer,
 * logistics terms (mode/POL/POD/incoterm), the priced line items, and the
 * VAT-inclusive totals — faithful to legacy `forwarder-quotation.php` view mode.
 *
 * Status-flip buttons (submit / approve / reject / send / accept / expire /
 * convert) REUSE the existing audited actions in
 * `actions/admin/freight-quotes.ts` — NO new money write-path is introduced
 * here. Every flip routes through a §0f confirm dialog (client component).
 *
 * RBAC: super | accounting | freight_sales. §0c: every read destructures error.
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = ["super", "accounting", "freight_sales"] as const;

const STATUS_CLS: Record<QuoteStatus, string> = {
  draft:            "bg-slate-100 text-slate-700 border-slate-300",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-300",
  approved:         "bg-blue-100 text-blue-700 border-blue-300",
  sent:             "bg-indigo-100 text-indigo-700 border-indigo-300",
  accepted:         "bg-emerald-100 text-emerald-700 border-emerald-300",
  rejected:         "bg-red-100 text-red-700 border-red-300",
  expired:          "bg-gray-100 text-gray-500 border-gray-300",
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function modeLabel(m: string | null): string {
  if (!m) return "—";
  return TRANSPORT_MODE_LABEL[m as TransportMode] ?? m;
}
function qty(n: number): string {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

type QuoteHeader = {
  id:                       string;
  quote_no:                 string | null;
  status:                   QuoteStatus;
  profile_id:               string | null;
  buyer_name_snapshot:      string;
  buyer_tax_id_snapshot:    string | null;
  buyer_contact_snapshot:   string | null;
  transport_mode:           string;
  port_loading:             string | null;
  port_discharge:           string | null;
  place_delivery:           string | null;
  incoterm:                 string | null;
  currency:                 string | null;
  subtotal:                 number | null;
  vat_pct:                  number | null;
  vat_amount:               number | null;
  total:                    number | null;
  valid_until:              string | null;
  notes:                    string | null;
  rejected_reason:          string | null;
  converted_to_shipment_id: string | null;
  created_at:               string | null;
  approved_at:              string | null;
  sent_at:                  string | null;
  accepted_at:              string | null;
};

type LineItem = {
  id:             string;
  position:       number;
  description:    string;
  quantity:       number;
  unit:           string;
  unit_price_thb: number;
  line_total_thb: number;
  note:           string | null;
};

export default async function FreightQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin([...VIEW_ROLES]);
  const roles = await getAdminRoles();
  const isSuper = roles != null && hasRole(roles, "super");
  const canSend = roles != null && hasRole(roles, ["accounting", "freight_sales"]); // super folds in via hasRole
  const canCreate = canSend; // create/edit/submit share the send role-set + super

  const { id } = await params;
  const admin = createAdminClient();

  const { data: header, error: headerErr } = await admin
    .from("freight_quotes")
    .select(
      "id, quote_no, status, profile_id, buyer_name_snapshot, buyer_tax_id_snapshot, " +
        "buyer_contact_snapshot, transport_mode, port_loading, port_discharge, place_delivery, " +
        "incoterm, currency, subtotal, vat_pct, vat_amount, total, valid_until, notes, " +
        "rejected_reason, converted_to_shipment_id, created_at, approved_at, sent_at, accepted_at",
    )
    .eq("id", id)
    .maybeSingle<QuoteHeader>();
  if (headerErr) {
    console.error("[freight-quote detail header]", { code: headerErr.code, message: headerErr.message });
    // Don't fall through to notFound on a transient DB error — surface a real error.
    throw new Error(`freight_quotes read failed: ${headerErr.code ?? "unknown"}`);
  }
  if (!header) notFound();

  const { data: itemsRaw, error: itemsErr } = await admin
    .from("freight_quote_items")
    .select("id, position, description, quantity, unit, unit_price_thb, line_total_thb, note")
    .eq("freight_quote_id", id)
    .order("position", { ascending: true });
  if (itemsErr) {
    console.error("[freight-quote detail items]", { code: itemsErr.code, message: itemsErr.message });
  }
  const items = ((itemsRaw ?? []) as unknown) as LineItem[];

  // Resolve member code for a registered buyer (display only).
  let memberCode: string | null = null;
  if (header.profile_id) {
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", header.profile_id)
      .maybeSingle<{ member_code: string | null }>();
    if (profErr) {
      console.error("[freight-quote detail profile]", { code: profErr.code, message: profErr.message });
    }
    memberCode = prof?.member_code ?? null;
  }

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-5xl">
      {/* Breadcrumb / back */}
      <div className="text-xs text-muted">
        <Link href="/admin/accounting/freight/quotes" className="text-primary-600 hover:underline">
          ← ใบเสนอราคา Freight
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{header.quote_no ?? "(ร่าง)"}</h1>
          <p className="text-sm text-muted mt-1">{header.buyer_name_snapshot}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[header.status]}`}>
          {QUOTE_STATUS_LABEL[header.status]}
        </span>
      </header>

      {header.status === "rejected" && header.rejected_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">เหตุผลที่ปฏิเสธ:</span> {header.rejected_reason}
        </div>
      )}

      {header.converted_to_shipment_id && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✅ แปลงเป็นงานขนส่งแล้ว ·{" "}
          <Link
            href={`/admin/freight/shipments/${header.converted_to_shipment_id}`}
            className="font-medium underline"
          >
            ดูงานขนส่ง
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Buyer card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide">ลูกค้า</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="ชื่อ" value={header.buyer_name_snapshot} />
            <Row label="รหัสสมาชิก" value={memberCode ?? (header.profile_id ? "—" : "(ลูกค้าใหม่ / cold)")} mono={!!memberCode} />
            <Row label="เลขผู้เสียภาษี" value={header.buyer_tax_id_snapshot ?? "—"} mono={!!header.buyer_tax_id_snapshot} />
            {header.buyer_contact_snapshot && (
              <div>
                <dt className="text-xs text-muted">ติดต่อ</dt>
                <dd className="whitespace-pre-line text-[13px]">{header.buyer_contact_snapshot}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Logistics card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide">เงื่อนไขขนส่ง</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="โหมดขนส่ง" value={modeLabel(header.transport_mode)} />
            <Row label="ต้นทาง (POL)" value={header.port_loading?.trim() || "—"} />
            <Row label="ปลายทาง (POD)" value={header.port_discharge?.trim() || "—"} />
            <Row label="สถานที่ส่งมอบ" value={header.place_delivery?.trim() || "—"} />
            <Row label="Incoterm" value={header.incoterm ?? "—"} mono={!!header.incoterm} />
            <Row label="สกุลเงิน" value={header.currency ?? "THB"} />
            <Row label="ใช้ได้ถึง" value={fmtDate(header.valid_until)} />
          </dl>
        </section>
      </div>

      {/* Line items */}
      <section className="space-y-2">
        <h2 className="font-bold text-sm">📋 รายการ ({items.length})</h2>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          {items.length === 0 ? (
            <p className="p-8 text-center text-xs text-muted">ยังไม่มีรายการในใบเสนอราคานี้</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 w-10">#</th>
                    <th className="px-3 py-2">รายละเอียด</th>
                    <th className="px-3 py-2 text-right">จำนวน</th>
                    <th className="px-3 py-2">หน่วย</th>
                    <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
                    <th className="px-3 py-2 text-right">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-[11px] text-muted">{it.position}</td>
                      <td className="px-3 py-2 text-[13px]">
                        {it.description}
                        {it.note && <p className="mt-0.5 text-[11px] text-muted">{it.note}</p>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{qty(it.quantity)}</td>
                      <td className="px-3 py-2 text-[11px] font-mono">{it.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{thb(it.unit_price_thb)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{thb(it.line_total_thb)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-surface-alt/30 text-sm">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted">ยอดก่อน VAT</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{thb(header.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-muted">
                      VAT {Number(header.vat_pct ?? 7)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{thb(header.vat_amount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right font-bold">ยอดรวมสุทธิ</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-primary-600 whitespace-nowrap">
                      {thb(header.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>

      {header.notes && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-1.5">หมายเหตุ</h2>
          <p className="whitespace-pre-line text-sm">{header.notes}</p>
        </section>
      )}

      {/* Status workflow actions — reuse existing audited actions, confirm-gated */}
      <QuoteStatusActions
        quoteId={header.id}
        status={header.status}
        hasItems={items.length > 0}
        hasProfile={!!header.profile_id}
        alreadyConverted={!!header.converted_to_shipment_id}
        isSuper={isSuper}
        canCreate={canCreate}
        canSend={canSend}
      />

      {/* Audit timeline (read-only) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-2">ไทม์ไลน์</h2>
        <dl className="space-y-1 text-[13px]">
          <Row label="สร้างเมื่อ" value={fmtDateTime(header.created_at)} />
          <Row label="อนุมัติเมื่อ" value={fmtDateTime(header.approved_at)} />
          <Row label="ส่งให้ลูกค้า" value={fmtDateTime(header.sent_at)} />
          <Row label="ลูกค้ายืนยัน" value={fmtDateTime(header.accepted_at)} />
        </dl>
      </section>
    </main>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted shrink-0">{label}</dt>
      <dd className={`text-right text-[13px] ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
