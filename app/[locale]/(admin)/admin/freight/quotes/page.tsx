import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, TRANSPORT_MODE_LABEL, type QuoteStatus, type TransportMode } from "@/lib/validators/freight-quote";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportFreightQuotesAll } from "@/actions/admin/export/freight-quotes";

/**
 * V-E6 — /admin/freight/quotes list page.
 *
 * Status filter via ?status=draft|... + free text search ?q=quote_no|buyer_name|tax_id.
 *
 * Roles: super, ops, sales_admin, accounting.
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

type QuoteRow = {
  id:                     string;
  quote_no:               string;
  status:                 QuoteStatus;
  buyer_name_snapshot:    string;
  buyer_tax_id_snapshot:  string | null;
  transport_mode:         TransportMode;
  total:                  number;
  valid_until:            string | null;
  created_at:             string;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminFreightQuotesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const sp = await searchParams;
  const status = (QUOTE_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as QuoteStatus)
    : null;
  const q = sp.q?.trim() ?? "";

  const admin = createAdminClient();

  // Pagination — server-side window via ?page=N (PERF 2026-06-03).
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);

  let query = admin
    .from("freight_quotes")
    .select(
      "id, quote_no, status, buyer_name_snapshot, buyer_tax_id_snapshot, transport_mode, total, valid_until, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(rowFrom, rowTo);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `quote_no.ilike.%${q}%,buyer_name_snapshot.ilike.%${q}%,buyer_tax_id_snapshot.ilike.%${q}%`,
    );
  }
  const { data: rows, error: rowsErr, count: totalQuotes } = await query;
  if (rowsErr) {
    console.error(`[freight_quotes list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }
  const quotes = (rows ?? []) as unknown as QuoteRow[];

  // Counts per status for badges.
  const counts: Record<QuoteStatus, number> = {} as Record<QuoteStatus, number>;
  for (const s of QUOTE_STATUSES) counts[s] = 0;
  const { data: countRows, error: countRowsErr } = await admin
    .from("freight_quotes")
    .select("status");
  if (countRowsErr) {
    console.error(`[freight_quotes list] failed`, { code: countRowsErr.code, message: countRowsErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: QuoteStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  // CSV export — columns mirror the table <thead> 1:1 (ลูกค้า split into
  // name + tax-id columns; money pre-formatted; dates sliced to YYYY-MM-DD).
  const csvCols: CsvCol[] = [
    { key: "quote_no",       label: "เลขที่" },
    { key: "customer",       label: "ลูกค้า" },
    { key: "tax_id",         label: "เลขผู้เสียภาษี" },
    { key: "transport_mode", label: "ขนส่ง" },
    { key: "total",          label: "ยอดรวม" },
    { key: "status",         label: "สถานะ" },
    { key: "created_at",     label: "สร้าง" },
    { key: "valid_until",    label: "หมดอายุ" },
  ];
  const csvRows: CsvRow[] = quotes.map((qrow) => ({
    quote_no:       qrow.quote_no,
    customer:       qrow.buyer_name_snapshot ?? "",
    tax_id:         qrow.buyer_tax_id_snapshot ?? "",
    transport_mode: TRANSPORT_MODE_LABEL[qrow.transport_mode] ?? qrow.transport_mode,
    total:          thb(Number(qrow.total)),
    status:         QUOTE_STATUS_LABEL[qrow.status] ?? qrow.status,
    created_at:     qrow.created_at ? qrow.created_at.slice(0, 10) : "",
    valid_until:    qrow.valid_until ? qrow.valid_until.slice(0, 10) : "",
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold">ใบเสนอราคา (Freight quotes)</h1>
          <p className="text-xs text-muted mt-1">
            workflow: draft → รออนุมัติ → อนุมัติ → ส่ง → ลูกค้ายืนยัน · approve/reject = super only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="freight-quotes.csv"
            fetchAll={async () => {
              "use server";
              return exportFreightQuotesAll({ status, q });
            }}
          />
          <Link
            href="/admin/freight/quotes/new"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
          >
            ➕ สร้างใบใหม่
          </Link>
        </div>
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/freight/quotes"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({Object.values(counts).reduce((s, n) => s + n, 0)})</span>
        </Link>
        {QUOTE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/freight/quotes?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {QUOTE_STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/admin/freight/quotes" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          placeholder="ค้นหา: เลขที่ใบ / ชื่อบริษัท / เลขผู้เสียภาษี"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {quotes.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📝</div>
            <p className="text-sm font-medium text-foreground">
              ไม่มีใบเสนอราคา{status && ` สถานะ "${QUOTE_STATUS_LABEL[status]}"`}{q && ` ตรงกับ "${q}"`}
            </p>
            <p className="text-xs text-muted max-w-md mx-auto">
              {status || q
                ? "ลองล้าง/เปลี่ยนตัวกรองด้านบนเพื่อดูใบเสนอราคาทั้งหมด"
                : "ลูกค้าขอใบเสนอราคาผ่านหน้า /freight ของลูกค้า หรือกดสร้างใหม่จากปุ่มด้านบน"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">ลูกค้า</th>
                <th className="px-3 py-2">ขนส่ง</th>
                <th className="px-3 py-2 text-right">ยอดรวม</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">สร้าง</th>
                <th className="px-3 py-2">หมดอายุ</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/freight/quotes/${q.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                      {q.quote_no}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-sm">{q.buyer_name_snapshot}</p>
                    {q.buyer_tax_id_snapshot && (
                      <p className="font-mono text-[10px] text-muted">{q.buyer_tax_id_snapshot}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{TRANSPORT_MODE_LABEL[q.transport_mode]}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{thb(q.total)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[q.status]}`}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(q.created_at).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {q.valid_until ? new Date(q.valid_until).toLocaleDateString("th-TH") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalQuotes ?? 0}
        basePath="/admin/freight/quotes"
        params={{ status: sp.status, q: sp.q }}
      />
    </main>
  );
}
