/**
 * Re-sweep A2 #24 — รายงานการใช้ระบบ API SMS (SMS usage / credit burn)
 *
 * Faithful port of legacy `pcs-admin/report-api-sms.php`. Lists every SMS
 * Pacred sent (recipient · message · status · date) from `tb_sms_hs`, with
 * a usage summary. Useful for:
 *   - SMS-cost auditing (each row = one SMS billed).
 *   - Catching delivery-failure spikes (status=2 / ไม่สำเร็จ).
 *
 * Legacy SQL: SELECT * FROM tb_sms_hs WHERE DATE(date)>'2024-03-26'
 *   (+ optional ?type=1|2 status filter; order [[0,'desc']]).
 *
 * ⚠️ The legacy page also showed a live credit-BALANCE card fetched from a
 * partner API (local-api.com/api/SMS/getCredit) with a hard-coded secret.
 * We cannot faithfully reproduce that runtime side-call (no credential in
 * Pacred env). Instead we surface a usage-derived credit-burn ESTIMATE at
 * 160 chars/credit — the exact rate the legacy card states (L113).
 *
 * Data layer: actions/admin/reports-monitoring.ts → getSmsUsageReport.
 *
 * Role gate: legacy report-api-sms.php had NO explicit $departmentKey gate.
 * SMS logs expose customer phone numbers + message bodies (OTPs, notices),
 * so we narrow to super / accounting / ops — same as the sibling reports.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import {
  getSmsUsageReport,
  SMS_STATUS_LABEL,
  SMS_CHARS_PER_CREDIT,
} from "@/actions/admin/reports-monitoring";
import {
  resolveDateRange, intTh, dateTimeTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1",   label: SMS_STATUS_LABEL["1"] }, // สำเร็จ
  { value: "2",   label: SMS_STATUS_LABEL["2"] }, // ไม่สำเร็จ
];

export default async function SmsUsageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
}) {
  await requireAdmin(["super", "accounting", "ops"]);

  const sp     = await searchParams;
  const range  = resolveDateRange(sp);
  const status = sp.status === "1" || sp.status === "2" ? sp.status : "all";
  const res    = await getSmsUsageReport(range, status);

  const rows = res.ok ? res.data : [];

  // Summary aggregates.
  const totalSent    = rows.length;
  const successCount = rows.filter((r) => r.status === "1").length;
  const failCount    = rows.filter((r) => r.status === "2").length;
  // Credit-burn estimate: ceil(chars / 160) per message, summed (legacy L113).
  const creditEstimate = rows.reduce(
    (s, r) => s + Math.max(1, Math.ceil((r.message?.length ?? 0) / SMS_CHARS_PER_CREDIT)),
    0,
  );

  const data: ReportData = {
    columns: [
      { key: "date",    label: "วันที่ส่ง", format: (v) => dateTimeTh(v as string) },
      { key: "msisdn",  label: "หมายเลขโทรศัพท์" },
      { key: "message", label: "ข้อความที่ส่ง" },
      { key: "status",  label: "สถานะ", format: (v) => SMS_STATUS_LABEL[String(v)] ?? String(v ?? "—") },
    ],
    rows: rows.map((r) => ({
      id:      r.id,
      date:    r.date,
      msisdn:  r.msisdn,
      message: r.message,
      status:  r.status,
    })),
    totals: {
      date:   "รวม " + intTh(totalSent) + " ข้อความ",
      status: "≈ " + intTh(creditEstimate) + " เครดิต",
    },
  };

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "ทั้งหมด";

  return (
    <ReportShell
      title="รายงานการใช้ระบบ API SMS"
      subtitle="รายการ SMS ที่ส่ง (ผู้รับ · ข้อความ · สถานะ) — ตรวจสอบค่าใช้จ่าย + อัตราส่งสำเร็จ"
      range={range}
      pathname="/admin/reports/sms-usage"
      extraQuery={{ status: status !== "all" ? status : undefined }}
      summary={[
        { label: "ส่งทั้งหมด",       value: intTh(totalSent) },
        { label: "สำเร็จ",          value: intTh(successCount), tone: "green" },
        { label: "ไม่สำเร็จ",        value: intTh(failCount), tone: failCount > 0 ? "red" : "default" },
        { label: "เครดิต (ประมาณ)*", value: "≈ " + intTh(creditEstimate) },
      ]}
      data={data}
      csvSlug="sms-usage"
      emptyLabel="ไม่มีการส่ง SMS ในช่วงเวลานี้"
      extraControls={
        <form method="GET" action="/admin/reports/sms-usage" className="flex items-end gap-2 flex-wrap">
          {/* Preserve the active date range when the status dropdown submits. */}
          <input type="hidden" name="from" value={range.from} />
          <input type="hidden" name="to"   value={range.to} />
          <div>
            <label htmlFor="status" className="block text-[10px] uppercase tracking-wide text-muted mb-1">สถานะการส่ง</label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt">
            กรองสถานะ
          </button>
        </form>
      }
      sourceNote={
        res.ok
          ? `Source: tb_sms_hs — port of report-api-sms.php. *เครดิตคำนวณโดยประมาณ (160 ตัวอักษร/เครดิต); ยอดคงเหลือจริงต้องดึงจาก API ผู้ให้บริการ (สถานะ ${statusLabel})`
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
