/**
 * Gap #8 — ยืนยัน OTP แล้ว (OTP success log)
 *
 * Faithful port of legacy `report-otp-success.php`. Lists every successful
 * OTP verification with the customer it belongs to. Useful for:
 *   - Onboarding funnel visibility (registered → OTP verified).
 *   - SMS-cost auditing (every row = one SMS Pacred paid for).
 *
 * Legacy SQL:
 *   SELECT date, userTel, userName, userLastName, u.userID
 *   FROM tb_users_otp uo LEFT JOIN tb_users u ON u.userID=uo.userID;
 *
 * Pacred mapping:
 *   - tb_users_otp.userID → look up profiles by phone (legacy stored userID
 *     keying; Pacred OTPs are phone-keyed because the OTP precedes signup).
 *   - tb_users_otp.date   → otp_codes.created_at (only `used=true` rows).
 *
 * Date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 30 days).
 *
 * Role gate: super, ops (operational — phone numbers visible).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { getOtpSuccessReport } from "@/actions/admin/reports";
import {
  resolveDateRange, intTh, dateTimeTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const PURPOSE_LABEL: Record<string, string> = {
  register:     "ลงทะเบียน",
  login:        "เข้าสู่ระบบ",
  reset:        "รีเซ็ตรหัสผ่าน",
  change_phone: "เปลี่ยนเบอร์",
};

export default async function OtpSuccessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "ops"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getOtpSuccessReport(range);

  const rows = res.ok ? res.data : [];

  // Per-purpose breakdown for the summary cards.
  const byPurpose = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.purpose] = (acc[r.purpose] ?? 0) + 1;
    return acc;
  }, {});
  const registerCount = byPurpose["register"] ?? 0;
  const loginCount    = byPurpose["login"]    ?? 0;
  const resetCount    = byPurpose["reset"]    ?? 0;

  // Estimated SMS spend at ~฿0.50/SMS (very rough — actual cost depends on
  // gateway tier). Just a sanity-check pulse for the ITDT team.
  const smsCostEstimate = rows.length * 0.50;

  const data: ReportData = {
    columns: [
      { key: "date",          label: "วันที่ยืนยันตัวตน", format: (v) => dateTimeTh(v as string) },
      { key: "member_code",   label: "รหัสสมาชิก" },
      { key: "phone",         label: "หมายเลขโทรศัพท์" },
      { key: "customer_name", label: "ชื่อ-นามสกุล" },
      { key: "purpose",       label: "วัตถุประสงค์", format: (v) => PURPOSE_LABEL[String(v)] ?? String(v) },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      date:          r.date,
      member_code:   r.member_code,
      phone:         r.phone,
      customer_name: r.customer_name,
      purpose:       r.purpose,
    })),
  };

  return (
    <ReportShell
      title="ยืนยัน OTP แล้ว"
      subtitle="รายการ OTP ที่ใช้ยืนยันสำเร็จ (ใช้สำหรับ funnel ลงทะเบียน + ตรวจสอบค่า SMS)"
      range={range}
      pathname="/admin/reports/otp-success"
      summary={[
        { label: "OTP สำเร็จทั้งหมด", value: intTh(rows.length) },
        { label: "ลงทะเบียน",         value: intTh(registerCount) },
        { label: "เข้าสู่ระบบ + รีเซ็ต", value: intTh(loginCount + resetCount) },
        { label: "ค่า SMS (ประมาณ)",  value: "฿" + smsCostEstimate.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), tone: "red" },
      ]}
      data={data}
      csvSlug="otp-success"
      emptyLabel="ไม่มีการยืนยัน OTP ในช่วงเวลานี้"
      sourceNote={
        res.ok
          ? "Source: otp_codes (used=true) → join profiles by phone — port of report-otp-success.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
