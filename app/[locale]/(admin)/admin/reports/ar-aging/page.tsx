/**
 * Wave C BI — AR-aging (ลูกหนี้การค้า · ยอดค้างชำระตามอายุหนี้).
 *
 * The cash-collection cockpit: every OUTSTANDING ฝากนำเข้า order (fstatus=5
 * รอชำระเงิน · or shipped-on-credit & unpaid) aged into 0-30 / 31-60 / 61-90 /
 * 90+ day buckets, rolled up per customer so collections work the worst debtors
 * top-down. Source = tb_forwarder (LIVE legacy table) · amount via the legacy
 * calPriceForwarderMain port · age = today − fdate (computed server-side).
 *
 * Read-only · createAdminClient (via the action) · force-dynamic · mobile-first
 * (cards stack · debtor table scrolls-x). Empty/error states render ฿0 + a
 * banner, never crash (§0c).
 *
 * Reachability (AGENTS.md §0d): linked from the reports hub menubar
 * (reports/page.tsx → "BI / ผู้บริหาร" group) — ≤3 clicks from the sidebar's
 * "ออกรายงาน" leaf.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getArAgingReport } from "@/actions/admin/reports-ar";
import type { DebtorRow, AgingBucketKey } from "@/actions/admin/reports-ar-types";
import { thb, intTh } from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const TOP_N = 50;

// Bucket → card tone: older = hotter (red), younger = cool.
const BUCKET_TONE: Record<AgingBucketKey, string> = {
  b0_30: "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20",
  b31_60: "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20",
  b61_90: "border-orange-200 bg-orange-50/50 dark:bg-orange-950/20",
  b90p: "border-red-200 bg-red-50/60 dark:bg-red-950/20",
};
const BUCKET_VALUE_CLS: Record<AgingBucketKey, string> = {
  b0_30: "text-emerald-700",
  b31_60: "text-amber-700",
  b61_90: "text-orange-700",
  b90p: "text-red-700",
};

/** Age tone for a debtor's oldest-order age. */
function ageTone(days: number): string {
  if (days > 90) return "bg-red-50 text-red-700 border-red-200";
  if (days > 60) return "bg-orange-50 text-orange-700 border-orange-200";
  if (days > 30) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-surface-alt text-muted border-border";
}

export default async function ArAgingReportPage() {
  await requireAdmin(["super", "accounting"]);

  const res = await getArAgingReport(TOP_N);
  const report = res.ok
    ? res.data
    : {
        buckets: [
          { key: "b0_30" as const,  label: "0–30 วัน",  amount: 0, count: 0 },
          { key: "b31_60" as const, label: "31–60 วัน", amount: 0, count: 0 },
          { key: "b61_90" as const, label: "61–90 วัน", amount: 0, count: 0 },
          { key: "b90p" as const,   label: "90+ วัน",   amount: 0, count: 0 },
        ],
        grandTotal: 0,
        grandCount: 0,
        debtorCount: 0,
        topDebtors: [],
        capped: false,
      };

  const maxDebtor = Math.max(0, ...report.topDebtors.map((d) => d.amount));

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · REPORTS · BI
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">ลูกหนี้การค้า (AR-aging)</h1>
          <p className="mt-1 text-sm text-muted">
            ยอดค้างชำระฝากนำเข้า แยกตามอายุหนี้ + ลูกหนี้รายใหญ่ — อ่านจาก tb_forwarder
            (รอชำระเงิน / เครดิตค้าง)
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {!res.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      )}

      {report.capped && res.ok && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          แตะเพดาน {intTh(20000)} แถว — ยอดรวมอาจต่ำกว่าจริง (ข้อมูลค้างชำระมากผิดปกติ)
        </div>
      )}

      {/* Grand-total summary */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="ยอดค้างชำระรวม" value={thb(report.grandTotal)} tone="primary" />
        <Stat label="จำนวนออเดอร์ค้าง" value={intTh(report.grandCount)} />
        <Stat label="จำนวนลูกหนี้" value={intTh(report.debtorCount)} />
      </section>

      {/* Aging buckets */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">ยอดค้างตามอายุหนี้</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {report.buckets.map((b) => {
            const pct = report.grandTotal > 0 ? (b.amount / report.grandTotal) * 100 : 0;
            return (
              <div
                key={b.key}
                className={`rounded-2xl border p-4 shadow-sm ${BUCKET_TONE[b.key]}`}
              >
                <p className="text-xs font-medium text-muted">{b.label}</p>
                <p className={`mt-1 text-base sm:text-lg font-bold font-mono ${BUCKET_VALUE_CLS[b.key]}`}>
                  {thb(b.amount)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {intTh(b.count)} ออเดอร์ · {pct.toFixed(0)}% ของยอดค้าง
                </p>
                {/* mini share bar */}
                <div className="mt-2 h-1.5 w-full rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top debtors */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">
            ลูกหนี้รายใหญ่ (สูงสุด {intTh(TOP_N)} ราย · เรียงยอดค้างมาก→น้อย)
          </h2>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] text-muted">
              <tr>
                <th className="px-3 py-2.5">ลูกค้า</th>
                <th className="px-3 py-2.5 text-right">ออเดอร์ค้าง</th>
                <th className="px-3 py-2.5 text-right">ยอดค้างรวม</th>
                <th className="px-3 py-2.5 text-right">อายุหนี้สูงสุด</th>
                <th className="px-3 py-2.5">สัดส่วนตามอายุ</th>
              </tr>
            </thead>
            <tbody>
              {report.topDebtors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    {res.ok ? "ไม่มียอดค้างชำระ 🎉" : "—"}
                  </td>
                </tr>
              ) : (
                report.topDebtors.map((d) => (
                  <DebtorTr key={d.userid} d={d} maxDebtor={maxDebtor} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-muted">
        ยอดค้าง = ราคาเต็มฝากนำเข้า (ผลรวมค่าขนส่ง/บริการ − ส่วนลด − ส่วนลดนิติ 1%) ·
        นับเฉพาะออเดอร์สถานะ &ldquo;รอชำระเงิน&rdquo; (fstatus=5) หรือ &ldquo;เครดิตค้าง&rdquo;
        (fcredit=1 และยังไม่จ่ายครบ) · ไม่นับ fstatus=99 (ยกเลิก) · อายุหนี้นับจากวันสร้างออเดอร์
      </p>
    </main>
  );
}

// ── components ──────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "primary"
          ? "border-primary-200 bg-primary-50/60 dark:bg-primary-950/20"
          : "border-border bg-white dark:bg-surface"
      }`}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 text-lg sm:text-xl font-bold font-mono ${
          tone === "primary" ? "text-primary-700" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DebtorTr({ d, maxDebtor }: { d: DebtorRow; maxDebtor: number }) {
  const pct = maxDebtor > 0 ? Math.max(0, (d.amount / maxDebtor) * 100) : 0;
  // Per-bucket split bar (stacked) so collections see the aging mix at a glance.
  const segs: { key: AgingBucketKey; cls: string }[] = [
    { key: "b0_30", cls: "bg-emerald-400" },
    { key: "b31_60", cls: "bg-amber-400" },
    { key: "b61_90", cls: "bg-orange-400" },
    { key: "b90p", cls: "bg-red-500" },
  ];
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{d.name || "—"}</div>
        <div className="font-mono text-[10px] text-muted">{d.userid}</div>
        {d.phone && <div className="text-[10px] text-muted">☎ {d.phone}</div>}
      </td>
      <td className="px-3 py-2 text-right font-mono">{intTh(d.orders)}</td>
      <td className="px-3 py-2 text-right font-mono font-semibold">{thb(d.amount)}</td>
      <td className="px-3 py-2 text-right">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ageTone(d.oldestAgeDays)}`}>
          {intTh(d.oldestAgeDays)} วัน
        </span>
      </td>
      <td className="px-3 py-2">
        {/* relative size bar + a stacked aging-mix bar under it */}
        <div className="h-1.5 w-full max-w-[160px] rounded-full bg-surface-alt overflow-hidden">
          <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-surface-alt">
          {segs.map((s) => {
            const segPct = d.amount > 0 ? (d.byBucket[s.key] / d.amount) * 100 : 0;
            if (segPct <= 0) return null;
            return <div key={s.key} className={s.cls} style={{ width: `${segPct}%` }} />;
          })}
        </div>
      </td>
    </tr>
  );
}
