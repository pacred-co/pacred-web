import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { computeCommission } from "@/lib/sales-commission/calc";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportCommissionsAll } from "@/actions/admin/export/commissions";

/**
 * /admin/commissions — sales-rep commission queue + top earners.
 *
 * REPOINTED 2026-06-02 per ADR-0026 from the DEAD rebuilt
 * `commission_withdrawals` + `commission_accruals` stack (0 rows on prod —
 * silent dead-write per AGENTS.md §0e) onto the LIVE legacy
 * `tb_user_sales` family (the real 4,104 earns + 5 payout history).
 *
 * Path A canonical per ADR-0020 + ADR-0026:
 *   • tb_user_sales         — per-row earned ledger (usstatus 1=unpaid · 2=pending · 3=paid)
 *   • tb_user_sales_admin_pay — withdrawal-request header (status 2=pending · 3=paid out)
 *   • tb_user_sales_pay     — link rows
 *
 * Commission math is the legacy 1% × (1 − 3% WHT) — see lib/sales-commission/calc.ts
 * (ADR-0020 D-2 + report-user-sales-history.php L405). Match what the customer
 * sees on /sales/report so the admin queue and the customer summary reconcile.
 *
 * Roles per ADR-0006 §1.4: super | accounting.
 */

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "2": "รอจ่าย",
  "3": "จ่ายแล้ว",
};
const STATUS_BADGE: Record<string, string> = {
  "2": "bg-amber-50 text-amber-700 border-amber-200",
  "3": "bg-green-50 text-green-700 border-green-200",
};

const SALES_PERCEN = 0.01; // ADR-0020 D-1 — all 4 VIP teams hardcode 0.01

type TopEarnerRow = {
  useridmain:        string;
  unpaidCount:       number;
  gross:             number;
  commission:        number;
  wht:               number;
  net:               number;
  eligible:          boolean;
};

type PayoutRow = {
  id:           number;
  date:         string | null;
  useridmain:   string;
  amount:       number;
  imagesslip:   string;
  status:       string;
  admincreate:  string | null;
  dateslip:     string | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Money-internal gate (owner 2026-06-18): commission amounts (1% · WHT · net
  // payout) are visible ONLY to ultra/accounting/pricing — NOT super. The page
  // stays reachable (god roles satisfy the gate for nav) but a non-cost viewer
  // sees the queue *structure* without the commission money.
  const showMoney = canViewCostProfit(roles);
  const sp = await searchParams;
  const status = sp.status === "2" || sp.status === "3" ? sp.status : null;

  const admin = createAdminClient();

  // ── 1. Top earners — aggregate tb_user_sales (unpaid usstatus='1') by team ──
  //
  // Legacy reference: report-user-sales-history.php L46-55 + L405 — the per-
  // team 1% commission on the unpaid earns. We re-derive it server-side so
  // the queue matches what the customer's withdrawal modal will compute.
  const { data: unpaidRaw, error: unpaidErr } = await admin
    .from("tb_user_sales")
    .select("id, useridmain, idf, date")
    .eq("usstatus", "1");
  if (unpaidErr) {
    console.error("[tb_user_sales unpaid] failed", { code: unpaidErr.code, message: unpaidErr.message });
  }
  type UnpaidRow = { id: number; useridmain: string; idf: number; date: string | null };
  const unpaid = (unpaidRaw ?? []) as unknown as UnpaidRow[];

  // Collect all forwarder ids → batch-query tb_forwarder for ftotalprice + fdiscount
  const fIds = Array.from(new Set(unpaid.map((r) => r.idf)));
  type FwdAmount = { id: number; ftotalprice: number | string | null; fdiscount: number | string | null };
  let fwdById = new Map<number, FwdAmount>();
  if (fIds.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftotalprice, fdiscount")
      .in("id", fIds);
    if (fwdErr) {
      console.error("[tb_forwarder ftotalprice] failed", { code: fwdErr.code, message: fwdErr.message });
    }
    fwdById = new Map(((fwdRaw ?? []) as FwdAmount[]).map((f) => [f.id, f]));
  }

  // Group by useridmain → compute the breakdown via the same calc.ts the
  // customer side uses (anti-reconciliation-drift).
  const teamMap = new Map<string, { rows: UnpaidRow[]; gross: number }>();
  for (const r of unpaid) {
    const f = fwdById.get(r.idf);
    if (!f) continue; // earn-row orphaned from its forwarder — skip (would be data corruption)
    const line = Number(f.ftotalprice ?? 0) - Number(f.fdiscount ?? 0);
    const slot = teamMap.get(r.useridmain) ?? { rows: [], gross: 0 };
    slot.rows.push(r);
    slot.gross += line;
    teamMap.set(r.useridmain, slot);
  }
  const topEarners: TopEarnerRow[] = Array.from(teamMap.entries())
    .map(([useridmain, agg]) => {
      const b = computeCommission(agg.gross, SALES_PERCEN);
      return {
        useridmain,
        unpaidCount: agg.rows.length,
        gross:       b.gross,
        commission:  b.commission,
        wht:         b.wht,
        net:         b.net,
        eligible:    b.eligible,
      };
    })
    .sort((a, b) => b.net - a.net);

  // ── 2. Withdrawal queue — tb_user_sales_admin_pay (status='2' pending · '3' paid) ──
  let q = admin
    .from("tb_user_sales_admin_pay")
    .select("id, date, useridmain, amount, imagesslip, status, admincreate, dateslip")
    .order("date", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data: payoutsRaw, error: payoutsErr } = await q;
  if (payoutsErr) {
    console.error("[tb_user_sales_admin_pay queue] failed", { code: payoutsErr.code, message: payoutsErr.message });
  }
  const payouts: PayoutRow[] = ((payoutsRaw ?? []) as Array<{
    id: number;
    date: string | null;
    useridmain: string;
    amount: number | string | null;
    imagesslip: string | null;
    status: string;
    admincreate: string | null;
    dateslip: string | null;
  }>).map((r) => ({
    id:           r.id,
    date:         r.date,
    useridmain:   r.useridmain,
    amount:       Number(r.amount ?? 0),
    imagesslip:   r.imagesslip ?? "",
    status:       r.status,
    admincreate:  r.admincreate,
    dateslip:     r.dateslip,
  }));

  // ── 3. Status counts (filter chips) ──
  const { data: countRowsRaw, error: countErr } = await admin
    .from("tb_user_sales_admin_pay")
    .select("status");
  if (countErr) {
    console.error("[tb_user_sales_admin_pay counts] failed", { code: countErr.code, message: countErr.message });
  }
  const counts: Record<string, number> = { "2": 0, "3": 0 };
  for (const r of ((countRowsRaw ?? []) as Array<{ status: string }>)) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const totalCount = (counts["2"] ?? 0) + (counts["3"] ?? 0);

  // Totals over the filtered queue (for the summary band).
  const sumAmount = payouts.reduce((s, p) => s + p.amount, 0);
  const grandUnpaidNet = topEarners.reduce((s, t) => s + t.net, 0);

  // PERF (2026-06-03): client-slice the withdrawal-queue table (50/page) —
  // sumAmount + status counts above stay full-set-correct (computed over the
  // full payouts window / their own queries). Top-earners is a fixed top-20
  // summary, untouched.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pagePayouts = payouts.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // ── CSV export of the withdrawal-payout queue (owner directive 2026-06-07) ──
  // Columns mirror the on-screen queue table 1:1 (money as formatted string,
  // dates sliced to YYYY-MM-DD, codes as-is). "หน้านี้" exports the displayed
  // page; "ทั้งหมด" re-runs the SAME status filter unpaginated (drift-free) +
  // writes an admin_export_log audit row.
  const csvCols: CsvCol[] = [
    { key: "id", label: "เลขที่" },
    { key: "useridmain", label: "ทีม" },
    { key: "admincreate", label: "ผู้สร้าง" },
    // amount (รับสุทธิ) = commission money → only for cost-allowed viewers.
    ...(showMoney ? [{ key: "amount", label: "รับสุทธิ" } as CsvCol] : []),
    { key: "status", label: "สถานะ" },
    { key: "requested_at", label: "ขอเมื่อ" },
    { key: "paid_at", label: "จ่ายเมื่อ" },
  ];
  const csvRows: CsvRow[] = pagePayouts.map((p) => ({
    id: p.id,
    useridmain: p.useridmain ?? "",
    admincreate: p.admincreate ?? "",
    ...(showMoney ? { amount: Number(p.amount ?? 0).toFixed(2) } : {}),
    status: STATUS_LABEL[p.status] ?? p.status,
    requested_at: p.date ? p.date.slice(0, 10) : "",
    paid_at: p.dateslip ? p.dateslip.slice(0, 10) : "",
  }));

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/commissions" />
      <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
        <PageHeader
          eyebrow="ADMIN · ค่าคอม + Payouts"
          title="ค่าคอม + Payouts"
          subtitle={
            <>
              Sales-rep ค่าคอมจาก {topEarners.reduce((s, t) => s + t.unpaidCount, 0).toLocaleString("th-TH")} รายการที่ยังไม่ได้เบิก ·
              workflow: ลูกค้าส่งคำขอ → admin จ่ายเงิน + upload slip ({STATUS_LABEL["2"]} → {STATUS_LABEL["3"]})
              <span className="block mt-1 text-[11px]">
                📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_user_sales</code> + <code className="bg-surface-alt px-1 rounded">tb_user_sales_admin_pay</code> (ADR-0026 repoint จาก dead rebuilt) ·
                คำนวณค่าคอม 1% − WHT 3% per ADR-0020.
              </span>
            </>
          }
          actions={
            <Link
              href="/admin/sales-payouts"
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              → ดูคิวจ่ายเงิน (faithful queue)
            </Link>
          }
        />

        {/* Top earners — top 20 teams with unpaid commissions (money-internal) */}
        {showMoney && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-bold text-sm">💰 ทีมที่มีค่าคอมรอเบิก ({topEarners.length} ทีม)</h2>
            <p className="text-xs text-muted">
              รวม net <span className="font-mono font-bold text-primary-700">{thb(grandUnpaidNet)}</span>
            </p>
          </div>
          {topEarners.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">
              ยังไม่มี <code className="bg-surface-alt px-1 rounded">tb_user_sales</code> ที่ usstatus=&apos;1&apos; ·
              earn-trigger ยังไม่ INSERT (ดู actions/admin/earn-trigger-tb-user-sales.ts)
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">ทีม (useridmain)</th>
                    <th className="px-3 py-2 text-right">#รายการ</th>
                    <th className="px-3 py-2 text-right">รวมยอดขาย CHN</th>
                    <th className="px-3 py-2 text-right">ค่าคอม 1%</th>
                    <th className="px-3 py-2 text-right">หัก WHT 3%</th>
                    <th className="px-3 py-2 text-right">รับสุทธิ</th>
                    <th className="px-3 py-2 text-center">เบิกได้?</th>
                  </tr>
                </thead>
                <tbody>
                  {topEarners.slice(0, 20).map((t) => (
                    <tr key={t.useridmain} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{t.useridmain}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{t.unpaidCount.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{thb(t.gross)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{thb(t.commission)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted">{thb(t.wht)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">{thb(t.net)}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {t.eligible ? (
                          <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px]">
                            ≥ ฿1,000
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px]">
                            &lt; ฿1,000
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted">
            net ≥ ฿1,000 = ทีมเบิกค่าคอมได้แล้ว (legacy <code>getListForwarder.php</code> L174) · ลูกค้าจะเห็นปุ่ม &quot;ทำรายการเบิกเงิน&quot; ใน /sales/report
          </p>
        </section>
        )}

        {/* Status filter chips */}
        <nav className="flex flex-wrap gap-2">
          <Link
            href="/admin/commissions"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
            }`}
          >
            ทั้งหมด <span className="ml-1 text-[11px]">({totalCount})</span>
          </Link>
          {(["2", "3"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/commissions?status=${s}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {STATUS_LABEL[s]} <span className="ml-1 text-[11px] opacity-75">({counts[s] ?? 0})</span>
            </Link>
          ))}
        </nav>

        {/* Withdrawal queue/history */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="font-bold text-sm">📋 คำขอเบิกค่าคอม</h2>
              {payouts.length > 0 && (
                <p className="text-xs text-muted">
                  {payouts.length} แถว{showMoney && (
                    <> · รวม <span className="font-mono font-bold text-primary-700">{thb(sumAmount)}</span></>
                  )}
                </p>
              )}
            </div>
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename="commissions-payouts.csv"
              fetchAll={async () => {
                "use server";
                return exportCommissionsAll(status);
              }}
            />
          </div>
          {payouts.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีคำขอเบิก{status && ` สถานะ "${STATUS_LABEL[status]}"`}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">เลขที่</th>
                    <th className="px-3 py-2">ทีม</th>
                    <th className="px-3 py-2">ผู้สร้าง</th>
                    {showMoney && <th className="px-3 py-2 text-right">รับสุทธิ</th>}
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2">ขอเมื่อ</th>
                    <th className="px-3 py-2">จ่ายเมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {pagePayouts.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/sales-payouts/${p.id}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                          title="ดูรายละเอียด (faithful /admin/sales-payouts)"
                        >
                          #{p.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{p.useridmain}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">{p.admincreate ?? "—"}</td>
                      {showMoney && <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(p.amount)}</td>}
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_BADGE[p.status]}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                        {p.date ? new Date(p.date).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                        {p.dateslip ? new Date(p.dateslip).toLocaleDateString("th-TH") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={payouts.length}
            basePath="/admin/commissions"
            params={{ status: sp.status }}
          />
        </div>

        <p className="text-[11px] text-muted">
          🔗 รายละเอียดทุกแถวเปิดที่ <Link href="/admin/sales-payouts" className="underline">/admin/sales-payouts</Link> (faithful detail + pay-out workflow) ·
          earn ทุกครั้งที่ส่งสำเร็จไหลผ่าน <code>earn-trigger-tb-user-sales.ts</code>
        </p>
      </main>
    </>
  );
}
