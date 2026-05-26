/**
 * /admin/reports/payment — รายงานฝากชำระเงิน (Wave 20 P1 batch 2-b Tailwind rewrite)
 *
 * **Wave 20 P1 batch 2-b (2026-05-26 ค่ำ):** UI rewrite only — the underlying
 * tb_* schema reads (tb_payment + tb_users) are already correct and stay
 * intact. Replaces the .pcs-legacy / Bootstrap-4 / admin-base.css verbatim
 * transcription (~696 LOC) with the Pacred Tailwind v4 reports template
 * (mirrors `reports/refunds/page.tsx` Wave 20 P0-4 commit `8071a3d`).
 *
 * **Workflow preserved (per AGENTS §0a):** same logic, same filters, same
 * data fields, same role gate — only the chrome moves from Bootstrap-4 to
 * Tailwind. The legacy .pcs-legacy / admin-base.css / DataTables / jQuery
 * scripts are removed; horizontal scroll uses .scrollbar-x-visible.
 *
 * **Data fidelity (unchanged):**
 *   - tb_payment ledger filtered by date range + paystatus (1/2/3/all)
 *   - tb_users 2-pass join on userid (PostgREST can't auto-join legacy text FK)
 *   - Default window = month-to-date when no submit
 *   - Filter banner shows ผลลัพธ์การค้นหา when ?report_paymentTable=true
 *
 * §0c compliance: every Supabase query destructures { data, error }, logs +
 * throws on the load-bearing reads.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────

function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastDayOfThisMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// tb_payment.paystatus enum.
const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "2": "bg-green-50 text-green-700 border-green-200",
  "3": "bg-red-50 text-red-700 border-red-200",
};

// tb_payment.paytype enum (channel).
const TYPE_LABEL: Record<string, string> = {
  "1": "จ่ายผ่านเว็บไซต์จีน",
  "2": "Alipay ร้านค้าจีน",
  "3": "อื่นๆ",
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1",   label: "รอดำเนินการ" },
  { value: "2",   label: "สำเร็จ" },
  { value: "3",   label: "ไม่สำเร็จ" },
];

// ── Row shapes ───────────────────────────────────────────────────────────

type RawPayment = {
  id: number;
  paydate: string | null;
  paystatus: string;
  paytype: string;
  paydetail: string | null;
  paythb: number | string | null;
  userid: string;
  adminidupdate: string | null;
};

type RawUser = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
};

type Row = RawPayment & {
  customer: {
    name: string;
    phone: string;
  };
};

type SP = {
  report_paymentTable?: string;
  payStatus?: string;
  date_from?: string;
  date_to?: string;
};

// ── Page ─────────────────────────────────────────────────────────────────

export default async function AdminReportPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Resolve date window + status — default = month-to-date, no status filter.
  const submitted = sp.report_paymentTable === "true";
  const dateFrom  = sp.date_from ?? firstDayOfThisMonth();
  const dateTo    = sp.date_to   ?? lastDayOfThisMonth();
  const payStatus = sp.payStatus ?? "all";

  // 1) Fetch tb_payment within window, optional status filter.
  let q = admin
    .from("tb_payment")
    .select("id, paydate, paystatus, paytype, paydetail, paythb, userid, adminidupdate")
    .gte("paydate", `${dateFrom} 00:00:00`)
    .lte("paydate", `${dateTo} 23:59:59`)
    .order("paydate", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (payStatus !== "all") {
    q = q.eq("paystatus", payStatus);
  }
  const { data: payData, error: payErr } = await q;
  if (payErr) {
    console.error(`[tb_payment list] failed`, {
      code: payErr.code, message: payErr.message, details: payErr.details,
    });
    throw new Error(`Failed to load tb_payment (${payErr.code ?? "unknown"}): ${payErr.message}`);
  }
  const payments = (payData ?? []) as RawPayment[];

  // 2) 2-pass tb_users join on userid (PostgREST can't auto-join legacy text FK).
  const userIds = Array.from(new Set(payments.map((p) => p.userid).filter(Boolean)));
  const userMap = new Map<string, RawUser>();
  if (userIds.length > 0) {
    const { data: usersData, error: usersErr } = await admin
      .from("tb_users")
      .select("userid, username, userlastname, usertel")
      .in("userid", userIds);
    if (usersErr) {
      console.error(`[tb_users join] failed`, { code: usersErr.code, message: usersErr.message });
    } else {
      for (const u of (usersData ?? []) as RawUser[]) userMap.set(u.userid, u);
    }
  }

  // 3) Shape rows.
  const rows: Row[] = payments.map((p) => {
    const u = userMap.get(p.userid);
    return {
      ...p,
      customer: {
        name: u ? `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() : "",
        phone: u?.usertel ?? "",
      },
    };
  });

  const total = rows.reduce((s, r) => s + Number(r.paythb ?? 0), 0);
  const successCount = rows.filter((r) => r.paystatus === "2").length;

  // 4) CSV.
  const csvRows = rows.map((r) => ({
    id:       r.id,
    paydate:  r.paydate ?? "",
    userid:   r.userid,
    name:     r.customer.name,
    phone:    r.customer.phone,
    paytype:  TYPE_LABEL[r.paytype] ?? r.paytype,
    paydetail: r.paydetail ?? "",
    paythb:   Number(r.paythb ?? 0),
    paystatus: STATUS_LABEL[r.paystatus] ?? r.paystatus,
    admin:    r.adminidupdate ?? "",
  }));
  const csvCols = [
    { key: "paydate",   label: "วันที่" },
    { key: "id",        label: "รหัสรายการ" },
    { key: "userid",    label: "รหัสลูกค้า" },
    { key: "name",      label: "ชื่อลูกค้า" },
    { key: "phone",     label: "เบอร์" },
    { key: "paytype",   label: "ประเภท" },
    { key: "paydetail", label: "รายละเอียด" },
    { key: "paythb",    label: "จำนวนเงิน (บาท)" },
    { key: "paystatus", label: "สถานะ" },
    { key: "admin",     label: "admin ผู้ทำรายการ" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">รายงานฝากชำระเงิน</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">tb_payment</span> · ฟิลเตอร์ตามสถานะ + ช่วงวันที่ทำรายการ
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Filter banner (when submitted) */}
      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ผลลัพธ์การค้นหา · สถานะ: <span className="font-semibold">{STATUS_LABEL[payStatus] ?? "ทั้งหมด"}</span>
          {" · "}
          ช่วงวันที่: <span className="font-semibold">{dateFrom}</span> ถึง <span className="font-semibold">{dateTo}</span>
        </div>
      )}

      {/* Filter form (GET) */}
      <form method="GET" action="/admin/reports/payment" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="payStatus" className="block text-xs text-muted mb-1">สถานะ</label>
            <select
              id="payStatus"
              name="payStatus"
              defaultValue={payStatus}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date_from" className="block text-xs text-muted mb-1">ตั้งแต่</label>
            <input
              id="date_from"
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="date_to" className="block text-xs text-muted mb-1">ถึง</label>
            <input
              id="date_to"
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="submit"
            name="report_paymentTable"
            value="true"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton rows={csvRows} cols={csvCols} filename={`payments-${dateFrom}-${dateTo}.csv`} />
        </div>
      </form>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="จำนวนรายการ" value={String(rows.length)} />
        <Card label="ยอดรวม" value={thb(total)} />
        <Card label="สำเร็จ" value={String(successCount)} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในช่วงเวลานี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3 text-right">จำนวนเงิน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">อัปเดต</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                      {r.paydate ? new Date(r.paydate).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/payment/update/${r.id}`} className="text-primary-600 hover:underline">
                        {r.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Link href={`/admin/customers/${r.userid}`} className="text-primary-600 hover:underline">
                        {r.customer.name || "—"}
                      </Link>
                      <div className="font-mono text-[10px] text-muted">{r.userid}</div>
                      {r.customer.phone && <div className="text-[10px] text-muted">☎ {r.customer.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-xs truncate" title={r.paydetail ?? ""}>
                      {r.paydetail ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {TYPE_LABEL[r.paytype] ?? r.paytype}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-red-700">
                      -{thb(Number(r.paythb ?? 0))}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_CLS[r.paystatus] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {STATUS_LABEL[r.paystatus] ?? r.paystatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{r.adminidupdate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน 1,000 รายการต่อหน้า · ใช้ตัวกรองช่วงวันที่เพื่อจำกัดผลลัพธ์
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
