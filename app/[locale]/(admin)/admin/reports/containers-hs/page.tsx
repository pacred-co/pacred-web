import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportContainersHsAll } from "@/actions/admin/export/report-containers-hs";

// Aggregate report — sums qty/weight/value/duty per HS code across
// all containers (or a date-filtered subset). Mirror of legacy
// report-cnt.php.

// NOTE (verified live against prod 2026-06-22): container_hs_lines has NO FK
// relationship to `containers` or `hs_codes` in the schema cache, so a
// PostgREST embed (`containers!container_id(...)`) throws PGRST200 → the page
// swallows it → the report renders permanently EMPTY. We fetch the lines, then
// the container + hs_code metadata in SEPARATE queries and merge in JS (a
// robust 2-query join, no FK dependency). The hs_codes lookup key is `code`
// (NOT `hs_code`); line.hs_code joins to containers.id / hs_codes.code.
type LineRow = {
  hs_code:       string;
  qty:           number;
  weight_kg:     number;
  value_thb:     number;
  duty_pct_used: number | null;
  container_id:  string | null;
};
type ContainerMeta = { id: string; container_no: string | null; created_at: string };

type Aggregate = {
  hs_code:        string;
  description:    string;
  qty:            number;
  weight_kg:      number;
  value_thb:      number;
  duty_thb:       number;
  containers:    Set<string>;
  lines:          number;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function ContainerHsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; page?: string }>;
}) {
  const sp        = await searchParams;
  const dateFrom  = sp.date_from ?? "";
  const dateTo    = sp.date_to   ?? "";

  const admin = createAdminClient();

  // 1) Fetch all HS lines (no embed — container_hs_lines has no usable FK).
  const { data, error } = await admin
    .from("container_hs_lines")
    .select(`hs_code, qty, weight_kg, value_thb, duty_pct_used, container_id`)
    .limit(10000);
  if (error) {
    console.error(`[container_hs_lines list] failed`, { code: error.code, message: error.message });
  }
  const lines = (data ?? []) as unknown as LineRow[];

  // 2) Fetch the container metadata (for the date filter + container_no) in a
  //    SEPARATE query keyed by id, then merge in JS.
  const containerIds = Array.from(new Set(lines.map((l) => l.container_id).filter((x): x is string => !!x)));
  const containerMap = new Map<string, ContainerMeta>();
  if (containerIds.length > 0) {
    const { data: ctData, error: ctErr } = await admin
      .from("containers")
      .select("id, container_no, created_at")
      .in("id", containerIds);
    if (ctErr) console.error(`[containers meta] failed`, { code: ctErr.code, message: ctErr.message });
    for (const c of (ctData ?? []) as ContainerMeta[]) containerMap.set(c.id, c);
  }

  // 3) Fetch the HS-code descriptions (key column is `code`, joined to line.hs_code).
  const hsCodes = Array.from(new Set(lines.map((l) => l.hs_code).filter((x): x is string => !!x)));
  const hsDescMap = new Map<string, string>();
  if (hsCodes.length > 0) {
    const { data: hsData, error: hsErr } = await admin
      .from("hs_codes")
      .select("code, description")
      .in("code", hsCodes);
    if (hsErr) console.error(`[hs_codes meta] failed`, { code: hsErr.code, message: hsErr.message });
    for (const h of (hsData ?? []) as Array<{ code: string; description: string | null }>) {
      hsDescMap.set(h.code, h.description ?? "");
    }
  }

  // Merge container meta onto each line + apply the date filter on container.created_at.
  const rows = lines
    .map((l) => ({ ...l, container: l.container_id ? containerMap.get(l.container_id) ?? null : null }))
    .filter((r) => {
      if (!r.container) return false;
      if (dateFrom && r.container.created_at < dateFrom) return false;
      if (dateTo   && r.container.created_at > dateTo + "T23:59:59") return false;
      return true;
    });

  // Aggregate per HS code
  const buckets = new Map<string, Aggregate>();
  for (const r of rows) {
    const key = r.hs_code;
    let b = buckets.get(key);
    if (!b) {
      b = {
        hs_code:     key,
        description: hsDescMap.get(key) ?? "",
        qty:         0,
        weight_kg:   0,
        value_thb:   0,
        duty_thb:    0,
        containers:  new Set(),
        lines:       0,
      };
      buckets.set(key, b);
    }
    b.qty       += Number(r.qty);
    b.weight_kg += Number(r.weight_kg);
    b.value_thb += Number(r.value_thb);
    b.duty_thb  += (Number(r.value_thb) * Number(r.duty_pct_used ?? 0)) / 100;
    b.lines     += 1;
    if (r.container) b.containers.add(r.container.id);
  }

  const aggregates = Array.from(buckets.values()).sort((a, b) => b.value_thb - a.value_thb);

  // Grand totals
  const grandQty       = aggregates.reduce((s, a) => s + a.qty, 0);
  const grandWeight    = aggregates.reduce((s, a) => s + a.weight_kg, 0);
  const grandValue     = aggregates.reduce((s, a) => s + a.value_thb, 0);
  const grandDuty      = aggregates.reduce((s, a) => s + a.duty_thb, 0);
  const grandLines     = aggregates.reduce((s, a) => s + a.lines, 0);
  const grandContainers = new Set<string>();
  aggregates.forEach((a) => a.containers.forEach((c) => grandContainers.add(c)));

  // PERF (2026-06-03): paginate the DISPLAYED aggregate table — grand totals
  // above are computed over the full `aggregates` array, so they stay correct;
  // we only slice the rendered rows.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = aggregates.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // CSV export — cols mirror the <thead> 1:1; page rows = displayed aggregates.
  const csvCols: CsvCol[] = [
    { key: "hs_code",     label: "HS code" },
    { key: "description", label: "รายละเอียด" },
    { key: "containers",  label: "containers" },
    { key: "lines",       label: "แถว" },
    { key: "qty",         label: "qty" },
    { key: "weight_kg",   label: "น้ำหนัก (kg)" },
    { key: "value_thb",   label: "มูลค่า (THB)" },
    { key: "duty_thb",    label: "อากรประมาณ" },
    { key: "pct",         label: "% ต่อรวม" },
  ];
  const csvRows: CsvRow[] = pageRows.map((a) => {
    const pct = grandValue > 0 ? (a.value_thb / grandValue) * 100 : 0;
    return {
      hs_code:     a.hs_code,
      description: a.description,
      containers:  a.containers.size,
      lines:       a.lines,
      qty:         a.qty.toLocaleString("th-TH"),
      weight_kg:   a.weight_kg.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
      value_thb:   thb(a.value_thb),
      duty_thb:    thb(a.duty_thb),
      pct:         pct.toFixed(1) + "%",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · REPORT</p>
          <h1 className="mt-1 text-2xl font-bold">รายงาน HS code — สะสมจากทุก container</h1>
          <p className="mt-1 text-sm text-muted">
            กลุ่มตาม HS code · เรียงตามมูลค่ารวมจากมากสุด · กรองตามวันที่ container ถูกสร้าง
          </p>
        </div>
        <CsvButton
          rows={csvRows}
          cols={csvCols}
          filename="report-containers-hs.csv"
          fetchAll={async () => {
            "use server";
            return exportContainersHsAll({ dateFrom, dateTo });
          }}
        />
      </div>

      {/* Date filter */}
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ตั้งแต่ (date_from)</span>
          <input
            type="date"
            name="date_from"
            defaultValue={dateFrom}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ถึง (date_to)</span>
          <input
            type="date"
            name="date_to"
            defaultValue={dateTo}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
        >
          กรอง
        </button>
        {(dateFrom || dateTo) && (
          <Link
            href="/admin/reports/containers-hs"
            className="text-xs text-primary-600 hover:underline"
          >
            เคลียร์
          </Link>
        )}
      </form>

      {/* Grand totals */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="HS codes"   value={aggregates.length.toLocaleString()} />
        <Stat label="Containers" value={grandContainers.size.toLocaleString()} />
        <Stat label="แถวรวม"     value={grandLines.toLocaleString()} />
        <Stat label="มูลค่ารวม"  value={thb(grandValue)} />
        <Stat label="อากรประมาณ" value={thb(grandDuty)} tone="amber" />
      </section>

      {/* Aggregates table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {aggregates.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีข้อมูลใน range นี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">HS code</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3 text-right">containers</th>
                  <th className="px-4 py-3 text-right">แถว</th>
                  <th className="px-4 py-3 text-right">qty</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก (kg)</th>
                  <th className="px-4 py-3 text-right">มูลค่า (THB)</th>
                  <th className="px-4 py-3 text-right">อากรประมาณ</th>
                  <th className="px-4 py-3 text-right">% ต่อรวม</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => {
                  const pct = grandValue > 0 ? (a.value_thb / grandValue) * 100 : 0;
                  return (
                    <tr key={a.hs_code} className="border-t border-border align-top">
                      <td className="px-4 py-3 font-mono">{a.hs_code}</td>
                      <td className="px-4 py-3 text-xs max-w-[260px] truncate" title={a.description}>{a.description}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{a.containers.size}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{a.lines}</td>
                      <td className="px-4 py-3 text-right font-mono">{a.qty.toLocaleString("th-TH")}</td>
                      <td className="px-4 py-3 text-right font-mono">{a.weight_kg.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-mono">{thb(a.value_thb)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-700">{thb(a.duty_thb)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-surface-alt/50 border-t-2 border-border">
                <tr>
                  <td colSpan={2} className="px-4 py-3 font-bold">รวม</td>
                  <td className="px-4 py-3 text-right font-mono">{grandContainers.size}</td>
                  <td className="px-4 py-3 text-right font-mono">{grandLines}</td>
                  <td className="px-4 py-3 text-right font-mono">{grandQty.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3 text-right font-mono">{grandWeight.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{thb(grandValue)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{thb(grandDuty)}</td>
                  <td className="px-4 py-3 text-right font-mono">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={aggregates.length}
          basePath="/admin/reports/containers-hs"
          params={{ date_from: dateFrom, date_to: dateTo }}
        />
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-white dark:bg-surface border-border";
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-base font-bold font-mono">{value}</p>
    </div>
  );
}
