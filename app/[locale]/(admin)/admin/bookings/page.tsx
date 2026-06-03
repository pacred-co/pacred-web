import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTranslations } from "next-intl/server";
import { getServiceConfig } from "@/lib/booking/service-config";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/validators/booking";

/**
 * BK-1 — /admin/bookings list page.
 *
 * The Sales + Pricing desk view of customer-submitted bookings (per design
 * docs/research/booking-flow-system-2026-05-18.md §6.5). Status filter via
 * URL ?status=submitted (default → 'submitted' so the unhandled queue is
 * the first thing the desk sees; 'all' lifts the filter).
 *
 * Read-only in BK-1 — status transitions (contacted / quoted / won / lost)
 * will land in BK-2 (booking-actions desk). The list links each row to the
 * detail page where audit + customer context is rendered.
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

type BookingRow = {
  id:               string;
  booking_no:       string | null;
  status:           BookingStatus;
  service_slug:     string;
  route_slug:       string | null;
  transport_mode:   string | null;
  estimate_total:   number;
  contact_name:     string | null;
  contact_phone:    string | null;
  source_channel:   string | null;
  submitted_at:     string | null;
  created_at:       string;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const STATUS_FILTERS: Array<{ value: BookingStatus | "all"; tKey:
  | "filterAll" | "filterDraft" | "filterSubmitted" | "filterContacted"
  | "filterQuoted" | "filterWon" | "filterLost" | "filterCancelled" }> = [
  { value: "all",       tKey: "filterAll" },
  { value: "submitted", tKey: "filterSubmitted" },
  { value: "contacted", tKey: "filterContacted" },
  { value: "quoted",    tKey: "filterQuoted" },
  { value: "won",       tKey: "filterWon" },
  { value: "lost",      tKey: "filterLost" },
  { value: "cancelled", tKey: "filterCancelled" },
  { value: "draft",     tKey: "filterDraft" },
];

export default async function AdminBookingsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "booking.admin" });
  const tStatus = await getTranslations({ locale, namespace: "booking.status" });

  // Default filter = 'submitted' (the open queue). 'all' lifts the filter.
  const rawStatus = sp.status ?? "submitted";
  const isAll = rawStatus === "all";
  const status: BookingStatus | null = isAll
    ? null
    : (BOOKING_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as BookingStatus)
      : "submitted";

  const admin = createAdminClient();

  let query = admin
    .from("bookings")
    .select(`
      id, booking_no, status, service_slug, route_slug, transport_mode,
      estimate_total, contact_name, contact_phone, source_channel,
      submitted_at, created_at
    `)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data: rowsRaw, error: rowsRawErr } = await query;
  if (rowsRawErr) {
    console.error(`[bookings list] failed`, { code: rowsRawErr.code, message: rowsRawErr.message });
  }
  const rows = (rowsRaw ?? []) as unknown as BookingRow[];

  // Counts for filter chips (across all rows so chips show queue depth).
  const counts: Record<BookingStatus, number> = {
    draft: 0, submitted: 0, contacted: 0, quoted: 0, won: 0, lost: 0, cancelled: 0,
  };
  const { data: countRows, error: countRowsErr } = await admin.from("bookings").select("status");
  if (countRowsErr) {
    console.error(`[bookings list] failed`, { code: countRowsErr.code, message: countRowsErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: BookingStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-7xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ขายและ Pricing</p>
          <h1 className="mt-1 text-2xl font-bold">{t("listTitle")} (BK-1)</h1>
          <p className="text-xs text-muted mt-1">{t("subtitle")}</p>
        </div>
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const isActive = f.value === "all" ? isAll : f.value === status;
          const count = f.value === "all" ? totalAll : counts[f.value];
          const badgeClass = f.value !== "all" && isActive
            ? STATUS_BADGE[f.value]
            : isActive
              ? "bg-primary-600 text-white"
              : "bg-white text-foreground border-border hover:bg-surface-alt";
          return (
            <Link
              key={f.value}
              href={`/admin/bookings?status=${f.value}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${badgeClass}`}
            >
              {t(f.tKey)} <span className="ml-1 text-[10px] opacity-75">({count})</span>
            </Link>
          );
        })}
      </nav>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📋</div>
            <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
            <p className="text-xs text-muted max-w-md mx-auto">{t("emptyHint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">{t("colBookingNo")}</th>
                  <th className="px-3 py-2">{t("colStatus")}</th>
                  <th className="px-3 py-2">{t("colService")}</th>
                  <th className="px-3 py-2 text-right">{t("colEstimate")}</th>
                  <th className="px-3 py-2">{t("colContact")}</th>
                  <th className="px-3 py-2">{t("colSubmitted")}</th>
                  <th className="px-3 py-2">{t("colCreated")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const svc = getServiceConfig(r.service_slug);
                  const svcLabel = svc
                    ? (locale === "en" ? svc.titleEn : svc.titleTh)
                    : r.service_slug;
                  // Drafts have no booking_no — fall back to id slice for the link key.
                  const linkRef = r.booking_no ?? r.id;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/bookings/${linkRef}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          {r.booking_no ?? `(draft) ${r.id.slice(0, 8)}…`}
                        </Link>
                        {r.source_channel && (
                          <p className="text-[9px] text-muted">{r.source_channel}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}>
                          {tStatus(r.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <p className="font-medium">{svcLabel}</p>
                        {r.route_slug && (
                          <p className="text-[10px] text-muted">/{r.route_slug}</p>
                        )}
                        {r.transport_mode && (
                          <p className="text-[10px] text-muted">{r.transport_mode}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-700">
                        {thb(Number(r.estimate_total))}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <p>{r.contact_name || "—"}</p>
                        {r.contact_phone && (
                          <p className="text-[10px] text-muted">☎ {r.contact_phone}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {r.submitted_at
                          ? new Date(r.submitted_at).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {new Date(r.created_at).toLocaleDateString("th-TH")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
