/**
 * รายงานลูกค้าสมัครใหม่แต่ยืนยัน OTP ไม่ผ่าน — admin report page.
 *
 * Faithful port of legacy `pcs-admin/report-otp-not-pass.php`
 * ("สมัครใหม่แต่ยืนยัน OTP ไม่ได้"). READ-ONLY.
 *
 * Lists pending-signup rows from tb_register (people who started signing up
 * but never completed OTP → never became a tb_users row). Each row is flagged
 * with the likely reason (phone-format check, port of legacy checkTelRe) and
 * whether the phone already exists in the system. Useful for CS to follow up
 * with customers stuck at the OTP step.
 *
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (legacy default = last 7 days).
 *
 * Role gate: super / ops — operational follow-up; phone numbers visible.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import {
  resolveDateRange,
  intTh,
  dateTimeTh,
  type ReportData,
} from "@/lib/admin/reports/types";
import { getOtpFailedReport, REGISTER_TYPE_LABEL } from "./data";

export const dynamic = "force-dynamic";

export default async function OtpFailedReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "ops"]);

  const sp = await searchParams;
  // Legacy default window = last 7 days.
  const range = resolveDateRange(sp, 7);
  const res = await getOtpFailedReport(range);

  const report = res.ok
    ? res.data
    : { rows: [], totals: { total: 0, badPhone: 0, alreadyInSystem: 0 } };
  const { rows, totals } = report;

  const data: ReportData = {
    columns: [
      { key: "registered", label: "วันที่สมัคร", format: (v) => dateTimeTh(v as string) },
      {
        key: "reason",
        label: "อาจจะเป็นเพราะ",
        format: (v) => (v ? String(v) : "—"),
      },
      { key: "phone", label: "หมายเลขโทรศัพท์" },
      { key: "first_name", label: "ชื่อ" },
      { key: "last_name", label: "นามสกุล" },
      { key: "email", label: "อีเมล" },
      {
        key: "type",
        label: "ประเภทลูกค้า",
        align: "center",
        format: (v) => REGISTER_TYPE_LABEL[String(v)] ?? "—",
      },
      {
        key: "already_in_system",
        label: "สถานะการสมัคร",
        align: "center",
        format: (v) => (v === "1" ? "มีเบอร์นี้ในระบบแล้ว" : "—"),
      },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      registered: r.registered,
      reason: r.reason,
      phone: r.phone,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      type: r.type,
      already_in_system: r.already_in_system ? "1" : "",
    })),
  };

  return (
    <ReportShell
      title="สมัครใหม่แต่ยืนยัน OTP ไม่ผ่าน"
      subtitle="ลูกค้าที่เริ่มสมัครสมาชิกแต่ยืนยัน OTP ไม่สำเร็จ (ยังไม่อยู่ในระบบ) — สำหรับ CS ติดตามลูกค้าที่ตกหล่น"
      range={range}
      pathname="/admin/reports/otp-failed"
      summary={[
        { label: "สมัครใหม่ทั้งหมด", value: intTh(totals.total), tone: "primary" },
        { label: "เบอร์ผิดรูปแบบ", value: intTh(totals.badPhone), tone: "red" },
        { label: "มีเบอร์นี้ในระบบแล้ว", value: intTh(totals.alreadyInSystem) },
        {
          label: "รอติดตาม (ยังไม่อยู่ในระบบ)",
          value: intTh(totals.total - totals.alreadyInSystem),
        },
      ]}
      data={data}
      csvSlug="otp-failed"
      emptyLabel="ไม่มีลูกค้าสมัครใหม่ที่ OTP ไม่ผ่านในช่วงเวลานี้"
      sourceNote={
        res.ok
          ? "Source: tb_register (สมัครค้างยังไม่ยืนยัน OTP) + ตรวจเบอร์ซ้ำกับ tb_users — port of report-otp-not-pass.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
