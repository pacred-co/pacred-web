import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

/**
 * V-G6 #3 — HS-code revenue analysis.
 *
 * Aggregates declared value per HS code from container_hs_lines (the per-
 * container customs breakdown ภูม built in 0030). Shows which HS codes
 * carry the most declared value + which containers carry each top code.
 *
 * Date range filter via ?days=7|30|90|365 (default 90, since customs
 * declaration is less frequent than sales).
 *
 * PHP ref: salary-hs.php (Pacred adapts to revenue-per-HS instead of
 * staff-salary-per-HS — the Pacred-side question is "which HS codes are
 * worth specialised handling?").
 *
 * Read-only — no schema changes.
 */

export const dynamic = "force-dynamic";

type HsLine = {
  hs_code:    string;
  qty:        number;
  weight_kg:  number;
  value_thb:  number;
  duty_pct_used: number | null;
  container_id: string;
  container: { code: string | null; status: string | null } | { code: string | null; status: string | null }[] | null;
  hs:        { description: string | null; description_en: string | null } | { description: string | null; description_en: string | null }[] | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function HsCodeRevenueReport({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days ?? 90) || 90));
  const from = daysAgoIso(days);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("container_hs_lines")
    .select(`
      hs_code, qty, weight_kg, value_thb, duty_pct_used, container_id,
      container:containers!container_id ( code, status ),
      hs:hs_codes!hs_code ( description, description_en )
    `)
    .gte("created_at", from)
    .limit(20000);
  if (error) {
    console.error(`[container_hs_lines list] failed`, { code: error.code, message: error.message });
  }
  const lines = (data ?? []) as unknown as HsLine[];

  // Aggregate per HS code.
  type HsAgg = {
    hs_code:      string;
    description:  string;
    line_count:   number;
    total_qty:    number;
    total_kg:     number;
    total_value:  number;
    duty_pct_max: number | null;
    container_codes: Set<string>;
  };
  const aggMap = new Map<string, HsAgg>();
  for (const l of lines) {
    const hsMeta = Array.isArray(l.hs) ? l.hs[0] ?? null : l.hs;
    const ctMeta = Array.isArray(l.container) ? l.container[0] ?? null : l.container;
    const a = aggMap.get(l.hs_code) ?? {
      hs_code:         l.hs_code,
      description:     hsMeta?.description ?? "—",
      line_count:      0,
      total_qty:       0,
      total_kg:        0,
      total_value:     0,
      duty_pct_max:    null,
      container_codes: new Set<string>(),
    };
    a.line_count   += 1;
    a.total_qty    += Number(l.qty       ?? 0);
    a.total_kg     += Number(l.weight_kg ?? 0);
    a.total_value  += Number(l.value_thb ?? 0);
    if (l.duty_pct_used != null) {
      a.duty_pct_max = Math.max(a.duty_pct_max ?? 0, Number(l.duty_pct_used));
    }
    if (ctMeta?.code) a.container_codes.add(ctMeta.code);
    aggMap.set(l.hs_code, a);
  }
  const aggregates = Array.from(aggMap.values()).sort((a, b) => b.total_value - a.total_value);

  const totalValue = aggregates.reduce((s, a) => s + a.total_value, 0);
  const totalKg    = aggregates.reduce((s, a) => s + a.total_kg, 0);
  const totalQty   = aggregates.reduce((s, a) => s + a.total_qty, 0);

  const csvCols = [
    { key: "hs",          label: "HS code" },
    { key: "desc",        label: "คำอธิบาย" },
    { key: "lines",       label: "จำนวน lines" },
    { key: "containers",  label: "จำนวนตู้" },
    { key: "qty",         label: "qty รวม" },
    { key: "kg",          label: "kg รวม" },
    { key: "value",       label: "มูลค่ารวม (บาท)" },
    { key: "duty_max",    label: "duty% สูงสุดที่ใช้" },
  ];
  const csvRows = aggregates.map((a) => ({
    hs:         a.hs_code,
    desc:       a.description,
    lines:      a.line_count,
    containers: a.container_codes.size,
    qty:        a.total_qty.toFixed(3),
    kg:         a.total_kg.toFixed(3),
    value:      a.total_value.toFixed(2),
    duty_max:   a.duty_pct_max != null ? a.duty_pct_max.toFixed(3) : "—",
  }));

  const dayOptions = [30, 90, 180, 365];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · REPORTS (V-G6)</p>
          <h1 className="mt-1 text-2xl font-bold">รายได้ตาม HS code</h1>
          <p className="mt-1 text-sm text-muted">
            มูลค่าที่ประกาศต่อ HS code ({days} วันล่าสุด) — ช่วยตัดสินใจว่าควร specialise ในกลุ่มไหน
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">ช่วงเวลา:</span>
          {dayOptions.map((d) => (
            <Link
              key={d}
              href={`/admin/reports/hs-code-revenue?days=${d}`}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                d === days ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={`hs-code-revenue-${days}d.csv`} />
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="HS codes ที่ใช้" value={String(aggregates.length)} />
        <Card label="qty รวม" value={totalQty.toFixed(3)} />
        <Card label="kg รวม" value={totalKg.toFixed(3)} />
        <Card label="มูลค่ารวม" value={thb(totalValue)} highlight />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {aggregates.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มี HS lines ในช่วงเวลานี้ —
            ลองช่วงนานขึ้น หรือเริ่มกรอก HS lines ผ่าน{" "}
            <Link href="/admin/containers" className="text-primary-600 hover:underline">
              admin/containers
            </Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">HS code</th>
                <th className="px-3 py-2">คำอธิบาย</th>
                <th className="px-3 py-2 text-right">Lines</th>
                <th className="px-3 py-2 text-right">ตู้</th>
                <th className="px-3 py-2 text-right">qty</th>
                <th className="px-3 py-2 text-right">kg</th>
                <th className="px-3 py-2 text-right">มูลค่า</th>
                <th className="px-3 py-2 text-right">duty% max</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.slice(0, 200).map((a) => (
                <tr key={a.hs_code} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/reports/containers-hs?hs=${encodeURIComponent(a.hs_code)}`}
                      className="font-mono text-xs text-primary-600 hover:underline"
                    >
                      {a.hs_code}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{a.description}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{a.line_count}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{a.container_codes.size}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{a.total_qty.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{a.total_kg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(a.total_value)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{a.duty_pct_max != null ? `${a.duty_pct_max}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {aggregates.length > 200 && (
          <p className="p-3 text-center text-[10px] text-muted">แสดง 200 HS codes แรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
        )}
      </div>

      <p className="text-[10px] text-muted">
        Source: <code>container_hs_lines</code> join <code>hs_codes</code> + <code>containers</code> · sort by total declared value
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-primary-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-primary-700" : ""}`}>{value}</p>
    </div>
  );
}
