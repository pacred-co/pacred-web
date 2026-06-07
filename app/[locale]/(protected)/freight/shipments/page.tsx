import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Package, ChevronRight, Home } from "lucide-react";
import {
  FREIGHT_SHIPMENT_STATUSES,
  FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODE_LABEL,
  type FreightShipmentStatus,
  type FreightTransportMode,
} from "@/lib/validators/freight-shipment";
import {
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
  type FreightInvoicePaymentStatus,
} from "@/lib/validators/freight-payment";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

/**
 * V-E1.2 — /freight/shipments customer list.
 *
 * Read-only list of OWN freight shipments. RLS scopes to profile_id.
 * Optional ?q= filters job_no / container_code / bl_no (ilike).
 * Optional ?status= chip filter.
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

const PAYMENT_STATUS_BADGE: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "bg-gray-50 text-gray-600 border-gray-200",
  partial:  "bg-amber-50 text-amber-700 border-amber-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  overpaid: "bg-purple-50 text-purple-700 border-purple-200",
};

type ShipmentRow = {
  id:                  string;
  job_no:              string | null;
  status:              FreightShipmentStatus;
  transport_mode:      FreightTransportMode;
  bl_no:               string | null;
  container_code:      string | null;
  port_loading:        string | null;
  port_discharge:      string | null;
  created_at:          string;
};

type InvoiceForShipment = {
  freight_shipment_id: string;
  payment_status:      FreightInvoicePaymentStatus;
  status:              string;
  created_at:          string;
};

export default async function CustomerFreightShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("customerFreight");
  const sb = await createClient();

  const status = (FREIGHT_SHIPMENT_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as FreightShipmentStatus)
    : null;
  const q = sp.q?.trim() ?? "";

  // PERF (2026-06-03): paginate — one 50-row window via .range() + exact count.
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  let query = sb
    .from("freight_shipments")
    .select(
      "id, job_no, status, transport_mode, bl_no, container_code, port_loading, port_discharge, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (q) {
    // Escape % and _ in the search term so RLS+filter doesn't trip.
    const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(`job_no.ilike.%${safe}%,container_code.ilike.%${safe}%,bl_no.ilike.%${safe}%`);
  }
  const { data: rowsRaw, count: shipmentTotal } = await query.returns<ShipmentRow[]>();
  const shipments = rowsRaw ?? [];

  // Per-status counts (for filter chips). Cheap second pass on the same RLS view.
  const counts: Record<FreightShipmentStatus, number> = {
    draft: 0, confirmed: 0, in_progress: 0, cleared: 0, delivered: 0, cancelled: 0,
  };
  const { data: countRows, error: countRowsErr } = await sb
    .from("freight_shipments")
    .select("status")
    .returns<Array<{ status: FreightShipmentStatus }>>();
  if (countRowsErr) {
    console.error(`[freight_shipments list] failed`, { code: countRowsErr.code, message: countRowsErr.message });
  }
  for (const r of countRows ?? []) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  // Latest non-cancelled invoice payment_status per visible shipment.
  const ids = shipments.map((s) => s.id);
  const paymentByShipment = new Map<string, FreightInvoicePaymentStatus>();
  if (ids.length > 0) {
    const { data: invsRaw, error: invsRawErr } = await sb
      .from("freight_invoices")
      .select("freight_shipment_id, payment_status, status, created_at")
      .in("freight_shipment_id", ids)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .returns<InvoiceForShipment[]>();
    if (invsRawErr) {
      console.error(`[freight_invoices list] failed`, { code: invsRawErr.code, message: invsRawErr.message });
    }
    for (const r of invsRaw ?? []) {
      if (!paymentByShipment.has(r.freight_shipment_id)) {
        paymentByShipment.set(r.freight_shipment_id, r.payment_status);
      }
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/freight" className="hover:text-primary-600">Freight</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{t("breadcrumbShipments")}</span>
        </nav>

        {/* Header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("shipmentsTitle")}</h1>
              <p className="text-xs text-muted mt-0.5">
                {t("shipmentsSubtitle")}
              </p>
            </div>
          </div>

          {/* Search */}
          <form className="mt-4 flex gap-2" action="/freight/shipments" method="get">
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
            >
              {t("searchButton")}
            </button>
          </form>

          {/* Status filter chips */}
          <nav className="mt-3 flex flex-wrap gap-2">
            <Link
              href={q ? `/freight/shipments?q=${encodeURIComponent(q)}` : "/freight/shipments"}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
              }`}
            >
              {t("filterAll")} <span className="ml-1 text-[10px]">({totalAll})</span>
            </Link>
            {FREIGHT_SHIPMENT_STATUSES.map((s) => {
              const href = q
                ? `/freight/shipments?status=${s}&q=${encodeURIComponent(q)}`
                : `/freight/shipments?status=${s}`;
              return (
                <Link
                  key={s}
                  href={href}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
                  }`}
                >
                  {FREIGHT_SHIPMENT_STATUS_LABEL[s]}{" "}
                  <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          {shipments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              {t("emptyShipments")}
              {status && t("emptyStatusFilter", { status: FREIGHT_SHIPMENT_STATUS_LABEL[status] })}
              {q && t("emptyQueryFilter", { query: q })}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Job No</th>
                  <th className="px-3 py-2">{t("colTransport")}</th>
                  <th className="px-3 py-2">Container / B/L</th>
                  <th className="px-3 py-2">{t("colRoute")}</th>
                  <th className="px-3 py-2">{t("colJobStatus")}</th>
                  <th className="px-3 py-2">{t("colPayment")}</th>
                  <th className="px-3 py-2">{t("colCreated")}</th>
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
                      <td className="px-3 py-2 text-xs">
                        {s.port_loading && <p>{s.port_loading}</p>}
                        {s.port_discharge && <p className="text-muted">→ {s.port_discharge}</p>}
                        {!s.port_loading && !s.port_discharge && "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[s.status]}`}>
                          {FREIGHT_SHIPMENT_STATUS_LABEL[s.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {pay ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${PAYMENT_STATUS_BADGE[pay]}`}>
                            {FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[pay]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted">{t("noInvoiceYet")}</span>
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
        </div>

        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={shipmentTotal ?? 0}
          basePath="/freight/shipments"
          params={{ q: sp.q, status: sp.status }}
        />
      </main>
    </>
  );
}
