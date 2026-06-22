/**
 * /admin/reports/agent-payouts — รายงานคอมมิชชั่นตัวแทนขาย + ประวัติการจ่ายเงิน
 * (re-sweep A2 #22 · 2026-05-31).
 *
 * The ADMIN-side, read-only VIEW of sales-agent commission + payout history.
 * This was the MISSING report: `/admin/reports/user-sales-history` is a
 * NAME-COLLISION (it serves a per-customer 3-service cohort SUM, not this).
 *
 * **Legacy PHP source (both ported as one read · AGENTS §0b):**
 *   - `pcs-admin/report-user-sales.php` — per-team commission summary
 *     (`?page=THADAVIP|SINVIP|OOAEOMVIP|SWAN`): Σ(fTotalPrice−fDiscount) over
 *     the team's unwithdrawn `tb_user_sales` rows → ส่วนแบ่ง × 1% − 3% WHT.
 *   - `pcs-admin/report-user-sales-history.php` — the payout-history list
 *     (`tb_user_sales_admin_pay`: date · agent coID · amount · slip · status
 *     2=รอดำเนินการ/3=เบิกจ่ายแล้ว · nameStatusUserPay).
 *
 * **Workflow preserved (AGENTS §0a):** same tables, same commission math
 * (lib/sales-commission/calc.ts — the SOT shared with the live earn→withdraw
 * E2E + admin pay-out), same status vocabulary, same min-1,000 gate. Read-only:
 * the actual pay-out (status 2→3) happens on `/admin/sales-payouts`. UI is
 * Pacred Tailwind via the shared ReportShell (mirrors otp-success / yuan-profit).
 *
 * **Role gate:** super + accounting + sales_admin — this report exposes
 * payout amounts + bank-adjacent commission accounting (matches the sibling
 * `/admin/sales-payouts` + `/admin/reports/sales-by-rep` lane).
 *
 * **§0c compliance:** the action destructures { data, error } on every query;
 * this page surfaces a failed load in the ReportShell sourceNote (no throw —
 * a stale report beats a 500 hub).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { Link } from "@/i18n/navigation";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getAgentPayoutReport } from "@/actions/admin/reports-agent-payouts";
import {
  resolveDateRange,
  thb,
  intTh,
  dateTimeTh,
  type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

// Payout-status vocabulary (nameStatusUserPay · function.php:1868):
//   tb_user_sales_admin_pay.status — 2=รอดำเนินการ / 3=เบิกจ่ายแล้ว
//   (1=ยังไม่เบิกจ่าย is a tb_user_sales.usstatus value, kept for completeness).
const PAYOUT_STATUS_LABEL: Record<string, string> = {
  "1": "ยังไม่เบิกจ่าย",
  "2": "รอดำเนินการ",
  "3": "เบิกจ่ายแล้ว",
};

// Payout-history status → badge palette (faithful to nameStatusUserPay colors:
// status 2 = warning/amber, status 3 = success/green).
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-red-50 text-red-700 border-red-200",
  "2": "bg-amber-50 text-amber-700 border-amber-200",
  "3": "bg-green-50 text-green-700 border-green-200",
};

export default async function AgentPayoutsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { roles } = await requireAdmin(["super", "accounting", "sales_admin"]);
  // Commission amounts (1% · WHT · net · pending/paid payout) = money-internal
  // (owner 2026-06-18): only ultra/accounting/pricing. The agent/team + รายการค้าง
  // (count) + ค่าขนส่งจีน (selling) columns stay visible to all.
  const showMoney = canViewCostProfit(roles);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const res = await getAgentPayoutReport(range);

  const agents = res.ok ? res.data.agents : [];
  const history = res.ok ? res.data.history : [];
  const minWithdrawal = res.ok ? res.data.minWithdrawalThb : 1000;

  // ── Grand totals for the summary cards ──
  const totalOpenNet = agents.reduce((s, a) => s + a.open_net, 0);
  const totalPending = agents.reduce((s, a) => s + a.pending_payout, 0);
  const totalPaid = agents.reduce((s, a) => s + a.paid_payout, 0);
  const totalWht = agents.reduce((s, a) => s + a.open_wht, 0);

  // ── ReportShell main table = the per-agent commission summary ──
  // The commission/payout money columns (1% · WHT · net · pending · paid) are
  // omitted from the columns/rows/totals at the data layer for non-cost viewers.
  const moneyCols: ReportData["columns"] = showMoney
    ? [
        { key: "open_commission", label: "ส่วนแบ่ง 1%", align: "right", format: (v) => thb(v as number) },
        { key: "open_wht", label: "หักภาษี 3%", align: "right", format: (v) => thb(v as number) },
        { key: "open_net", label: "เบิกได้สุทธิ", align: "right", format: (v) => thb(v as number) },
        { key: "pending_payout", label: "รอดำเนินการ", align: "right", format: (v) => thb(v as number) },
        { key: "paid_payout", label: "จ่ายแล้วรวม", align: "right", format: (v) => thb(v as number) },
      ]
    : [];
  const data: ReportData = {
    columns: [
      { key: "agent", label: "ตัวแทน / ทีม" },
      { key: "open_rows", label: "รายการค้าง", align: "right", format: (v) => intTh(v as number) },
      { key: "open_gross", label: "ค่าขนส่งจีน (ค้าง)", align: "right", format: (v) => thb(v as number) },
      ...moneyCols,
    ],
    rows: agents.map((a) => ({
      id: a.team_code,
      // member code + team coID stacked (the legacy report keys on coID).
      agent: `${a.member_code} · ${a.team_code}`,
      open_rows: a.open_rows,
      open_gross: a.open_gross,
      ...(showMoney
        ? {
            open_commission: a.open_commission,
            open_wht: a.open_wht,
            open_net: a.open_net,
            pending_payout: a.pending_payout,
            paid_payout: a.paid_payout,
          }
        : {}),
    })),
    totals: {
      open_gross: thb(agents.reduce((s, a) => s + a.open_gross, 0)),
      ...(showMoney
        ? {
            open_commission: thb(agents.reduce((s, a) => s + a.open_commission, 0)),
            open_wht: thb(totalWht),
            open_net: thb(totalOpenNet),
            pending_payout: thb(totalPending),
            paid_payout: thb(totalPaid),
          }
        : {}),
    },
  };

  // ── Payout-history CSV (its own download, the dated detail list) ──
  // จำนวนเงิน (payout amount) = money-internal → omitted for non-cost viewers.
  const historyCsvRows: CsvRow[] = history.map((h) => ({
    วันที่: h.date ? dateTimeTh(h.date) : "",
    รหัสตัวแทน: h.member_code,
    ทีม: h.team_code,
    ...(showMoney ? { จำนวนเงิน: h.amount } : {}),
    ผู้ทำรายการ: h.created_by ?? "",
    มีสลิป: h.has_slip ? "มี" : "—",
    สถานะ: PAYOUT_STATUS_LABEL[h.status] ?? h.status,
  }));
  const historyCsvCols = [
    { key: "วันที่", label: "วันที่" },
    { key: "รหัสตัวแทน", label: "รหัสตัวแทน" },
    { key: "ทีม", label: "ทีม" },
    ...(showMoney ? [{ key: "จำนวนเงิน", label: "จำนวนเงิน" }] : []),
    { key: "ผู้ทำรายการ", label: "ผู้ทำรายการ" },
    { key: "มีสลิป", label: "มีสลิป" },
    { key: "สถานะ", label: "สถานะ" },
  ];

  return (
    <>
      <ReportShell
        title="คอมมิชชั่นตัวแทนขาย"
        subtitle={`สรุปส่วนแบ่ง 1% − หักภาษี 3% ต่อทีมตัวแทน + ประวัติการจ่ายเงิน · เบิกขั้นต่ำ ฿${minWithdrawal.toLocaleString("en-US")} (อ่านอย่างเดียว · จ่ายเงินที่หน้า "เบิกเงินตัวแทน")`}
        range={range}
        pathname="/admin/reports/agent-payouts"
        summary={
          showMoney
            ? [
                { label: "เบิกได้สุทธิ (ค้างทุกทีม)", value: thb(totalOpenNet), tone: "primary" },
                { label: "รอจ่าย (รอดำเนินการ)", value: thb(totalPending), tone: "red" },
                { label: "จ่ายแล้วรวม", value: thb(totalPaid), tone: "green" },
                { label: "หักภาษี 3% (ค้าง)", value: thb(totalWht) },
              ]
            : []
        }
        data={data}
        csvSlug="agent-commission-summary"
        emptyLabel="ยังไม่มีตัวแทนที่มียอดคอมมิชชั่น"
        sourceNote={
          res.ok
            ? "Source: tb_user_sales + tb_forwarder + tb_users (coID) + tb_user_sales_admin_pay — port of report-user-sales.php + report-user-sales-history.php (ADR-0020)"
            : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
        }
      />

      {/* ── Payout-history list (the dated detail · report-user-sales-history.php) ── */}
      <section className="px-6 lg:px-8 pb-8 -mt-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold">ประวัติการจ่ายเงินตัวแทน</h2>
            <p className="text-xs text-muted">
              รายการเบิกเงินในช่วงวันที่ที่เลือก ({history.length.toLocaleString("th-TH")} รายการ)
            </p>
          </div>
          <CsvButton
            rows={historyCsvRows}
            cols={historyCsvCols}
            filename={`agent-payout-history_${range.from}_${range.to}.csv`}
          />
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {history.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีรายการจ่ายเงินในช่วงเวลานี้
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">วันที่ทำรายการ</th>
                    <th className="px-4 py-3">รหัสตัวแทน</th>
                    <th className="px-4 py-3">ทีม</th>
                    {showMoney && <th className="px-4 py-3 text-right">จำนวนเงิน</th>}
                    <th className="px-4 py-3">ผู้ทำรายการ</th>
                    <th className="px-4 py-3 text-center">สลิป</th>
                    <th className="px-4 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {h.date ? dateTimeTh(h.date) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">{h.member_code}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{h.team_code}</td>
                      {showMoney && (
                        <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap">
                          {thb(h.amount)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {h.created_by || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {h.has_slip ? (
                          <span className="text-green-700">✓</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            STATUS_BADGE[h.status] ?? "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {PAYOUT_STATUS_LABEL[h.status] ?? h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted">
          ทำรายการจ่ายเงิน (อัปโหลดสลิป · เปลี่ยนสถานะเป็น &ldquo;เบิกจ่ายแล้ว&rdquo;) ได้ที่{" "}
          <Link href="/admin/sales-payouts" className="text-primary-600 hover:underline">
            หน้าเบิกเงินตัวแทน →
          </Link>
        </p>
      </section>
    </>
  );
}
