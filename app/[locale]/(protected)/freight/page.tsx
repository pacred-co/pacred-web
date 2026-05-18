import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { LINE_OA } from "@/components/seo/site";
import { Ship, ChevronRight, Home, FileText, Package, MessageCircle } from "lucide-react";
import {
  QUOTE_STATUS_LABEL,
  TRANSPORT_MODE_LABEL,
  type QuoteStatus,
  type TransportMode,
} from "@/lib/validators/freight-quote";
import {
  FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODE_LABEL,
  type FreightShipmentStatus,
  type FreightTransportMode,
} from "@/lib/validators/freight-shipment";
import {
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
  type FreightInvoicePaymentStatus,
} from "@/lib/validators/freight-payment";

/**
 * V-E1.2 — /freight customer hub.
 *
 * Read-only view of OWN freight quotes (sent+) + OWN freight shipments.
 * RLS scopes both lists to profile_id = auth.uid().
 *
 * V-E1.2.1 ✅ — customer self-accept on quotes lives on the per-quote page
 * (/freight/quotes/[quote_no]) via <AcceptQuoteButton>.  Admin then
 * converts the accepted quote → freight_shipment manually.
 */

export const dynamic = "force-dynamic";

const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  draft:            "bg-gray-50 text-gray-600 border-gray-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved:         "bg-blue-50 text-blue-700 border-blue-200",
  sent:             "bg-purple-50 text-purple-700 border-purple-200",
  accepted:         "bg-green-50 text-green-700 border-green-200",
  rejected:         "bg-red-50 text-red-700 border-red-200",
  expired:          "bg-gray-100 text-gray-500 border-gray-200",
};

const SHIPMENT_STATUS_BADGE: Record<FreightShipmentStatus, string> = {
  draft:       "bg-gray-50 text-gray-600 border-gray-200",
  confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  cleared:     "bg-purple-50 text-purple-700 border-purple-200",
  delivered:   "bg-green-50 text-green-700 border-green-200",
  cancelled:   "bg-red-50 text-red-700 border-red-200",
};

const PAYMENT_STATUS_BADGE: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "bg-gray-50 text-gray-600 border-gray-200",
  partial:  "bg-amber-50 text-amber-700 border-amber-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  overpaid: "bg-purple-50 text-purple-700 border-purple-200",
};

type QuoteRow = {
  quote_no:       string;
  status:         QuoteStatus;
  transport_mode: TransportMode;
  total:          number;
  valid_until:    string | null;
  created_at:     string;
};

type ShipmentRow = {
  id:             string;
  job_no:         string | null;
  status:         FreightShipmentStatus;
  transport_mode: FreightTransportMode;
  bl_no:          string | null;
  container_code: string | null;
  created_at:     string;
};

type InvoicePaymentRow = {
  freight_shipment_id: string;
  payment_status:      FreightInvoicePaymentStatus;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function CustomerFreightHubPage() {
  const sb = await createClient();

  // Recent quotes (RLS already filters to status in sent/accepted/rejected/expired
  // for the customer — drafts/pending_approval/approved are invisible).
  const { data: quotesRaw } = await sb
    .from("freight_quotes")
    .select("quote_no, status, transport_mode, total, valid_until, created_at")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<QuoteRow[]>();
  const quotes = quotesRaw ?? [];

  // Recent shipments (any status owned by customer).
  const { data: shipmentsRaw } = await sb
    .from("freight_shipments")
    .select("id, job_no, status, transport_mode, bl_no, container_code, created_at")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<ShipmentRow[]>();
  const shipments = shipmentsRaw ?? [];

  // Latest non-cancelled invoice payment_status per shipment (for the chip).
  // RLS scopes freight_invoices to profile_id = auth.uid() automatically.
  const shipmentIds = shipments.map((s) => s.id);
  const paymentByShipment = new Map<string, FreightInvoicePaymentStatus>();
  if (shipmentIds.length > 0) {
    const { data: invsRaw } = await sb
      .from("freight_invoices")
      .select("freight_shipment_id, payment_status, status, created_at")
      .in("freight_shipment_id", shipmentIds)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .returns<InvoicePaymentRow[] & { status: string; created_at: string }[]>();
    for (const r of (invsRaw ?? []) as InvoicePaymentRow[]) {
      if (!paymentByShipment.has(r.freight_shipment_id)) {
        paymentByShipment.set(r.freight_shipment_id, r.payment_status);
      }
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">Freight</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                <Ship className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">Freight (FCL/LCL · นำเข้า-ส่งออก)</h1>
                <p className="text-xs text-muted mt-0.5">
                  ใบเสนอราคา + งานขนส่ง + เอกสาร (CI / Packing List / Form E / D/O) ของคุณ
                </p>
              </div>
            </div>
            <a
              href={LINE_OA.addFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-green-500 text-white px-3 py-2 text-xs sm:text-sm font-bold hover:bg-green-600 inline-flex items-center gap-1.5 shadow-sm"
            >
              <MessageCircle className="w-4 h-4" /> ขอใบเสนอราคาใหม่
            </a>
          </div>
        </div>

        {/* Recent quotes */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-sm inline-flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-600" /> ใบเสนอราคาล่าสุด ({quotes.length})
            </h2>
          </div>
          {quotes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">
              ยังไม่มีใบเสนอราคา —{" "}
              <a href={LINE_OA.addFriendUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                ติดต่อทีมเพื่อขอใบเสนอราคา
              </a>
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">ขนส่ง</th>
                  <th className="px-3 py-2 text-right">ยอดรวม</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">หมดอายุ</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.quote_no} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/freight/quotes/${q.quote_no}`}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        {q.quote_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{TRANSPORT_MODE_LABEL[q.transport_mode]}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(q.total)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${QUOTE_STATUS_BADGE[q.status]}`}>
                        {QUOTE_STATUS_LABEL[q.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {q.valid_until ? new Date(q.valid_until).toLocaleDateString("th-TH") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Recent shipments */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-sm inline-flex items-center gap-2">
              <Package className="w-4 h-4 text-primary-600" /> งานขนส่งล่าสุด ({shipments.length})
            </h2>
            <Link
              href="/freight/shipments"
              className="text-xs text-primary-500 hover:underline"
            >
              ดูทั้งหมด →
            </Link>
          </div>
          {shipments.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">
              ยังไม่มีงานขนส่ง — ใบเสนอราคาที่ตอบรับแล้วจะกลายเป็นงานขนส่งให้อัตโนมัติ
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Job No</th>
                  <th className="px-3 py-2">ขนส่ง</th>
                  <th className="px-3 py-2">Container / B/L</th>
                  <th className="px-3 py-2">สถานะงาน</th>
                  <th className="px-3 py-2">การชำระ</th>
                  <th className="px-3 py-2">สร้าง</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const pay = paymentByShipment.get(s.id);
                  return (
                    <tr key={s.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2">
                        <Link
                          href={`/freight/shipments/${s.id}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          {s.job_no ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">{FREIGHT_TRANSPORT_MODE_LABEL[s.transport_mode]}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.container_code && <p className="font-mono">{s.container_code}</p>}
                        {s.bl_no && <p className="font-mono text-muted text-[10px]">B/L: {s.bl_no}</p>}
                        {!s.container_code && !s.bl_no && "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SHIPMENT_STATUS_BADGE[s.status]}`}>
                          {FREIGHT_SHIPMENT_STATUS_LABEL[s.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {pay ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${PAYMENT_STATUS_BADGE[pay]}`}>
                            {FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[pay]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted">ยังไม่มี invoice</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {new Date(s.created_at).toLocaleDateString("th-TH")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Contact CTA */}
        <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-5">
          <p className="text-sm font-medium text-green-900">ต้องการใบเสนอราคาใหม่ หรือสอบถามเพิ่มเติม?</p>
          <p className="text-xs text-green-800 mt-1">
            ทีม Pacred ตอบไวทาง LINE OA — ส่งรายละเอียดสินค้า/ปริมาณ/ต้นทาง-ปลายทางมาได้เลย
          </p>
          <a
            href={LINE_OA.addFriendUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-bold hover:bg-green-700"
          >
            <MessageCircle className="w-4 h-4" /> ติดต่อทีม Pacred
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
