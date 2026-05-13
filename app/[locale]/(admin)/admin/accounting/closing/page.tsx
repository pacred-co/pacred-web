import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { ClosingMonthPicker } from "./closing-month-picker";

// Port of legacy `pcs-admin/closingAccReportForwarder.php` — month-end
// closing report for delivered forwarders, sliced by customer type
// (all / juristic / personal). Used by finance to reconcile each
// month's revenue + cut tax invoices for corporate customers.

type Tab = "all" | "juristic" | "personal";

type Profile = {
  member_code:  string | null;
  account_type: "personal" | "juristic";
  first_name:   string | null;
  last_name:    string | null;
  company_name: string | null;
  phone:        string | null;
} | null;

type Row = {
  id:               string;
  f_no:             string | null;
  status:           string;
  created_at:       string;
  date_delivered:   string | null;
  weight_kg:        number;
  volume_cbm:       number;
  tracking_china:   string | null;
  total_price:      number;
  profile:          Profile;
  corporate:        { tax_id: string | null; company_name: string | null } | { tax_id: string | null; company_name: string | null }[] | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function customerLabel(p: Profile): string {
  if (!p) return "—";
  if (p.account_type === "juristic" && p.company_name) return p.company_name;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to:   `${year}-${pad(month)}-${pad(last)}`,
  };
}

export default async function ClosingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string; month?: string }>;
}) {
  const sp     = await searchParams;
  const tab    = (sp.tab === "juristic" || sp.tab === "personal" ? sp.tab : "all") as Tab;
  const now    = new Date();
  const year   = Math.max(2021, Math.min(2099, Number(sp.year ?? now.getFullYear())));
  const month  = Math.max(1, Math.min(12, Number(sp.month ?? now.getMonth() + 1)));
  const range  = monthRange(year, month);

  const admin = createAdminClient();

  // Pull delivered forwarders for the month + customer + corporate (left
  // join — corporate is only relevant when account_type='juristic').
  // We over-fetch then bucket in app code so each tab share the same
  // dataset (cheap because closings are small — usually <500 rows/month).
  const q = admin
    .from("forwarders")
    .select(`
      id, f_no, status, created_at, date_delivered, weight_kg, volume_cbm,
      tracking_china, total_price,
      profile:profiles!profile_id ( member_code, account_type, first_name, last_name, company_name, phone ),
      corporate:corporate!profile_id ( tax_id, company_name )
    `)
    .eq("status", "delivered")
    .gte("created_at", range.from)
    .lte("created_at", range.to + "T23:59:59")
    .order("created_at", { ascending: false })
    .limit(2000);

  const { data } = await q;
  const allRows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    profile:   normSingle(r.profile),
    corporate: normSingle(r.corporate),
  }));

  const juristicRows = allRows.filter((r) => r.profile?.account_type === "juristic");
  const personalRows = allRows.filter((r) => r.profile?.account_type !== "juristic");

  const visibleRows = tab === "juristic" ? juristicRows
                    : tab === "personal" ? personalRows
                    : allRows;

  const sum = (rs: typeof allRows, key: "total_price" | "weight_kg" | "volume_cbm") =>
    rs.reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const counts = {
    all:      allRows.length,
    juristic: juristicRows.length,
    personal: personalRows.length,
  };
  const totals = {
    all:      sum(allRows,      "total_price"),
    juristic: sum(juristicRows, "total_price"),
    personal: sum(personalRows, "total_price"),
  };
  const totalWeight = sum(visibleRows, "weight_kg");
  const totalVolume = sum(visibleRows, "volume_cbm");

  // CSV rows — finance teams want the tax-id + company name front and
  // center so they can match to their accounting software
  const csvRows: CsvRow[] = visibleRows.map((r) => {
    const corp = r.corporate as { tax_id: string | null; company_name: string | null } | null;
    return {
      f_no:           r.f_no ?? "",
      customer:       customerLabel(r.profile),
      member_code:    r.profile?.member_code ?? "",
      account_type:   r.profile?.account_type ?? "",
      tax_id:         corp?.tax_id ?? "",
      company:        corp?.company_name ?? "",
      tracking_china: r.tracking_china ?? "",
      weight_kg:      r.weight_kg ?? 0,
      volume_cbm:     r.volume_cbm ?? 0,
      total_price:    r.total_price ?? 0,
      delivered_at:   r.date_delivered ?? r.created_at,
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            ACCOUNTING · CLOSING
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">ปิดงบฝากนำเข้ารายเดือน</h1>
          <p className="text-sm text-muted mt-1">
            สรุปใบเสร็จฝากนำเข้าที่จบ (delivered) ในเดือนที่เลือก — แยกตามลูกค้าบริษัทและลูกค้าทั่วไป
          </p>
        </div>
        <Link
          href="/admin/accounting"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← Accounting hub
        </Link>
      </div>

      <ClosingMonthPicker year={year} month={month} tab={tab} />

      {/* Tabs */}
      <nav className="flex gap-2 border-b border-border">
        {([
          { key: "all",      label: `ทั้งหมด (${counts.all})`,        total: totals.all },
          { key: "juristic", label: `บริษัท (${counts.juristic})`,    total: totals.juristic },
          { key: "personal", label: `บุคคลทั่วไป (${counts.personal})`, total: totals.personal },
        ] as const).map((t) => {
          const params = new URLSearchParams({
            year: String(year),
            month: String(month),
            tab: t.key,
          });
          return (
            <Link
              key={t.key}
              href={`/admin/accounting/closing?${params}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                t.key === tab
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Summary cards */}
      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="จำนวนใบ" value={String(visibleRows.length)} />
        <Stat label="ยอดรวมรายรับ" value={thb(totals[tab])} />
        <Stat label="น้ำหนัก / ปริมาตร" value={`${totalWeight.toFixed(2)} kg · ${totalVolume.toFixed(3)} cbm`} sub />
      </section>

      {/* CSV export */}
      <div className="flex justify-end">
        <CsvButton
          rows={csvRows}
          cols={[
            { key: "f_no",           label: "เลขใบ" },
            { key: "customer",       label: "ลูกค้า" },
            { key: "member_code",    label: "รหัสสมาชิก" },
            { key: "account_type",   label: "ประเภท" },
            { key: "tax_id",         label: "เลขผู้เสียภาษี" },
            { key: "company",        label: "ชื่อบริษัท" },
            { key: "tracking_china", label: "เลขแทรคจีน" },
            { key: "weight_kg",      label: "น้ำหนัก (kg)" },
            { key: "volume_cbm",     label: "ปริมาตร (cbm)" },
            { key: "total_price",    label: "ยอดรวม (THB)" },
            { key: "delivered_at",   label: "วันที่ส่งสำเร็จ" },
          ]}
          filename={`pacred-closing-forwarder-${year}-${String(month).padStart(2, "0")}-${tab}.csv`}
        />
      </div>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] sm:text-[11px] text-muted">
            <tr>
              <th className="px-3 py-2.5">เลขใบ</th>
              <th className="px-3 py-2.5">ลูกค้า</th>
              <th className="px-3 py-2.5">รหัส</th>
              <th className="px-3 py-2.5">เลขผู้เสียภาษี</th>
              <th className="px-3 py-2.5">แทรคจีน</th>
              <th className="px-3 py-2.5 text-right">น้ำหนัก</th>
              <th className="px-3 py-2.5 text-right">ปริมาตร</th>
              <th className="px-3 py-2.5 text-right">ยอด</th>
              <th className="px-3 py-2.5">วันที่</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted">
                  ไม่มีรายการในช่วงที่เลือก
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => {
                const corp = r.corporate as { tax_id: string | null; company_name: string | null } | null;
                const closed = r.date_delivered ?? r.created_at;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2.5 font-mono text-primary-600">
                      <Link href={`/admin/forwarders/${r.f_no}`} className="hover:underline">
                        {r.f_no ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{customerLabel(r.profile)}</div>
                      {r.profile?.account_type === "juristic" && (
                        <div className="text-[10px] text-muted">บริษัท</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.profile?.member_code ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {corp?.tax_id ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.tracking_china ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {Number(r.weight_kg ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {Number(r.volume_cbm ?? 0).toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold">
                      {thb(Number(r.total_price ?? 0))}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">
                      {new Date(closed).toLocaleDateString("th-TH")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-primary-50/40 font-bold text-sm">
                <td colSpan={5} className="px-3 py-2.5 text-right">รวม</td>
                <td className="px-3 py-2.5 text-right font-mono">{totalWeight.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{totalVolume.toFixed(3)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-primary-700">
                  {thb(totals[tab])}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono text-foreground ${sub ? "text-sm" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}
