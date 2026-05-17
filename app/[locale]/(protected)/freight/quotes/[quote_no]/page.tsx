import { notFound } from "next/navigation";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { LINE_OA, CONTACT } from "@/components/seo/site";
import { Home, ChevronRight, FileText, MessageCircle } from "lucide-react";
import {
  QUOTE_STATUS_LABEL,
  TRANSPORT_MODE_LABEL,
  type QuoteStatus,
  type TransportMode,
  type Incoterm,
} from "@/lib/validators/freight-quote";

/**
 * V-E1.2 — /freight/quotes/[quote_no] customer detail view.
 *
 * Read-only. RLS only shows the row to the customer when status is in
 * (sent, accepted, rejected, expired) — drafts/pending are invisible.
 * Items inherit visibility via the items policy.
 *
 * Self-accept deferred to V-E1.2.1 — customer contacts team to confirm.
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

type QuoteHeader = {
  id:                     string;
  quote_no:               string;
  status:                 QuoteStatus;
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
  rejected_reason:        string | null;
  sent_at:                string | null;
  accepted_at:            string | null;
  created_at:             string;
};

type QuoteItem = {
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

export default async function CustomerFreightQuoteDetailPage({
  params,
}: {
  params: Promise<{ quote_no: string }>;
}) {
  const { quote_no } = await params;
  const sb = await createClient();

  const { data: header } = await sb
    .from("freight_quotes")
    .select(`
      id, quote_no, status, buyer_name_snapshot, buyer_tax_id_snapshot,
      buyer_contact_snapshot, transport_mode, port_loading, port_discharge,
      place_delivery, incoterm, currency, subtotal, vat_pct, vat_amount, total,
      valid_until, notes, rejected_reason, sent_at, accepted_at, created_at
    `)
    .eq("quote_no", quote_no)
    .maybeSingle<QuoteHeader>();
  if (!header) notFound();

  const { data: itemsRaw } = await sb
    .from("freight_quote_items")
    .select("id, position, description, quantity, unit, unit_price_thb, line_total_thb, note")
    .eq("freight_quote_id", header.id)
    .order("position", { ascending: true })
    .returns<QuoteItem[]>();
  const items = itemsRaw ?? [];

  const isExpired = header.status === "expired";
  const isRejected = header.status === "rejected";
  const isAccepted = header.status === "accepted";
  const isSent = header.status === "sent";

  return (
    <>
      <main className="mx-auto w-full max-w-[1000px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/freight" className="hover:text-primary-600">Freight</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium font-mono">{header.quote_no}</span>
        </nav>

        {/* Header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-600">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  ใบเสนอราคา <span className="font-mono">{header.quote_no}</span>
                </h1>
                <p className="text-xs text-muted mt-1">
                  สร้าง {new Date(header.created_at).toLocaleDateString("th-TH")}
                  {header.sent_at && <> · ส่ง {new Date(header.sent_at).toLocaleDateString("th-TH")}</>}
                  {header.accepted_at && <> · ตอบรับ {new Date(header.accepted_at).toLocaleDateString("th-TH")}</>}
                </p>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
              {QUOTE_STATUS_LABEL[header.status]}
            </span>
          </div>
          {header.valid_until && (
            <p className="mt-3 text-xs">
              <span className="text-muted">ใช้ได้ถึง:</span>{" "}
              <span className={`font-medium ${isExpired ? "text-red-600" : "text-foreground"}`}>
                {new Date(header.valid_until).toLocaleDateString("th-TH")}
                {isExpired && " (หมดอายุแล้ว)"}
              </span>
            </p>
          )}
        </div>

        {/* Rejected reason banner */}
        {isRejected && header.rejected_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>ปฏิเสธ:</strong> {header.rejected_reason}
          </div>
        )}

        {/* Buyer + Logistics blocks */}
        <div className="grid md:grid-cols-2 gap-5">
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
            <h2 className="font-bold text-sm mb-2">ผู้ซื้อ</h2>
            <p className="font-medium">{header.buyer_name_snapshot}</p>
            {header.buyer_tax_id_snapshot && (
              <p className="text-xs">
                เลขผู้เสียภาษี: <span className="font-mono">{header.buyer_tax_id_snapshot}</span>
              </p>
            )}
            {header.buyer_contact_snapshot && (
              <p className="text-xs whitespace-pre-line text-muted">{header.buyer_contact_snapshot}</p>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
            <h2 className="font-bold text-sm mb-2">โลจิสติกส์</h2>
            <p>ขนส่ง: {TRANSPORT_MODE_LABEL[header.transport_mode]}</p>
            {header.port_loading   && <p>ต้นทาง: {header.port_loading}</p>}
            {header.port_discharge && <p>ปลายทาง: {header.port_discharge}</p>}
            {header.place_delivery && <p>ส่งมอบ: {header.place_delivery}</p>}
            {header.incoterm       && <p>Incoterm: <span className="font-mono">{header.incoterm}</span></p>}
            <p>สกุลเงิน: {header.currency}</p>
          </section>
        </div>

        {/* Line items */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">รายการ ({items.length})</h2>
          </div>
          {items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">ไม่มีรายการ</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">รายละเอียด</th>
                  <th className="px-3 py-2 text-right w-20">จำนวน</th>
                  <th className="px-3 py-2 w-16">หน่วย</th>
                  <th className="px-3 py-2 text-right w-28">ราคา/หน่วย</th>
                  <th className="px-3 py-2 text-right w-28">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{it.position}</td>
                    <td className="px-3 py-2">
                      <p>{it.description}</p>
                      {it.note && <p className="text-[10px] text-muted mt-0.5">📝 {it.note}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{Number(it.quantity)}</td>
                    <td className="px-3 py-2 text-xs">{it.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(Number(it.unit_price_thb))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(Number(it.line_total_thb))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Totals */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-muted">มูลค่าก่อน VAT</td>
                <td className="py-1 text-right font-mono">{thb(Number(header.subtotal))}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted">VAT {Number(header.vat_pct)}%</td>
                <td className="py-1 text-right font-mono">{thb(Number(header.vat_amount))}</td>
              </tr>
              <tr className="border-t-2 border-black text-base font-bold">
                <td className="py-2">รวมทั้งสิ้น</td>
                <td className="py-2 text-right font-mono text-primary-700">{thb(Number(header.total))}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Notes */}
        {header.notes && (
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
            <h2 className="font-bold text-sm mb-1">หมายเหตุ</h2>
            <p className="text-xs whitespace-pre-line text-muted">{header.notes}</p>
          </section>
        )}

        {/* CTA — accept via team (self-accept deferred) */}
        {isSent && !isExpired && (
          <div className="rounded-2xl border-2 border-green-300 bg-green-50 dark:bg-green-900/10 p-5">
            <p className="text-sm font-bold text-green-900">ต้องการตอบรับใบเสนอราคานี้?</p>
            <p className="text-xs text-green-800 mt-1">
              ติดต่อทีม Pacred เพื่อยืนยัน — เราจะแปลงเป็นงานขนส่ง (job) ให้ทันที
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={LINE_OA.addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-bold hover:bg-green-700"
              >
                <MessageCircle className="w-4 h-4" /> ติดต่อทีมเพื่อตอบรับ
              </a>
              <a
                href={`tel:${CONTACT.phoneCompanyDisplay}`}
                className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                📞 {CONTACT.phoneCompanyDisplay}
              </a>
            </div>
          </div>
        )}
        {isAccepted && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            ✅ ตอบรับใบเสนอราคาแล้ว — ระบบจะสร้างงานขนส่ง (job) ให้ตามขั้นตอน
          </div>
        )}
        {isExpired && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            ⚠️ ใบเสนอราคาหมดอายุแล้ว —{" "}
            <a href={LINE_OA.addFriendUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
              ติดต่อทีมเพื่อขอใบใหม่
            </a>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
