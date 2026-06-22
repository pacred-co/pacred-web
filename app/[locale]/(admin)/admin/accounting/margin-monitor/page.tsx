import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import {
  getMarginReport,
  type MarginBucket,
} from "@/actions/admin/margin-monitor";
// Cost-reveal blur gate (owner ภูม 2026-06-16) — blur ต้นทุน/กำไร until the PIN.
import { CostRevealRegion, CostRevealToggle } from "@/components/admin/cost-reveal";

/**
 * /admin/accounting/margin-monitor — Profit/margin retrospective.
 *
 * CEO directive 2026-06-01 (per CLAUDE.md PM section):
 *   "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"
 *
 * This page covers the RETROSPECTIVE half (analytics over delivered orders).
 * Forward-looking quote-comparison tool = separate next surface.
 *
 * Reads tb_forwarder where fstatus='7' (delivered · margin realised) ·
 * computes per-row margin = ftotalprice − fcosttotalprice − fdiscount ·
 * buckets per CEO cap (negative / 0-5k / 5-10k / 10-15k / 15k+) · per-rep
 * attribution via tb_sales_report.
 *
 * Roles per ADR-0006 §1.4: super | accounting | sales_admin.
 */

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<MarginBucket, string> = {
  "negative": "ขาดทุน 🔴",
  "0-5k":     "ต่ำ (0-5k)",
  "5-10k":    "กลาง (5-10k)",
  "10-15k":   "ดี (10-15k)",
  "15k+":     "เกิน cap 🚨 (>15k)",
};
const BUCKET_COLOR: Record<MarginBucket, string> = {
  "negative": "bg-red-50 text-red-700 border-red-200",
  "0-5k":     "bg-slate-50 text-slate-700 border-slate-200",
  "5-10k":    "bg-blue-50 text-blue-700 border-blue-200",
  "10-15k":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "15k+":     "bg-amber-50 text-amber-800 border-amber-300",
};

function defaultDateRange(): { from: string; to: string } {
  // Default to last 90 days (give enough volume for margin analytics)
  const to   = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  const pad  = (n: number) => n.toString().padStart(2, "0");
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to:   `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  };
}

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function AdminMarginMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  // 2026-06-15 (owner "พนักงานไม่ควรเห็นต้นทุน") — margin/profit IS cost data;
  // dropped sales_admin → accounting-only dashboard.
  // 2026-06-18 (owner · mig 0189) — super ALSO loses money-internal visibility;
  // this whole page is cost/profit/margin. Gate at the DATA layer: don't even
  // run getMarginReport() when the viewer can't see money internals, so no
  // cost/profit/margin value is ever fetched or serialized. (The CostRevealRegion
  // blur is CSS-only UX — never the access boundary.)
  const { roles } = await requireAdmin(["super", "accounting"]);
  if (!canViewCostProfit(roles)) {
    return (
      <main className="p-6 lg:p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          หน้านี้แสดงต้นทุน · กำไร · มาร์จิ้น (ข้อมูลภายในด้านการเงิน) —
          เฉพาะบัญชี Ultra · บัญชี · Pricing เท่านั้น
        </div>
      </main>
    );
  }
  const sp = await searchParams;
  const defaults = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : defaults.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : defaults.to;

  const report = await getMarginReport({ dateFrom, dateTo });

  // CSV — focus on over-cap and negative-margin actionables
  const csvOverCap: CsvRow[] = report.topOverCap.map((r) => ({
    "Forwarder ID":          r.fid,
    "วันที่":                fmtDate(r.fdate),
    "ลูกค้า":                r.userid ?? "",
    "Tracking CHN":          r.fTrackingChn ?? "",
    "ราคาขาย":              r.ftotalprice,
    "ต้นทุน":                r.fcosttotalprice,
    "ส่วนลด":                r.fdiscount,
    "กำไร (บาท)":           r.margin,
  }));

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/margin-monitor" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · CEO · MARGIN</p>
          <h1 className="mt-1 text-2xl font-bold">Margin Monitor · profit-cap ≤ ฿15k/ตู้</h1>
          <p className="text-xs text-muted mt-1">
            ตามนโยบาย CEO 2026-06-01 — ตู้ที่กำไรเกิน ฿15k ควร review (อาจเรียกราคาสูงไป) · ตู้ขาดทุน = เรียกราคาต่ำเกิน หรือ rate sheet ผิด
          </p>
          <p className="text-[11px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_forwarder</code> WHERE
            {" "}<code className="bg-surface-alt px-1 rounded">fstatus=&apos;7&apos;</code>
            {" "}(ส่งสำเร็จ · margin realised) · กำไร = ราคาขาย − ต้นทุน − ส่วนลด · per-rep attribution via
            {" "}<code className="bg-surface-alt px-1 rounded">tb_sales_report</code>
          </p>
        </header>

        {/* Date range form */}
        <form method="GET" action="/admin/accounting/margin-monitor" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted">ตั้งแต่</span>
            <input type="date" name="date_from" defaultValue={dateFrom} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted">ถึง</span>
            <input type="date" name="date_to" defaultValue={dateTo} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
          </label>
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
            อัพเดต
          </button>
          {(sp.date_from || sp.date_to) && (
            <Link href="/admin/accounting/margin-monitor" className="text-xs text-muted hover:text-foreground">
              ใช้ default
            </Link>
          )}
          <p className="text-[11px] text-muted ml-auto">
            ช่วงปัจจุบัน {dateFrom} → {dateTo} · default = 90 วันล่าสุด
          </p>
        </form>

        {/* Blur gate (owner ภูม 2026-06-16) — กดดูต้นทุน + ใส่รหัสเพื่อแสดงรายงานกำไร/ต้นทุนทั้งหมด */}
        <div className="flex justify-end -mb-2">
          <CostRevealToggle />
        </div>
        <CostRevealRegion className="space-y-6">

        {/* Headline summary */}
        <section className="grid sm:grid-cols-3 gap-3">
          <Stat label="ตู้ทั้งหมด (ส่งสำเร็จ)" value={report.totalRows.toLocaleString("th-TH")} />
          <Stat label="กำไรรวม" value={`฿${thb(report.totalMargin)}`} bold />
          <Stat label="กำไรเฉลี่ย/ตู้" value={`฿${thb(report.avgMargin)}`} highlight={report.avgMargin > 15_000} />
        </section>

        {/* Bucket cards */}
        <section>
          <h2 className="font-bold text-sm mb-3">📊 กระจาย margin ตาม cap policy</h2>
          <div className="grid sm:grid-cols-5 gap-3">
            {report.buckets.map((b) => (
              <div key={b.bucket} className={`rounded-2xl border p-4 shadow-sm ${BUCKET_COLOR[b.bucket]}`}>
                <p className="text-xs font-semibold">{BUCKET_LABEL[b.bucket]}</p>
                <p className="mt-1 text-xs">{b.count.toLocaleString("th-TH")} ตู้</p>
                <p className="mt-2 text-lg font-bold font-mono">฿{thb(b.sumMargin)}</p>
                <p className="mt-1 text-[11px] opacity-75">
                  {report.totalMargin !== 0
                    ? `${((b.sumMargin / Math.abs(report.totalMargin)) * 100).toFixed(1)}% ของกำไรรวม`
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Top over-cap (>15k) */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-sm">🚨 ตู้ที่กำไรเกิน cap (top 20 · &gt;฿15k)</h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted">น่าจะ review · ลูกค้าควรได้ราคาดีกว่า</p>
              <CsvButton
                rows={csvOverCap}
                cols={Object.keys(csvOverCap[0] ?? {}).map((k) => ({ key: k, label: k }))}
                filename={`pacred-margin-over-cap-${dateFrom}-to-${dateTo}.csv`}
              />
            </div>
          </div>
          {report.topOverCap.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีตู้ที่กำไรเกิน ฿15k ในช่วงนี้ · {report.totalRows === 0 ? "ยังไม่มี delivered ตู้" : "ปกติ ตาม policy"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Forwarder</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">Tracking CHN</th>
                    <th className="px-3 py-2 text-right">ราคาขาย</th>
                    <th className="px-3 py-2 text-right">ต้นทุน</th>
                    <th className="px-3 py-2 text-right">ส่วนลด</th>
                    <th className="px-3 py-2 text-right">กำไร 🚨</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topOverCap.map((r) => (
                    <tr key={r.fid} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2">
                        <Link href={`/admin/forwarders/${r.fid}`} className="font-mono text-xs text-primary-600 hover:underline">
                          #{r.fid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.fdate)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.userid}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">{r.fTrackingChn}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.ftotalprice)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted">฿{thb(r.fcosttotalprice)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted">฿{thb(r.fdiscount)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-amber-700">฿{thb(r.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Top negative (loss) */}
        <section className="rounded-2xl border border-red-200 bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-red-200 bg-red-50/30">
            <h2 className="font-bold text-sm">🔴 ตู้ที่ขาดทุน (top 20 worst)</h2>
            <p className="text-xs text-muted mt-1">น่าจะเช็ค rate sheet · หรือมีรายการ pass-through ที่บันทึกผิด</p>
          </div>
          {report.topNegative.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีตู้ขาดทุน 👍</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Forwarder</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2 text-right">ราคาขาย</th>
                    <th className="px-3 py-2 text-right">ต้นทุน</th>
                    <th className="px-3 py-2 text-right">ขาดทุน 🔴</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topNegative.map((r) => (
                    <tr key={r.fid} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2">
                        <Link href={`/admin/forwarders/${r.fid}`} className="font-mono text-xs text-primary-600 hover:underline">
                          #{r.fid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.fdate)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.userid}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.ftotalprice)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted">฿{thb(r.fcosttotalprice)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-red-700">฿{thb(r.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Per-rep leaderboard */}
        {report.byRep.length > 0 && (
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <h2 className="font-bold text-sm mb-3">🏆 Sales Rep ที่สร้างกำไรมากที่สุด (top 20)</h2>
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Rep</th>
                    <th className="px-3 py-2 text-right">ตู้</th>
                    <th className="px-3 py-2 text-right">กำไรเฉลี่ย</th>
                    <th className="px-3 py-2 text-right">กำไรรวม</th>
                    <th className="px-3 py-2 text-right">เกิน cap (ตู้)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byRep.map((r, idx) => (
                    <tr key={r.adminID} className="border-t border-border">
                      <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.adminID}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.count.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.avgMargin)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">฿{thb(r.totalMargin)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        <span className={r.overCapCount > 0 ? "text-amber-700 font-bold" : "text-muted"}>
                          {r.overCapCount.toLocaleString("th-TH")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        </CostRevealRegion>

        <section className="rounded-2xl border border-border bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-2">
          <p className="font-medium">📌 CEO directive ที่เกี่ยวข้อง (Phase-C):</p>
          <ul className="list-disc list-inside text-muted space-y-1">
            <li><strong>Sales quote-comparison tool</strong> — เซลส์ใช้ pitch ลูกค้า · เปรียบเทียบราคา PCS/JMF/MOMO + cap warning forward-looking (ไม่ใช่หน้านี้)</li>
            <li><strong>Auto-flag</strong> ตู้ที่ margin เกิน 15k → notify ผู้บริหาร review · cron ทุก 1 ชม</li>
            <li><strong>Per-customer cap tracking</strong> — ลูกค้าประจำควรได้ราคาดีกว่า · บางคน margin ควร ต่ำกว่า cap</li>
          </ul>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${
      highlight ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-white dark:bg-surface"
    }`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono ${
        bold ? "text-2xl text-primary-700" : highlight ? "text-2xl text-amber-800" : "text-xl"
      }`}>
        {value}
      </p>
    </div>
  );
}
