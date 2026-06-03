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
import { getInvoiceList } from "@/actions/admin/billing-run";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  from?: string;
  to?: string;
  userid?: string;
};

type TabKey = "recent" | "all" | "issued" | "overdue" | "paid" | "cancelled";

type TabDef = {
  key: TabKey;
  label: string;
  tone: "neutral" | "amber" | "red" | "emerald" | "stone";
  /** Implicit date range when tab is "recent" — default tab. */
  defaultDays?: number;
};

const TABS: TabDef[] = [
  { key: "recent",    label: "ล่าสุด",          tone: "neutral", defaultDays: 30 },
  { key: "all",       label: "ทั้งหมด",         tone: "neutral" },
  { key: "issued",    label: "รอรับชำระ",      tone: "amber" },
  { key: "overdue",   label: "เกินเวลารับชำระ", tone: "red" },
  { key: "paid",      label: "รับชำระแล้ว",    tone: "emerald" },
  { key: "cancelled", label: "ยกเลิก",          tone: "stone" },
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
  await requireAdmin(["super", "accounting", "ops"]);
  const sp = await searchParams;

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
  type StatusFilter = "all" | "issued" | "paid" | "cancelled" | "overdue";
  let statusFilter: StatusFilter = "all";
  if (tab === "issued")    statusFilter = "issued";
  if (tab === "overdue")   statusFilter = "overdue";
  if (tab === "paid")      statusFilter = "paid";
  if (tab === "cancelled") statusFilter = "cancelled";
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
  const [recentRes, allRes, issuedRes, overdueRes, paidRes, cancelledRes] = await Promise.all([
    getInvoiceList({ dateFrom: isoDaysAgo(30), dateTo: today, status: "all", limit: 1 }),
    getInvoiceList({ status: "all", limit: 1 }),
    getInvoiceList({ status: "issued", limit: 1 }),
    getInvoiceList({ status: "overdue", limit: 1 }),
    getInvoiceList({ status: "paid", limit: 1 }),
    getInvoiceList({ status: "cancelled", limit: 1 }),
  ]);
  const counts: Record<TabKey, number> = {
    recent:    recentRes.ok    ? recentRes.data!.totalCount    : 0,
    all:       allRes.ok       ? allRes.data!.totalCount       : 0,
    issued:    issuedRes.ok    ? issuedRes.data!.totalCount    : 0,
    overdue:   overdueRes.ok   ? overdueRes.data!.totalCount   : 0,
    paid:      paidRes.ok      ? paidRes.data!.totalCount      : 0,
    cancelled: cancelledRes.ok ? cancelledRes.data!.totalCount : 0,
  };

  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 space-y-4">
        <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting" />
        <h1 className="text-xl font-bold">ใบวางบิล (Billing-Run)</h1>
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

  return (
    <main className="space-y-5">
      <title>ใบวางบิล (Billing-Run) | PR Admin</title>

      {/* PEAK-style accounting top menubar (ระบบบัญชี chrome) */}
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/billing-run" />

      <div className="px-4 md:px-6 lg:px-8 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div>
            <p className="text-xs text-muted">รายรับ → ใบวางบิล</p>
            <h1 className="text-xl font-bold tracking-tight">ใบวางบิล (Billing-Run)</h1>
            <p className="text-xs text-muted mt-0.5">
              ออกใบเรียกเก็บค่าฝากนำเข้าให้ลูกค้าเครดิตเทอม · ดูประวัติ · ปรับสถานะรับชำระ
            </p>
          </div>
          <Link href="/admin/billing-run/add" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            + สร้างใบวางบิลใหม่
          </Link>
        </header>

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

        {/* Outstanding amount banner (only when there's unpaid in current view) */}
        {totalUnpaid > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/40 to-orange-50/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-700 font-medium">ยอดค้างชำระในมุมมองปัจจุบัน</div>
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
                  <th className="px-3 py-2 text-right">ยอดรวม (฿)</th>
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
                      <td className="px-3 py-2.5 text-right font-medium">{thbFmt(r.total_thb)}</td>
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
