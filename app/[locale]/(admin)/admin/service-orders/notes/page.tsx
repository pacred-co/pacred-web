/**
 * Admin > Service Orders > "หมายเหตุฝากสั่ง" — standalone notes-list page.
 *
 * Legacy source: `pcs-admin/forwarder-action.php?action=NoteShop`
 *   - SELECT * FROM tb_header_order WHERE hNote <> '' [+ optional hStatus filter]
 *
 * Before this commit the sidebar item ALSO labelled "หมายเหตุฝากสั่ง" linked
 * to `/admin/service-orders?q=note` which the list page does NOT handle —
 * the filter was silently dropped, and the link rendered the unfiltered
 * order list. Owner flagged this. Fix = a dedicated `/notes` route.
 *
 * §0e Potemkin fix (2026-06-01): this page previously read the rebuilt
 * `service_orders` table (0-row on prod after the D1 pivot) → it ALWAYS
 * rendered 0 notes. Re-pointed to the live `tb_header_order` (where all
 * 21,950 real shop-order headers + their `hnote`/`hnoteuser` live), with a
 * 2nd `tb_users` query for the customer name (the canonical pattern from
 * `/admin/service-orders/page.tsx` + the sibling `/admin/forwarders/notes`).
 * Detail link now uses `hno` (the legacy key the detail route resolves) — was
 * the rebuilt uuid.
 *
 * Casing: `tb_header_order` is all-lowercase (hno/hstatus/hnote/hnoteuser/
 * hdateupdate · migration 0081). `tb_users` keeps camelCase (userID/userName/
 * userLastName · CLAUDE.md exception).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LEGACY_ORDER_STATUS, legacyOrderStatusThai, type LegacyOrderCode } from "@/lib/legacy-status-map";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportServiceOrderNotesAll } from "@/actions/admin/export/service-order-notes";

export const dynamic = "force-dynamic";

// Raw row shape from tb_header_order — the columns we read.
type RawOrderRow = {
  id:           number;
  hno:          string;
  hstatus:      string | null;
  hnote:        string | null;
  hnoteuser:    string | null;
  hnotedate:    string | null;
  hdateupdate:  string | null;
  hdate:        string | null;
  htotalpriceuser: number | string | null;
  userid:       string;
};

// tb_users — camelCase columns (CLAUDE.md exception). userid (lowercase) on
// tb_header_order joins to userID (camelCase) here.
type RawUserRow = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
};

export default async function ServiceOrderNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  // legacy menu-purchasing.php — note view sits inside the purchasing
  // module → CS/sales/super (ops alias keeps it open to the cargo team)
  await requireAdmin(["ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);

  // legacy: WHERE hNote<>'' (+ optional hStatus). On tb_header_order we widen
  // to "either hnote OR hnoteuser has content" so both the staff note and the
  // customer note surface. Sorted hdateupdate DESC to match the legacy
  // "ล่าสุด" view. Limit 500 (parity with the prior page cap).
  let q = admin
    .from("tb_header_order")
    .select(
      "id,hno,hstatus,hnote,hnoteuser,hnotedate,hdateupdate,hdate,htotalpriceuser,userid",
      { count: "exact" },
    )
    // Supabase `.or()` combines "neq empty" predicates — same proven pattern as
    // the sibling /admin/forwarders/notes page. `neq.` already excludes both
    // NULL and '' (the legacy "no note" marker); the client-side filter below
    // is the belt-and-braces guard for whitespace-only rows.
    .or("hnote.neq.,hnoteuser.neq.")
    .order("hdateupdate", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(rowFrom, rowTo);

  // Optional status filter — accepts the legacy single-char code '1'..'6'.
  const statusFilter =
    sp.status && (sp.status as LegacyOrderCode) in LEGACY_ORDER_STATUS
      ? (sp.status as LegacyOrderCode)
      : null;
  if (statusFilter) q = q.eq("hstatus", statusFilter);

  const { data, error, count: totalNotes } = await q;
  if (error) {
    console.error(`[service-orders/notes tb_header_order list] failed`, {
      code: error.code, message: error.message,
    });
  }
  const raw = (data ?? []) as unknown as RawOrderRow[];

  // Defensive client-side filter: keep only rows with a real (non-empty,
  // trimmed) note in EITHER column. The .or() above is the DB-side cut; this
  // guards against whitespace-only legacy rows.
  const rows = raw.filter(
    (r) => (r.hnote ?? "").trim() !== "" || (r.hnoteuser ?? "").trim() !== "",
  );

  // 2nd query: tb_users for customer name + phone (canonical pattern from
  // /admin/service-orders/page.tsx — tb_header_order has no embeddable FK to
  // tb_users so we resolve via a keyed Map).
  const uniqueUserIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean)));
  const usersByUserId = new Map<string, RawUserRow>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", uniqueUserIds);
    if (userErr) {
      console.error(`[service-orders/notes tb_users join] failed`, {
        code: userErr.code, message: userErr.message,
      });
    }
    for (const u of ((userRows ?? []) as unknown as RawUserRow[])) {
      usersByUserId.set(u.userID, u);
    }
  }

  // CSV columns mirror the <thead> 1:1 (multi-line note cell flattened into two
  // columns — staff note / customer note).
  const csvCols: CsvCol[] = [
    { key: "updated", label: "วันอัปเดต/สั่ง" },
    { key: "hno", label: "เลขออเดอร์" },
    { key: "userid", label: "รหัสลูกค้า" },
    { key: "customer", label: "ลูกค้า" },
    { key: "tel", label: "เบอร์โทร" },
    { key: "status", label: "สถานะ" },
    { key: "total", label: "ยอด (บาท)" },
    { key: "staff_note", label: "หมายเหตุ (พนักงาน)" },
    { key: "user_note", label: "หมายเหตุ (ลูกค้า)" },
  ];
  const csvRows: CsvRow[] = rows.map((r) => {
    const updated = r.hdateupdate ?? r.hnotedate ?? r.hdate;
    const user = usersByUserId.get(r.userid);
    const customerName = user
      ? `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim()
      : "";
    return {
      updated: updated ? String(updated).slice(0, 10) : "",
      hno: r.hno,
      userid: r.userid || "",
      customer: customerName,
      tel: user?.userTel ?? "",
      status: legacyOrderStatusThai(r.hstatus) || "",
      total:
        r.htotalpriceuser != null
          ? Number(r.htotalpriceuser).toLocaleString("th-TH", { minimumFractionDigits: 2 })
          : "",
      staff_note: (r.hnote ?? "").trim(),
      user_note: (r.hnoteuser ?? "").trim(),
    };
  });

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <title>หมายเหตุฝากสั่ง | PR Admin</title>

      <main className="p-6 lg:p-8 space-y-5">
        {/* Breadcrumb */}
        <div className="text-sm text-muted space-x-2">
          <Link href="/admin" className="hover:underline">หน้าแรก</Link>
          <span>›</span>
          <Link href="/admin/service-orders" className="hover:underline">ฝากสั่งสินค้า</Link>
          <span>›</span>
          <span className="font-semibold">หมายเหตุฝากสั่ง</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ฝากสั่งสินค้า</p>
            <h1 className="mt-1 text-2xl font-bold">หมายเหตุฝากสั่ง</h1>
            <p className="mt-1 text-sm text-muted">
              รายการฝากสั่งที่มีหมายเหตุ · {rows.length} รายการ · เรียงตามวันอัปเดตล่าสุด · จำกัด 500 รายการ
            </p>
          </div>
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="หมายเหตุฝากสั่ง.csv"
            fetchAll={async () => {
              "use server";
              return exportServiceOrderNotesAll({ status: statusFilter });
            }}
          />
        </div>

        {/* Filter chips — รวม + filter by legacy hstatus code */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted mr-1">สถานะ:</span>
          <FilterChip active={!statusFilter} href="/admin/service-orders/notes">ทั้งหมด</FilterChip>
          {(Object.keys(LEGACY_ORDER_STATUS) as LegacyOrderCode[]).map((code) => (
            <FilterChip
              key={code}
              active={statusFilter === code}
              href={`/admin/service-orders/notes?status=${code}`}
            >
              {LEGACY_ORDER_STATUS[code].thai}
            </FilterChip>
          ))}
        </div>

        {/* Table — note rows */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>📝</div>
              <p className="text-sm font-medium text-foreground">ไม่มีรายการฝากสั่งที่มีหมายเหตุ</p>
              <p className="text-xs text-muted">ลองล้าง/เปลี่ยนตัวกรองสถานะด้านบน</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">วันอัปเดต / สั่ง</th>
                    <th className="px-4 py-3">เลขออเดอร์</th>
                    <th className="px-4 py-3">ลูกค้า</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">ยอด (บาท)</th>
                    <th className="px-4 py-3">หมายเหตุ</th>
                    <th className="px-4 py-3 text-right">เปิด</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const updated = r.hdateupdate ?? r.hnotedate ?? r.hdate;
                    const user = usersByUserId.get(r.userid);
                    const customerName = user
                      ? `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim()
                      : "";
                    const staffNote = (r.hnote ?? "").trim();
                    const userNote  = (r.hnoteuser ?? "").trim();
                    return (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                          {updated
                            ? new Date(updated).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-semibold">{r.hno}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-mono font-semibold">{r.userid || "—"}</div>
                          <div className="text-muted">{customerName || "—"}</div>
                          <div className="text-[10px] text-muted">{user?.userTel}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{legacyOrderStatusThai(r.hstatus) || "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {r.htotalpriceuser != null
                            ? Number(r.htotalpriceuser).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[320px] space-y-1">
                          {staffNote && (
                            <div className="rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-2 py-1">
                              📝 {staffNote}
                            </div>
                          )}
                          {userNote && (
                            <div className="rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-1">
                              👤 {userNote}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <Link
                            href={`/admin/service-orders/${r.hno}`}
                            className="text-primary-500 hover:underline whitespace-nowrap"
                          >
                            เปิด →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={totalNotes ?? 0}
            basePath="/admin/service-orders/notes"
            params={{ status: sp.status }}
          />
        </div>
      </main>
    </div>
  );
}

function FilterChip({
  active, href, children,
}: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border hover:bg-surface-alt text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
