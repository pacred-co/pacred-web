import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { PageHeader } from "@/components/admin/page-header";
import { exportWhtAll } from "@/actions/admin/export/wht";

/**
 * /admin/wht — Withholding-tax certificate chase queue.
 *
 * The single thing legacy PCS couldn't do — "ตามแทบไม่ได้เลย" (per the
 * staff verbatim ask captured in ADR-0015 §Context). Per-shipment WHT
 * panels exist on tax-invoice / freight-shipment detail pages, but
 * staff need a CENTRALIZED chase-list to know who hasn't sent in
 * their 50 ทวิ certificate yet — and how long it's been outstanding.
 *
 * Default view = status='pending', sorted by oldest first (chase
 * priority). Filter chips: pending / received / waived / all.
 *
 * RBAC — accounting + super only. Plain `ops` cannot see chase data
 * (it includes customer financial detail beyond their role).
 *
 * Per ADR-0015 §Decision (Option B — dedicated `withholding_tax_entries`
 * table) — this page renders that table with parent-order context.
 * Issuance gate is enforced at `actions/admin/tax-invoices.tsx:113`
 * and `actions/admin/freight-invoices.ts:340` (already shipped).
 */
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  received: "bg-green-50 text-green-700 border-green-200",
  waived:   "bg-gray-50 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  pending:  "รอใบ 50 ทวิ",
  received: "ได้รับใบแล้ว",
  waived:   "ไม่ขอใบ",
};

type Row = {
  id:                  string;
  cert_status:         "pending" | "received" | "waived";
  cert_number:         string | null;
  gross_invoice_thb:   number;
  wht_base_thb:        number;
  wht_rate_pct:        number;
  wht_amount_thb:      number;
  net_expected_thb:    number;
  cert_received_at:    string | null;
  waived_reason:       string | null;
  order_h_no:          string | null;
  forwarder_f_no:      string | null;
  tax_invoice_id:      string | null;
  created_at:          string;
  profile_id:          string;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
    company_name: string | null;
  } | null;
};

const thb = (n: number) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Days since `iso` — used for the "อายุ" (aged days) chase signal. */
function ageDays(iso: string): number {
  const ms = Date.now() - Date.parse(iso);
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default async function AdminWhtChasePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const { status: statusParam, page: pageParam } = await searchParams;
  const status = (["pending", "received", "waived", "all"].includes(statusParam ?? "")
    ? statusParam
    : "pending") as "pending" | "received" | "waived" | "all";

  const page = parsePage(pageParam);
  const { from, to } = pageRange(page);

  const admin = createAdminClient();
  const baseQuery = admin
    .from("withholding_tax_entries")
    .select(
      `id, cert_status, cert_number, gross_invoice_thb, wht_base_thb, wht_rate_pct,
       wht_amount_thb, net_expected_thb, cert_received_at, waived_reason,
       order_h_no, forwarder_f_no, tax_invoice_id, created_at, profile_id,
       profile:profiles!withholding_tax_entries_profile_id_fkey(member_code, first_name, last_name, company_name)`,
      { count: "exact" },
    )
    // Oldest first when chasing pending; newest first otherwise so recent
    // additions surface for staff doing same-day work.
    .order("created_at", { ascending: status === "pending" })
    .range(from, to);

  const { data: rawRows, count: total } = status === "all"
    ? await baseQuery
    : await baseQuery.eq("cert_status", status);

  // The select returns `profile` as an array via the foreign-key shorthand.
  // Flatten to the first element so the row matches Row type below.
  const rows: Row[] = ((rawRows ?? []) as unknown as Array<
    Omit<Row, "profile"> & { profile: Row["profile"][] | null }
  >).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // Aggregate counts for the filter chips (always show, even if filter
  // hides them — helps staff see total pending at a glance).
  const counts = await Promise.all([
    admin
      .from("withholding_tax_entries")
      .select("id", { count: "exact", head: true })
      .eq("cert_status", "pending"),
    admin
      .from("withholding_tax_entries")
      .select("id", { count: "exact", head: true })
      .eq("cert_status", "received"),
    admin
      .from("withholding_tax_entries")
      .select("id", { count: "exact", head: true })
      .eq("cert_status", "waived"),
  ]);
  const cntPending  = counts[0].count ?? 0;
  const cntReceived = counts[1].count ?? 0;
  const cntWaived   = counts[2].count ?? 0;
  const cntAll      = cntPending + cntReceived + cntWaived;

  // CSV columns — mirror the <thead> 1:1 (multi-line cells flattened to columns).
  const csvCols: CsvCol[] = [
    { key: "customer",     label: "ลูกค้า" },
    { key: "member_code",  label: "รหัสลูกค้า" },
    { key: "job",          label: "งาน" },
    { key: "gross",        label: "Gross" },
    { key: "wht_rate",     label: "% หัก" },
    { key: "wht_amount",   label: "WHT" },
    { key: "net_expected", label: "Net รับจริง" },
    { key: "status",       label: "สถานะ" },
    { key: "cert_number",  label: "เลขที่ใบ 50 ทวิ" },
    { key: "age",          label: "อายุ" },
  ];

  // Map on-screen rows → flat CsvRow[] (same formatting the table renders).
  const csvRows: CsvRow[] = rows.map((r) => {
    const customerLabel =
      r.profile?.company_name?.trim() ||
      [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ").trim() ||
      "—";
    const jobCode = r.order_h_no || r.forwarder_f_no || "—";
    const aged = r.cert_status === "pending" ? `${ageDays(r.created_at)}d` : "—";
    return {
      customer: customerLabel,
      member_code: r.profile?.member_code ?? "",
      job: jobCode,
      gross: thb(r.gross_invoice_thb),
      wht_rate: `${Number(r.wht_rate_pct).toFixed(2)}%`,
      wht_amount: thb(r.wht_amount_thb),
      net_expected: thb(r.net_expected_thb),
      status: STATUS_LABEL[r.cert_status] ?? r.cert_status,
      cert_number: r.cert_status === "received" ? r.cert_number ?? "" : "",
      age: aged,
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · ACCOUNTING"
        title="ใบ 50 ทวิ — ตามใบหักภาษี ณ ที่จ่าย"
        subtitle={
          <>
            คิวรายการที่ลูกค้านิติบุคคลหักภาษี ณ ที่จ่ายแล้ว — ต้องส่ง <strong>ใบ 50 ทวิ</strong>{" "}
            กลับมาให้ Pacred เพื่อใช้เป็นเครดิตภาษี. <strong>ใบเสร็จออกไม่ได้</strong>{" "}
            จนกว่าใบ 50 ทวิ จะเข้าระบบ (gate ที่ <code>issueTaxInvoice</code> +{" "}
            <code>adminCreateFreightInvoice</code>).
          </>
        }
        actions={
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`wht-${status}.csv`}
            fetchAll={async () => {
              "use server";
              return exportWhtAll({ status });
            }}
          />
        }
      />

      {/* Filter chips — show count beside each so the queue size is visible at a glance. */}
      <nav className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["pending",  `รอใบ 50 ทวิ (${cntPending.toLocaleString("th-TH")})`],
            ["received", `ได้รับใบแล้ว (${cntReceived.toLocaleString("th-TH")})`],
            ["waived",   `ไม่ขอใบ (${cntWaived.toLocaleString("th-TH")})`],
            ["all",      `ทั้งหมด (${cntAll.toLocaleString("th-TH")})`],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/wht?status=${k}`}
            className={`rounded-full border px-3 py-1.5 ${
              status === k
                ? "bg-primary-600 text-white border-primary-600"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            {status === "pending"
              ? "ไม่มีใบที่รอลูกค้าส่งใบ 50 ทวิ — เคลียร์หมดแล้ว ✓"
              : "ไม่พบรายการตรงเงื่อนไข"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">ลูกค้า</th>
                  <th className="px-4 py-2">งาน</th>
                  <th className="px-4 py-2 text-right">Gross</th>
                  <th className="px-4 py-2 text-right">% หัก</th>
                  <th className="px-4 py-2 text-right">WHT</th>
                  <th className="px-4 py-2 text-right">Net รับจริง</th>
                  <th className="px-4 py-2 text-center">สถานะ</th>
                  <th className="px-4 py-2 text-center">อายุ</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const customerLabel =
                    r.profile?.company_name?.trim() ||
                    [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ").trim() ||
                    "—";
                  const jobLabel =
                    r.order_h_no
                      ? { kind: "order" as const, code: r.order_h_no, href: `/admin/service-orders/${r.order_h_no}` }
                      : r.forwarder_f_no
                      ? { kind: "forwarder" as const, code: r.forwarder_f_no, href: `/admin/forwarders/${r.forwarder_f_no}` }
                      : null;
                  const aged = ageDays(r.created_at);
                  const linkHref = r.tax_invoice_id
                    ? `/admin/tax-invoices/${r.tax_invoice_id}`
                    : jobLabel?.href ?? `/admin/wht`;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <div className="text-xs">{customerLabel}</div>
                        {r.profile?.member_code && (
                          <div className="text-xs text-muted font-mono">{r.profile.member_code}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {jobLabel ? (
                          <Link className="font-mono text-primary-600 hover:underline" href={jobLabel.href}>
                            {jobLabel.code}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{thb(r.gross_invoice_thb)}</td>
                      <td className="px-4 py-2 text-right text-xs">{Number(r.wht_rate_pct).toFixed(2)}%</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{thb(r.wht_amount_thb)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{thb(r.net_expected_thb)}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            STATUS_BADGE[r.cert_status]
                          }`}
                        >
                          {STATUS_LABEL[r.cert_status]}
                        </span>
                        {r.cert_status === "received" && r.cert_number && (
                          <div className="mt-0.5 text-[11px] text-muted font-mono">เลขที่ {r.cert_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-xs">
                        {r.cert_status === "pending" ? (
                          <span
                            className={
                              aged >= 30
                                ? "font-bold text-red-700"
                                : aged >= 14
                                ? "font-semibold text-amber-700"
                                : "text-gray-600"
                            }
                          >
                            {aged}d
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <Link className="text-primary-600 hover:underline" href={linkHref}>
                          จัดการ →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={total ?? 0}
        basePath="/admin/wht"
        params={{ status: statusParam }}
      />

      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
        <div className="font-semibold">⚠️ Reminder — ทำไมต้องตามใบ 50 ทวิ</div>
        <div>
          ใบ 50 ทวิ จากลูกค้า = <strong>เครดิตภาษี</strong> ที่ Pacred ใช้ลดยอดภาษีเงินได้นิติบุคคลตอนยื่น ภงด.51/53.
          ถ้าไม่ได้ใบ = <strong>เสียเครดิตภาษี</strong> (= เสียเงินจริง). ADR-0015 §Context.
        </div>
        <div className="mt-1">
          <strong>Gate</strong>: ใบเสร็จออกไม่ได้ระหว่าง <code>cert_status=&apos;pending&apos;</code>{" "}
          (issueTaxInvoice + adminCreateFreightInvoice มี guard ทั้งคู่). <strong>Aged ≥30d</strong>{" "}
          (สีแดง) → escalate ติดตามตรง.
        </div>
      </aside>
    </main>
  );
}
