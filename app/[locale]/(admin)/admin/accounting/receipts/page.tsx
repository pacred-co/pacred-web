/**
 * /admin/accounting/receipts — ใบเสร็จรับเงิน ฝากนำเข้าสินค้า
 * (legacy-faithful rebuild 2026-07-08 · owner "หน้ายังไม่เหมือน")
 *
 * ── PURPOSE ───────────────────────────────────────────────────────
 * Matches the legacy PCS receipt-forwarder-item list layout:
 *
 *   - Title "ใบเสร็จรับเงิน ฝากนำเข้าสินค้า" + CSV / พิมพ์รายงาน / สร้าง buttons
 *   - Tab row #1 = ประเภทลูกค้า (ทั้งหมด / ลูกค้าบริษัท / ลูกค้าทั่วไป · count badges)
 *   - Tab row #2 = สถานะ (Pacred semantics · ทั้งหมด/ร่าง/รอชำระ/ออกแล้ว/ยกเลิก)
 *   - Date range filter (default current month)
 *   - คำอธิบายระบบ card (numbering explainer)
 *   - 13-column table (via ReceiptsVoidTable · keeps tick-to-VOID bulk action)
 *   - Totals row + pagination + CSV
 *
 * ── STATUS SEMANTICS ARE PACRED-NATIVE, NOT LEGACY ────────────────
 * tb_receipt.rstatus: '1'=ออกแล้ว(paid) · '2'=ยกเลิก(cancelled) · '3'=รอชำระ
 * (pending · DEFAULT). We KEEP RSTATUS_CFG + the status tabs on Pacred
 * semantics — the legacy status codes mean something else (1=ร่าง etc.) and
 * copying them would mislabel paid receipts. Only the LAYOUT is legacy.
 *
 * ── DATA SOURCE ───────────────────────────────────────────────────
 * Reads `tb_receipt` via `actions/admin/accounting-receipts.ts:getReceiptList`.
 * The ประเภทลูกค้า filter (cType) + per-cType counts compose WITH the status
 * tab + date range + search — all filters apply together (like legacy).
 *
 * ── ROLES ─────────────────────────────────────────────────────────
 * super | accounting | freight_export_doc | freight_import_doc.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getReceiptList,
  type ReceiptTab,
  type ReceiptCType,
  type ReceiptTabCounts,
  type ReceiptCTypeCounts,
} from "@/actions/admin/accounting-receipts";
import { exportReceiptsAll } from "@/actions/admin/export/acc-receipts";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { Info, Plus, Printer, Search } from "lucide-react";
import { ReceiptsVoidTable } from "./receipts-void-table";

// CSV columns — mirror the on-screen table.
const CSV_COLS: CsvCol[] = [
  { key: "id", label: "ID" },
  { key: "rid", label: "เลขที่เอกสาร" },
  { key: "refid", label: "อ้างอิง" },
  { key: "rdate", label: "วันที่ออก" },
  { key: "rdatecreate", label: "วันที่สร้าง" },
  { key: "corporate", label: "ประเภทลูกค้า" },
  { key: "userid", label: "รหัสลูกค้า" },
  { key: "tax_id", label: "เลขผู้เสียภาษี" },
  { key: "customer", label: "ชื่อลูกค้า" },
  { key: "total_before_wht", label: "ก่อนหัก ณ ที่จ่าย" },
  { key: "ramount", label: "มูลค่าสุทธิ" },
  { key: "wht", label: "WHT หัก" },
  { key: "status", label: "สถานะ" },
];

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────
// Status palette (for the CSV label mapping only — table has its own)
// ────────────────────────────────────────────────────────────

const RSTATUS_LABEL: Record<string, string> = {
  "1": "ออกแล้ว",
  "2": "ยกเลิก",
  "3": "รอชำระ",
  "0": "ร่าง",
};

// Build a default current-month YYYY-MM-DD pair (matches the action's default).
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

const STATUS_TABS: ReceiptTab[] = ["recent", "all", "draft", "pending", "issued", "cancelled"];

function statusTabLabel(t: ReceiptTab, counts: ReceiptTabCounts): string {
  switch (t) {
    case "recent":    return `ล่าสุด`;
    case "all":       return `ทั้งหมด (${counts.all.toLocaleString()})`;
    case "draft":     return `ร่าง (${counts.draft.toLocaleString()})`;
    case "pending":   return `รอชำระ (${counts.pending.toLocaleString()})`;
    case "issued":    return `ออกแล้ว (${counts.issued.toLocaleString()})`;
    case "cancelled": return `ยกเลิก (${counts.cancelled.toLocaleString()})`;
  }
}

const CTYPE_TABS: { key: ReceiptCType; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "com", label: "ลูกค้าบริษัท" },
  { key: "gen", label: "ลูกค้าทั่วไป" },
];

function cTypeCount(k: ReceiptCType, c: ReceiptCTypeCounts): number {
  return k === "com" ? c.com : k === "gen" ? c.gen : c.all;
}

function fmtDateInput(iso: string): string {
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
  ctype?: string;
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

  // Parse status tab — fall back to "recent".
  const tab: ReceiptTab =
    sp.tab === "all" || sp.tab === "draft" || sp.tab === "pending"
      || sp.tab === "issued" || sp.tab === "cancelled"
      ? (sp.tab as ReceiptTab)
      : "recent";

  // Parse ประเภทลูกค้า tab — fall back to "all".
  const cType: ReceiptCType =
    sp.ctype === "com" || sp.ctype === "gen" ? (sp.ctype as ReceiptCType) : "all";

  const range = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : range.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : range.to;
  const pageNum  = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 10;

  const { rows, totals, counts, cTypeCounts, totalRowCount, page, pageSize: usedPageSize } =
    await getReceiptList({
      tab,
      cType,
      dateFrom,
      dateTo,
      search: sp.q ?? "",
      page: pageNum,
      pageSize,
    });

  // CSV — the currently-displayed page rows. Keys match CSV_COLS + exportReceiptsAll.
  const csvRows: CsvRow[] = rows.map((r) => ({
    id: r.id,
    rid: r.rid,
    refid: r.refid ?? "",
    rdate: r.rdate ? r.rdate.slice(0, 10) : "",
    rdatecreate: r.rdatecreate ? r.rdatecreate.slice(0, 10) : "",
    corporate: r.isCorporate ? "นิติบุคคล" : "บุคคลธรรมดา",
    userid: r.userid,
    tax_id: r.recompnumber ?? "",
    customer: r.customerLabel,
    total_before_wht: r.totalBeforeWithholding.toFixed(2),
    ramount: r.ramount.toFixed(2),
    wht: r.whtAmount.toFixed(2),
    status: RSTATUS_LABEL[r.rstatus] ?? r.rstatus,
  }));

  // Pagination math.
  const pageCount = Math.max(1, Math.ceil(totalRowCount / usedPageSize));
  const pageStart = totalRowCount === 0 ? 0 : (page - 1) * usedPageSize + 1;
  const pageEnd   = Math.min(page * usedPageSize, totalRowCount);

  // sp passthrough for nav links (preserve every active filter).
  const spThrough: Record<string, string | undefined> = {
    ctype:     cType === "all" ? undefined : cType,
    q:         sp.q,
    date_from: dateFrom,
    date_to:   dateTo,
  };
  const tabParam = tab === "recent" ? undefined : tab;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className=" px-4 py-6 space-y-5">
        {/* ── Breadcrumb ── */}
        <nav className="text-xs text-slate-500">
          <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
          <span className="mx-1">/</span>
          <span className="text-slate-700">ใบเสร็จรับเงิน ฝากนำเข้าสินค้า</span>
        </nav>

        {/* ── Header — title + buttons ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ใบเสร็จรับเงิน ฝากนำเข้าสินค้า</h1>
            <p className="text-xs text-slate-500 mt-1">
              ใบเสร็จส่วนใหญ่จะถูกสร้างอัตโนมัติเมื่ออนุมัติสลิป · วันที่ออก = วันที่ในสลิป
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* CSV export — page rows + drift-free "ทั้งหมด" (all filtered, audited).
                Omitted on the "recent" landing tab (last-N snapshot has no filtered
                set to match — it would dump the whole table). */}
            <CsvButton
              rows={csvRows}
              cols={CSV_COLS}
              filename="ใบเสร็จรับเงิน-ฝากนำเข้า.csv"
              fetchAll={
                tab === "recent"
                  ? undefined
                  : async () => {
                      "use server";
                      return exportReceiptsAll({
                        tab,
                        cType,
                        dateFrom,
                        dateTo,
                        search: sp.q ?? "",
                      });
                    }
              }
            />
            <Link
              href={`/admin/accounting/closing?year=${dateFrom.slice(0, 4)}&month=${Number.parseInt(dateFrom.slice(5, 7), 10)}`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="size-4" />
              พิมพ์รายงาน
            </Link>
            <Link
              href="/admin/accounting/forwarder-invoice/add"
              className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
            >
              <Plus className="size-4" />
              สร้างใบเสร็จรับเงิน
            </Link>
          </div>
        </div>

        {/* ── Tab row #1 — ประเภทลูกค้า (legacy · composes with the status tab) ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">ประเภทลูกค้า:</span>
          {CTYPE_TABS.map((c) => {
            const active = c.key === cType;
            return (
              <Link
                key={c.key}
                href={buildHref("/admin/accounting/receipts", spThrough, {
                  tab:   tabParam,
                  ctype: c.key === "all" ? undefined : c.key,
                  page:  undefined,
                })}
                className={`inline-flex items-center gap-1.5 rounded-2xl border border-dashed px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-red-300 bg-white text-slate-600 hover:bg-red-50/50"
                }`}
              >
                {c.label}
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">
                  {cTypeCount(c.key, cTypeCounts).toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>

        {/* ── Tab row #2 — สถานะ (Pacred semantics · legacy dashed-pill look) ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">สถานะ:</span>
          {STATUS_TABS.map((t) => (
            <Link
              key={t}
              href={buildHref("/admin/accounting/receipts", spThrough, {
                tab:  t === "recent" ? undefined : t,
                page: undefined,
              })}
              className={`whitespace-nowrap rounded-2xl border border-dashed px-3 py-1.5 text-sm font-medium ${
                t === tab
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-red-300 bg-white text-slate-600 hover:bg-red-50/50"
              }`}
            >
              {statusTabLabel(t, counts)}
            </Link>
          ))}
        </div>

        {/* ── Filter + description (2-col on lg) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Filter row — date range + search */}
          <form
            method="GET"
            action="/admin/accounting/receipts"
            className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-3"
          >
            {/* preserve tab + ctype + reset page on submit */}
            {tab !== "recent" && <input type="hidden" name="tab" value={tab} />}
            {cType !== "all" && <input type="hidden" name="ctype" value={cType} />}

            <label className="flex flex-col text-xs text-slate-600">
              <span>วันที่ออก ตั้งแต่</span>
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
            <label className="flex flex-col text-xs text-slate-600 flex-1 min-w-[220px]">
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
                href={buildHref("/admin/accounting/receipts", {}, {
                  tab:   tabParam,
                  ctype: cType === "all" ? undefined : cType,
                })}
                className="px-3 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-50 text-slate-600"
              >
                ล้าง
              </Link>
            )}
          </form>

          {/* คำอธิบายระบบ — numbering explainer (static · legacy green header) */}
          <aside className="rounded-lg border border-emerald-200 overflow-hidden text-xs text-slate-700">
            <div className="flex items-center gap-1.5 bg-emerald-500 px-3 py-2 font-semibold text-white">
              <Info className="size-4" /> คำอธิบายระบบ
            </div>
            <div className="bg-white p-3 space-y-1.5">
              <p>
                บุคคลธรรมดา = <span className="font-mono font-medium">FRG</span>[ปี ค.ศ. 2 หลัก][เดือน 2 หลัก]-[ลำดับ]
                <span className="text-slate-500"> (เช่น FRG2408-00001)</span>
              </p>
              <p>
                นิติบุคคล = <span className="font-mono font-medium">FRC</span>[ปี ค.ศ. 2 หลัก][เดือน 2 หลัก]-[ลำดับ]
              </p>
              <p>ใบเสร็จถูกสร้างอัตโนมัติเมื่ออนุมัติสลิป</p>
              <p>วันที่ออก = วันที่ในสลิป</p>
            </div>
          </aside>
        </div>

        {/* ── Table — 13-col legacy layout + tick-to-VOID bulk action ── */}
        <ReceiptsVoidTable rows={rows} totals={totals} />

        {/* ── Pagination — 10/page ── */}
        {totalRowCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p>
              แสดง {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} จาก {totalRowCount.toLocaleString()} รายการ
            </p>
            <div className="flex items-center gap-1">
              {page > 1 && (
                <Link
                  href={buildHref("/admin/accounting/receipts", spThrough, {
                    tab:  tabParam,
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
                    tab:  tabParam,
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
