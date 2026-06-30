/**
 * /admin/billing-run — ใบวางบิล / billing-run history list (R-2 · PEAK tabs)
 *
 * 2026-06-03 (ภูม flag · R-2 close-out): rewritten to mirror PEAK accounting
 * UI — 6-tab nav (ล่าสุด / ทั้งหมด / รอรับชำระ / เกินเวลารับชำระ / รับชำระแล้ว /
 * ยกเลิก) + the shared CARGO_MENUBAR + PageTopMenubar chrome so the page
 * is reachable from /admin/accounting → รายรับ → ใบวางบิล AND visually
 * matches the receipt/tax-invoice surfaces.
 *
 * Status enum on tb_forwarder_invoice = issued | paid | cancelled. "overdue"
 * is computed (status='issued' AND date_due < today) — not stored.
 *
 * Tab semantics:
 *   ?tab=recent     (default) — last 30 days · any status
 *   ?tab=all                  — all-time · any status
 *   ?tab=issued               — รอรับชำระ (status='issued' AND date_due >= today)
 *   ?tab=overdue              — เกินเวลา (status='issued' AND date_due < today)
 *   ?tab=paid                 — รับชำระแล้ว (status='paid')
 *   ?tab=cancelled            — ยกเลิก (status='cancelled')
 *
 * PEAK has 8 tabs (adds ร่าง + รออนุมัติ). Pacred ไม่มี draft/approval workflow
 * — สร้าง = issued ทันที — so we ship 6 tabs (the ones with real DB states).
 * If ภูม adds approval workflow later, append 'draft'/'pending_approval'
 * to the status check + add 2 more tabs here.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { getInvoiceList } from "@/actions/admin/billing-run";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { createAdminClient } from "@/lib/supabase/admin";
import { CntListTable, type CntListRow } from "../report-cnt/cnt-list-table";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportBillingRunAll } from "@/actions/admin/export/billing-run";
import { Explain, GUIDE } from "@/components/ui/tooltip";

// CSV columns — mirror the list <thead> 1:1.
const CSV_COLS: CsvCol[] = [
  { key: "doc_no", label: "เลขที่เอกสาร" },
  { key: "buyer_name", label: "ลูกค้า" },
  { key: "userid", label: "รหัสลูกค้า" },
  { key: "item_count", label: "จำนวนรายการ" },
  { key: "total_thb", label: "ยอดรวม (฿)" },
  { key: "date_issued", label: "วันที่ออก" },
  { key: "date_due", label: "ครบกำหนด" },
  { key: "status", label: "สถานะ" },
];

function csvStatusName(status: "issued" | "paid" | "cancelled", isOverdue: boolean): string {
  if (status === "paid") return "รับชำระแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  if (isOverdue) return "เกินเวลา";
  return "รอรับชำระ";
}

export const dynamic = "force-dynamic";

// Warehouse + transport label maps (mirrors /admin/report-cnt/page.tsx).
// Kept inline so this page is self-contained.
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚛 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ",
};

/**
 * Load cabinets that arrived in Thailand (fstatus > 3) in the last 30 days +
 * group by fCabinetNumber. Mirrors the query in /admin/report-cnt/page.tsx
 * (succeed page mode) but capped + scoped for the billing-run side-list.
 *
 * 2026-06-03 ภูม flag: "เอาหน้านี้มาแปะที่หน้าใบวางบิล" — copy the cabinet
 * list from /admin/report-cnt?page=succeed onto this page so accounting can
 * see cabinets that arrived + jump to creating invoices in one place.
 */
async function loadEligibleCabinets(): Promise<CntListRow[]> {
  const admin = createAdminClient();

  // Date range: last 30 days (vs report-cnt's 90 days — narrower for billing
  // focus · accounting cares about recent arrivals, not historic).
  const today = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const startDate = thirtyAgo.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from("tb_forwarder")
    .select(
      "fwarehousename,fdatestatus4,fstatus,fcabinetnumber,fdatecontainerclose,ftransporttype,fvolume,fweight,fcosttotalprice,ftotalprice",
    )
    .not("fcabinetnumber", "is", null)
    .neq("fcabinetnumber", "")
    .neq("fcabinetnumber", "0")
    .gt("fstatus", "3")
    .gte("fdatecontainerclose", startDate + " 00:00:00")
    .lte("fdatecontainerclose", endDate + " 23:59:59")
    .limit(50_000);
  if (error) {
    console.error(`[billing-run loadEligibleCabinets]`, { code: error.code, message: error.message });
    return [];
  }
  if (!rows) return [];

  // Group by cabinet (PostgREST cannot do SUM/GROUP BY without an RPC, so
  // aggregate at app layer · same as /admin/report-cnt).
  type Row = {
    fwarehousename: string;
    fdatestatus4: string | null;
    fstatus: string;
    fcabinetnumber: string;
    fdatecontainerclose: string | null;
    ftransporttype: string;
    fvolume: number;
    fweight: number;
    fcosttotalprice: number;
    ftotalprice: number;
  };
  const byContainer = new Map<string, CntListRow>();
  for (const r of (rows as Row[])) {
    const k = r.fcabinetnumber;
    const existing = byContainer.get(k);
    if (existing) {
      existing.trackCount += 1;
      existing.volumeSum += Number(r.fvolume ?? 0);
      existing.weightSum += Number(r.fweight ?? 0);
      existing.costSum   += Number(r.fcosttotalprice ?? 0);
      existing.priceSum  += Number(r.ftotalprice ?? 0);
      if (r.fdatestatus4 && (!existing.fdatestatus4 || r.fdatestatus4 > existing.fdatestatus4)) {
        existing.fdatestatus4 = r.fdatestatus4;
      }
    } else {
      byContainer.set(k, {
        fcabinetnumber: k,
        fwarehousename: r.fwarehousename,
        fdatecontainerclose: r.fdatecontainerclose,
        fdatestatus4: r.fdatestatus4,
        ftransporttype: r.ftransporttype,
        fstatus: r.fstatus,
        trackCount: 1,
        volumeSum: Number(r.fvolume ?? 0),
        weightSum: Number(r.fweight ?? 0),
        costSum:   Number(r.fcosttotalprice ?? 0),
        priceSum:  Number(r.ftotalprice ?? 0),
        isPaid:    false, // not relevant for billing — we don't filter on cnt-payment here
      });
    }
  }

  // Hydrate isPaid from tb_cnt_item (whether internal cnt-payment was made).
  const visibleCabs = Array.from(byContainer.keys());
  if (visibleCabs.length > 0) {
    const { data: paidRows, error: paidErr } = await admin
      .from("tb_cnt_item")
      .select("fCabinetNumber")
      .in("fCabinetNumber", visibleCabs);
    if (paidErr) {
      console.error(`[billing-run loadEligibleCabinets paid]`, { code: paidErr.code, message: paidErr.message });
    }
    const paidSet = new Set((paidRows ?? []).map((r) => (r as { fCabinetNumber: string }).fCabinetNumber));
    for (const [k, v] of byContainer) {
      v.isPaid = paidSet.has(k);
    }
  }

  return Array.from(byContainer.values()).sort((a, b) => {
    if (!a.fdatecontainerclose) return 1;
    if (!b.fdatecontainerclose) return -1;
    return b.fdatecontainerclose.localeCompare(a.fdatecontainerclose);
  });
}

type SearchParams = {
  tab?: string;
  from?: string;
  to?: string;
  userid?: string;
};

type TabKey = "recent" | "all" | "issued" | "overdue" | "slip_pending" | "paid" | "cancelled";

type TabDef = {
  key: TabKey;
  label: string;
  tone: "neutral" | "amber" | "red" | "emerald" | "stone" | "violet";
  /** Implicit date range when tab is "recent" — default tab. */
  defaultDays?: number;
};

const TABS: TabDef[] = [
  { key: "recent",       label: "ล่าสุด",          tone: "neutral", defaultDays: 30 },
  { key: "all",          label: "ทั้งหมด",         tone: "neutral" },
  { key: "issued",       label: "รอรับชำระ",      tone: "amber" },
  { key: "overdue",      label: "เกินเวลารับชำระ", tone: "red" },
  // ภูม 2026-06-29 — เซลแนบสลิปแล้ว รอบัญชีตรวจ + ตัดจ่าย (คิวตรวจสลิปวางบิล).
  { key: "slip_pending", label: "📎 รอตรวจสลิป",  tone: "violet" },
  { key: "paid",         label: "รับชำระแล้ว",    tone: "emerald" },
  { key: "cancelled",    label: "ยกเลิก",          tone: "stone" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function tabToneCls(tone: TabDef["tone"], active: boolean): string {
  if (active) {
    const map: Record<TabDef["tone"], string> = {
      neutral: "bg-primary-600 text-white border-primary-600",
      amber:   "bg-amber-600 text-white border-amber-600",
      red:     "bg-red-600 text-white border-red-600",
      emerald: "bg-emerald-600 text-white border-emerald-600",
      stone:   "bg-stone-600 text-white border-stone-600",
      violet:  "bg-violet-600 text-white border-violet-600",
    };
    return map[tone];
  }
  return "bg-white dark:bg-surface text-foreground border-border hover:bg-surface-alt";
}

function statusBadge(status: "issued" | "paid" | "cancelled", isOverdue: boolean) {
  if (status === "paid") {
    return <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">รับชำระแล้ว</span>;
  }
  if (status === "cancelled") {
    return <span className="rounded-full bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-0.5 text-xs whitespace-nowrap">ยกเลิก</span>;
  }
  if (isOverdue) {
    return <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">เกินเวลา</span>;
  }
  return <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">รอรับชำระ</span>;
}

export default async function BillingRunListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles can view +
  // create billing-run invoices (doc issuance); mark-paid + cancel stay
  // accounting-only (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  const { roles } = await requireAdmin(["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"]);
  const sp = await searchParams;

  // 2026-06-03 ภูม flag: pre-load cabinet list (last 30d · เข้าโกดังไทยแล้ว)
  // so accounting can browse arrived containers + jump to billing in one
  // place. Mirrors /admin/report-cnt?page=succeed.
  const eligibleCabinets = await loadEligibleCabinets();
  // Money-internal: showMoney gates the fcosttotalprice (ต้นทุน) column. Owner
  // 2026-06-18 — super + ops no longer see cost internals; only ultra/
  // accounting/pricing do. (Previously super/ops/accounting.)
  const showMoney = canViewCostProfit(roles);

  const requestedTab = (sp.tab ?? "recent") as TabKey;
  const tab = TABS.find((t) => t.key === requestedTab)?.key ?? "recent";
  const tabDef = TABS.find((t) => t.key === tab)!;

  // Date range — only applied to "recent" (default 30d) tab by default.
  // Other tabs honor explicit ?from/?to params; the status-only tabs
  // (issued/overdue/paid/cancelled) ignore the date range by default so
  // staff sees the FULL bucket — easier dunning + collections workflow.
  const today = isoToday();
  const dateFrom = sp.from || (tabDef.defaultDays ? isoDaysAgo(tabDef.defaultDays) : undefined);
  const dateTo   = sp.to   || (tabDef.defaultDays ? today : undefined);

  // Map tab → status filter for the action
  type StatusFilter = "all" | "issued" | "paid" | "cancelled" | "overdue" | "slip_pending";
  let statusFilter: StatusFilter = "all";
  if (tab === "issued")       statusFilter = "issued";
  if (tab === "overdue")      statusFilter = "overdue";
  if (tab === "slip_pending") statusFilter = "slip_pending";
  if (tab === "paid")         statusFilter = "paid";
  if (tab === "cancelled")    statusFilter = "cancelled";
  // recent + all → all statuses

  const res = await getInvoiceList({
    dateFrom,
    dateTo,
    status: statusFilter,
    userid: sp.userid?.trim() || undefined,
    limit: 1000,
  });

  // Always fetch the per-tab counts for the tab strip (independent of the
  // active tab's filter so badges show the true bucket size, not the
  // post-filter remainder).
  const [recentRes, allRes, issuedRes, overdueRes, slipPendingRes, paidRes, cancelledRes] = await Promise.all([
    getInvoiceList({ dateFrom: isoDaysAgo(30), dateTo: today, status: "all", limit: 1 }),
    getInvoiceList({ status: "all", limit: 1 }),
    getInvoiceList({ status: "issued", limit: 1 }),
    getInvoiceList({ status: "overdue", limit: 1 }),
    getInvoiceList({ status: "slip_pending", limit: 1 }),
    getInvoiceList({ status: "paid", limit: 1 }),
    getInvoiceList({ status: "cancelled", limit: 1 }),
  ]);
  const counts: Record<TabKey, number> = {
    recent:       recentRes.ok      ? recentRes.data!.totalCount      : 0,
    all:          allRes.ok         ? allRes.data!.totalCount         : 0,
    issued:       issuedRes.ok      ? issuedRes.data!.totalCount      : 0,
    overdue:      overdueRes.ok     ? overdueRes.data!.totalCount     : 0,
    slip_pending: slipPendingRes.ok ? slipPendingRes.data!.totalCount : 0,
    paid:         paidRes.ok        ? paidRes.data!.totalCount        : 0,
    cancelled:    cancelledRes.ok   ? cancelledRes.data!.totalCount   : 0,
  };

  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 space-y-4">
        <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting" />
        <PageHeader eyebrow="ADMIN · รายรับ → ใบวางบิล" title="ใบวางบิล (Billing-Run)" />

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          ไม่สามารถโหลดข้อมูลได้: {res.error}
        </div>
      </main>
    );
  }

  const { rows, totalCount } = res.data!;
  const totalUnpaid = rows
    .filter((r) => r.status === "issued")
    .reduce((s, r) => s + r.total_thb, 0);

  // CSV rows — on-screen list mapped to flat cells (mirrors the <thead>).
  const csvRows: CsvRow[] = rows.map((r) => ({
    doc_no: r.doc_no,
    buyer_name: r.buyer_name || "",
    userid: r.userid || "",
    item_count: r.item_count,
    total_thb: thbFmt(r.total_thb),
    date_issued: (r.date_issued ?? "").slice(0, 10),
    date_due: (r.date_due ?? "").slice(0, 10),
    status: csvStatusName(r.status, r.is_overdue),
  }));

  return (
    <main className="space-y-5">
      <title>ใบวางบิล | PR Admin</title>

      {/* PEAK-style accounting top menubar (ระบบบัญชี chrome) */}
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/billing-run" />

      <div className="px-4 md:px-6 lg:px-8 space-y-5">
        <div className="pt-4">
          <PageHeader
            eyebrow="ADMIN · รายรับ → ใบวางบิล"
            title="ใบวางบิล"
            subtitle="ออกใบเรียกเก็บค่าฝากนำเข้าให้ลูกค้าเครดิตเทอม · ดูประวัติ · ปรับสถานะรับชำระ"
            actions={
              <>
                <CsvButton
                  rows={csvRows}
                  cols={CSV_COLS}
                  filename={`billing-run-${tab}.csv`}
                  fetchAll={async () => {
                    "use server";
                    return exportBillingRunAll({
                      dateFrom,
                      dateTo,
                      status: statusFilter,
                      userid: sp.userid?.trim() || undefined,
                    });
                  }}
                />
                <Link href="/admin/billing-run/add" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                  + สร้างใบวางบิลใหม่
                </Link>
              </>
            }
          />
        </div>

        {/* Tab strip (PEAK pattern) */}
        <nav className="flex flex-wrap gap-2 overflow-x-auto scrollbar-x-visible -mx-1 px-1 pb-1">
          {TABS.map((t) => {
            const active = t.key === tab;
            const count = counts[t.key];
            return (
              <Link
                key={t.key}
                href={`/admin/billing-run?tab=${t.key}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors whitespace-nowrap ${tabToneCls(t.tone, active)}`}
              >
                <span>{t.label}</span>
                <span className={`rounded-full px-1.5 text-xs font-medium ${active ? "bg-white/20" : "bg-surface-alt text-muted"}`}>
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* 📦 ตู้พร้อมวางบิล — embed of /admin/report-cnt?page=succeed
            (2026-06-03 ภูม flag: "เอาหน้านี้มาแปะที่หน้าใบวางบิล").
            Accounting can browse arrived containers + click to create
            a billing-run invoice without bouncing to report-cnt first. */}
        <section className="rounded-2xl border border-sky-200 bg-sky-50/30 dark:bg-sky-950/10 overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-sky-200 bg-sky-100/40">
            <div>
              <h2 className="font-bold text-sm flex items-center gap-1.5">
                📦 ตู้พร้อมวางบิล <span className="text-xs font-normal text-muted">(เข้าโกดังไทยแล้ว · 30 วันล่าสุด)</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                ดูภาพรวมตู้ที่ถึงไทยแล้ว · กด <strong>+ สร้างใบวางบิลใหม่</strong> ด้านบนเพื่อเลือก
                <strong> ลูกค้า + forwarders</strong> ที่ต้องการ (ติ๊กข้ามตู้ได้ · เลือกเฉพาะรายการที่พร้อม)
              </p>
            </div>
            <Link
              href="/admin/report-cnt?page=succeed"
              className="text-xs text-sky-700 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              → ดูตู้ทั้งหมด
            </Link>
          </header>

          {eligibleCabinets.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              ไม่มีตู้ที่ถึงโกดังไทยใน 30 วันล่าสุด
              {" "}<Link href="/admin/report-cnt?page=succeed" className="text-sky-600 hover:underline">→ ดูประวัติทั้งหมด</Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-surface">
              <CntListTable
                rows={eligibleCabinets}
                showMoney={showMoney}
                isWaiting={false}
                warehouseLabel={WAREHOUSE_LABEL}
                transportLabel={TRANSPORT_LABEL}
              />
            </div>
          )}
        </section>

        {/* Outstanding amount banner (only when there's unpaid in current view) */}
        {totalUnpaid > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/40 to-orange-50/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-700 font-medium">
                  <Explain label="ยอดค้างชำระในมุมมองปัจจุบัน" def={GUIDE.owed_amount} />
                </div>
                <div className="text-2xl font-bold text-amber-800">{thbFmt(totalUnpaid)} ฿</div>
              </div>
              <div className="text-xs text-amber-600">
                {rows.filter((r) => r.status === "issued").length} ใบ
              </div>
            </div>
          </section>
        )}

        {/* List table */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-xs text-muted">
              {tabDef.label} · แสดง <strong>{rows.length}</strong> จาก {totalCount} ใบ
            </div>
            {/* Date-range filter — visible only on tabs that honor it */}
            {(tab === "recent" || tab === "all") && (
              <form method="GET" className="flex items-center gap-2 text-xs">
                <input type="hidden" name="tab" value={tab} />
                <input type="date" name="from" defaultValue={dateFrom} className="rounded border border-border bg-white dark:bg-surface px-2 py-1" />
                <span className="text-muted">→</span>
                <input type="date" name="to" defaultValue={dateTo} className="rounded border border-border bg-white dark:bg-surface px-2 py-1" />
                <button type="submit" className="rounded bg-foreground/90 text-white px-3 py-1 hover:bg-foreground">ค้นหา</button>
              </form>
            )}
          </div>

          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 text-left">ลูกค้า</th>
                  <th className="px-3 py-2 text-right">จำนวนรายการ</th>
                  <th className="px-3 py-2 text-right">
                    <Explain label="ยอดรวม (฿)" def={GUIDE.bill_gross} align="right" />
                  </th>
                  <th className="px-3 py-2 text-center">วันที่ออก</th>
                  <th className="px-3 py-2 text-center">ครบกำหนด</th>
                  <th className="px-3 py-2 text-center">สถานะ</th>
                  <th className="px-3 py-2 text-right">ดู</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-muted text-sm">
                      ไม่มีใบวางบิลในมุมมองนี้
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/billing-run/${r.id}`} className="font-mono text-primary-600 hover:underline">
                          {r.doc_no}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.buyer_name || "—"}</div>
                        <div className="text-xs text-muted">{r.userid}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right">{r.item_count}</td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        {thbFmt(r.total_thb)}
                        {r.wht_amount > 0 && (
                          <div className="text-xs font-normal text-emerald-700">
                            <Explain label={`สุทธิ ฿${thbFmt(r.net_payable)}`} def={GUIDE.bill_net_payable} align="right" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">{r.date_issued}</td>
                      <td className="px-3 py-2.5 text-center text-xs">{r.date_due}</td>
                      <td className="px-3 py-2.5 text-center">{statusBadge(r.status, r.is_overdue)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/admin/billing-run/${r.id}`} className="text-xs text-primary-600 hover:underline">
                          ดู →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* PEAK-style help note */}
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-4 text-xs text-muted space-y-1">
          <p>💡 <strong>เกี่ยวกับ ใบวางบิล</strong> — เป็นเอกสารเรียกเก็บค่าฝากนำเข้าให้ลูกค้าเครดิตเทอม (juristic/บุคคลธรรมดาที่มีเครดิต) สร้างจากรายการ <code className="bg-surface px-1 rounded">tb_forwarder.fStatus=5</code> (ส่งแล้ว · รอชำระเงิน) ลูกค้าเห็นใบวางบิลของตัวเองที่ <Link href="/billing-run" className="text-primary-600 hover:underline">/billing-run</Link>.</p>
          <p>📨 ส่งแจ้งเตือนผ่าน LINE OA + Email ได้ที่หน้า detail · ระบบเตือนซ้ำอัตโนมัติทุกเช้า 09:00 (cron <code className="bg-surface px-1 rounded">billing-run-overdue</code>) สำหรับใบที่เลยกำหนด.</p>
          <p>🔗 ดูเอกสารที่เกี่ยวข้อง: <Link href="/admin/forwarders/combine-bill" className="text-primary-600 hover:underline">รวมบิลสินค้า (ใบส่งสินค้า)</Link> · <Link href="/admin/accounting/receipts" className="text-primary-600 hover:underline">ใบเสร็จรับเงิน</Link> · <Link href="/admin/accounting/ar-aging" className="text-primary-600 hover:underline">ลูกหนี้ค้างชำระ (AR Aging)</Link></p>
        </section>
      </div>
    </main>
  );
}
