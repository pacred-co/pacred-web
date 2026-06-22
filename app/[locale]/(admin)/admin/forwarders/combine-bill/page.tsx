/**
 * /admin/forwarders/combine-bill — "ประวัติรายการรวมบิล"
 *
 * Wave 20 P1 (2026-05-26): UI rewrite ONLY — drop `.pcs-legacy` scope +
 * `<link>` to admin-base.css + Bootstrap-4 markup → Pacred Tailwind v4
 * (chrome modeled on `/admin/forwarders/notes/page.tsx`). All
 * tb_bill + tb_bill_item schema reads + filter logic + URL params
 * preserved verbatim from prior commit.
 *
 * Legacy source: `pcs-admin/forwarder-bill.php` DEFAULT view (L57-231)
 * — multi-select forwarder rows for the SAME customer, combine them
 * into ONE printed shipping bill. Data lives in `tb_bill` (header) +
 * `tb_bill_item` (fan-out, one row per forwarder ID).
 *
 * Existing wired functionality preserved:
 *   - CombineBillRowActions (delete + print buttons) — adminDeleteCombineBill
 *     server action already exists + works
 *   - "สร้างบิลรวม" CTA → `/admin/forwarders/combine-bill/add` page (form
 *     wired to adminCreateCombineBill)
 *
 * Status:
 *   ✅ Filter chips (date range / 90-day default / all-time)
 *   ✅ Read of tb_bill + tb_bill_item with date filter
 *   ✅ "สร้างบิลรวม" CTA (super role only) → wired form
 *   ✅ Delete + print row actions (super role only) → wired island
 *   ⏳ Wave 21: daterangepicker JS init (currently plain text input)
 *   ⏳ Wave 21: bulk-select + bulk-print (DataTables checkboxes equivalent)
 *   ⏳ Wave 21: print PDF (@react-pdf renderer — printHref currently 404)
 *
 * URL filters (transcribed from forwarder-bill.php L84-91 + L116-132):
 *   ?historyTable=true&date=YYYY-MM-DD - YYYY-MM-DD → custom date range
 *   ?historyTableAll=true                            → ทั้งหมด (no filter)
 *   (none)                                           → last 90 days (default)
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCombineBillPrintHref, buildCombineBillDetailHref } from "@/lib/admin/combine-bill-urls";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportCombineBillAll } from "@/actions/admin/export/combine-bill";
import { CombineBillRowActions } from "./combine-bill-row-actions";
// ^ Wired client island (delete + print buttons). Kept on the page so super
//   role retains the existing functional delete; visual chrome of the
//   buttons inside renders without `.pcs-legacy` wrapper — Wave 21 will
//   restyle that island's buttons in Tailwind to fully match the new look.

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined — same as prior commit, pure formatters/parsers.
// ============================================================================

/** Legacy PHP `date("Y-m-d", strtotime("-90 days", ...))` — forwarder-bill.php L86. */
function dateMinusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Legacy daterangepicker emits "YYYY-MM-DD - YYYY-MM-DD"; legacy substr-slices it. */
function parseDateRange(raw: string | undefined): { start: string; end: string } | null {
  if (!raw) return null;
  if (raw.length < 23) return null;
  const start = raw.slice(0, 10);
  const end = raw.slice(13);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return { start, end };
}

// ============================================================================
// SQL — admin client, RLS-locked to service_role.
// ============================================================================

type BillRow = {
  billid: number;
  date: string | null;
  printstatus: string;
  adminid: string;
};

type BillItemRow = {
  id: number;
  billid: number;
  fid: number;
};

type SP = {
  historyTable?: string;
  historyTableAll?: string;
  date?: string;
  page?: string;
};

export default async function CombineBillPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (forwarder-bill.php L94) — view is open to admin roles
  // who legitimately need this screen (warehouse + ops + accounting).
  // The mutate gate (super) controls the create + delete actions.
  const { roles } = await requireAdmin(["super", "ops", "warehouse", "accounting"]);
  const canMutate = isGodRole(roles);

  const sp = await searchParams;
  const admin = createAdminClient();

  // PERF (2026-06-03): paginate — one 50-row window via .range() + exact
  // count instead of pulling every bill on each render.
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);

  // ── Filter resolution (forwarder-bill.php L115-132) ──────────
  let filterStart: string | null = null;
  let filterEnd: string | null = null;
  let filterMode: "range" | "all" | "default" = "default";

  if (sp.historyTable === "true") {
    const range = parseDateRange(sp.date);
    if (range) {
      filterStart = range.start;
      filterEnd = range.end;
      filterMode = "range";
    } else {
      filterStart = dateMinusDaysISO(90);
      filterEnd = todayISO();
    }
  } else if (sp.historyTableAll === "true") {
    filterMode = "all";
  } else {
    filterStart = dateMinusDaysISO(90);
    filterEnd = todayISO();
  }

  // ── tb_bill filtered query (forwarder-bill.php L116-132) ─────
  let billsQ = admin
    .from("tb_bill")
    .select("billid, date, printstatus, adminid", { count: "exact" })
    .order("billid", { ascending: false })
    .range(rowFrom, rowTo);

  if (filterStart && filterEnd) {
    billsQ = billsQ
      .gte("date", `${filterStart}T00:00:00`)
      .lte("date", `${filterEnd}T23:59:59`);
  }

  const billsRes = await billsQ;
  const totalBills = billsRes.count ?? 0;

  // §0c — destructure error + log on the load-bearing read.
  if (billsRes.error) {
    console.error("[combine-bill] tb_bill query failed", {
      code: billsRes.error.code,
      message: billsRes.error.message,
      details: billsRes.error.details,
    });
    throw new Error(
      `combine-bill: failed to load tb_bill — ${billsRes.error.code ?? "unknown"}: ${billsRes.error.message}`,
    );
  }

  const bills: BillRow[] = (billsRes.data ?? []) as unknown as BillRow[];

  // ── tb_bill_item — Wave 23 P0 fix #3 (Task #153, 2026-05-26 ค่ำ) ──
  //
  // Legacy SQL (forwarder-bill.php L133-146):
  //   SELECT bi.ID, bi.billID, bi.fID FROM tb_bill_item AS bi
  //     LEFT JOIN tb_bill AS b ON b.billID = bi.billID
  //     WHERE 1=1 [same date filter]
  //
  // Earlier port used `tb_bill_item.select("…, tb_bill!inner(date)")` to
  // express the join — but the ported schema (migration 0081, transcribed
  // verbatim from the legacy MySQL) declares NO foreign key between
  // `tb_bill_item.billid` and `tb_bill.billid` (the legacy MySQL didn't
  // either). PostgREST therefore can't resolve the embed and the call
  // returns `PGRST200` "Could not find a relationship between
  // 'tb_bill_item' and 'tb_bill' in the schema cache" — leaving every
  // "รายการฝากนำเข้า" cell empty (Agent K click-through audit,
  // 2026-05-26).
  //
  // Fix: collapse to a 2-query pattern. The bills load above already
  // narrows by date; now load items only for the visible bills via
  // .in("billid", visibleBillIds) — same shape that Wave 22 used to
  // fix the tb_admin casing failure in actions/admin/admins.ts.
  let rawItems: BillItemRow[] = [];
  if (bills.length > 0) {
    const visibleBillIds = bills.map((b) => b.billid);
    // ── 2026-06-03 (ภูม flag · Pacred R-2 close-out) — silent 1000-cap fix ──
    //
    // The Wave 23 P0 fix #3 (Task #153) above collapsed the embed-join to a
    // .in() pattern but did NOT set an explicit .limit() — so PostgREST's
    // default 1000-row cap silently truncated the items result. With 953
    // visible bills × ~3-5 items each the items table has ~3-5k rows in
    // scope, but only the first 1000 (ordered unspecified by PostgREST →
    // happens to be the OLDEST billids) came back. The newest bills (highest
    // billid) got nothing in the Map → every `รายการฝากนำเข้า` cell rendered
    // empty `—`. Live-verified 2026-06-03: items returned 1000 with first
    // billid=9691 (= an OLD bill, NOT among the visible top-rows 10632-10643).
    //
    // Fix: explicit .limit(50000) + ascending sort by billid so the result
    // set is deterministic. 50k is far above the ~26k total tb_bill_item
    // row count today + leaves headroom; if it ever caps the page warns
    // in the console.
    const itemsRes = await admin
      .from("tb_bill_item")
      .select("id, billid, fid")
      .in("billid", visibleBillIds)
      .order("billid", { ascending: true })
      .limit(50000);
    if (itemsRes.error) {
      // §0c — log + surface; do NOT swallow. Items being null here is
      // a real bug (already-visible bills must have item rows by
      // construction), not a benign empty.
      console.error("[combine-bill] tb_bill_item query failed", {
        visibleBillCount: visibleBillIds.length,
        code: itemsRes.error.code,
        message: itemsRes.error.message,
        details: itemsRes.error.details,
      });
      throw new Error(
        `combine-bill: failed to load tb_bill_item — ${itemsRes.error.code ?? "unknown"}: ${itemsRes.error.message}`,
      );
    }
    rawItems = (itemsRes.data ?? []) as unknown as BillItemRow[];
    if (rawItems.length >= 50000) {
      console.warn("[combine-bill] tb_bill_item hit the 50k cap — paginate", {
        visibleBillCount: visibleBillIds.length,
      });
    }
  }

  // Build the (billID -> fID[]) Map — replaces legacy `search()` helper.
  const itemsByBill = new Map<number, number[]>();
  for (const r of rawItems) {
    const arr = itemsByBill.get(r.billid);
    if (arr) arr.push(r.fid);
    else itemsByBill.set(r.billid, [r.fid]);
  }

  // ── Filter banner copy (forwarder-bill.php L111-114) ─────────
  const filterBanner =
    filterMode === "range"
      ? `กรองตั้งแต่วันที่ ${sp.date ?? ""}`
      : filterMode === "all"
        ? "ทั้งหมด (ไม่กรองวันที่)"
        : "90 วันที่ผ่านมา (default)";

  const dateInputDefault =
    filterMode === "range" && sp.date
      ? sp.date
      : `${dateMinusDaysISO(90)} - ${todayISO()}`;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb — 2026-06-03 (ภูม flag): ย้ายจาก ฝากนำเข้า → ระบบบัญชี →
          รายรับ → รวมบิลสินค้า ตาม PEAK pattern (acc-system-cargo.php). The
          /admin/forwarders/combine-bill URL stays for bookmark stability;
          only the breadcrumb + section label reflect the move. */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/accounting" className="hover:text-primary-600">ระบบบัญชี</Link>
        <span>/</span>
        <span className="text-muted">รายรับ</span>
        <span>/</span>
        <span className="text-foreground">รวมบิลสินค้า (ใบส่งสินค้า)</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ระบบบัญชี · รายรับ</p>
          <h1 className="mt-1 text-2xl font-bold">รวมบิลสินค้า (ใบส่งสินค้า)</h1>
          <p className="mt-1 text-sm text-muted">
            รวมหลายรายการฝากนำเข้าของลูกค้าเดียวกันเป็นใบส่งสินค้าใบเดียว · {totalBills.toLocaleString("th-TH")} รายการ
          </p>
        </div>
        {canMutate && (
          <Link
            href="/admin/forwarders/combine-bill/add"
            className="rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-600 inline-flex items-center gap-1.5"
          >
            <span aria-hidden>+</span> สร้างบิลรวม
          </Link>
        )}
      </div>

      {/* Wave 23 status banner — 4 P0 bugs from click-through audit closed */}
      <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs text-emerald-800 flex items-start gap-2">
        <span aria-hidden>✓</span>
        <div className="flex-1">
          <span className="font-medium">Wave 23 P0:</span>{" "}
          ✅ Tailwind chrome · tb_bill + tb_bill_item reads · สร้าง/ลบบิล wired · บิล # คลิกได้ → print · พิมพ์บิลรวม (browser) ·{" "}
          <span className="opacity-75">
            ⏳ Future polish: daterangepicker JS · bulk-select+print · @react-pdf PDF download
          </span>
        </div>
      </div>

      {/* Date range filter */}
      <form
        method="GET"
        action="/admin/forwarders/combine-bill"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-3"
      >
        <label htmlFor="date" className="block text-xs font-medium text-foreground">
          วันที่บันทึกรายการ
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <input
            id="date"
            type="text"
            name="date"
            defaultValue={dateInputDefault}
            placeholder="YYYY-MM-DD - YYYY-MM-DD"
            className="flex-1 min-w-[260px] rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="submit"
            name="historyTable"
            value="true"
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            ค้นหา
          </button>
          <button
            type="submit"
            name="historyTableAll"
            value="true"
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            ทั้งหมด
          </button>
          <Link
            href="/admin/forwarders/combine-bill"
            className="rounded-lg border border-border bg-white px-3 py-2 text-xs text-muted hover:bg-surface-alt"
          >
            ล้าง
          </Link>
        </div>
        <p className="text-[11px] text-muted">
          กรอบเวลาปัจจุบัน: <span className="font-medium text-foreground">{filterBanner}</span>
        </p>
      </form>

      {/* CSV export — current page of bills (50/page · honours date filter).
          Accounting uses the export to attach to PEAK / Excel reconciliation
          when handing the อ.ก. trail to finance. Each row lists the linked
          forwarder IDs in one column so the recipient can drill back to the
          source items. */}
      {bills.length > 0 && (
        <div className="flex justify-end">
          <CsvButton
            rows={bills.map((row) => {
              const fids = itemsByBill.get(row.billid) ?? [];
              const csvRow: CsvRow = {
                billid: row.billid,
                date: row.date ?? "",
                adminid: row.adminid ?? "",
                printstatus: row.printstatus === "1" ? "พิมพ์แล้ว" : "ยังไม่พิมพ์",
                item_count: fids.length,
                forwarder_ids: fids.join(", "),
              };
              return csvRow;
            })}
            fetchAll={async () => {
              "use server";
              // Export the FULL filtered bill list (all pages, capped) — audited
              // via admin_export_log (export walk-off trail · owner directive).
              // Captures the page's already-derived date window so the export's
              // WHERE clause matches the on-screen table exactly (no drift).
              return exportCombineBillAll({ filterMode, filterStart, filterEnd });
            }}
            cols={[
              { key: "billid",        label: "billID" },
              { key: "date",          label: "วันที่บันทึก" },
              { key: "adminid",       label: "ผู้รวมบิล" },
              { key: "printstatus",   label: "สถานะการพิมพ์" },
              { key: "item_count",    label: "จำนวนรายการ" },
              { key: "forwarder_ids", label: "เลขที่ฝากนำเข้า (fID)" },
            ]}
            filename={`combine-bill-page${page}-${filterMode}-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {bills.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📦</div>
            <p className="text-sm font-medium text-foreground">ยังไม่มีรายการรวมบิลในช่วงเวลานี้</p>
            <p className="text-xs text-muted">ลองเปลี่ยนตัวกรอง หรือกดปุ่ม &quot;ทั้งหมด&quot; ด้านบน</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">billID</th>
                  <th className="px-4 py-3 whitespace-nowrap">เลขที่รวมบิล</th>
                  <th className="px-4 py-3">รายการฝากนำเข้า</th>
                  <th className="px-4 py-3 whitespace-nowrap">ผู้รวมบิล</th>
                  <th className="px-4 py-3 whitespace-nowrap">เวลา</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((row) => {
                  const fids = itemsByBill.get(row.billid) ?? [];
                  const printHref = buildCombineBillPrintHref(fids);
                  const detailHref = buildCombineBillDetailHref(row.billid);
                  // re-sweep A2 #9 (2026-06-01): bill # now links to the
                  // editable detail page (`combine-bill/[id]`) — the
                  // canonical "view/edit this bill" surface. The detail
                  // page works for empty bills too (shows the add-items
                  // form), so the link is never disabled. Print stays its
                  // own button (it 404s on empty, so that one is gated).
                  return (
                    <tr key={row.billid} className="border-t border-border align-top hover:bg-surface-alt/40">
                      <td className="px-4 py-3 text-xs font-mono text-muted">{row.billid}</td>
                      <td className="px-4 py-3 text-xs font-mono font-semibold">
                        <Link
                          href={detailHref}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                          title="ดู/แก้ไขบิลรวมนี้"
                        >
                          #{row.billid}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {fids.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[460px]">
                            {fids.map((fid) => (
                              <Link
                                key={fid}
                                href={`/admin/forwarders/${fid}`}
                                target="_blank"
                                className="rounded-full border border-border bg-surface-alt px-2 py-0.5 font-mono text-[11px] text-primary-600 hover:bg-primary-50 hover:border-primary-200"
                              >
                                #{fid}
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{row.adminid}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {row.date
                          ? new Date(row.date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap gap-1 justify-end">
                          {/* ดู/แก้ไข — reachable for ALL admin roles (§0d).
                              view-only roles can open the detail to inspect;
                              mutate roles get the add/remove/delete controls
                              inside it. */}
                          <Link
                            href={detailHref}
                            className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
                          >
                            ดู/แก้ไข
                          </Link>
                          {canMutate && (
                            <CombineBillRowActions
                              billId={row.billid}
                              printHref={printHref}
                              hasItems={fids.length > 0}
                            />
                          )}
                        </div>
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
        total={totalBills}
        basePath="/admin/forwarders/combine-bill"
        params={{
          historyTable: sp.historyTable,
          historyTableAll: sp.historyTableAll,
          date: sp.date,
        }}
      />
    </main>
  );
}
