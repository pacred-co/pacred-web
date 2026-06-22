import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { getFreightLeads } from "@/actions/admin/freight-leads";

/**
 * /admin/freight/leads — the inbound Freight RFQ leads-inbox.
 *
 * This is the single highest-value freight delta: it unblocks freight revenue.
 * The public /freight-quote wizard writes inbound RFQ leads to the SINGULAR
 * `freight_quote` table; until this page existed those leads were orphaned
 * (only a CRM head-count proxy read them). Here staff view / filter / search /
 * triage them, and from the detail page convert a hot lead into a draft B2B
 * quotation (the plural `freight_quotes` editor).
 *
 * Mirrors /admin/freight/quotes/page.tsx (status chips + search + CSV + paged
 * table). Roles: super, ops, sales_admin.
 */

export const dynamic = "force-dynamic";

// Lead status set + Thai labels (mirror migration 0134's CHECK).
const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

const STATUS_LABEL: Record<LeadStatus, string> = {
  new:       "ใหม่",
  contacted: "ติดต่อแล้ว",
  quoted:    "เสนอราคาแล้ว",
  won:       "ปิดการขาย",
  lost:      "ไม่สำเร็จ",
  spam:      "สแปม",
};

const STATUS_BADGE: Record<LeadStatus, string> = {
  new:       "bg-amber-50 text-amber-700 border-amber-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  quoted:    "bg-purple-50 text-purple-700 border-purple-200",
  won:       "bg-green-50 text-green-700 border-green-200",
  lost:      "bg-red-50 text-red-700 border-red-200",
  spam:      "bg-gray-100 text-gray-500 border-gray-200",
};

const SERVICE_LABEL: Record<string, string> = {
  import:    "นำเข้า",
  export:    "ส่งออก",
  customs:   "ออกใบขน",
  nondoc:    "ฝากสั่ง/ไม่รับเอกสาร",
  clearance: "เคลียร์ด่าน",
};
const TRANSPORT_LABEL: Record<string, string> = {
  sea:   "เรือ",
  air:   "แอร์",
  truck: "รถ",
};

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0 });
}

/** Compact route + terms summary for the table cell. */
function routeSummary(r: {
  service: string; transport: string | null; incoterm: string | null;
  load_type: string | null; origin: string | null; destination: string | null;
}): string {
  const parts = [
    SERVICE_LABEL[r.service] ?? r.service,
    r.transport ? TRANSPORT_LABEL[r.transport] ?? r.transport : null,
    r.incoterm,
    r.load_type,
  ].filter(Boolean);
  const route = r.origin || r.destination ? `${r.origin ?? "-"} → ${r.destination ?? "-"}` : null;
  return [parts.join(" · "), route].filter(Boolean).join(" | ");
}

export default async function AdminFreightLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin"]);
  const sp = await searchParams;
  const status = (LEAD_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as LeadStatus)
    : null;
  const q = sp.q?.trim() ?? "";
  const page = parsePage(sp.page);

  const { rows, total, counts } = await getFreightLeads({ status, q, page });

  // CSV — columns mirror the table 1:1.
  const csvCols: CsvCol[] = [
    { key: "ref",        label: "เลขที่ RFQ" },
    { key: "contact",    label: "ผู้ติดต่อ" },
    { key: "phone",      label: "เบอร์" },
    { key: "route",      label: "บริการ / เส้นทาง" },
    { key: "est",        label: "ประมาณการ" },
    { key: "status",     label: "สถานะ" },
    { key: "created_at", label: "วันที่" },
  ];
  const csvRows: CsvRow[] = rows.map((r) => ({
    ref:        r.ref,
    contact:    r.contact_name,
    phone:      r.contact_phone,
    route:      routeSummary(r),
    est:        r.est_total_thb != null ? thb(r.est_total_thb) : "",
    status:     STATUS_LABEL[(r.status as LeadStatus)] ?? r.status,
    created_at: r.created_at ? r.created_at.slice(0, 10) : "",
  }));

  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold">RFQ ขอราคา Freight (Leads)</h1>
          <p className="text-xs text-muted mt-1">
            คำขอราคาที่ลูกค้าส่งผ่านหน้า /freight-quote — ติดต่อ · ติดตาม · แปลงเป็นใบเสนอราคา
          </p>
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename="freight-leads.csv" />
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/freight/leads"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[11px]">({totalAll})</span>
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/freight/leads?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {STATUS_LABEL[s]} <span className="ml-1 text-[11px] opacity-75">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/admin/freight/leads" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          placeholder="ค้นหา: เลขที่ RFQ / ชื่อผู้ติดต่อ / เบอร์โทร"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📦</div>
            <p className="text-sm font-medium text-foreground">
              ยังไม่มีคำขอราคา Freight{status && ` สถานะ "${STATUS_LABEL[status]}"`}{q && ` ตรงกับ "${q}"`}
            </p>
            <p className="text-xs text-muted max-w-md mx-auto">
              {status || q
                ? "ลองล้าง/เปลี่ยนตัวกรองด้านบนเพื่อดูคำขอทั้งหมด"
                : "เมื่อลูกค้าส่งคำขอราคาผ่านหน้า /freight-quote คำขอจะปรากฏที่นี่ให้ทีมเซลส์ติดตาม"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">เลขที่ RFQ</th>
                <th className="px-3 py-2">ผู้ติดต่อ</th>
                <th className="px-3 py-2">บริการ / เส้นทาง</th>
                <th className="px-3 py-2 text-right">ประมาณการ</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/freight/leads/${r.ref}`} className="font-mono text-xs text-primary-600 hover:underline">
                      {r.ref}
                    </Link>
                    {r.contact_pref === "call" && (
                      <span className="ml-1 text-[11px] text-red-600" title="ลูกค้าขอให้โทรกลับ">⚡โทร</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-sm">{r.contact_name}</p>
                    <p className="font-mono text-[11px] text-muted">{r.contact_phone}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">{routeSummary(r)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.est_total_thb)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_BADGE[(r.status as LeadStatus)] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                      {STATUS_LABEL[(r.status as LeadStatus)] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(r.created_at).toLocaleDateString("th-TH")}
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
        total={total}
        basePath="/admin/freight/leads"
        params={{ status: sp.status, q: sp.q }}
      />
    </main>
  );
}
