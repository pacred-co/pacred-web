/**
 * /admin/accounting/receipts — PEAK-style ใบเสร็จรับเงิน list (2026-05-30 sitting-B)
 *
 * ── PURPOSE ───────────────────────────────────────────────────────
 * NEW surface adapting the PEAK accounting "ใบเสร็จรับเงิน" page pattern
 * (the owner pasted the full DOM of the sale-side ใบกำกับภาษีขาย version
 * and asked Pacred to adapt the same shell). Matches PEAK on:
 *
 *   - Title + 2 right-aligned buttons (สร้าง / พิมพ์รายงาน)
 *   - 7-tab navigation (ล่าสุด / ทั้งหมด / ร่าง / รอชำระ / ออกแล้ว / ยกเลิก / e-Receipt)
 *   - Date range filter (dd/mm/yyyy - dd/mm/yyyy · default current month)
 *   - Search input + advanced filter chip row
 *   - Table cols: ☐ / เลขที่เอกสาร / ลูกค้า / วันที่ / มูลค่ารวม / WHT / status
 *   - Summary footer row (ผลรวม N รายการ · Σ)
 *   - Pagination 10/page default
 *
 * ── DATA SOURCE ───────────────────────────────────────────────────
 * Reads `tb_receipt` (legacy money-of-record · 0081 L4132) via
 * `actions/admin/accounting-receipts.ts:getReceiptList`. Tab counts via
 * 5 parallel COUNT queries. ลูกค้า name hydrated via IN-batch tb_users
 * join inside the action.
 *
 * ── RSTATUS LEGEND (per forwarder-invoice.ts L54-57 + 0081 L4134 default) ─
 *   '1' = paid     → ออกแล้ว (emerald)
 *   '2' = cancelled → ยกเลิก (red)
 *   '3' = pending   → รอชำระ (amber · the default for new receipts)
 *   '0' (placeholder) → ร่าง — no rows today; forward-compat with draft workflow
 *
 * ── ROLES ────────────────────────────────────────────────────────
 * Guard inside the action (super | accounting). Page-level guard is the
 * same — keep both in sync.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getReceiptList,
  type ReceiptListRow,
  type ReceiptTab,
  type ReceiptTabCounts,
} from "@/actions/admin/accounting-receipts";
import { exportReceiptsAll } from "@/actions/admin/export/acc-receipts";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { Plus, Printer, Search } from "lucide-react";

// CSV columns — mirror the on-screen table (money as the formatted 2dp string,
// dates sliced, codes as-is). Keys match the page-row mapping + exportReceiptsAll.
const CSV_COLS: CsvCol[] = [
  { key: "rid", label: "เลขที่เอกสาร" },
  { key: "refid", label: "อ้างอิง" },
  { key: "customer", label: "ลูกค้า" },
  { key: "userid", label: "รหัสลูกค้า" },
  { key: "corporate", label: "ประเภท" },
  { key: "rdate", label: "วันที่" },
  { key: "total_before_wht", label: "มูลค่ารวม (ก่อน WHT)" },
  { key: "wht", label: "WHT หัก" },
  { key: "ramount", label: "รับสุทธิ" },
  { key: "status", label: "สถานะ" },
  { key: "item_count", label: "จำนวนรายการ" },
];

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────
// Status palette
// ────────────────────────────────────────────────────────────

const RSTATUS_CFG: Record<string, { label: string; chip: string }> = {
  "1": { label: "ออกแล้ว",    chip: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  "2": { label: "ยกเลิก",     chip: "bg-red-100 text-red-800 border border-red-300" },
  "3": { label: "รอชำระ",     chip: "bg-amber-100 text-amber-800 border border-amber-300" },
  "0": { label: "ร่าง",       chip: "bg-slate-100 text-slate-700 border border-slate-300" },
};

function rstatusCfg(rstatus: string) {
  return RSTATUS_CFG[rstatus] ?? {
    label: rstatus,
    chip:  "bg-slate-100 text-slate-700 border border-slate-300",
  };
}

// Build a default current-month YYYY-MM-DD pair (matches the action's
// internal default; we render it as dd/mm/yyyy in the filter UI).
function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to:   `${y}-${pad(m + 1)}-${pad(last)}`,
  };
}

const ALL_TABS: ReceiptTab[] = ["recent", "all", "draft", "pending", "issued", "cancelled"];

function tabLabel(t: ReceiptTab, counts: ReceiptTabCounts): string {
  switch (t) {
    case "recent":    return `ล่าสุด`;
    case "all":       return `ทั้งหมด (${counts.all.toLocaleString()})`;
    case "draft":     return `ร่าง (${counts.draft.toLocaleString()})`;
    case "pending":   return `รอชำระ (${counts.pending.toLocaleString()})`;
    case "issued":    return `ออกแล้ว (${counts.issued.toLocaleString()})`;
    case "cancelled": return `ยกเลิก (${counts.cancelled.toLocaleString()})`;
  }
}

function fmtThb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateInput(iso: string): string {
  // YYYY-MM-DD → dd/mm/yyyy for the read-only filter-row preview text.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function buildHref(
  base: string,
  sp: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const merged: Record<string, string | undefined> = { ...sp, ...patch };
  const parts: string[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (!v) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `${base}?${parts.join("&")}` : base;
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

type SearchParams = {
  tab?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
};

export default async function ReceiptsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles reference
  // receipts after payment (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);

  const sp = await searchParams;

  // Parse tab — fall back to "recent" (PEAK default).
  const tab: ReceiptTab =
    sp.tab === "all" || sp.tab === "draft" || sp.tab === "pending"
      || sp.tab === "issued" || sp.tab === "cancelled"
      ? (sp.tab as ReceiptTab)
      : "recent";

  const range = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : range.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : range.to;
  const pageNum  = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 10;

  const { rows, totals, counts, totalRowCount, page, pageSize: usedPageSize } =
    await getReceiptList({
      tab,
      dateFrom,
      dateTo,
      search: sp.q ?? "",
      page: pageNum,
      pageSize,
    });

  // CSV — the currently-displayed page rows mapped to flat CsvRow objects.
  // Keys match CSV_COLS + the exportReceiptsAll value-mapping (drift-free).
  const csvRows: CsvRow[] = rows.map((r) => ({
    rid: r.rid,
    refid: r.refid ?? "",
    customer: r.customerLabel,
    userid: r.userid,
    corporate: r.isCorporate ? "นิติบุคคล" : "ทั่วไป",
    rdate: r.rdate ? r.rdate.slice(0, 10) : "",
    total_before_wht: r.totalBeforeWithholding.toFixed(2),
    wht: r.whtAmount.toFixed(2),
    ramount: r.ramount.toFixed(2),
    status: rstatusCfg(r.rstatus).label,
    item_count: r.itemCount,
  }));

  // Pagination math.
  const pageCount = Math.max(1, Math.ceil(totalRowCount / usedPageSize));
  const pageStart = totalRowCount === 0 ? 0 : (page - 1) * usedPageSize + 1;
  const pageEnd   = Math.min(page * usedPageSize, totalRowCount);

  // sp passthrough for nav links
  const spThrough: Record<string, string | undefined> = {
    q:         sp.q,
    date_from: dateFrom,
    date_to:   dateTo,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className=" px-4 py-6 space-y-5">
        {/* ── Breadcrumb ── */}
        <nav className="text-xs text-slate-500">
          <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
          <span className="mx-1">/</span>
          <span className="text-slate-700">ใบเสร็จรับเงิน</span>
        </nav>

        {/* ── Header — title + 2 buttons (PEAK pattern) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">ใบเสร็จรับเงิน</h1>
            <p className="text-xs text-slate-500 mt-1">
              ออกใบเสร็จเมื่อรับชำระเงินจากลูกค้า · ใบเสร็จส่วนใหญ่จะถูกสร้างอัตโนมัติเมื่ออนุมัติสลิป
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* CSV export — page rows + drift-free "ทั้งหมด" (all filtered,
                audited via admin_export_log). Reuses the EXACT page filters.
                EXCEPT the "recent" (ล่าสุด) landing tab: it's a last-N snapshot
                with NO date/status filter, so an "export all" there has no
                meaningful filtered set to match (it would dump the whole
                tb_receipt table — drift from the ~10 rows shown). On recent we
                therefore omit fetchAll → only "⬇ CSV (N แถว)" for the visible
                rows. To export every receipt, use the "ทั้งหมด" tab. */}
            <CsvButton
              rows={csvRows}
              cols={CSV_COLS}
              filename="ใบเสร็จรับเงิน.csv"
              fetchAll={
                tab === "recent"
                  ? undefined
                  : async () => {
                      "use server";
                      return exportReceiptsAll({
                        tab,
                        dateFrom,
                        dateTo,
                        search: sp.q ?? "",
                      });
                    }
              }
            />
            {/* "พิมพ์รายงาน" — outline secondary (PEAK). Reuses the closing
                report as the canonical month-end summary printable view. */}
            <Link
              href={`/admin/accounting/closing?year=${dateFrom.slice(0, 4)}&month=${Number.parseInt(dateFrom.slice(5, 7), 10)}`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="size-4" />
              พิมพ์รายงาน
            </Link>
            {/* "สร้างใบเสร็จรับเงิน" — primary brand-red (PEAK · Pacred brand).
                Routes to the existing Wave 29 manual-issue form (/admin/accounting/
                forwarder-invoice/add). Per AGENTS.md §0d every function ships its
                entry-point — this satisfies reachability for the new surface. */}
            <Link
              href="/admin/accounting/forwarder-invoice/add"
              className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
            >
              <Plus className="size-4" />
              สร้างใบเสร็จรับเงิน
            </Link>
          </div>
        </div>

        {/* ── 7-tab nav (PEAK pattern) ── */}
        <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-x-visible">
          {ALL_TABS.map((t) => (
            <Link
              key={t}
              href={buildHref("/admin/accounting/receipts", spThrough, { tab: t === "recent" ? undefined : t, page: undefined })}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                t === tab
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              {tabLabel(t, counts)}
            </Link>
          ))}
          {/* e-Receipt placeholder — not wired (no field exists in tb_receipt
              for e-receipt status today). Marked disabled per PEAK pattern. */}
          <span
            className="whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-300 cursor-not-allowed"
            title="ยังไม่เปิดใช้งาน · รอ ก๊อต ผูก ETDA e-Receipt"
          >
            e-Receipt
          </span>
        </nav>

        {/* ── Filter row — date range + search ── */}
        <form
          method="GET"
          action="/admin/accounting/receipts"
          className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-3"
        >
          {/* preserve tab + reset page on submit */}
          {tab !== "recent" && <input type="hidden" name="tab" value={tab} />}

          <label className="flex flex-col text-xs text-slate-600">
            <span>วันที่ (rdate) ตั้งแต่</span>
            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
              aria-label={`ตั้งแต่ ${fmtDateInput(dateFrom)}`}
            />
          </label>
          <label className="flex flex-col text-xs text-slate-600">
            <span>ถึง</span>
            <input
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
              aria-label={`ถึง ${fmtDateInput(dateTo)}`}
            />
          </label>
          <label className="flex flex-col text-xs text-slate-600 flex-1 min-w-[240px]">
            <span>ค้นหา (เลขเอกสาร / รหัสลูกค้า / ชื่อบริษัท)</span>
            <div className="mt-1 relative">
              <Search className="absolute left-2 top-2.5 size-4 text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="FRG2605-00220 หรือ PR10899"
                className="w-full pl-8 pr-2 py-1.5 rounded border border-slate-300 text-sm"
              />
            </div>
          </label>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-800"
          >
            ค้นหา
          </button>
          {(sp.q || sp.date_from || sp.date_to) && (
            <Link
              href={buildHref("/admin/accounting/receipts", {}, { tab: tab === "recent" ? undefined : tab })}
              className="px-3 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-50 text-slate-600"
            >
              ล้าง
            </Link>
          )}
        </form>

        {/* ── Table — PEAK columns ── */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-10">
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    className="rounded border-slate-300"
                    disabled
                    title="Bulk actions ยังไม่เปิดใช้ — Wave 24+ wire ภายหลัง"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">เลขที่เอกสาร</th>
                <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
                <th className="px-3 py-2 text-left font-medium">วันที่</th>
                <th className="px-3 py-2 text-right font-medium">มูลค่ารวม (ก่อน WHT)</th>
                <th className="px-3 py-2 text-right font-medium">WHT หัก</th>
                <th className="px-3 py-2 text-right font-medium">รับสุทธิ</th>
                <th className="px-3 py-2 text-center font-medium">สถานะ</th>
                <th className="px-3 py-2 text-center font-medium">รายการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-slate-500">
                    ไม่พบใบเสร็จในเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                rows.map((r: ReceiptListRow) => {
                  const cfg = rstatusCfg(r.rstatus);
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${r.rid}`}
                          className="rounded border-slate-300"
                          disabled
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {/* 2026-05-31 sitting-H-fix: row link → mPDF print page
                            (canonical detail). The orphan [rid] summary was dropped
                            since the print page already shows all the same data.
                            Uses numeric tb_receipt.id since the print page route
                            is /admin/accounting/forwarder-invoice/[id]. */}
                        <Link
                          href={`/admin/accounting/forwarder-invoice/${r.id}`}
                          className="font-medium text-primary-700 hover:underline"
                        >
                          {r.rid}
                        </Link>
                        {r.refid && r.refid.trim() && (
                          <div className="text-xs text-slate-500 font-mono">{r.refid}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{r.customerLabel}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {r.userid}{r.isCorporate ? " · นิติบุคคล" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {fmtDate(r.rdate)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ฿{fmtThb(r.totalBeforeWithholding)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {r.whtAmount > 0 ? `฿${fmtThb(r.whtAmount)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary-700">
                        ฿{fmtThb(r.ramount)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.chip}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">
                        {r.itemCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                  <td colSpan={4} className="px-3 py-2.5 text-right text-slate-600">
                    ผลรวม {rows.length.toLocaleString()} รายการ ในหน้านี้
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    ฿{fmtThb(totals.totalBeforeWithholding)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                    ฿{fmtThb(totals.whtAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-primary-700">
                    ฿{fmtThb(totals.ramount)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── Pagination — 10/page (PEAK default) ── */}
        {totalRowCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p>
              แสดง {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} จาก {totalRowCount.toLocaleString()} รายการ
            </p>
            <div className="flex items-center gap-1">
              {page > 1 && (
                <Link
                  href={buildHref("/admin/accounting/receipts", spThrough, {
                    tab:  tab === "recent" ? undefined : tab,
                    page: String(page - 1),
                  })}
                  className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
                >
                  ก่อนหน้า
                </Link>
              )}
              <span className="px-3 py-1.5 text-slate-500">
                หน้า {page} / {pageCount}
              </span>
              {page < pageCount && (
                <Link
                  href={buildHref("/admin/accounting/receipts", spThrough, {
                    tab:  tab === "recent" ? undefined : tab,
                    page: String(page + 1),
                  })}
                  className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
                >
                  ถัดไป
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
