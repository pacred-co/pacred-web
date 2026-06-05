import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getNearChurnReport } from "@/actions/admin/near-churn";
import { AlertCircle, Phone, MessageCircle, Mail } from "lucide-react";

/**
 * /admin/accounting/near-churn — inactive customer win-back report.
 *
 * 2026-06-05 (ภูม · CEO "business runs itself" automation):
 *   CEO directive — scale 3-4 months via CRM + Marketing + standardised
 *   workflow + training. หน้านี้คือ CRM activation 2.0: ลูกค้าที่เคย active
 *   แต่หายไปนานเกินไป → sales rep ติดต่อกลับให้ทัน.
 *
 * Cohort: userActive='1' AND has ≥1 delivered ตู้ AND last fdate
 * older than N days (default 90). Ranked by lifetime margin DESC
 * (highest-LTV win-back targets first).
 *
 * Why this matters (CEO lens):
 *   · "ลูกค้าประจำควรได้ราคาดีกว่า" works only if we KEEP the loyal ones.
 *   · A 90-day silent customer is signalling distress — competitor stole,
 *     business problem, or just forgot. The earliest the rep calls, the
 *     higher the recovery chance.
 *   · Without this report, churn is invisible until quarterly close.
 *
 * Roles: super | accounting | sales_admin.
 */

export const dynamic = "force-dynamic";

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default async function AdminNearChurnPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const sp = await searchParams;
  const daysIdle = Math.max(30, Math.min(parseInt(sp.days ?? "90", 10) || 90, 365));

  const report = await getNearChurnReport({ daysIdle, limit: 200 });

  const csvRows: CsvRow[] = report.rows.map((r) => ({
    "userid":          r.userid,
    "ชื่อลูกค้า":       r.fullName,
    "เบอร์โทร":          r.userTel ?? "",
    "อีเมล":            r.userEmail ?? "",
    "เซลผู้ดูแล":         r.adminIDSale ?? "",
    "ตู้สำเร็จทั้งหมด":   r.totalDelivered,
    "ยอดขายรวม":      r.totalRevenue,
    "กำไรรวม":         r.totalMargin,
    "ตู้ล่าสุด":          fmtDate(r.lastOrderDate),
    "เงียบมาแล้ว(วัน)":  r.daysSinceLast,
  }));

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/near-churn" />
      <main className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · CRM · WIN-BACK</p>
          <h1 className="mt-1 text-2xl font-bold">ลูกค้าใกล้หายไป (Near-Churn)</h1>
          <p className="text-xs text-muted mt-1">
            ลูกค้า active ที่เคยมีตู้สำเร็จ แต่ห่างหายไปนานเกิน {daysIdle} วัน — สำหรับเซลโทรกลับ
          </p>
          <p className="text-[10px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_users</code> +
            {" "}<code className="bg-surface-alt px-1 rounded">tb_forwarder</code> WHERE fstatus=&apos;7&apos;
            · เรียงตาม lifetime margin (highest-LTV first)
          </p>
        </header>

        {/* Days-idle preset filter (form GET) */}
        <form method="GET" action="/admin/accounting/near-churn" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted">เงียบเกิน (วัน)</span>
            <input
              type="number"
              name="days"
              defaultValue={daysIdle}
              min={30}
              max={365}
              className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs w-24"
            />
          </label>
          <div className="flex items-center gap-1">
            <Link
              href="/admin/accounting/near-churn?days=60"
              className={`rounded-lg border px-2.5 py-1 text-[10px] ${daysIdle === 60 ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted hover:border-foreground"}`}
            >
              60 วัน
            </Link>
            <Link
              href="/admin/accounting/near-churn?days=90"
              className={`rounded-lg border px-2.5 py-1 text-[10px] ${daysIdle === 90 ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted hover:border-foreground"}`}
            >
              90 วัน
            </Link>
            <Link
              href="/admin/accounting/near-churn?days=180"
              className={`rounded-lg border px-2.5 py-1 text-[10px] ${daysIdle === 180 ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted hover:border-foreground"}`}
            >
              180 วัน
            </Link>
          </div>
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
            อัพเดต
          </button>
          <CsvButton
            rows={csvRows}
            cols={Object.keys(csvRows[0] ?? {}).map((k) => ({ key: k, label: k }))}
            filename={`pacred-near-churn-${daysIdle}days.csv`}
          />
        </form>

        {/* Headline summary */}
        <section className="grid sm:grid-cols-3 gap-3">
          <Stat
            label="ลูกค้าใกล้หายไป"
            value={report.totalRows.toLocaleString("th-TH")}
            sub={`เงียบเกิน ${daysIdle} วัน`}
            highlight={report.totalRows > 0}
          />
          <Stat
            label="ยอดขายเดิมทั้งหมด"
            value={`฿${thb(report.totalRevenue)}`}
            sub="LTV ของลูกค้าใน list นี้"
          />
          <Stat
            label="กำไรเดิมทั้งหมด"
            value={`฿${thb(report.totalMargin)}`}
            sub="ถ้า win-back สำเร็จ = pipeline กลับมา"
            bold
          />
        </section>

        {/* Per-rep breakdown */}
        {report.byRep.length > 0 && (
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <h2 className="font-bold text-sm mb-3">🏆 จัดเซลส์ตามจำนวนลูกค้าหายไป (top 20)</h2>
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[500px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">เซลส์</th>
                    <th className="px-3 py-2 text-right">ลูกค้าหาย</th>
                    <th className="px-3 py-2 text-right">ยอดขายเดิม</th>
                    <th className="px-3 py-2 text-right">กำไรเดิม</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byRep.map((r, idx) => (
                    <tr key={r.adminID} className="border-t border-border">
                      <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.adminID}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.count.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.revenue)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">฿{thb(r.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Win-back call list */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h2 className="font-bold text-sm">รายชื่อลูกค้าใกล้หายไป — เรียงจากมูลค่าสูงสุด</h2>
            <p className="text-[10px] text-muted ml-auto">แสดงสูงสุด 200 ราย</p>
          </div>
          {report.rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีลูกค้าใกล้หายไปในเกณฑ์นี้ 👍
              <br />
              <span className="text-[10px]">
                (active customer ทั้งหมดมีตู้ส่งสำเร็จในช่วง {daysIdle} วันที่ผ่านมา · งานเซลส์ดีมาก)
              </span>
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2 text-center">ติดต่อ</th>
                    <th className="px-3 py-2">เซลผู้ดูแล</th>
                    <th className="px-3 py-2 text-right">ตู้สำเร็จ</th>
                    <th className="px-3 py-2 text-right">ยอดขาย LTV</th>
                    <th className="px-3 py-2 text-right">กำไร LTV</th>
                    <th className="px-3 py-2">ตู้ล่าสุด</th>
                    <th className="px-3 py-2 text-right">เงียบมา</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, idx) => (
                    <tr key={r.userid} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 text-[10px] font-mono text-muted">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/customers/${r.userid}`}
                          className="font-medium text-primary-700 hover:underline"
                        >
                          {r.fullName}
                        </Link>
                        <div className="text-[10px] text-muted font-mono">{r.userid}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {r.userTel && (
                            <a
                              href={`tel:${r.userTel.replace(/[^\d+]/g, "")}`}
                              title={`โทร ${r.userTel}`}
                              className="rounded-full p-1 hover:bg-emerald-100 text-emerald-700"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {r.userEmail && (
                            <a
                              href={`mailto:${r.userEmail}`}
                              title={`อีเมล ${r.userEmail}`}
                              className="rounded-full p-1 hover:bg-blue-100 text-blue-700"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {r.userTel && (
                            <a
                              href={`https://line.me/R/ti/p/~${encodeURIComponent(r.userTel.replace(/[^\d]/g, ""))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="LINE (best effort · ใช้เบอร์เป็น keyword)"
                              className="rounded-full p-1 hover:bg-emerald-100 text-emerald-600"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.adminIDSale ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.totalDelivered.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.totalRevenue)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">฿{thb(r.totalMargin)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.lastOrderDate)}</td>
                      <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${
                        r.daysSinceLast > 180 ? "text-red-700" :
                        r.daysSinceLast > 120 ? "text-amber-700" :
                        "text-foreground"
                      }`}>
                        {r.daysSinceLast.toLocaleString("th-TH")} วัน
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-2">
          <p className="font-medium">📌 ทำต่อแบบ Phase-C (CEO direction · automated win-back):</p>
          <ul className="list-disc list-inside text-muted space-y-1">
            <li><strong>LINE staff-notify cron</strong> — ส่งรายชื่อลูกค้าใกล้หาย {`>`} 90 วัน ไปยัง LINE group ของเซลส์ทุกเช้า</li>
            <li><strong>Per-customer LINE re-engagement</strong> — ส่ง offer อัตโนมัติให้ลูกค้าที่ผูก LINE (ผ่าน /liff/link)</li>
            <li><strong>Win-back tracking</strong> — บันทึก call_attempts ใน tb_users + ดูอัตรา recovery</li>
          </ul>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, sub, bold, highlight }: { label: string; value: string; sub?: string; bold?: boolean; highlight?: boolean }) {
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
      {sub && <p className="text-[10px] text-muted mt-1">{sub}</p>}
    </div>
  );
}
