import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

// Aggregate report — sums qty/weight/value/duty per HS code across
// all containers (or a date-filtered subset). Mirror of legacy
// report-cnt.php.

type LineRow = {
  hs_code:       string;
  qty:           number;
  weight_kg:     number;
  value_thb:     number;
  duty_pct_used: number | null;
  container:     { id: string; container_no: string | null; created_at: string }
                 | { id: string; container_no: string | null; created_at: string }[]
                 | null;
  hs:            { description: string }
                 | { description: string }[]
                 | null;
};

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
function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function ContainerHsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  const sp        = await searchParams;
  const dateFrom  = sp.date_from ?? "";
  const dateTo    = sp.date_to   ?? "";

  const admin = createAdminClient();

  // Fetch all lines + container created_at for date filter + hs description
  const { data, error } = await admin
    .from("container_hs_lines")
    .select(`
      hs_code, qty, weight_kg, value_thb, duty_pct_used,
      container:containers!container_id ( id, container_no, created_at ),
      hs:hs_codes!hs_code ( description )
    `)
    .limit(10000);
  if (error) {
    console.error(`[container_hs_lines list] failed`, { code: error.code, message: error.message });
  }

  const rowsRaw = ((data ?? []) as LineRow[]).map((l) => ({
    ...l,
    container: normSingle(l.container),
    hs:        normSingle(l.hs),
  }));

  // Date filter on container.created_at
  const rows = rowsRaw.filter((r) => {
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
        description: r.hs?.description ?? "",
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

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · REPORT</p>
        <h1 className="mt-1 text-2xl font-bold">รายงาน HS code — สะสมจากทุก container</h1>
        <p className="mt-1 text-sm text-muted">
          กลุ่มตาม HS code · เรียงตามมูลค่ารวมจากมากสุด · กรองตามวันที่ container ถูกสร้าง
        </p>
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
                {aggregates.map((a) => {
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
