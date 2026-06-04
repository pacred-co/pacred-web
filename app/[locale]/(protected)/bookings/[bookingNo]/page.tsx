import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { MessageCircle, Phone, ChevronLeft, FileText, Download } from "lucide-react";
import { getMyBookingByNo, listBookingDocuments } from "@/actions/bookings";
import { getServiceConfig } from "@/lib/booking/service-config";
import { createClient } from "@/lib/supabase/server";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import type { BookingDocKind, QuoteLine } from "@/types/booking";

const DOC_LABEL_TH: Record<BookingDocKind, string> = {
  booking_invoice:       "ใบกำกับสินค้า",
  booking_packing_list:  "Packing List",
  booking_certificate:   "Certificate / Form E",
  booking_vat_paw20:     "ภพ.20",
  booking_national_id:   "บัตรประชาชน",
  booking_passport:      "พาสปอร์ต",
};

/**
 * BK-1.12 — per-booking detail in the customer portal.
 *
 * Shows everything the customer has on file: status badge, the service +
 * route + transport mode, the estimate breakdown (read-only), the
 * contact info they submitted, the rep-contact CTA, and the status-
 * history block (a small placeholder until a dedicated `booking_events`
 * table lands — BK-2.8 / IC-1). When the booking has reached `quoted`
 * and a `freight_quote_id` exists, surface a link to the formal quote.
 *
 * RLS `bookings_customer_read` already scopes this — `getMyBookingByNo`
 * returns `not_found` if the booking_no isn't ours, so this page never
 * leaks another customer's data.
 *
 * Design: docs/research/booking-flow-system-2026-05-18.md §3.2 + §5.3.
 */

export const dynamic = "force-dynamic";

// i18n-key: booking.detail.status.{key}
const STATUS_LABEL: Record<string, string> = {
  submitted: "ส่งคำขอแล้ว",
  contacted: "ทีมขายติดต่อแล้ว",
  quoted: "ออกใบเสนอราคาแล้ว",
  won: "ตกลงรับงาน",
  lost: "ยกเลิก",
  cancelled: "ยกเลิก",
};

const STATUS_BADGE: Record<string, string> = {
  submitted:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  contacted:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800",
  quoted:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  won:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  lost:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
  cancelled:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
};

// i18n-key: booking.detail.status.message.{key}
const STATUS_MESSAGE: Record<string, string> = {
  submitted: "ทีมขายจะติดต่อกลับเร็วๆ นี้เพื่อยืนยันราคาจริงและรายละเอียดงาน",
  contacted: "ทีมขายติดต่อแล้ว — กำลังจัดทำใบเสนอราคาจริงให้",
  quoted: "ทีมขายส่งใบเสนอราคามาแล้ว — กรุณาตรวจสอบและยืนยัน",
  won: "ขอบคุณที่ใช้บริการ — งานเริ่มดำเนินการแล้ว",
  lost: "การจองถูกยกเลิก — สามารถเริ่มจองใหม่ได้ตลอดเวลา",
  cancelled: "การจองถูกยกเลิก — สามารถเริ่มจองใหม่ได้ตลอดเวลา",
};

interface BookingOptionRow {
  option_key: string;
  option_label: string;
  detail: string | null;
  quantity: number;
  line_amount: number;
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingNo: string }>;
}) {
  const { bookingNo } = await params;

  const res = await getMyBookingByNo(bookingNo);
  if (!res.ok) {
    if (res.error === "not_found" || res.error === "invalid_booking_no") {
      notFound();
    }
    return (
      <main className="mx-auto w-full max-w-[920px] px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-sm text-red-700 dark:text-red-300">
          {/* i18n-key: booking.detail.loadError */}
          เกิดข้อผิดพลาด: {res.error}
        </div>
      </main>
    );
  }

  const b = res.data;
  const cfg = getServiceConfig(b.service_slug);
  const serviceTitle = cfg ? cfg.titleTh : b.service_slug;

  // BK-1.5 (G1) — customer's own attachments
  const docsRes = await listBookingDocuments(b.id);
  const bookingDocs = docsRes.ok ? docsRes.data.documents : [];

  // Children — the picked option line-items (RLS scopes via parent).
  const supabase = await createClient();
  const { data: options, error: optionsErr } = await supabase
    .from("booking_options")
    .select("option_key, option_label, detail, quantity, line_amount")
    .eq("booking_id", b.id)
    .order("position", { ascending: true });
  if (optionsErr) {
    console.error(`[booking_options list] failed`, { code: optionsErr.code, message: optionsErr.message });
  }

  // If Pricing has formalised a freight_quote, fetch its no for the
  // "ดูใบเสนอราคา" link. We don't try to render the quote here — just
  // surface it.
  let freightQuoteNo: string | null = null;
  if (b.freight_quote_id) {
    const { data: q, error: qErr } = await supabase
      .from("freight_quotes")
      .select("quote_no")
      .eq("id", b.freight_quote_id)
      .maybeSingle<{ quote_no: string }>();
    if (qErr) {
      console.error(`[freight_quotes list] failed`, { code: qErr.code, message: qErr.message });
    }
    freightQuoteNo = q?.quote_no ?? null;
  }

  const badge =
    STATUS_BADGE[b.status] ??
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700";
  const statusLabel = STATUS_LABEL[b.status] ?? b.status;
  const statusMessage = STATUS_MESSAGE[b.status] ?? "";

  const breakdown: QuoteLine[] = Array.isArray(b.estimate_breakdown)
    ? (b.estimate_breakdown as QuoteLine[])
    : [];

  return (
    <main className="mx-auto w-full max-w-[920px] px-4 py-8 lg:py-10 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/bookings"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {/* i18n-key: booking.detail.back */}
            กลับรายการการจอง
          </Link>
          {/* i18n-key: booking.detail.kicker */}
          <p className="mt-2 text-xs font-semibold tracking-widest text-primary-600">
            BOOKING
          </p>
          <h1 className="mt-1 text-xl font-bold font-mono text-foreground sm:text-2xl">
            {b.booking_no ?? "—"}
          </h1>
          <p className="mt-1 text-sm font-medium text-foreground">
            {serviceTitle}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Status message + quote link if applicable */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <p className="text-sm text-foreground">{statusMessage}</p>

        {b.status === "quoted" && b.freight_quote_id && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-900/20 px-3 py-2.5 text-sm">
            {/* i18n-key: booking.detail.viewQuote */}
            <p className="font-semibold text-purple-700 dark:text-purple-300">
              ทีมขายส่งใบเสนอราคามาแล้ว
            </p>
            {freightQuoteNo && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 font-mono">
                {freightQuoteNo}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              กรุณาติดต่อทีมขายเพื่อขอรายละเอียดใบเสนอราคาฉบับเต็ม
            </p>
          </div>
        )}
      </section>

      {/* Booking details */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        {/* i18n-key: booking.detail.summary.title */}
        <h2 className="text-sm font-bold text-foreground">รายละเอียดการจอง</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {b.route_slug && (
            <Row label="เส้นทาง" value={b.route_slug} mono />
          )}
          {b.transport_mode && (
            <Row label="ประเภทขนส่ง" value={b.transport_mode} />
          )}
          <Row label="การจัดการเอกสาร" value={docModeLabel(b.doc_mode)} />
          {b.contact_name && (
            <Row label="ผู้ติดต่อ" value={b.contact_name} />
          )}
          {b.contact_phone && (
            <Row label="เบอร์โทร" value={b.contact_phone} mono />
          )}
          {b.contact_line && (
            <Row label="LINE ID" value={b.contact_line} mono />
          )}
          {b.pickup_address && (
            <Row label="จุดรับสินค้า" value={b.pickup_address} />
          )}
          {b.dropoff_address && (
            <Row label="จุดส่งสินค้า" value={b.dropoff_address} />
          )}
          {b.submitted_at && (
            <Row
              label="วันที่ส่งคำขอ"
              value={new Date(b.submitted_at).toLocaleString("th-TH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          )}
        </dl>

        {b.customer_note && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs text-muted">รายละเอียดเพิ่มเติม</p>
            <p className="mt-1 text-sm text-foreground whitespace-pre-line">
              {b.customer_note}
            </p>
          </div>
        )}
      </section>

      {/* Estimate breakdown — frozen snapshot */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        {/* i18n-key: booking.detail.estimate.title */}
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ราคาประมาณการ
        </p>

        {breakdown.length > 0 ? (
          <ul className="mt-3 divide-y divide-border text-sm">
            {breakdown.map((r) => (
              <li
                key={r.key}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{r.label}</p>
                  {r.detail && (
                    <p className="text-xs text-muted mt-0.5">{r.detail}</p>
                  )}
                </div>
                <p className="shrink-0 text-sm tabular-nums">
                  ฿{Number(r.amount).toLocaleString("th-TH")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          (options ?? []).length > 0 && (
            <ul className="mt-3 divide-y divide-border text-sm">
              {((options ?? []) as unknown as BookingOptionRow[]).map((o) => (
                <li
                  key={`${o.option_key}-${o.option_label}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {o.option_label}
                    </p>
                    {o.detail && (
                      <p className="text-xs text-muted mt-0.5">{o.detail}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    ฿{Number(o.line_amount).toLocaleString("th-TH")}
                  </p>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="mt-3 border-t border-border pt-3 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-foreground">รวมประมาณการ</p>
          <p className="text-xl font-bold text-primary-600 tabular-nums">
            ฿{Number(b.estimate_total ?? 0).toLocaleString("th-TH")}
          </p>
        </div>

        {/* i18n-key: booking.detail.estimate.disclaimer */}
        <p className="mt-2 text-[11px] leading-snug text-muted">
          * ราคาเริ่มต้น — ทีมขายจะยืนยันราคาจริงหลังตรวจสินค้า
        </p>
      </section>

      {/* BK-1.5 (G1) — customer's own booking attachments (read-only here;
          customer edits via the review step before submit). */}
      {bookingDocs.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-foreground">
            เอกสารที่แนบ ({bookingDocs.length})
          </h3>
          <ul className="space-y-2">
            {bookingDocs.map((doc) => {
              const fileName = doc.storagePath.split("/").pop() ?? doc.storagePath;
              const cleanName = fileName.replace(/^[a-z_]+-\d+-/, "");
              return (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-alt/30 px-3 py-2"
                >
                  <FileText className="w-4 h-4 text-primary-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {DOC_LABEL_TH[doc.kind]}
                    </p>
                    <p className="text-[11px] text-muted truncate">{cleanName}</p>
                  </div>
                  {doc.signedUrl && (
                    <a
                      href={doc.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-md border border-primary-300 bg-white text-primary-600 hover:bg-primary-50 text-[11px] font-bold"
                    >
                      <Download className="w-3 h-3" /> ดู
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-muted">
            ลิงก์มีอายุ ~1 ชั่วโมง · refresh หน้าเพื่อสร้างลิงก์ใหม่
          </p>
        </section>
      )}

      {/* Status history placeholder (until BK-2.8 / IC-1 ships booking_events) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        {/* i18n-key: booking.detail.history.title */}
        <h3 className="text-sm font-bold text-foreground">ประวัติการจอง</h3>
        <ol className="mt-3 space-y-2 text-sm">
          <HistoryItem
            active
            label="ส่งคำขอจอง"
            at={b.submitted_at ?? b.created_at}
          />
          {b.status !== "submitted" && (
            <HistoryItem
              active={["contacted", "quoted", "won"].includes(b.status)}
              label="ทีมขายติดต่อแล้ว"
            />
          )}
          {["quoted", "won"].includes(b.status) && (
            <HistoryItem
              active={["quoted", "won"].includes(b.status)}
              label="ออกใบเสนอราคา"
            />
          )}
          {b.status === "won" && (
            <HistoryItem active label="ตกลงรับงาน" />
          )}
          {(b.status === "lost" || b.status === "cancelled") && (
            <HistoryItem active label={STATUS_LABEL[b.status] ?? b.status} />
          )}
        </ol>
      </section>

      {/* Rep contact CTA */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        {/* i18n-key: booking.detail.contact.title */}
        <h3 className="text-sm font-bold text-foreground">
          ติดต่อทีมขาย Pacred
        </h3>
        <p className="mt-1 text-xs text-muted">
          แจ้งเลขที่การจอง{" "}
          <span className="font-mono text-foreground">{b.booking_no}</span>{" "}
          เมื่อสอบถามเพื่อให้เจ้าหน้าที่ค้นหาข้อมูลได้เร็วขึ้น
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={LINE_OA.addFriendUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-2xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#05b54c]"
          >
            <MessageCircle className="h-4 w-4" />
            ทักไลน์ {LINE_OA.premiumId}
          </a>
          <a
            href={`tel:${CONTACT.phone}`}
            className="flex items-center gap-2 rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary-300 hover:text-primary-600"
          >
            <Phone className="h-4 w-4" />
            โทร {CONTACT.phoneDisplay}
          </a>
        </div>
      </section>
    </main>
  );
}

function HistoryItem({
  label,
  at,
  active,
}: {
  label: string;
  at?: string;
  active?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-1 size-2.5 rounded-full ${active ? "bg-primary-600" : "bg-border"}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={`text-sm ${active ? "font-medium text-foreground" : "text-muted"}`}
        >
          {label}
        </p>
        {at && (
          <p className="text-[11px] text-muted mt-0.5">
            {new Date(at).toLocaleString("th-TH", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>
    </li>
  );
}

function docModeLabel(mode: string): string {
  // i18n-key: booking.detail.docMode.{none|tax_invoice|customs_declaration}
  switch (mode) {
    case "tax_invoice":
      return "ออกใบกำกับภาษี";
    case "customs_declaration":
      return "ออกใบขนสินค้า";
    default:
      return "ไม่รับเอกสาร";
  }
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
