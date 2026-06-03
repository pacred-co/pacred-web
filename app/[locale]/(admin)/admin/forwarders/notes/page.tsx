/**
 * Admin > Forwarders > "หมายเหตุนำเข้า" — standalone notes-list page.
 *
 * Legacy source: `pcs-admin/forwarder-action.php?action=Note`
 *   - SELECT * FROM tb_forwarder WHERE fNote <> '' [+ optional fStatus filter]
 *
 * Wave 20 P1 (2026-05-26): two fixes in one commit.
 * - Schema swap: was reading rebuilt `forwarders` (empty on prod) →
 *   now reads `tb_forwarder` with fnote/fnoteuser columns + 2-pass
 *   tb_users lookup (same pattern as /admin/forwarders/page.tsx).
 *   Closes audit P1-2 finding for this page.
 * - UI cleanup: dropped the `.pcs-legacy` CSS scope wrapper +
 *   `<link>` to admin-base.css. The body was already Tailwind; the
 *   wrapper was vestigial from an early Wave 7.3 port.
 *
 * Legacy column map:
 *   forwarders.note_admin (rebuilt) → tb_forwarder.fnote
 *   forwarders.note_user  (rebuilt) → tb_forwarder.fnoteuser
 *   forwarders.f_no                 → tb_forwarder.fidorco (text) ?? id (int)
 *   forwarders.status               → tb_forwarder.fstatus numeric '1'..'7'
 *   forwarders.created_at           → tb_forwarder.fdate
 *   forwarders.updated_at           → tb_forwarder.fdateadminstatus (last-touched)
 *   forwarders.total_price          → tb_forwarder.ftotalprice
 *   forwarders.tracking_chn         → tb_forwarder.ftrackingchn
 *   forwarders.tracking_th          → tb_forwarder.ftrackingth
 *   profile (uuid join)             → tb_users via userid (text)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LEGACY_FORWARDER_STATUS, legacyForwarderStatusThai, toLegacyForwarderCode } from "@/lib/legacy-status-map";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

export const dynamic = "force-dynamic";

type RawForwarder = {
  id: number;
  fidorco: string | null;
  fstatus: string;
  fnote: string | null;
  fnoteuser: string | null;
  fdate: string;
  fdateadminstatus: string | null;
  ftotalprice: number | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  userid: string;
};

type UserLite = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

export default async function ForwarderNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  // legacy menu-forwarder.php — note view sits inside the forwarder module
  // → ops (warehouse + cs) + sales_admin (follow-up). super implicit.
  await requireAdmin(["ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Resolve rebuilt-era status key (?status=pending_payment / shipped_china / etc.)
  // to its numeric legacy fstatus via the shared status map.
  const legacyStatusCode = sp.status ? toLegacyForwarderCode(sp.status) : undefined;

  // Pass 1 — fetch headers with at least one non-empty note column.
  // Supabase `.or()` can combine "neq empty" predicates: fnote.neq.,fnoteuser.neq.
  // §0c: destructure error + throw on the load-bearing read.
  let q = admin
    .from("tb_forwarder")
    .select("id, fidorco, fstatus, fnote, fnoteuser, fdate, fdateadminstatus, ftotalprice, ftrackingchn, ftrackingth, userid")
    .or("fnote.neq.,fnoteuser.neq.")
    .order("fdateadminstatus", { ascending: false, nullsFirst: false })
    .order("fdate", { ascending: false })
    .limit(500);

  if (legacyStatusCode) q = q.eq("fstatus", legacyStatusCode);

  const { data: rowsRaw, error: rowsErr } = await q;
  if (rowsErr) {
    console.error(`[tb_forwarder notes] failed`, {
      code: rowsErr.code, message: rowsErr.message, details: rowsErr.details,
    });
    throw new Error(`Failed to load tb_forwarder notes (${rowsErr.code ?? "unknown"}): ${rowsErr.message}`);
  }
  const rows = ((rowsRaw ?? []) as RawForwarder[])
    // Drop any row where BOTH note columns are empty (.or with neq.'' false negatives).
    .filter((r) => (r.fnote && r.fnote.trim()) || (r.fnoteuser && r.fnoteuser.trim()));

  // PERF (2026-06-03): client-slice pagination. The fetched-then-filtered
  // `rows` is the authoritative set (a DB count:exact would over-count the
  // .or false-negatives dropped above), so we keep the full list for the
  // count + tb_users lookup and only render one 50-row window.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // Pass 2 — batch tb_users lookup for the customer panel column.
  const useridList = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean)));
  let userMap: Record<string, UserLite> = {};
  if (useridList.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", useridList);
    if (usersErr) {
      console.error(`[tb_users notes-join] failed`, { code: usersErr.code, message: usersErr.message });
    } else {
      userMap = Object.fromEntries(((usersRaw ?? []) as UserLite[]).map((u) => [u.userID, u]));
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>/</span>
        <span className="text-foreground">หมายเหตุนำเข้า</span>
      </nav>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ฝากนำเข้า</p>
        <h1 className="mt-1 text-2xl font-bold">หมายเหตุนำเข้า</h1>
        <p className="mt-1 text-sm text-muted">
          รายการฝากนำเข้าที่มีหมายเหตุ · {rows.length} รายการ · เรียงตามวันอัปเดตล่าสุด · จำกัด 500 รายการ
        </p>
      </div>

      {/* Filter chips — all statuses from LEGACY_FORWARDER_STATUS map */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted mr-1">สถานะ:</span>
        <FilterChip active={!sp.status} href="/admin/forwarders/notes">ทั้งหมด</FilterChip>
        {Object.values(LEGACY_FORWARDER_STATUS).map((e) => (
          <FilterChip
            key={e.key}
            active={sp.status === e.key}
            href={`/admin/forwarders/notes?status=${e.key}`}
          >
            {e.thai}
          </FilterChip>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📝</div>
            <p className="text-sm font-medium text-foreground">ไม่มีรายการฝากนำเข้าที่มีหมายเหตุ</p>
            <p className="text-xs text-muted">ลองล้าง/เปลี่ยนตัวกรองสถานะด้านบน</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันอัปเดต / สั่ง</th>
                  <th className="px-4 py-3">เลขนำเข้า</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">ยอด (บาท)</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                  <th className="px-4 py-3 text-right">เปิด</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const updated = r.fdateadminstatus ?? r.fdate;
                  const u = userMap[r.userid];
                  const customerName = u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "";
                  const displayFNo = r.fidorco ?? `#${r.id}`;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {new Date(updated).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono font-semibold">{displayFNo}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono font-semibold">{r.userid}</div>
                        <div className="text-muted">{customerName || "—"}</div>
                        {u?.userTel && <div className="text-[10px] text-muted">{u.userTel}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs">{legacyForwarderStatusThai(r.fstatus)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {r.ftotalprice != null
                          ? Number(r.ftotalprice).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs space-y-1">
                        {r.ftrackingchn && <div className="font-mono text-[10px]">🇨🇳 {r.ftrackingchn}</div>}
                        {r.ftrackingth &&  <div className="font-mono text-[10px]">🇹🇭 {r.ftrackingth}</div>}
                        {!r.ftrackingchn && !r.ftrackingth && <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[320px] space-y-1">
                        {r.fnote && r.fnote.trim() && (
                          <div className="rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-1">
                            <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">แอดมิน</span>
                            <div>📝 {r.fnote}</div>
                          </div>
                        )}
                        {r.fnoteuser && r.fnoteuser.trim() && (
                          <div className="rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-2 py-1">
                            <span className="text-[10px] font-semibold text-yellow-700 dark:text-yellow-300">ลูกค้า</span>
                            <div>📝 {r.fnoteuser}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <Link
                          href={`/admin/forwarders/${r.id}`}
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
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={rows.length}
        basePath="/admin/forwarders/notes"
        params={{ status: sp.status }}
      />
    </main>
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
