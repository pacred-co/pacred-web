import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTranslations } from "next-intl/server";
import { getServiceConfig } from "@/lib/booking/service-config";
import type { BookingStatus } from "@/lib/validators/booking";
import { listBookingDocuments } from "@/actions/bookings";
import type { BookingDocKind } from "@/types/booking";
import { BookingActionPanel } from "./booking-action-panel";
import { WorkItemThread } from "@/components/admin/work-item-thread";

const DOC_KIND_LABEL_TH: Record<BookingDocKind, string> = {
  booking_invoice:       "ใบกำกับสินค้า",
  booking_packing_list:  "Packing List",
  booking_certificate:   "Certificate / Form E",
  booking_vat_paw20:     "ภพ.20",
  booking_national_id:   "บัตรประชาชน",
  booking_passport:      "พาสปอร์ต",
};

/**
 * BK-1 — /admin/bookings/[bookingNo] detail page.
 *
 * Read-only view of a single booking — the Sales/Pricing rep opens this from
 * the list to see what the customer picked, where the lead came from, and
 * the estimate-receipt snapshot. Per design §6.5 the next step (status
 * transitions / linking to a freight_quote / spawning shipments) lands in
 * BK-2 (G2) ✅ — the action panel now drives 5 status transitions
 * (markContacted / markQuoted / markWon / markLost / cancel) via
 * actions/admin/bookings.ts.
 *
 * `bookingNo` accepts either the BKYYMMDD-NNNN booking_no OR (for drafts
 * with no booking_no yet) the uuid id. The lookup tries booking_no first.
 *
 * Roles: super, ops, sales_admin, accounting (read; mirrors RLS in 0079).
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<BookingStatus, string> = {
  draft:     "bg-gray-50 text-gray-700 border-gray-200",
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  quoted:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  won:       "bg-green-50 text-green-700 border-green-200",
  lost:      "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
};

type Profile = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
  email:       string | null;
};

type BookingDetailRaw = {
  id:                  string;
  booking_no:          string | null;
  status:              BookingStatus;
  service_slug:        string;
  route_slug:          string | null;
  transport_mode:      string | null;
  profile_id:          string | null;
  contact_name:        string | null;
  contact_phone:       string | null;
  contact_line:        string | null;
  customer_note:       string | null;
  doc_mode:            string;
  pickup_lat:          number | null;
  pickup_lng:          number | null;
  pickup_address:      string | null;
  dropoff_lat:         number | null;
  dropoff_lng:         number | null;
  dropoff_address:     string | null;
  estimate_total:      number;
  estimate_breakdown:  unknown;
  is_estimate:         boolean;
  source_channel:      string | null;
  source_url:          string | null;
  freight_quote_id:    string | null;
  submitted_at:        string | null;
  contacted_at:        string | null;
  closed_at:           string | null;
  closed_reason:       string | null;
  created_at:          string;
  updated_at:          string;
  profile: Profile | Profile[] | null;
};
type BookingDetail = Omit<BookingDetailRaw, "profile"> & { profile: Profile | null };

type BookingOptionRow = {
  id:           string;
  position:     number;
  option_key:   string;
  option_label: string;
  detail:       string | null;
  quantity:     number;
  unit_amount:  number;
  line_amount:  number;
};

type QuoteLineSnap = {
  key?:        string;
  label?:      string;
  detail?:     string;
  quantity?:   number;
  unitAmount?: number;
  amount?:     number;
};

function thb(n: number | null | undefined): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function normP(p: Profile | Profile[] | null): Profile | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; bookingNo: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const { locale, bookingNo } = await params;
  const t = await getTranslations({ locale, namespace: "booking.admin" });
  const tStatus = await getTranslations({ locale, namespace: "booking.status" });

  const admin = createAdminClient();

  const baseSelect = `
    id, booking_no, status, service_slug, route_slug, transport_mode,
    profile_id, contact_name, contact_phone, contact_line, customer_note,
    doc_mode, pickup_lat, pickup_lng, pickup_address,
    dropoff_lat, dropoff_lng, dropoff_address,
    estimate_total, estimate_breakdown, is_estimate,
    source_channel, source_url, freight_quote_id,
    submitted_at, contacted_at, closed_at, closed_reason,
    created_at, updated_at,
    profile:profiles!profile_id(member_code, first_name, last_name, phone, email)
  `;

  // Try booking_no first (BKYYMMDD-NNNN), fall back to uuid id (draft path).
  // Avoid running a uuid query against a clearly non-uuid string (e.g. "BK260518-0001").
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    bookingNo,
  );

  let rowRaw: BookingDetailRaw | null = null;
  {
    const { data, error } = await admin
      .from("bookings")
      .select(baseSelect)
      .eq("booking_no", bookingNo)
      .maybeSingle<BookingDetailRaw>();
    if (error) {
      console.error(`[bookings list] failed`, { code: error.code, message: error.message });
    }
    rowRaw = data ?? null;
  }
  if (!rowRaw && looksLikeUuid) {
    const { data, error } = await admin
      .from("bookings")
      .select(baseSelect)
      .eq("id", bookingNo)
      .maybeSingle<BookingDetailRaw>();
    if (error) {
      console.error(`[bookings list] failed`, { code: error.code, message: error.message });
    }
    rowRaw = data ?? null;
  }
  if (!rowRaw) notFound();
  const row: BookingDetail = { ...rowRaw, profile: normP(rowRaw.profile) };

  // Option line-items (mirrors the estimate_breakdown snapshot — preferred over
  // the JSONB when a per-row id is needed for future per-line actions).
  const { data: optionsRaw, error: optionsRawErr } = await admin
    .from("booking_options")
    .select("id, position, option_key, option_label, detail, quantity, unit_amount, line_amount")
    .eq("booking_id", row.id)
    .order("position", { ascending: true });
  if (optionsRawErr) {
    console.error(`[booking_options list] failed`, { code: optionsRawErr.code, message: optionsRawErr.message });
  }
  const options = (optionsRaw ?? []) as unknown as BookingOptionRow[];

  // Frozen JSONB snapshot — preferred display source so the page always shows
  // the receipt the customer saw, even if booking_options got mutated later.
  const breakdownSnap: QuoteLineSnap[] = Array.isArray(row.estimate_breakdown)
    ? (row.estimate_breakdown as QuoteLineSnap[])
    : [];

  const svc = getServiceConfig(row.service_slug);
  const svcLabel = svc
    ? (locale === "en" ? svc.titleEn : svc.titleTh)
    : row.service_slug;

  const pickupHasPin = row.pickup_lat != null && row.pickup_lng != null;
  const dropoffHasPin = row.dropoff_lat != null && row.dropoff_lng != null;

  // BK-1.5 (G1) — booking attachments (uses listBookingDocuments — admin
  // role auth covers cross-customer reads via the documents_admin_read
  // policy added in migration 0084).
  const docsRes = await listBookingDocuments(row.id);
  const bookingDocs = docsRes.ok ? docsRes.data.documents : [];

  // IC-1 — find the work_item that indexes this booking so the thread
  // panel can render below.  May be null until bookings are added to the
  // work_items entity_type CHECK constraint (a future migration) — the
  // placeholder explains the gap.
  const { data: workItem, error: workItemErr } = await admin
    .from("work_items")
    .select("id")
    .eq("entity_type", "booking")
    .eq("entity_ref", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (workItemErr) {
    console.error(`[work_items list] failed`, { code: workItemErr.code, message: workItemErr.message });
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/bookings" className="text-xs text-primary-500 hover:underline">
            {t("backToList")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {t("detailTitle")} <span className="font-mono">{row.booking_no ?? `(draft) ${row.id.slice(0, 8)}…`}</span>
          </h1>
          <p className="text-xs text-muted mt-1">
            {`สร้าง ${new Date(row.created_at).toLocaleString("th-TH")}`}
            {row.submitted_at && <> · {`ส่ง ${new Date(row.submitted_at).toLocaleString("th-TH")}`}</>}
            {row.contacted_at && <> · {`ติดต่อ ${new Date(row.contacted_at).toLocaleString("th-TH")}`}</>}
            {row.closed_at && <> · {`ปิด ${new Date(row.closed_at).toLocaleString("th-TH")}`}</>}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
          {tStatus(row.status)}
        </span>
      </div>

      {/* Service + route + customer */}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1.5">
          <h2 className="font-bold text-sm mb-2">{t("sectionService")}</h2>
          <p className="font-medium">{svcLabel}</p>
          <p className="text-xs text-muted font-mono">{row.service_slug}</p>
          {row.route_slug && (
            <p className="text-xs"><span className="text-muted">route:</span> <span className="font-mono">{row.route_slug}</span></p>
          )}
          {row.transport_mode && (
            <p className="text-xs"><span className="text-muted">transport:</span> <span className="font-mono">{row.transport_mode}</span></p>
          )}
          {row.doc_mode && row.doc_mode !== "none" && (
            <p className="text-xs"><span className="text-muted">doc:</span> <span className="font-mono">{row.doc_mode}</span></p>
          )}
          {row.freight_quote_id && (
            <p className="text-xs text-indigo-700 mt-2">
              <span className="text-muted">freight_quote:</span>{" "}
              <span className="font-mono">{row.freight_quote_id.slice(0, 12)}…</span>
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2">{t("sectionContact")}</h2>
          <p className="font-medium">
            {[row.profile?.first_name, row.profile?.last_name].filter(Boolean).join(" ")
              || row.contact_name
              || "—"}
          </p>
          {row.profile?.member_code && (
            <p className="text-xs font-mono text-muted">{row.profile.member_code}</p>
          )}
          {(row.contact_phone || row.profile?.phone) && (
            <p className="text-xs">{`☎ ${row.contact_phone || row.profile?.phone}`}</p>
          )}
          {row.contact_line && <p className="text-xs">{`LINE: ${row.contact_line}`}</p>}
          {row.profile?.email && <p className="text-xs">{`✉ ${row.profile.email}`}</p>}
          {row.customer_note && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] text-muted uppercase tracking-wide mb-1">note</p>
              <p className="text-xs whitespace-pre-line">{row.customer_note}</p>
            </div>
          )}
          {row.profile_id ? (
            <p className="text-[10px] font-mono text-muted mt-2">profile_id: {row.profile_id}</p>
          ) : (
            <p className="text-[10px] text-amber-700 mt-2 font-medium">(guest draft — no profile linked yet)</p>
          )}
        </section>
      </div>

      {/* Estimate snapshot */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold text-sm">{t("sectionEstimate")}</h2>
          <p className="font-mono text-2xl font-bold text-emerald-700">{thb(row.estimate_total)}</p>
        </div>
        {breakdownSnap.length === 0 && options.length === 0 ? (
          <p className="text-xs text-muted">—</p>
        ) : breakdownSnap.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {breakdownSnap.map((line, i) => (
              <li key={line.key ?? i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1.5 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{line.label ?? line.key ?? "—"}</p>
                  {line.detail && <p className="text-[11px] text-muted">{line.detail}</p>}
                </div>
                <p className="font-mono text-xs whitespace-nowrap text-foreground">
                  {thb(line.amount ?? 0)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {options.map((opt) => (
              <li key={opt.id} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1.5 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{opt.option_label}</p>
                  {opt.detail && <p className="text-[11px] text-muted">{opt.detail}</p>}
                </div>
                <p className="font-mono text-xs whitespace-nowrap text-foreground">
                  {thb(opt.line_amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {row.is_estimate && (
          <p className="text-[11px] text-amber-700 mt-3 italic">
            * ราคาเริ่มต้น — ทีมขายยืนยันราคาจริงหลังตรวจสินค้า
          </p>
        )}
      </section>

      {/* Options the customer picked (raw rows, useful when breakdown is jsonb) */}
      {options.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5">
          <h2 className="font-bold text-sm mb-3">{t("sectionOptions")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 pr-3">key</th>
                  <th className="py-1 pr-3">label</th>
                  <th className="py-1 pr-3 text-right">qty</th>
                  <th className="py-1 pr-3 text-right">unit</th>
                  <th className="py-1 text-right">line</th>
                </tr>
              </thead>
              <tbody>
                {options.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-1 pr-3 font-mono text-[10px]">{o.option_key}</td>
                    <td className="py-1 pr-3">
                      {o.option_label}
                      {o.detail && <span className="text-muted"> — {o.detail}</span>}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono">{o.quantity}</td>
                    <td className="py-1 pr-3 text-right font-mono">{thb(o.unit_amount)}</td>
                    <td className="py-1 text-right font-mono font-semibold">{thb(o.line_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pin pickup / drop-off */}
      {(pickupHasPin || dropoffHasPin || row.pickup_address || row.dropoff_address) && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">{t("sectionPin")}</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-muted uppercase text-[10px] tracking-wide mb-1">pickup</p>
              {row.pickup_address && <p>{row.pickup_address}</p>}
              {pickupHasPin && (
                <p className="font-mono text-[10px] text-muted">
                  {row.pickup_lat}, {row.pickup_lng}
                </p>
              )}
              {!row.pickup_address && !pickupHasPin && <p className="text-muted">—</p>}
            </div>
            <div>
              <p className="text-muted uppercase text-[10px] tracking-wide mb-1">drop-off</p>
              {row.dropoff_address && <p>{row.dropoff_address}</p>}
              {dropoffHasPin && (
                <p className="font-mono text-[10px] text-muted">
                  {row.dropoff_lat}, {row.dropoff_lng}
                </p>
              )}
              {!row.dropoff_address && !dropoffHasPin && <p className="text-muted">—</p>}
            </div>
          </div>
        </section>
      )}

      {/* Lead source */}
      {(row.source_channel || row.source_url) && (
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 text-xs space-y-1">
          <h2 className="font-bold text-sm mb-2">{t("sectionLead")}</h2>
          {row.source_channel && (
            <p><span className="text-muted">channel:</span> <span className="font-mono">{row.source_channel}</span></p>
          )}
          {row.source_url && (
            <p className="truncate">
              <span className="text-muted">url:</span>{" "}
              <span className="font-mono text-[10px]">{row.source_url}</span>
            </p>
          )}
        </section>
      )}

      {/* BK-1.5 (G1) — booking attachments (uploaded by the customer
          at the review step; admin sees them here, download via 1-hr
          signed URLs). */}
      {bookingDocs.length > 0 ? (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
          <h2 className="font-bold text-sm">เอกสารแนบ ({bookingDocs.length})</h2>
          <ul className="space-y-2">
            {bookingDocs.map((doc) => {
              const fileName = doc.storagePath.split("/").pop() ?? doc.storagePath;
              const cleanName = fileName.replace(/^[a-z_]+-\d+-/, "");
              const sizeKb = doc.sizeBytes ? Math.round(doc.sizeBytes / 1024) : null;
              return (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt/30 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {DOC_KIND_LABEL_TH[doc.kind]} <span className="text-muted font-normal">— {cleanName}</span>
                    </p>
                    <p className="text-[10px] text-muted">
                      {doc.mimeType ?? "unknown"}
                      {sizeKb !== null && ` · ${sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb / 1024).toFixed(1)} MB`}`}
                      {" · "}อัปโหลด {new Date(doc.uploadedAt).toLocaleString("th-TH")}
                    </p>
                  </div>
                  {doc.signedUrl && (
                    <a
                      href={doc.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center justify-center min-h-[36px] rounded-md border border-primary-300 bg-white px-3 text-xs font-bold text-primary-600 hover:bg-primary-50"
                    >
                      ดาวน์โหลด
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
      ) : (
        row.booking_no && (
          <section className="rounded-2xl border border-dashed border-border bg-surface-alt/20 p-4">
            <p className="text-xs text-muted">ลูกค้ายังไม่ได้แนบเอกสาร</p>
          </section>
        )
      )}

      {/* G2 · BK-2 — admin transition panel (status-aware buttons). */}
      <BookingActionPanel
        bookingId={row.id}
        bookingNo={row.booking_no}
        status={row.status}
        freightQuoteId={row.freight_quote_id}
      />

      {/* IC-1 — internal per-job chat thread (work_item_messages). */}
      {workItem ? (
        <WorkItemThread workItemId={workItem.id} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-4 text-center">
          <p className="text-sm text-muted">
            ยังไม่มี work-item สำหรับงานนี้ — สร้างก่อนเริ่มแชท
          </p>
          <Link
            href="/admin/board"
            className="mt-2 inline-block text-xs text-primary-600 hover:underline"
          >
            → ไปสร้างที่กระดานงาน
          </Link>
        </div>
      )}
    </main>
  );
}
