/**
 * /admin/reports/shop — รายงานฝากสั่งซื้อสินค้า (Wave 20 P1 batch 2-b Tailwind rewrite)
 *
 * **Wave 20 P1 batch 2-b (2026-05-26 ค่ำ):** UI rewrite only — the underlying
 * tb_* schema reads (tb_header_order + tb_users + tb_order amount aggregate)
 * are already correct and stay intact. Replaces the .pcs-legacy / Bootstrap-4
 * verbatim transcription (~723 LOC) with the Pacred Tailwind v4 reports
 * template (mirrors `reports/refunds/page.tsx` Wave 20 P0-4 commit `8071a3d`).
 *
 * **Wave 24 #189 (2026-05-27 ค่ำ):** drop the silent `.limit(1000)` PostgREST
 * cap → swap for `?offset=`-based pagination (200 rows per page) + a separate
 * `count: "exact", head: true` query for the grand total. Footer renders
 * Prev/Next + "หน้า X จาก Y · แสดง M-N จาก T". Same pattern Agent B used on
 * `/admin/reports/forwarder` (commit `399ed01`) and `/admin/reports/payment`
 * (#185 · `22dd746`).
 *
 * **Workflow preserved (per AGENTS §0a):** same hStatus filter set
 * (all / 1-6 / 2plus), same date range default = month-to-date, same
 * tb_header_order columns, same per-hno SUM(cAmount) from tb_order child rows.
 *
 * **Data fidelity (unchanged):**
 *   - tb_header_order ledger filtered by date range + hstatus (1/2/2plus/3-6/all)
 *   - tb_users 2-pass join on userid
 *   - tb_order 2-pass aggregate SUM(camount) per hno (legacy "จำนวนชิ้น" column)
 *   - 2plus branch: hstatus > 2 AND hstatus < 6 (paid+ rows)
 *
 * §0c compliance: every Supabase query destructures { data, error }, logs +
 * throws on the load-bearing reads.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";
import { legacyOrderStatusThai } from "@/lib/legacy-status-map";
import { parsePage } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

export const dynamic = "force-dynamic";

// ── Pagination constants (Wave 24 #189) ──────────────────────────────────
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
function intFmt(n: number): string {
  return Math.round(n).toLocaleString("th-TH");
}

// tb_header_order.hstatus badge palette.
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอดำเนินการ
  "2": "bg-red-50 text-red-700 border-red-200",           // รอชำระเงิน
  "3": "bg-blue-50 text-blue-700 border-blue-200",        // สั่งสินค้า
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200",  // รอร้านจีนจัดส่ง
  "5": "bg-green-50 text-green-700 border-green-200",     // สำเร็จ
  "6": "bg-gray-50 text-gray-600 border-gray-200",        // ยกเลิก
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all",   label: "ทั้งหมด" },
  { value: "1",     label: "รอดำเนินการ" },
  { value: "2",     label: "รอชำระเงิน" },
  { value: "2plus", label: "ยอดที่ชำระเงินแล้วขึ้นไป" },
  { value: "3",     label: "สั่งสินค้า" },
  { value: "4",     label: "รอร้านจีนจัดส่ง" },
  { value: "5",     label: "สำเร็จ" },
  { value: "6",     label: "ยกเลิกออเดอร์" },
];

function statusFilterLabel(s: string): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? "ทั้งหมด";
}

// ── Row shapes ───────────────────────────────────────────────────────────

type RawHeaderOrder = {
  id: number;
  hno: string;
  htitle: string | null;
  hcover: string | null;
  hcount: number;
  hstatus: string;
  hdate: string | null;
  hdatepayment: string | null;
  htotalpricechn: number | string | null;
  hshippingchn: number | string | null;
  hrate: number | string | null;
  htotalpriceuser: number | string | null;
  hcostallth: number | string | null;
  adminidupdate: string | null;
  userid: string;
};

type RawUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

type Row = RawHeaderOrder & {
  amount_total: number;
  price_total: number;
  customer: {
    name: string;
    phone: string;
  };
};

type SP = {
  report_shopsTable?: string;
  hStatus?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
};

// ── Page ─────────────────────────────────────────────────────────────────

export default async function AdminReportShopPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const submitted = sp.report_shopsTable === "true";
  const dateFrom  = sp.date_from ?? firstDayOfThisMonth();
  const dateTo    = sp.date_to   ?? lastDayOfThisMonth();
  const hStatus   = sp.hStatus   ?? "all";

  // Pagination (2026-06-03 · unified with shared <Pagination> · ?page=N).
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  // 1) Fetch tb_header_order within date window with optional status filter.
  //    Wave 24 #189: dropped the silent `.limit(1000)` cap → `.range()` +
  //    a separate `count: "exact", head: true` query for the grand total.
  let q = admin
    .from("tb_header_order")
    .select(
      "id, hno, htitle, hcover, hcount, hstatus, hdate, hdatepayment, " +
      "htotalpricechn, hshippingchn, hrate, htotalpriceuser, hcostallth, " +
      "adminidupdate, userid",
    )
    .gte("hdate", `${dateFrom} 00:00:00`)
    .lte("hdate", `${dateTo} 23:59:59`)
    .order("hdate", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (hStatus === "2plus") {
    q = q.gt("hstatus", "2").lt("hstatus", "6");
  } else if (hStatus !== "all") {
    q = q.eq("hstatus", hStatus);
  }

  // 2) Exact-count head query (mirrors the same filter set so the footer
  //    total reflects the same window the table renders).
  let totalQ = admin
    .from("tb_header_order")
    .select("id", { count: "exact", head: true })
    .gte("hdate", `${dateFrom} 00:00:00`)
    .lte("hdate", `${dateTo} 23:59:59`);
  if (hStatus === "2plus") {
    totalQ = totalQ.gt("hstatus", "2").lt("hstatus", "6");
  } else if (hStatus !== "all") {
    totalQ = totalQ.eq("hstatus", hStatus);
  }

  const [
    { data: hData, error: hErr },
    { count: grandTotal, error: countErr },
  ] = await Promise.all([q, totalQ]);

  if (hErr) {
    console.error(`[tb_header_order list] failed`, {
      code: hErr.code, message: hErr.message, details: hErr.details,
    });
    throw new Error(`Failed to load tb_header_order (${hErr.code ?? "unknown"}): ${hErr.message}`);
  }
  if (countErr) {
    // Count is a UX nicety, not load-bearing — log + fall through.
    console.error(`[tb_header_order count] failed`, {
      code: countErr.code, message: countErr.message,
    });
  }
  const headers = (hData ?? []) as unknown as RawHeaderOrder[];
  const totalRows = grandTotal ?? headers.length;

  // 2) 2-pass tb_users join.
  const userIds = Array.from(new Set(headers.map((h) => h.userid).filter(Boolean)));
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

  // 3) 2-pass tb_order aggregate SUM(camount) per hno (legacy "จำนวนชิ้น").
  const hnos = Array.from(new Set(headers.map((h) => h.hno).filter(Boolean)));
  const amountByHno = new Map<string, number>();
  if (hnos.length > 0) {
    const { data: orderData, error: orderErr } = await admin
      .from("tb_order")
      .select("hno, camount")
      .in("hno", hnos);
    if (orderErr) {
      console.error(`[tb_order aggregate] failed`, { code: orderErr.code, message: orderErr.message });
    } else {
      for (const r of (orderData ?? []) as Array<{ hno: string; camount: number }>) {
        amountByHno.set(r.hno, (amountByHno.get(r.hno) ?? 0) + Number(r.camount ?? 0));
      }
    }
  }

  // 4) Shape rows.
  const rows: Row[] = headers.map((h) => {
    const u = userMap.get(h.userid);
    // Legacy price formula L228: (htotalpricechn + hshippingchn) * hrate, but
    // when htotalpriceuser is populated prefer that (Wave 19 service-orders
    // logic — it's the customer-facing final price).
    const computed =
      (Number(h.htotalpricechn ?? 0) + Number(h.hshippingchn ?? 0)) *
      Number(h.hrate ?? 0);
    const priceTotal =
      Number(h.htotalpriceuser ?? 0) ||
      Number(h.hcostallth ?? 0) ||
      computed;
    return {
      ...h,
      amount_total: amountByHno.get(h.hno) ?? 0,
      price_total: priceTotal,
      customer: {
        name: u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "",
        phone: u?.userTel ?? "",
      },
    };
  });

  const total = rows.reduce((s, r) => s + r.price_total, 0);
  const successCount = rows.filter((r) => r.hstatus === "5").length;

  // Wave 24 #189 — pagination boundary + Prev/Next href builder. Mirrors
  // /admin/reports/payment commit 22dd746 (which mirrors /reports/forwarder
  // 399ed01 · which mirrors cnt-hs/page.tsx).
  const rangeFrom = totalRows === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + rows.length, totalRows);

  // 5) CSV.
  const csvRows = rows.map((r) => ({
    hdate:     r.hdate ?? "",
    hno:       r.hno,
    userid:    r.userid,
    name:      r.customer.name,
    phone:     r.customer.phone,
    htitle:    r.htitle ?? "",
    hcount:    r.hcount,
    amount:    r.amount_total,
    price:     r.price_total,
    hstatus:   legacyOrderStatusThai(r.hstatus),
    admin:     r.adminidupdate ?? "",
  }));
  const csvCols = [
    { key: "hdate",   label: "วันที่สร้าง" },
    { key: "hno",     label: "เลขที่ออเดอร์" },
    { key: "userid",  label: "รหัสลูกค้า" },
    { key: "name",    label: "ชื่อลูกค้า" },
    { key: "phone",   label: "เบอร์" },
    { key: "htitle",  label: "สินค้า" },
    { key: "hcount",  label: "จำนวนรายการ" },
    { key: "amount",  label: "จำนวนชิ้น (SUM)" },
    { key: "price",   label: "ราคารวม (บาท)" },
    { key: "hstatus", label: "สถานะ" },
    { key: "admin",   label: "อัปเดตโดย" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">รายงานฝากสั่งซื้อสินค้า</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">tb_header_order</span> · ฟิลเตอร์ตามสถานะ + ช่วงวันที่สร้างออเดอร์
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Filter banner (when submitted) */}
      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ผลลัพธ์การค้นหา · สถานะ: <span className="font-semibold">{statusFilterLabel(hStatus)}</span>
          {" · "}
          ช่วงวันที่: <span className="font-semibold">{dateFrom}</span> ถึง <span className="font-semibold">{dateTo}</span>
        </div>
      )}

      {/* Wave 24 #189 — pagination notice (replaces the silent 1000-cap). */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
        <span aria-hidden>✓</span>
        <div className="flex-1">
          <span className="font-semibold">ลบเพดาน 1,000 แถวต่อหน้าแล้ว</span> ·
          แบ่งหน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ ·
          ใช้ปุ่ม &ldquo;ก่อนหน้า / ถัดไป&rdquo; ใต้ตารางเพื่อดูทั้งหมด.
          <span className="text-emerald-700/80">{" "}(Wave 24 #189)</span>
        </div>
      </div>

      {/* Filter form (GET) */}
      <form method="GET" action="/admin/reports/shop" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="hStatus" className="block text-xs text-muted mb-1">สถานะ</label>
            <select
              id="hStatus"
              name="hStatus"
              defaultValue={hStatus}
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
            name="report_shopsTable"
            value="true"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton rows={csvRows} cols={csvCols} filename={`shop-orders-${dateFrom}-${dateTo}.csv`} />
        </div>
      </form>

      {/* Stat cards — Wave 24 #189 added "ทั้งหมด (ทุกหน้า)" so the grand
          total isn't misread as the page subtotal; other cards relabeled to
          page-scoped framing. */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="ทั้งหมด (ทุกหน้า)" value={totalRows.toLocaleString("th-TH")} />
        <Card label={`หน้านี้ (${rangeFrom.toLocaleString("th-TH")}–${rangeTo.toLocaleString("th-TH")})`} value={String(rows.length)} />
        <Card label="ยอดรวม (หน้านี้)" value={thb(total)} />
        <Card label="สำเร็จ (หน้านี้)" value={String(successCount)} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีออเดอร์ในช่วงเวลานี้</p>
        ) : (
          <>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่สร้าง</th>
                  <th className="px-4 py-3">เลขที่ออเดอร์</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">สินค้า</th>
                  <th className="px-4 py-3 text-right">จำนวนชิ้น</th>
                  <th className="px-4 py-3 text-right">ราคารวม</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">อัปเดตโดย</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const extraTitle = r.hcount > 1 ? ` และอีก ${r.hcount - 1} รายการ` : "";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {r.hdate ? new Date(r.hdate).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/service-orders/${encodeURIComponent(r.hno)}`} className="text-primary-600 hover:underline">
                          {r.hno}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Link href={`/admin/customers/${r.userid}`} className="text-primary-600 hover:underline">
                          {r.customer.name || "—"}
                        </Link>
                        <div className="font-mono text-[10px] text-muted">{r.userid}</div>
                        {r.customer.phone && <div className="text-[10px] text-muted">☎ {r.customer.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs">
                        <Link href={`/admin/service-orders/${encodeURIComponent(r.hno)}`} className="text-primary-600 hover:underline">
                          <span className="line-clamp-2">{r.htitle}{extraTitle}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">{intFmt(r.amount_total)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{thb(r.price_total)}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_CLS[r.hstatus] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          {legacyOrderStatusThai(r.hstatus) || r.hstatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{r.adminidupdate ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={totalRows}
            basePath="/admin/reports/shop"
            params={{
              report_shopsTable: sp.report_shopsTable,
              hStatus: sp.hStatus,
              date_from: sp.date_from,
              date_to: sp.date_to,
            }}
          />
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
