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
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCombineBillPrintHref } from "@/lib/admin/combine-bill-urls";
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
  const canMutate = roles.includes("super");

  const sp = await searchParams;
  const admin = createAdminClient();

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
    .select("billid, date, printstatus, adminid")
    .order("billid", { ascending: false });

  if (filterStart && filterEnd) {
    billsQ = billsQ
      .gte("date", `${filterStart}T00:00:00`)
      .lte("date", `${filterEnd}T23:59:59`);
  }

  const billsRes = await billsQ;

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
    const itemsRes = await admin
      .from("tb_bill_item")
      .select("id, billid, fid")
      .in("billid", visibleBillIds);
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
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>/</span>
        <span className="text-foreground">ประวัติรายการรวมบิล</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ฝากนำเข้า</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติรายการรวมบิล</h1>
          <p className="mt-1 text-sm text-muted">
            รวมหลายรายการฝากนำเข้าของลูกค้าเดียวกันเป็นบิลค่าส่งเดียว · {bills.length.toLocaleString("th-TH")} รายการ
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
                  // Wave 23 P0 fix #2 (Task #153): bill # is now a link to
                  // the print route — the canonical "view this bill"
                  // surface (no dedicated detail page exists; the print
                  // view shows every forwarder ID + the consignee).
                  // Disabled (rendered as muted text) when fids is empty
                  // so we never link to a 404 print page.
                  return (
                    <tr key={row.billid} className="border-t border-border align-top hover:bg-surface-alt/40">
                      <td className="px-4 py-3 text-xs font-mono text-muted">{row.billid}</td>
                      <td className="px-4 py-3 text-xs font-mono font-semibold">
                        {fids.length > 0 ? (
                          <Link
                            href={printHref}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                            title="เปิดบิลรวม (พิมพ์ได้)"
                          >
                            #{row.billid}
                          </Link>
                        ) : (
                          <span className="text-muted" title="บิลนี้ไม่มีรายการฝากนำเข้า — ไม่สามารถเปิดบิลได้">
                            #{row.billid}
                          </span>
                        )}
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
                                className="rounded-full border border-border bg-surface-alt px-2 py-0.5 font-mono text-[10px] text-primary-600 hover:bg-primary-50 hover:border-primary-200"
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
                          {canMutate ? (
                            <CombineBillRowActions
                              billId={row.billid}
                              printHref={printHref}
                            />
                          ) : (
                            <span className="text-[10px] text-muted">view-only</span>
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
    </main>
  );
}
