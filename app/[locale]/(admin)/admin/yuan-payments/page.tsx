/**
 * /admin/yuan-payments — รายการฝากโอนหยวน (faithful port · Wave 7.1 · 2026-05-21 night)
 *
 * ภูม flagged 2026-05-21 night: "หน้าฝากโอนนี้ไม่เห็นมีรายการอะไรเลย แต่พอ
 * /822 ตามแกบอกถึงมีข้อมูลมาให้". Root cause: the original list read the
 * rebuilt `yuan_payments` table which is empty on prod (the real ~1,460
 * payments live in `tb_payment` after the D1 pivot). Rewritten to read
 * tb_payment directly + join tb_users by userid (same 2-query merge
 * pattern as `/admin/forwarders` since PostgREST FK auto-join is unreliable
 * across the legacy schema).
 *
 * The matching `/admin/yuan-payments/[id]` (shipped Wave 7) already reads
 * tb_payment — so dashboard ดู/แก้ไข row clicks already worked. This rewrite
 * just fixes the LIST so staff can see + filter.
 *
 * Wave 8 backlog: bulk-approve bar + slip-transferred-at editor +
 * refund-slip flow + admin-initiated payment form (the redirected
 * `new/page.tsx` stub is the entry).
 *
 * Verified prod schema 2026-05-21 via REST: tb_payment(id, paydate,
 *   paydeposit, paystatus, paytype, paydetail, payyuan, payrate, paythb,
 *   paythbcost, payprofitthb, paydateadmin, userid, adminid, adminidupdate,
 *   imagesslip, imagesslipadmin).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { TbYuanBulkBar, TbYuanRowCheckbox } from "./tb-bulk-bar";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "Alipay",
  "2": "Wechat",
  "3": "Union",
  "4": "USDT",
};

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "ทั้งหมด" },
  { key: "1",  label: "รอตรวจ" },
  { key: "2",  label: "อนุมัติ" },
  { key: "3",  label: "ปฏิเสธ" },
];

type PaymentRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  paytype: string | null;
  paydetail: string | null;
  payyuan: number | null;
  payrate: number | null;
  paythb: number | null;
  payprofitthb: number | null;
  paydateadmin: string | null;
  userid: string | null;
  adminid: string | null;
  imagesslip: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

type SP = { status?: string; q?: string; from?: string; to?: string; all?: string; sort?: string; dir?: string; page?: string };

// Lane C 2026-06-02 — server-side sort field whitelist (ภูม flag #3).
// Maps the URL `?sort=` value to the actual tb_payment column. Any value
// not in this map falls back to `paydate` (the legacy default).
const YUAN_SORT_FIELDS: Record<string, string> = {
  paydate:        "paydate",
  userid:         "userid",
  paytype:        "paytype",
  payyuan:        "payyuan",
  paythb:         "paythb",
  payprofitthb:   "payprofitthb",
  paystatus:      "paystatus",
};

// Wave 15 P0-2 — Default date window helpers.
//
// Legacy `pcs-admin/payment.php` L176-178 defaults the list view to the
// LAST 60 DAYS so paid rows from earlier months don't drown today's
// pending queue. Pacred was loading "newest 200 of all time" which made
// the รอตรวจ tab look quiet while old paid rows hogged the window.
//
// Rule: if neither `?from` nor `?to` is in the URL AND `?all=1` is
// absent → apply the 60-day default. `?all=1` is the escape hatch for
// the "ค้นหาข้อมูลทั้งหมด" button matching legacy.
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function resolveDateWindow(sp: SP): { from: string | null; to: string | null; isDefault: boolean } {
  if (sp.all === "1") return { from: null, to: null, isDefault: false };
  if (sp.from || sp.to) return { from: sp.from ?? null, to: sp.to ?? null, isDefault: false };
  // Default 60-day window per legacy.
  return { from: isoDaysAgo(60), to: todayIsoDate(), isDefault: true };
}

export default async function AdminYuanPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Exposes customer slip +
  // recipient details via createAdminClient (RLS-bypass) — accounting + ops
  // (super implicit).
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Wave 15 P0-2 — apply default 60-day window (legacy parity).
  const window = resolveDateWindow(sp);

  // Lane C 2026-06-02 — resolve sort + dir from URL with whitelist.
  const sortKey = sp.sort && YUAN_SORT_FIELDS[sp.sort] ? sp.sort : "paydate";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const sortColumn = YUAN_SORT_FIELDS[sortKey];

  // PERF (2026-06-03): paginate — one 50-row window via .range() + exact count
  // instead of pulling 200 rows every render.
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);

  let q = admin
    .from("tb_payment")
    .select(
      "id,paydate,paystatus,paytype,paydetail,payyuan,payrate,paythb,payprofitthb,paydateadmin,userid,adminid,imagesslip",
      { count: "exact" },
    )
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(rowFrom, rowTo);

  if (sp.status && /^[123]$/.test(sp.status)) q = q.eq("paystatus", sp.status);
  if (sp.q) {
    // search by userid (e.g. PR3963) or by tb_payment.id (numeric)
    const term = sp.q.trim();
    if (/^\d+$/.test(term)) q = q.eq("id", Number(term));
    else q = q.eq("userid", term.toUpperCase());
  }
  // Date filter applies to BOTH the data query and pending count below
  // so the count chip reflects what the user is actually viewing.
  if (window.from) q = q.gte("paydate", window.from);
  if (window.to)   q = q.lte("paydate", window.to + "T23:59:59");

  const { data: rowsRaw, error, count: totalPayments } = await q;
  const rows = (rowsRaw ?? []) as unknown as PaymentRow[];

  // 2nd query — merge customer names from tb_users
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersRawErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }

  // Lane C 2026-06-02 — pre-compute sort hrefs for each header. Click on
  // the active sort column flips the direction; click on any other column
  // sets it as the new active sort with the default 'desc' direction.
  const sortHrefs: Record<string, string> = {};
  for (const k of Object.keys(YUAN_SORT_FIELDS)) {
    const nextDir = sortKey === k && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (sp.status) params.set("status", sp.status);
    if (sp.q)      params.set("q", sp.q);
    if (sp.from)   params.set("from", sp.from);
    if (sp.to)     params.set("to", sp.to);
    if (sp.all)    params.set("all", sp.all);
    params.set("sort", k);
    params.set("dir", nextDir);
    sortHrefs[k] = `/admin/yuan-payments?${params.toString()}`;
  }

  // Pending count for the page header chip — scoped to the SAME date window
  // so the chip matches the visible data (per the "{rows.length} is a lie"
  // pattern in docs/learnings/supabase-rls-patterns.md).
  let pendingCountQ = admin
    .from("tb_payment")
    .select("id", { count: "exact", head: true })
    .eq("paystatus", "1");
  if (window.from) pendingCountQ = pendingCountQ.gte("paydate", window.from);
  if (window.to)   pendingCountQ = pendingCountQ.lte("paydate", window.to + "T23:59:59");
  const { count: pendingCount } = await pendingCountQ;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">ฝากโอนหยวน</h1>
            {pendingCount ? (
              <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
                {pendingCount} รอตรวจ
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 7.1 · อ่านจาก tb_payment · approve/reject bulk + slip-time editor → Wave 8
          </p>
        </div>
        <Link
          href="/admin/yuan-payments/new"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          + เพิ่มรายการ
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {STATUS_TABS.map((t) => {
          const isActive = (t.key ?? "") === (sp.status ?? "");
          const href = t.key ? `/admin/yuan-payments?status=${t.key}` : `/admin/yuan-payments`;
          return (
            <Link
              key={t.label}
              href={href}
              className={
                "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
                (isActive
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-muted hover:text-foreground")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Wave 15 P0-2 — Search + date-range filter (default last 60 days) */}
      <form className="flex gap-2 flex-wrap items-end" action="/admin/yuan-payments">
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">ค้นหา</span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="รหัสลูกค้า (PR…) / หมายเลข payment"
            className="rounded-lg border border-border px-3 py-2 text-sm w-72"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">ตั้งแต่</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? (window.isDefault ? window.from ?? "" : "")}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">ถึง</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? (window.isDefault ? window.to ?? "" : "")}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm">
          ค้นหา
        </button>
        {!window.isDefault && (
          <Link
            href="/admin/yuan-payments"
            className="rounded-lg border border-border bg-white text-foreground px-3 py-2 text-xs hover:bg-surface-alt self-end"
          >
            กลับ 60 วัน
          </Link>
        )}
        {window.isDefault && (
          <Link
            href="/admin/yuan-payments?all=1"
            className="rounded-lg border border-border bg-white text-foreground px-3 py-2 text-xs hover:bg-surface-alt self-end"
            title="แสดงทั้งหมด ไม่จำกัดช่วงวัน"
          >
            ดูทั้งหมด
          </Link>
        )}
      </form>

      {/* Date-window status chip + CSV export — explicit feedback for what's loaded */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-muted">
          {window.isDefault ? (
            <>📅 แสดง <strong className="text-foreground">60 วันล่าสุด</strong> ({window.from} → {window.to}) ·{" "}
            <Link href="/admin/yuan-payments?all=1" className="text-primary-600 hover:underline">ดูทั้งหมด</Link></>
          ) : sp.all === "1" ? (
            <>📅 แสดง <strong className="text-foreground">ทั้งหมด</strong> · <Link href="/admin/yuan-payments" className="text-primary-600 hover:underline">กลับ 60 วัน</Link></>
          ) : (
            <>📅 ช่วง: <strong className="text-foreground">{window.from ?? "ตั้งแต่เริ่ม"} → {window.to ?? "ปัจจุบัน"}</strong></>
          )}
        </p>
        {/* CSV export — current page only (50 rows/page · honours active filter/window/sort).
            Accounting often exports the รอตรวจ tab to reconcile against ธนาคาร statements. */}
        <CsvButton
          rows={rows.map((r) => {
            const u = r.userid ? userMap.get(r.userid) : undefined;
            const fullName = u
              ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
              : "";
            const row: CsvRow = {
              id: r.id,
              paydate: r.paydate ?? "",
              userid: r.userid ?? "",
              customer: fullName,
              paytype: PAYTYPE_LABEL[r.paytype ?? ""] ?? r.paytype ?? "",
              payyuan: r.payyuan != null ? Number(r.payyuan).toFixed(2) : "",
              payrate: r.payrate != null ? Number(r.payrate).toFixed(4) : "",
              paythb: r.paythb != null ? Number(r.paythb).toFixed(2) : "",
              payprofitthb: r.payprofitthb != null ? Number(r.payprofitthb).toFixed(2) : "",
              status: STATUS_LABEL[r.paystatus ?? ""] ?? r.paystatus ?? "",
              detail: r.paydetail ?? "",
              paydateadmin: r.paydateadmin ?? "",
              adminid: r.adminid ?? "",
            };
            return row;
          })}
          cols={[
            { key: "id",           label: "Payment ID" },
            { key: "paydate",      label: "วันที่สร้าง" },
            { key: "userid",       label: "รหัสลูกค้า" },
            { key: "customer",     label: "ชื่อลูกค้า" },
            { key: "paytype",      label: "ช่องทาง" },
            { key: "payyuan",      label: "จำนวนหยวน (¥)" },
            { key: "payrate",      label: "เรท" },
            { key: "paythb",       label: "บาท (฿)" },
            { key: "payprofitthb", label: "กำไร (฿)" },
            { key: "status",       label: "สถานะ" },
            { key: "detail",       label: "รายละเอียด" },
            { key: "paydateadmin", label: "วันที่อนุมัติ" },
            { key: "adminid",      label: "Admin" },
          ]}
          filename={`yuan-payments-page${page}${sp.status ? `-status${sp.status}` : ""}${sp.q ? `-${sp.q}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`}
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </div>
      )}

      {/* Wave 8 Group A — sticky bulk-approve bar */}
      <TbYuanBulkBar />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8"></th>
                  <YuanSortTh label="วันที่สร้าง" field="paydate"      activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <YuanSortTh label="ลูกค้า"      field="userid"       activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <YuanSortTh label="ช่องทาง"     field="paytype"      activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <YuanSortTh label="หยวน"        field="payyuan"      activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} align="right" />
                  <YuanSortTh label="บาท"         field="paythb"       activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} align="right" />
                  <YuanSortTh label="กำไร"        field="payprofitthb" activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} align="right" />
                  <YuanSortTh label="สถานะ"       field="paystatus"    activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <th className="px-3 py-3">สลิป</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const status = r.paystatus ?? "1";
                  const customerName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-3 w-8">
                        {status === "1" ? <TbYuanRowCheckbox id={r.id} /> : null}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.paydate
                          ? new Date(r.paydate).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-mono">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted">{u.userTel}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {PAYTYPE_LABEL[r.paytype ?? ""] ?? r.paytype ?? "—"}
                        {r.paydetail ? (
                          <div className="text-muted text-[10px] max-w-[160px] truncate" title={r.paydetail}>
                            {r.paydetail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ¥
                        {Number(r.payyuan ?? 0).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ฿
                        {Number(r.paythb ?? 0).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                        })}
                        <div className="text-muted text-[10px]">
                          @ {Number(r.payrate ?? 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {r.payprofitthb !== null
                          ? `฿${Number(r.payprofitthb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {STATUS_LABEL[status] ?? `status ${status}`}
                        </span>
                        {r.paydateadmin ? (
                          <div className="text-muted text-[10px] mt-1">
                            {new Date(r.paydateadmin).toLocaleDateString("th-TH")}
                            {r.adminid ? ` · ${r.adminid}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.imagesslip ? (
                          <a
                            href={r.imagesslip}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline"
                          >
                            ดู
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Link
                          href={`/admin/yuan-payments/${r.id}`}
                          className="text-primary-600 hover:underline"
                        >
                          ดู
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalPayments ?? 0}
        basePath="/admin/yuan-payments"
        params={{
          status: sp.status, q: sp.q, from: sp.from, to: sp.to,
          all: sp.all, sort: sp.sort, dir: sp.dir,
        }}
      />
    </main>
  );
}

/**
 * Lane C 2026-06-02 — server-side sortable column header (Link-based).
 * Pattern mirrors service-orders-table.tsx `SortableTh` — pre-computed
 * hrefs Record passed in (Server Components can't ship functions over
 * the RSC wire).
 */
function YuanSortTh({
  label,
  field,
  activeKey,
  activeDir,
  hrefs,
  align,
}: {
  label: string;
  field: string;
  activeKey: string;
  activeDir: "asc" | "desc";
  hrefs: Record<string, string>;
  align?: "right";
}) {
  const active = activeKey === field;
  const arrow = active ? (activeDir === "asc" ? "↑" : "↓") : "⇵";
  const cls = align === "right" ? "text-right" : "";
  return (
    <th className={`px-3 py-3 ${cls}`}>
      <Link
        href={hrefs[field]}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-primary-700 font-semibold" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <span className="text-[9px]" aria-hidden>{arrow}</span>
      </Link>
    </th>
  );
}
