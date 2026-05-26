/**
 * /admin/reports/forwarder — รายงานฝากนำเข้าสินค้า (Wave 20 P1 batch 2-b Tailwind rewrite)
 *
 * **Wave 20 P1 batch 2-b (2026-05-26 ค่ำ):** UI rewrite only — the underlying
 * tb_* schema reads (tb_forwarder + tb_users) are already correct and stay
 * intact. Replaces the .pcs-legacy / Bootstrap-4 / admin-base.css verbatim
 * transcription (~675 LOC) with the Pacred Tailwind v4 reports template
 * (mirrors `reports/refunds/page.tsx` Wave 20 P0-4 commit `8071a3d`).
 *
 * **Workflow preserved (per AGENTS §0a):** same fStatus filter set
 * (all / 1-7), same date range default = month-to-date, same tb_forwarder
 * columns, same role gate.
 *
 * **Data fidelity (unchanged):**
 *   - tb_forwarder ledger filtered by date range + fstatus (1-7/all)
 *   - tb_users 2-pass join on userid
 *   - Default window = month-to-date when no submit
 *
 * §0c compliance: every Supabase query destructures { data, error }, logs +
 * throws on the load-bearing reads.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";

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

// tb_forwarder.fstatus badge palette.
const STATUS_CLS: Record<string, string> = {
  "1": "bg-blue-50 text-blue-700 border-blue-200",         // รอเข้าโกดังจีน
  "2": "bg-blue-50 text-blue-700 border-blue-200",         // ถึงโกดังจีน
  "3": "bg-indigo-50 text-indigo-700 border-indigo-200",   // กำลังส่งมาไทย
  "4": "bg-purple-50 text-purple-700 border-purple-200",   // ถึงไทย
  "5": "bg-yellow-50 text-yellow-700 border-yellow-200",   // รอชำระเงิน
  "6": "bg-orange-50 text-orange-700 border-orange-200",   // เตรียมส่ง
  "7": "bg-green-50 text-green-700 border-green-200",      // ส่งแล้ว
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1",   label: "รอสินค้าเข้าโกดังจีน" },
  { value: "2",   label: "สินค้าถึงโกดังจีนแล้ว" },
  { value: "3",   label: "กำลังส่งมาประเทศไทย" },
  { value: "4",   label: "สินค้าถึงประเทศไทยแล้ว" },
  { value: "5",   label: "รอชำระเงิน" },
  { value: "6",   label: "เตรียมส่ง" },
  { value: "7",   label: "ส่งแล้ว" },
];

function statusFilterLabel(s: string): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? "ทั้งหมด";
}

// ── Row shapes ───────────────────────────────────────────────────────────

type RawForwarder = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  fdetail: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fdiscount: number | string | null;
  adminidupdate: string | null;
  userid: string | null;
};

type RawUser = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
};

type Row = RawForwarder & {
  total_thb: number;
  customer: {
    name: string;
    phone: string;
  };
};

type SP = {
  report_forwarderTable?: string;
  fStatus?: string;
  date_from?: string;
  date_to?: string;
};

// ── Page ─────────────────────────────────────────────────────────────────

export default async function ReportForwarderPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const submitted = sp.report_forwarderTable === "true";
  const dateFrom  = sp.date_from ?? firstDayOfThisMonth();
  const dateTo    = sp.date_to   ?? lastDayOfThisMonth();
  const fStatus   = sp.fStatus   ?? "all";

  // 1) Fetch tb_forwarder within window, optional status filter.
  let q = admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fstatus, fdetail, ftrackingchn, ftrackingth, " +
      "ftotalprice, ftransportprice, fpriceupdate, fdiscount, " +
      "adminidupdate, userid",
    )
    .gte("fdate", `${dateFrom} 00:00:00`)
    .lte("fdate", `${dateTo} 23:59:59`)
    .order("fdate", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (fStatus !== "all") {
    q = q.eq("fstatus", fStatus);
  }
  const { data: fData, error: fErr } = await q;
  if (fErr) {
    console.error(`[tb_forwarder list] failed`, {
      code: fErr.code, message: fErr.message, details: fErr.details,
    });
    throw new Error(`Failed to load tb_forwarder (${fErr.code ?? "unknown"}): ${fErr.message}`);
  }
  const forwarders = (fData ?? []) as unknown as RawForwarder[];

  // 2) 2-pass tb_users join.
  const userIds = Array.from(new Set(forwarders.map((f) => f.userid).filter(Boolean) as string[]));
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

  // 3) Shape rows (legacy revenue = ftotalprice + ftransportprice + fpriceupdate - fdiscount).
  const rows: Row[] = forwarders.map((f) => {
    const u = f.userid ? userMap.get(f.userid) : undefined;
    const totalThb =
      Number(f.ftotalprice ?? 0) +
      Number(f.ftransportprice ?? 0) +
      Number(f.fpriceupdate ?? 0) -
      Number(f.fdiscount ?? 0);
    return {
      ...f,
      total_thb: totalThb,
      customer: {
        name: u ? `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() : "",
        phone: u?.usertel ?? "",
      },
    };
  });

  const total = rows.reduce((s, r) => s + r.total_thb, 0);
  const sentCount = rows.filter((r) => r.fstatus === "7").length;

  // 4) CSV.
  const csvRows = rows.map((r) => ({
    fdate:        r.fdate ?? "",
    id:           r.id,
    userid:       r.userid ?? "",
    name:         r.customer.name,
    phone:        r.customer.phone,
    fdetail:      r.fdetail ?? "",
    ftrackingchn: r.ftrackingchn ?? "",
    ftrackingth:  r.ftrackingth ?? "",
    total:        r.total_thb,
    fstatus:      legacyForwarderStatusThai(r.fstatus ?? ""),
    admin:        r.adminidupdate ?? "",
  }));
  const csvCols = [
    { key: "fdate",        label: "วันที่สร้าง" },
    { key: "id",           label: "รหัสรายการ" },
    { key: "userid",       label: "รหัสลูกค้า" },
    { key: "name",         label: "ชื่อลูกค้า" },
    { key: "phone",        label: "เบอร์" },
    { key: "fdetail",      label: "รายละเอียด" },
    { key: "ftrackingchn", label: "เลขพัสดุ (จีน)" },
    { key: "ftrackingth",  label: "เลขพัสดุ (ไทย)" },
    { key: "total",        label: "ยอดรวม (บาท)" },
    { key: "fstatus",      label: "สถานะ" },
    { key: "admin",        label: "อัปเดต" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">รายงานฝากนำเข้าสินค้า</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">tb_forwarder</span> · ฟิลเตอร์ตามสถานะ + ช่วงวันที่สร้างออเดอร์
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Filter banner (when submitted) */}
      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ผลลัพธ์การค้นหา · สถานะ: <span className="font-semibold">{statusFilterLabel(fStatus)}</span>
          {" · "}
          ช่วงวันที่: <span className="font-semibold">{dateFrom}</span> ถึง <span className="font-semibold">{dateTo}</span>
        </div>
      )}

      {/* Filter form (GET) */}
      <form method="GET" action="/admin/reports/forwarder" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="fStatus" className="block text-xs text-muted mb-1">สถานะ</label>
            <select
              id="fStatus"
              name="fStatus"
              defaultValue={fStatus}
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
            name="report_forwarderTable"
            value="true"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton rows={csvRows} cols={csvCols} filename={`forwarder-${dateFrom}-${dateTo}.csv`} />
        </div>
      </form>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="จำนวนรายการ" value={String(rows.length)} />
        <Card label="ยอดรวม" value={thb(total)} />
        <Card label="ส่งแล้ว" value={String(sentCount)} />
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
                  <th className="px-4 py-3">วันที่สร้าง</th>
                  <th className="px-4 py-3">ออเดอร์</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3">เลขพัสดุ</th>
                  <th className="px-4 py-3 text-right">ยอดรวม</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">อัปเดต</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                      {r.fdate ? new Date(r.fdate).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/forwarders/${r.id}`} className="text-primary-600 hover:underline">
                        #{r.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.userid ? (
                        <Link href={`/admin/customers/${r.userid}`} className="text-primary-600 hover:underline">
                          {r.customer.name || "—"}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      <div className="font-mono text-[10px] text-muted">{r.userid ?? ""}</div>
                      {r.customer.phone && <div className="text-[10px] text-muted">☎ {r.customer.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-xs truncate" title={r.fdetail ?? ""}>
                      {r.fdetail ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {r.ftrackingth  && <div>TH: {r.ftrackingth}</div>}
                      {r.ftrackingchn && <div className="text-muted">CN: {r.ftrackingchn}</div>}
                      {!r.ftrackingth && !r.ftrackingchn && <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{thb(r.total_thb)}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_CLS[r.fstatus ?? ""] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {legacyForwarderStatusThai(r.fstatus ?? "") || r.fstatus || "—"}
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
