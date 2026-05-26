import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";

/**
 * Admin > "รายการเบิกเงินค่าตู้" — container-payment (ตู้-ค่าจ่าย) ledger.
 *
 * Wave 23 P1 #11.a (2026-05-27 ค่ำ · Agent E): full Tailwind rewrite —
 * dropped `.pcs-legacy` scope + legacy Bootstrap-4 CSS includes
 * (`admin-base.css` + `cnt-hs.css`) per AGENTS.md §0a "steal the LOGIC +
 * apply OUR OWN polish" rule. The legacy chrome was a faithful-port
 * stepping stone (D1/ADR-0017); this is the post-port polish pass.
 *
 * Includes Wave 23 P1 #9 fix: "ข้อมูลเพิ่มเติม" column's GZE/cabinet codes
 * used to overflow (long comma-joined list spilled across the row). Now
 * capped at 3 visible chips + "+N more" `<details>` toggle reveals the
 * rest in-row without a modal.
 *
 * Workflow / data unchanged from the faithful-port version:
 *   - Reads `tb_cnt` (ledger header) + `tb_cnt_item` (cabinet fan-out)
 *   - Status filter `?q=1` (รอดำเนินการ) / `?q=2` (สำเร็จแล้ว)
 *   - Free-text search across id / nameblank / noblank
 *   - 200-row pagination via `?offset=`
 *   - Mutations stay on `/admin/cnt-hs/[id]` detail (this list is read-only)
 *
 * RBAC: super + ops + accounting (closest V3 mapping to legacy
 * cnt-hs.php L185 CEO/Manager/QA&QC/Accounting/ITDT gate).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a YYYY-MM-DD / ISO date into Thai short date. Returns "—" on failure. */
function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

// ============================================================================
// Row shape — relevant subset of tb_cnt
// ============================================================================

type CntRow = {
  id: number;
  cntname: string;
  cntstatus: string;
  cntamount: number;
  cntimagesslip: string;
  cntfile: string;
  date: string | null;
  adminidcreate: string;
  nameblank: string;
  noblank: string;
  nameaccount: string;
};

type SP = { q?: string; search?: string; offset?: string };

const PAGE_SIZE = 200;

// Wave 23 P1 #9 — cap visible GZE codes at 3, rest in <details>.
const CABINET_VISIBLE = 3;

export default async function CntHsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── tb_cnt_item fan-out (cnt-hs.php L202-213) ───────────────────
  const { data: itemsData, error: itemsErr } = await admin
    .from("tb_cnt_item")
    .select("cntid, fcabinetnumber");
  if (itemsErr) {
    console.error(`[tb_cnt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const arrItem = new Map<number, string[]>();
  for (const r of (itemsData ?? []) as Array<{ cntid: number; fcabinetnumber: string }>) {
    const arr = arrItem.get(r.cntid);
    if (arr) arr.push(r.fcabinetnumber);
    else arrItem.set(r.cntid, [r.fcabinetnumber]);
  }

  // ── pagination + search resolve ─────────────────────────────────
  const offsetRaw = Number(sp.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
  const searchTerm = (sp.search ?? "").trim();
  const qIsStatus = sp.q === "1" || sp.q === "2";
  const qAsSearch = !qIsStatus ? (sp.q ?? "").trim() : "";
  const search = searchTerm || qAsSearch;

  let q = admin
    .from("tb_cnt")
    .select(
      "id, cntname, cntstatus, cntamount, cntimagesslip, cntfile, date, " +
        "adminidcreate, nameblank, noblank, nameaccount",
      { count: "exact" },
    )
    .order("date", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (qIsStatus) q = q.eq("cntstatus", sp.q!);
  if (search) {
    const safe = search.replace(/[(),]/g, " ");
    const pattern = `%${safe}%`;
    q = q.or(
      `id::text.ilike.${pattern},nameblank.ilike.${pattern},noblank.ilike.${pattern}`,
    );
  }

  // ── status overview counts ──────────────────────────────────────
  const [tableRes, countAllRes, count1Res] = await Promise.all([
    q,
    admin.from("tb_cnt").select("id", { count: "exact", head: true }),
    admin.from("tb_cnt").select("id", { count: "exact", head: true }).eq("cntstatus", "1"),
  ]);

  if (tableRes.error) {
    console.error(`[tb_cnt list] failed`, { code: tableRes.error.code, message: tableRes.error.message });
  }

  const rows: CntRow[] = (tableRes.data ?? []) as unknown as CntRow[];
  const countAll = countAllRes.count ?? 0;
  const count1 = count1Res.count ?? 0;
  const count2 = countAll - count1;
  const resultTotal = tableRes.count ?? rows.length;

  const activeTab: "all" | "1" | "2" =
    sp.q === "1" ? "1" : sp.q === "2" ? "2" : "all";

  // Pagination boundary
  const hasPrev = offset > 0;
  const hasNext = offset + rows.length < resultTotal;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const buildPageHref = (newOffset: number): string => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (searchTerm) params.set("search", searchTerm);
    if (newOffset > 0) params.set("offset", String(newOffset));
    const qs = params.toString();
    return qs ? `/admin/cnt-hs?${qs}` : "/admin/cnt-hs";
  };

  // Tab pill class helper.
  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "border-primary-200 bg-primary-50 text-primary-700"
        : "border-border bg-white text-foreground hover:bg-surface-alt"
    }`;
  const badgeCls = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      active ? "bg-primary-600 text-white" : "bg-surface-alt text-muted"
    }`;

  return (
    <>
      <TopMenuReport activeHref="/admin/cnt-hs" />
      <main className="p-6 lg:p-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
            <h1 className="mt-1 text-2xl font-bold">รายการเบิกเงินค่าตู้</h1>
            <p className="mt-1 text-sm text-muted">
              จัดการการชำระเงินค่าตู้คอนเทนเนอร์ (tb_cnt) · {countAll.toLocaleString()} รายการทั้งหมด
            </p>
          </div>
          <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center">
            <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
            <span>/</span>
            <span className="text-foreground">รายการเบิกเงินค่าตู้</span>
          </nav>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/cnt-hs" className={tabCls(activeTab === "all")}>
            ทั้งหมด
            {countAll > 0 && <span className={badgeCls(activeTab === "all")}>{countAll}</span>}
          </Link>
          <Link href={{ pathname: "/admin/cnt-hs", query: { q: "1" } }} className={tabCls(activeTab === "1")}>
            รอดำเนินการ
            {count1 > 0 && <span className={badgeCls(activeTab === "1")}>{count1}</span>}
          </Link>
          <Link href={{ pathname: "/admin/cnt-hs", query: { q: "2" } }} className={tabCls(activeTab === "2")}>
            สำเร็จแล้ว
            {count2 > 0 && <span className={badgeCls(activeTab === "2")}>{count2}</span>}
          </Link>
        </div>

        {/* Search bar */}
        <form action="/admin/cnt-hs" method="GET" className="flex flex-wrap items-center gap-2">
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <input
            type="text"
            name="search"
            defaultValue={searchTerm}
            placeholder="ค้นหา ID / ธนาคาร / เลขที่บัญชี"
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm w-72"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700"
          >
            ค้นหา
          </button>
          {searchTerm && (
            <Link
              href={sp.q ? `/admin/cnt-hs?q=${sp.q}` : "/admin/cnt-hs"}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              ล้าง
            </Link>
          )}
          <span className="ml-auto text-xs text-muted">
            พบ {resultTotal.toLocaleString()} รายการ
            {resultTotal > PAGE_SIZE &&
              ` · แสดง ${(offset + 1).toLocaleString()}–${Math.min(offset + rows.length, resultTotal).toLocaleString()}`}
          </span>
        </form>

        {/* Table card */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่พบรายการเบิกเงินค่าตู้</p>
          ) : (
            <>
              <p className="px-4 pt-3 text-[11px] text-muted">
                <span className="opacity-70">เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด</span>
                <span className="ml-1">⇆</span>
              </p>
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">วันที่</th>
                      <th className="px-4 py-3">หมายเลขตู้</th>
                      <th className="px-4 py-3 text-right">จำนวนเงิน</th>
                      <th className="px-4 py-3">ข้อมูลเพิ่มเติม</th>
                      <th className="px-4 py-3 text-center">สลิป</th>
                      <th className="px-4 py-3 text-center">หลักฐาน</th>
                      <th className="px-4 py-3">ผู้ทำรายการ</th>
                      <th className="px-4 py-3 text-center">สถานะ</th>
                      <th className="px-4 py-3 text-right">ตัวเลือก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const cabinets = arrItem.get(row.id) ?? [];
                      // Wave 23 P1 #9 — cap visible cabinets at 3, fold rest into <details>.
                      const visibleCabinets = cabinets.slice(0, CABINET_VISIBLE);
                      const hiddenCabinets = cabinets.slice(CABINET_VISIBLE);
                      const isPaid = row.cntstatus === "2";
                      return (
                        <tr key={row.id} className="border-t border-border hover:bg-surface-alt/30">
                          {/* 1 — ID */}
                          <td className="px-4 py-3 font-mono text-xs">
                            <Link
                              href={`/admin/cnt-hs/${row.id}`}
                              className="text-primary-600 hover:underline"
                            >
                              #{row.id}
                            </Link>
                          </td>
                          {/* 2 — วันที่ */}
                          <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                            {formatDate(row.date)}
                          </td>
                          {/* 3 — หมายเลขตู้ (cntname is summary; cabinets are fan-out chips) */}
                          <td className="px-4 py-3 text-xs max-w-[320px]">
                            <div className="font-medium text-foreground mb-1">{row.cntname || "—"}</div>
                            {cabinets.length > 0 && (
                              <div className="flex flex-wrap gap-1 items-center">
                                {visibleCabinets.map((c, i) => (
                                  <span
                                    key={`${row.id}-cab-${i}`}
                                    className="inline-block rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-mono text-primary-700"
                                  >
                                    {c}
                                  </span>
                                ))}
                                {hiddenCabinets.length > 0 && (
                                  <details className="inline-block">
                                    <summary
                                      className="inline-block cursor-pointer rounded border border-border bg-surface-alt px-1.5 py-0.5 text-[10px] font-mono text-muted hover:bg-surface-alt/70 list-none"
                                      title={`คลิกเพื่อดูเพิ่มอีก ${hiddenCabinets.length} ตู้`}
                                    >
                                      +{hiddenCabinets.length} more
                                    </summary>
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {hiddenCabinets.map((c, i) => (
                                        <span
                                          key={`${row.id}-hcab-${i}`}
                                          className="inline-block rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-mono text-primary-700"
                                        >
                                          {c}
                                        </span>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            )}
                          </td>
                          {/* 4 — จำนวนเงิน */}
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            ฿{numberFormat2(row.cntamount)}
                          </td>
                          {/* 5 — ข้อมูลเพิ่มเติม */}
                          <td className="px-4 py-3 text-xs max-w-[220px]">
                            <div className="space-y-0.5">
                              <div>
                                <span className="text-muted">ธนาคาร:</span>{" "}
                                <span className="font-medium">{row.nameblank || "—"}</span>
                              </div>
                              <div>
                                <span className="text-muted">เลขที่:</span>{" "}
                                <span className="font-mono">{row.noblank || "—"}</span>
                              </div>
                              <div className="truncate" title={row.nameaccount || ""}>
                                <span className="text-muted">ชื่อ:</span>{" "}
                                <span>{row.nameaccount || "—"}</span>
                              </div>
                            </div>
                          </td>
                          {/* 6 — สลิป */}
                          <td className="px-4 py-3 text-center text-xs">
                            {row.cntimagesslip ? (
                              <Link
                                href={`/admin/cnt-hs/${row.id}`}
                                className="text-primary-600 hover:underline"
                              >
                                ดูสลิป
                              </Link>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          {/* 7 — หลักฐาน */}
                          <td className="px-4 py-3 text-center text-xs">
                            {row.cntfile ? (
                              <Link
                                href={`/admin/cnt-hs/${row.id}`}
                                className="text-primary-600 hover:underline"
                              >
                                ดูไฟล์
                              </Link>
                            ) : (
                              <Link
                                href={`/admin/cnt-hs/${row.id}`}
                                className="text-amber-600 hover:underline"
                              >
                                เพิ่มไฟล์
                              </Link>
                            )}
                          </td>
                          {/* 8 — ผู้ทำรายการ */}
                          <td className="px-4 py-3 text-xs font-mono text-muted">
                            {row.adminidcreate || "—"}
                          </td>
                          {/* 9 — สถานะ */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                isPaid
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {isPaid ? "สำเร็จ" : "รอดำเนินการ"}
                            </span>
                          </td>
                          {/* 10 — ตัวเลือก */}
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/admin/cnt-hs/${row.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            >
                              อัปเดต / ดูรายละเอียด
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(hasPrev || hasNext) && (
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted">
                  <span>
                    หน้า {Math.floor(offset / PAGE_SIZE) + 1} จาก{" "}
                    {Math.max(1, Math.ceil(resultTotal / PAGE_SIZE))}
                  </span>
                  <div className="flex gap-2">
                    {hasPrev ? (
                      <Link
                        href={buildPageHref(prevOffset)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                      >
                        ก่อนหน้า
                      </Link>
                    ) : (
                      <span className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium opacity-40 pointer-events-none">
                        ก่อนหน้า
                      </span>
                    )}
                    {hasNext ? (
                      <Link
                        href={buildPageHref(nextOffset)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                      >
                        ถัดไป
                      </Link>
                    ) : (
                      <span className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium opacity-40 pointer-events-none">
                        ถัดไป
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
