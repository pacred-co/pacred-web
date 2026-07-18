import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDataHealthChecks, type HealthCheckResult } from "@/lib/admin/data-health/checks";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/**
 * 🩺 /admin/data-health — LIVE production data-invariant dashboard.
 *
 * Owner 2026-07-18: "ระบบควรจะ on green สม่ำเสมอ · ห้ามแสดงผลข้อมูลมั่ว · ลูกค้าจริง
 * ไม่ใช่หนูลองยา". Every check = an invariant a REAL past incident violated
 * (PR050 เบิ้ลกล่อง · PR107 เก็บเงินซ้ำ · ฿0 bills · เครดิตค้าง · cost มั่ว …).
 * Runs the SAME read-only checks the hourly cron runs (/api/cron/data-health —
 * that twin files deduped incidents); this page is the on-demand drill-down.
 * Retrospective: docs/wip/plan-2026-07-18-data-health-invariants.md.
 */

const SEV_LABEL: Record<string, { text: string; cls: string }> = {
  red:  { text: "🔴 เงิน/ข้อมูลลูกค้า", cls: "bg-red-600 text-white" },
  warn: { text: "🟠 รายงาน/ภายใน",     cls: "bg-amber-500 text-white" },
  info: { text: "🟡 เฝ้าดู",            cls: "bg-yellow-400 text-yellow-950" },
};

function StatusPill({ r }: { r: HealthCheckResult }) {
  if (r.error) {
    return <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">ตรวจไม่สำเร็จ</span>;
  }
  return r.ok ? (
    <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">ผ่าน</span>
  ) : (
    <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">พบ {r.count} รายการ</span>
  );
}

/** Link a sample field to the surface that shows the real row (≤3 clicks · §0d). */
function SampleValue({ k, v }: { k: string; v: unknown }) {
  const s = Array.isArray(v) ? v.join(", ") : String(v ?? "—");
  if ((k === "forwarderId" || k === "bareId" || k === "id") && Number(v) > 0) {
    return (
      <Link href={`/admin/forwarders/${Number(v)}`} className="font-semibold text-primary-600 underline underline-offset-2">
        #{s}
      </Link>
    );
  }
  if (k === "hno") {
    return (
      <Link href={`/admin/service-orders/${s}`} className="font-semibold text-primary-600 underline underline-offset-2">
        {s}
      </Link>
    );
  }
  return <span className="tabular-nums">{s}</span>;
}

export default async function DataHealthPage() {
  await requireAdmin(["super", "ops", "accounting"]);
  const admin = createAdminClient();
  const report = await runDataHealthChecks(admin);

  const failing = report.results.filter((r) => !r.ok);
  const passing = report.results.filter((r) => r.ok);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">🩺 สุขภาพข้อมูล (Data Health)</h1>
        {report.green ? (
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-bold text-white">ON GREEN — ไม่พบปัญหาเงิน/ข้อมูลลูกค้า</span>
        ) : (
          <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">🔴 {report.redCount} เรื่องต้องแก้</span>
        )}
        {report.warnCount > 0 && (
          <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">🟠 {report.warnCount} เตือน</span>
        )}
      </div>
      <p className="max-w-3xl text-sm text-muted">
        ทุกหัวข้อ = กติกาที่เคยพังจริงบน production (ลูกค้าเจอก่อนเรา) — หน้านี้ตรวจสดตอนเปิด ·
        cron ตรวจซ้ำทุกชั่วโมงและยิงเข้า <Link href="/admin/incidents" className="text-primary-600 underline underline-offset-2">แจ้งเตือนระบบ</Link> เมื่อพบ ·
        อ่านอย่างเดียว 100% (ไม่มีการแก้ข้อมูลจากหน้านี้) · ตรวจล่าสุด {new Date(report.ranAt).toLocaleString("th-TH")}
      </p>

      {failing.length > 0 && (
        <div className="space-y-4">
          {failing.map((r) => (
            <div key={r.id} className="rounded-xl border-2 border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${SEV_LABEL[r.severity].cls}`}>{SEV_LABEL[r.severity].text}</span>
                <h2 className="text-base font-semibold">{r.title}</h2>
                <StatusPill r={r} />
              </div>
              <p className="mt-2 text-sm"><span className="font-semibold">เคยเกิดอะไร:</span> <span className="text-muted">{r.why}</span></p>
              <p className="mt-1 text-sm"><span className="font-semibold">ทำไงต่อ:</span> {r.action}</p>
              {r.error && <p className="mt-1 text-sm font-semibold text-red-700">ตัวตรวจล้มเหลว: {r.error}</p>}
              {r.sample.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-white dark:bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt text-left">
                        {Object.keys(r.sample[0]).map((k) => (
                          <th key={k} className="px-3 py-1.5 font-semibold">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.sample.map((row, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0">
                          {Object.entries(row).map(([k, v]) => (
                            <td key={k} className="px-3 py-1.5"><SampleValue k={k} v={v} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {r.count > r.sample.length && (
                    <p className="px-3 py-1.5 text-xs text-muted">แสดง {r.sample.length} จาก {r.count} รายการ</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border p-4">
        <h2 className="text-base font-semibold">✅ ผ่าน ({passing.length})</h2>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {passing.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {r.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
