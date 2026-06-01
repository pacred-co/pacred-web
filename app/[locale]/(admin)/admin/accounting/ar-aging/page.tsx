import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import {
  getForwarderAgingReport,
  type AgingBucket,
} from "@/actions/admin/ar-aging";

/**
 * /admin/accounting/ar-aging — AR-aging cockpit (ลูกหนี้ค้างชำระ).
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §4 — surfaces the outstanding
 * tb_forwarder.fstatus='5' cohort (~457 rows = the "cash in the door"
 * waiting for collection) bucketed by Thai accounting standard
 * (0-30/30-60/60-90/90+ days).
 *
 * READ-ONLY · no money mutation. The MVP uses tb_forwarder.fstatus alone
 * as the outstanding indicator (the legacy money-of-record signal). A
 * tighter "actual unpaid" (tb_receipt issued vs tb_wallet_hs paid) is a
 * Phase-2 enhancement when the receipt↔forwarder bundling is audited.
 *
 * Roles per ADR-0006 §1.4: super | accounting | sales_admin.
 */

export const dynamic = "force-dynamic";

const BUCKET_COLOR: Record<AgingBucket, string> = {
  "0-30":  "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "30-60": "bg-amber-50 text-amber-700 border border-amber-200",
  "60-90": "bg-orange-50 text-orange-700 border border-orange-200",
  "90+":   "bg-red-50 text-red-700 border border-red-200",
};
const BUCKET_LABEL: Record<AgingBucket, string> = {
  "0-30":  "0 - 30 วัน",
  "30-60": "31 - 60 วัน",
  "60-90": "61 - 90 วัน",
  "90+":   "เกิน 90 วัน 🔴",
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminARAgingPage() {
  await requireAdmin(["super", "accounting", "sales_admin"]);

  const report = await getForwarderAgingReport();
  const asOfDisplay = new Date(report.asOf).toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/ar-aging" />
      <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · ลูกหนี้</p>
            <h1 className="mt-1 text-2xl font-bold">ลูกหนี้ค้างชำระ (AR Aging)</h1>
            <p className="text-xs text-muted mt-1">
              คอกพิทดูเงินที่ต้องตามเก็บ · แบ่งเป็นช่วง 0-30/30-60/60-90/เกิน 90 วัน · ทีมเซลส์เอาไปไล่ตามได้
            </p>
            <p className="text-[10px] text-muted mt-1">
              📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_forwarder</code> WHERE <code className="bg-surface-alt px-1 rounded">fstatus=&apos;5&apos;</code>{" "}
              (รอชำระเงิน) · ใช้ <code className="bg-surface-alt px-1 rounded">fdatestatus5</code> หรือ <code className="bg-surface-alt px-1 rounded">fdate</code> เป็น issue date ·{" "}
              outstanding = <code className="bg-surface-alt px-1 rounded">ftotalprice − fdiscount</code> · per-rep attribution via <code className="bg-surface-alt px-1 rounded">tb_sales_report</code>
            </p>
            <p className="text-[10px] text-muted mt-1">As of: {asOfDisplay}</p>
          </div>
        </header>

        {/* Headline totals */}
        <section className="grid sm:grid-cols-3 gap-3">
          <Stat label="จำนวนรายการค้าง" value={report.totalRows.toLocaleString("th-TH")} />
          <Stat label="ลูกค้าค้าง (unique)" value={report.topCustomers.length.toLocaleString("th-TH")} />
          <Stat label="ยอดค้างรวม" value={thb(report.totalSum)} bold />
        </section>

        {/* Bucket cards — color-coded */}
        <section className="grid sm:grid-cols-4 gap-3">
          {report.buckets.map((b) => (
            <div
              key={b.bucket}
              className={`rounded-2xl border p-4 shadow-sm ${BUCKET_COLOR[b.bucket]}`}
            >
              <p className="text-xs font-semibold">{BUCKET_LABEL[b.bucket]}</p>
              <p className="mt-1 text-xs">{b.count.toLocaleString("th-TH")} รายการ</p>
              <p className="mt-2 text-xl font-bold font-mono">{thb(b.sumOutstanding)}</p>
              <p className="mt-1 text-[10px] opacity-75">
                {report.totalSum > 0
                  ? `${((b.sumOutstanding / report.totalSum) * 100).toFixed(1)}% ของยอดค้าง`
                  : "—"}
              </p>
            </div>
          ))}
        </section>

        {/* Top customers */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-sm">🏢 ลูกค้าที่ค้างมากที่สุด (top 20)</h2>
            <p className="text-xs text-muted">เรียงจากยอดค้างสูง→ต่ำ</p>
          </div>
          {report.topCustomers.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ยังไม่มีลูกหนี้ค้างชำระ · tb_forwarder.fstatus=&apos;5&apos; ว่าง
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">รหัสลูกค้า</th>
                    <th className="px-3 py-2">ชื่อ</th>
                    <th className="px-3 py-2 text-right">#รายการ</th>
                    <th className="px-3 py-2 text-right">นานสุด (วัน)</th>
                    <th className="px-3 py-2 text-right">0-30</th>
                    <th className="px-3 py-2 text-right">31-60</th>
                    <th className="px-3 py-2 text-right">61-90</th>
                    <th className="px-3 py-2 text-right">90+</th>
                    <th className="px-3 py-2 text-right">รวมค้าง</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topCustomers.map((c, idx) => (
                    <tr key={c.userid} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/customers/${c.userid}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          {c.userid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">{c.customerName ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{c.count.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        <span className={c.oldestDays > 90 ? "text-red-700 font-bold" : c.oldestDays > 60 ? "text-orange-700" : ""}>
                          {c.oldestDays.toLocaleString("th-TH")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">{c.byBucket["0-30"] > 0 ? thb(c.byBucket["0-30"]) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-amber-700">{c.byBucket["30-60"] > 0 ? thb(c.byBucket["30-60"]) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-orange-700">{c.byBucket["60-90"] > 0 ? thb(c.byBucket["60-90"]) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-red-700 font-bold">{c.byBucket["90+"] > 0 ? thb(c.byBucket["90+"]) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">{thb(c.sumOutstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Top reps (rep attribution via tb_sales_report) */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-sm">👤 Sales Rep ที่ถือหนี้ค้างมากที่สุด (top 10)</h2>
            <p className="text-xs text-muted">attribution via tb_sales_report</p>
          </div>
          {report.topReps.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มี rep attribution ใน tb_sales_report สำหรับ outstanding cohort
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Sales Rep</th>
                    <th className="px-3 py-2 text-right">#รายการที่ถือ</th>
                    <th className="px-3 py-2 text-right">ยอดค้างรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topReps.map((r, idx) => (
                    <tr key={r.adminID} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono">{r.adminID}</span>
                        {r.repName && <span className="text-muted ml-2">· {r.repName}</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.count.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">{thb(r.sumOutstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[10px] text-muted">
          📌 MVP read-only · tb_wallet_hs reconciliation deferred Phase-2 ·
          ใช้ tb_forwarder.fstatus=&apos;5&apos; เป็น outstanding signal (legacy money-of-record) ·
          อ่านอ้างอิงเพิ่ม: <Link href="/admin/reports/pending-payments" className="underline">pending payments</Link>
          {" · "}
          <Link href="/admin/reports/debtors" className="underline">debtors report (flat)</Link>
        </p>
      </main>
    </>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono ${bold ? "text-2xl text-primary-700" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
