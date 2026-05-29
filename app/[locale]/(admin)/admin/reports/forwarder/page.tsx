/**
 * /admin/reports/forwarder — รายงานฝากนำเข้าสินค้า (Wave 20 P1 batch 2-b Tailwind rewrite)
 *
 * **Wave 20 P1 batch 2-b (2026-05-26 ค่ำ):** UI rewrite only — the underlying
 * tb_* schema reads (tb_forwarder + tb_users) are already correct and stay
 * intact. Replaces the .pcs-legacy / Bootstrap-4 / admin-base.css verbatim
 * transcription (~675 LOC) with the Pacred Tailwind v4 reports template
 * (mirrors `reports/refunds/page.tsx` Wave 20 P0-4 commit `8071a3d`).
 *
 * **Wave 23 P1 #137 (2026-05-27 ค่ำ · close-out Agent B):** drop the silent
 * `.limit(1000)` PostgREST cap → swap for `?offset=`-based pagination (200
 * rows per page) + a separate `count: "exact", head: true` query for the
 * grand total. Footer renders Prev/Next + "หน้า X จาก Y · แสดง M-N จาก T".
 * Mirrors the working pattern in `app/(admin)/admin/cnt-hs/page.tsx`.
 *
 * Why it mattered: with > 1000 forwarder rows in a date range, the staff
 * saw a silently truncated list and assumed the rest didn't exist (Wave 22
 * Agent D side-finding). Stat cards + CSV are now scoped to the visible
 * page — the only honest framing while paginated.
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

// ── Pagination constants (Wave 23 P1 #137) ───────────────────────────────
const PAGE_SIZE = 200;

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
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
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
  offset?: string;
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

  // Wave 23 P1 #137 — parse + clamp ?offset= (default 0, never negative).
  const offsetRaw = Number(sp.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

  // 1) Fetch tb_forwarder within window + status filter, paginated 200/page.
  //    Wave 23 P1 #137: dropped the silent `.limit(1000)` cap → `.range()`
  //    + a separate `count: "exact", head: true` query for the grand total.
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
    .range(offset, offset + PAGE_SIZE - 1);
  if (fStatus !== "all") {
    q = q.eq("fstatus", fStatus);
  }

  // 2) Exact-count head query (mirrors the same filter set so the footer
  //    total reflects the same window the table renders).
  let totalQ = admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .gte("fdate", `${dateFrom} 00:00:00`)
    .lte("fdate", `${dateTo} 23:59:59`);
  if (fStatus !== "all") {
    totalQ = totalQ.eq("fstatus", fStatus);
  }

  const [
    { data: fData, error: fErr },
    { count: grandTotal, error: countErr },
  ] = await Promise.all([q, totalQ]);

  if (fErr) {
    console.error(`[tb_forwarder list] failed`, {
      code: fErr.code, message: fErr.message, details: fErr.details,
    });
    throw new Error(`Failed to load tb_forwarder (${fErr.code ?? "unknown"}): ${fErr.message}`);
  }
  if (countErr) {
    // Count is a UX nicety, not load-bearing — log + fall through with 0.
    console.error(`[tb_forwarder count] failed`, {
      code: countErr.code, message: countErr.message,
    });
  }
  const forwarders = (fData ?? []) as unknown as RawForwarder[];
  const totalRows = grandTotal ?? forwarders.length;

  // 3) 2-pass tb_users join.
  const userIds = Array.from(new Set(forwarders.map((f) => f.userid).filter(Boolean) as string[]));
  const userMap = new Map<string, RawUser>();
  if (userIds.length > 0) {
    const { data: usersData, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[tb_users join] failed`, { code: usersErr.code, message: usersErr.message });
    } else {
      for (const u of (usersData ?? []) as RawUser[]) userMap.set(u.userID, u);
    }
  }

  // 4) Shape rows (legacy revenue = ftotalprice + ftransportprice + fpriceupdate - fdiscount).
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
        name: u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "",
        phone: u?.userTel ?? "",
      },
    };
  });

  const total = rows.reduce((s, r) => s + r.total_thb, 0);
  const sentCount = rows.filter((r) => r.fstatus === "7").length;

  // Wave 23 P1 #137 — pagination boundary + Prev/Next href builder.
  // Mirrors `app/(admin)/admin/cnt-hs/page.tsx` (the working canonical
  // pattern for offset-based admin lists).
  const hasPrev = offset > 0;
  const hasNext = offset + rows.length < totalRows;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const rangeFrom = totalRows === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + rows.length, totalRows);
  const buildPageHref = (newOffset: number): string => {
    const params = new URLSearchParams();
    if (sp.report_forwarderTable) params.set("report_forwarderTable", sp.report_forwarderTable);
    if (sp.fStatus)               params.set("fStatus", sp.fStatus);
    if (sp.date_from)             params.set("date_from", sp.date_from);
    if (sp.date_to)               params.set("date_to", sp.date_to);
    if (newOffset > 0)            params.set("offset", String(newOffset));
    const qs = params.toString();
    return qs ? `/admin/reports/forwarder?${qs}` : "/admin/reports/forwarder";
  };

  // 5) CSV (page-scoped — see file header doc for why).
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

      {/* Wave 23 P1 #137 — pagination notice (replaces the silent 1000-cap). */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
        <span aria-hidden>✗</span>
        <div className="flex-1">
          <span className="font-semibold">ลบเพดาน 1,000 แถวต่อหน้าแล้ว</span> ·
          แบ่งหน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ ·
          ใช้ปุ่ม &ldquo;ก่อนหน้า / ถัดไป&rdquo; ใต้ตารางเพื่อดูทั้งหมด.
          <span className="text-emerald-700/80">{" "}(Wave 22 Agent D side-finding · #137)</span>
        </div>
      </div>

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

      {/* Stat cards (page-scoped) — clarified copy after Wave 23 P1 #137
          pagination landed; ยอดรวม / ส่งแล้ว reflect the visible page only,
          ทั้งหมด shows the grand total across the date+status filter. */}
      <div className="grid sm:grid-cols-4 gap-3">
        <Card label="ทั้งหมด (ทุกหน้า)" value={totalRows.toLocaleString("th-TH")} />
        <Card label={`หน้านี้ (${rangeFrom.toLocaleString("th-TH")}–${rangeTo.toLocaleString("th-TH")})`} value={String(rows.length)} />
        <Card label="ยอดรวม (หน้านี้)" value={thb(total)} />
        <Card label="ส่งแล้ว (หน้านี้)" value={String(sentCount)} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในช่วงเวลานี้</p>
        ) : (
          <>
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

            {/* Wave 23 P1 #137 — Prev/Next footer (only when there's >1 page). */}
            {(hasPrev || hasNext) && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted flex-wrap">
                <span>
                  หน้า <span className="font-semibold text-foreground">{pageNumber.toLocaleString("th-TH")}</span> จาก{" "}
                  <span className="font-semibold text-foreground">{totalPages.toLocaleString("th-TH")}</span>
                  {" · "}
                  แสดง <span className="font-semibold text-foreground">{rangeFrom.toLocaleString("th-TH")}</span>
                  –<span className="font-semibold text-foreground">{rangeTo.toLocaleString("th-TH")}</span> จากทั้งหมด{" "}
                  <span className="font-semibold text-foreground">{totalRows.toLocaleString("th-TH")}</span>
                </span>
                <div className="flex gap-2">
                  {hasPrev ? (
                    <Link
                      href={buildPageHref(prevOffset)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                    >
                      ← ก่อนหน้า
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium opacity-40 pointer-events-none"
                    >
                      ← ก่อนหน้า
                    </span>
                  )}
                  {hasNext ? (
                    <Link
                      href={buildPageHref(nextOffset)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                    >
                      ถัดไป →
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium opacity-40 pointer-events-none"
                    >
                      ถัดไป →
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] text-muted">
        หน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ · ใช้ตัวกรองช่วงวันที่/สถานะเพื่อจำกัดผลลัพธ์ ·
        CSV ดาวน์โหลดเฉพาะหน้าที่แสดง (หากต้องการครบทุกหน้า ให้ไล่กดถัดไปแล้วโหลดทีละหน้า)
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
