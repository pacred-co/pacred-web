import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ACCOUNTING_PERIOD_STATUS_LABEL,
  type AccountingPeriodStatus,
  lastNYyyymm, currentYyyymm,
} from "@/lib/validators/accounting-period";
import { OpenPeriodButton } from "./open-period-button";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportAccPeriodsAll } from "@/actions/admin/export/acc-periods";

/**
 * V-E9 — /admin/accounting/periods list.
 *
 * Shows the last 24 months as rows. For each yyyymm:
 *   - If an accounting_periods row exists → status pill + close date +
 *     closed-by + revenue snapshot.
 *   - If no row exists → "ยังไม่เปิดงวด" + "เปิดงวด" button (creates the
 *     row in 'open' state).
 *
 * Roles: super + accounting + ops (ops read-only).
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<AccountingPeriodStatus, string> = {
  open:    "bg-blue-50 text-blue-700 border-blue-200",
  closing: "bg-amber-50 text-amber-700 border-amber-200",
  closed:  "bg-red-50 text-red-700 border-red-200",
};

type PeriodRow = {
  period_yyyymm:      string;
  status:             AccountingPeriodStatus;
  opened_at:          string;
  closing_marked_at:  string | null;
  closed_at:          string | null;
  closing_notes:      string | null;
  closed_by_profile:  { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
};

type EventRow = {
  period_yyyymm: string;
  table_name:    string;
  row_count:     number;
  sum_thb:       number | null;
};

function formatYyyymm(yyyymm: string): string {
  const year  = yyyymm.slice(0, 4);
  const month = yyyymm.slice(4, 6);
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const m = Number.parseInt(month, 10);
  const monthName = monthNames[m - 1] ?? month;
  // Thai calendar year (Buddhist Era) for display.
  const beYear = Number.parseInt(year, 10) + 543;
  return `${monthName} ${beYear}`;
}

function profileName(p: PeriodRow["closed_by_profile"]): string {
  if (!p) return "—";
  const single = Array.isArray(p) ? p[0] : p;
  if (!single) return "—";
  return `${single.first_name ?? ""} ${single.last_name ?? ""}`.trim() || "—";
}

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminAccountingPeriodsPage() {
  const { roles } = await requireAdmin(["super", "accounting", "ops"]);
  const canWrite  = roles.includes("super") || roles.includes("accounting");

  const admin = createAdminClient();

  // Pull last 24 months of accounting_periods rows + the latest snapshot
  // per (period, table_name). The 24-month window is the V1 default per
  // the handoff brief.
  const window = lastNYyyymm(24);
  const oldest = window[window.length - 1];
  const newest = window[0];

  const { data: periodsRaw, error: periodsRawErr } = await admin
    .from("accounting_periods")
    .select(`
      period_yyyymm, status, opened_at, closing_marked_at, closed_at, closing_notes,
      closed_by_profile:profiles!closed_by_admin_id ( first_name, last_name )
    `)
    .gte("period_yyyymm", oldest)
    .lte("period_yyyymm", newest)
    .order("period_yyyymm", { ascending: false });
  if (periodsRawErr) {
    console.error(`[accounting_periods list] failed`, { code: periodsRawErr.code, message: periodsRawErr.message });
  }
  const periods = (periodsRaw ?? []) as unknown as PeriodRow[];
  const periodMap = new Map<string, PeriodRow>(periods.map((p) => [p.period_yyyymm, p]));

  // Latest close-event row per (period, table) — pulled flat, then
  // bucketed in app code to a Map<period, Map<table, EventRow>>.
  const { data: eventsRaw, error: eventsRawErr } = await admin
    .from("period_close_event")
    .select("period_yyyymm, table_name, row_count, sum_thb, closed_at")
    .gte("period_yyyymm", oldest)
    .lte("period_yyyymm", newest)
    .order("closed_at", { ascending: false });
  if (eventsRawErr) {
    console.error(`[period_close_event list] failed`, { code: eventsRawErr.code, message: eventsRawErr.message });
  }
  type EventRowWithTs = EventRow & { closed_at: string };
  const events = (eventsRaw ?? []) as EventRowWithTs[];
  const eventMap = new Map<string, Map<string, EventRow>>();
  for (const e of events) {
    if (!eventMap.has(e.period_yyyymm)) eventMap.set(e.period_yyyymm, new Map());
    const inner = eventMap.get(e.period_yyyymm);
    // Only keep the LATEST per (period, table) — order by closed_at desc
    // above means the first one we see wins.
    if (inner && !inner.has(e.table_name)) {
      inner.set(e.table_name, e);
    }
  }

  const now = currentYyyymm();

  // CSV columns mirror the <thead> 1:1 (+ explicit money/count splits so each
  // multi-line table cell becomes flat columns).
  const csvCols: CsvCol[] = [
    { key: "period_label",  label: "งวด" },
    { key: "period_yyyymm", label: "รหัสงวด" },
    { key: "status",        label: "สถานะ" },
    { key: "tax_count",     label: "tax_invoices (จำนวน)" },
    { key: "tax_sum",       label: "tax_invoices (ยอด)" },
    { key: "freight_count", label: "freight_invoices (จำนวน)" },
    { key: "freight_sum",   label: "freight_invoices (ยอด)" },
    { key: "pay_count",     label: "payments (จำนวน)" },
    { key: "pay_sum",       label: "payments (ยอด)" },
    { key: "closed_at",     label: "ปิดเมื่อ" },
    { key: "closed_by",     label: "ปิดโดย" },
  ];

  const csvRows: CsvRow[] = window.map((yyyymm) => {
    const p = periodMap.get(yyyymm);
    const ev = eventMap.get(yyyymm);
    const taxRow = ev?.get("tax_invoices");
    const freightRow = ev?.get("freight_invoices");
    const payRow = ev?.get("freight_invoice_payments");
    return {
      period_label: formatYyyymm(yyyymm) + (yyyymm === now ? " (เดือนปัจจุบัน)" : ""),
      period_yyyymm: yyyymm,
      status: p ? ACCOUNTING_PERIOD_STATUS_LABEL[p.status] : "ยังไม่เปิดงวด",
      tax_count: taxRow ? `${taxRow.row_count} ใบ` : "—",
      tax_sum: taxRow ? thb(taxRow.sum_thb) : "—",
      freight_count: freightRow ? `${freightRow.row_count} ใบ` : "—",
      freight_sum: freightRow ? thb(freightRow.sum_thb) : "—",
      pay_count: payRow ? `${payRow.row_count} ครั้ง` : "—",
      pay_sum: payRow ? thb(payRow.sum_thb) : "—",
      closed_at: p?.closed_at ? p.closed_at.slice(0, 10) : "—",
      closed_by: p?.closed_at ? profileName(p.closed_by_profile) : "—",
    } satisfies CsvRow;
  });

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · V-E9</p>
          <h1 className="mt-1 text-2xl font-bold">📅 ปิดงวดบัญชีรายเดือน</h1>
          <p className="text-xs text-muted mt-1">
            workflow: เปิดงวด → กำลังปิด (soft warn) → ปิดงวด (DB freeze trigger active) ·
            ปิดแล้วจะไม่สามารถแก้ไข tax_invoices / freight_invoices / freight_invoice_payments / wallet_transactions ในงวดนั้น
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`งวดบัญชี-${now}.csv`}
            fetchAll={async () => {
              "use server";
              return exportAccPeriodsAll({ months: 24 });
            }}
          />
          <Link
            href="/admin/accounting"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ← Accounting hub
          </Link>
        </div>
      </header>

      {/* Legend */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-4">
        <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">สถานะ</h2>
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE.open}`}>เปิด</span>
            <span className="text-muted">งวดเปิด · admin แก้ไขได้ปกติ</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE.closing}`}>กำลังปิด</span>
            <span className="text-muted">UI เตือน แต่ยังแก้ได้ (soft barrier)</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE.closed}`}>ปิดแล้ว</span>
            <span className="text-muted">DB trigger บล็อก UPDATE/DELETE · เปิดใหม่ต้อง super + เหตุผล</span>
          </span>
        </div>
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">งวด</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2 text-right">tax_invoices</th>
              <th className="px-3 py-2 text-right">freight_invoices</th>
              <th className="px-3 py-2 text-right">payments</th>
              <th className="px-3 py-2">ปิดเมื่อ</th>
              <th className="px-3 py-2">ปิดโดย</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {window.map((yyyymm) => {
              const p = periodMap.get(yyyymm);
              const ev = eventMap.get(yyyymm);
              const isCurrent = yyyymm === now;
              const taxRow = ev?.get("tax_invoices");
              const freightRow = ev?.get("freight_invoices");
              const payRow = ev?.get("freight_invoice_payments");

              return (
                <tr
                  key={yyyymm}
                  className={`border-t border-border ${isCurrent ? "bg-primary-50/30" : "hover:bg-surface-alt/30"}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/accounting/periods/${yyyymm}`}
                      className="text-sm text-primary-600 hover:underline font-medium"
                    >
                      {formatYyyymm(yyyymm)}
                    </Link>
                    {isCurrent && <p className="text-[10px] text-primary-700 font-bold">เดือนปัจจุบัน</p>}
                    <p className="font-mono text-[10px] text-muted">{yyyymm}</p>
                  </td>
                  <td className="px-3 py-2">
                    {p ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[p.status]}`}>
                        {ACCOUNTING_PERIOD_STATUS_LABEL[p.status]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted italic">ยังไม่เปิดงวด</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[10px]">
                    {taxRow ? (
                      <>
                        <div>{taxRow.row_count} ใบ</div>
                        <div className="text-muted">{thb(taxRow.sum_thb)}</div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[10px]">
                    {freightRow ? (
                      <>
                        <div>{freightRow.row_count} ใบ</div>
                        <div className="text-muted">{thb(freightRow.sum_thb)}</div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[10px]">
                    {payRow ? (
                      <>
                        <div>{payRow.row_count} ครั้ง</div>
                        <div className="text-muted">{thb(payRow.sum_thb)}</div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {p?.closed_at
                      ? new Date(p.closed_at).toLocaleDateString("th-TH", { dateStyle: "short" })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p?.closed_at ? profileName(p.closed_by_profile) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!p && canWrite && (
                      <OpenPeriodButton period_yyyymm={yyyymm} />
                    )}
                    {p && (
                      <Link
                        href={`/admin/accounting/periods/${yyyymm}`}
                        className="text-[10px] text-primary-500 hover:underline"
                      >
                        จัดการ →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[10px] text-muted">
        V1: คลิก &quot;เปิดงวด&quot; ทุกเดือนด้วยตัวเอง · V1.1 cron auto-seed · V1.1 PEAK ERP export · V1.1 closing checklist enforcement
      </p>
    </main>
  );
}
