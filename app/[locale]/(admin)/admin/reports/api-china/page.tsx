/**
 * รายงานยอดการใช้ API จีน — admin report page.
 *
 * Faithful port of legacy `pcs-admin/report-api-china.php`
 * ("ยอดการใช้ API จีน" · menu-report.php L30). READ-ONLY.
 *
 * The headline table is the per-DAY usage cut (rendered through the shared
 * ReportShell — date form + CSV + summary cards + table). A second card
 * below lists the per-CUSTOMER usage cut (busiest customers first).
 *
 * Source: public.tb_search_history (the LIVE China-search/API log written by
 * actions/search.ts) — the legacy tb_history_key twin is empty in prod, so we
 * aggregate from the live log + note it. See ./data.ts for the full rationale.
 *
 * Role gate: super / accounting / ops — matches the sibling monitoring
 * reports (rows expose raw customer search behaviour).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import {
  resolveDateRange,
  intTh,
  dateTh,
  dateTimeTh,
  type ReportData,
} from "@/lib/admin/reports/types";
import { getApiChinaReport } from "./data";

export const dynamic = "force-dynamic";

const CHANNEL_OPTIONS = [
  { value: "all", label: "ทุกช่องทาง" },
  { value: "keyword", label: "ค้นด้วยคำค้นหา" },
  { value: "url", label: "ค้นด้วยลิงก์ (1688/Taobao/Tmall)" },
];

export default async function ApiChinaReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; channel?: string }>;
}) {
  await requireAdmin(["super", "accounting", "ops"]);

  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const channel =
    sp.channel === "keyword" || sp.channel === "url" ? sp.channel : "all";

  const res = await getApiChinaReport(range, channel);
  const report = res.ok
    ? res.data
    : { byDay: [], byCustomer: [], totals: { calls: 0, errors: 0, users: 0 } };

  const { byDay, byCustomer, totals } = report;
  const errorRate =
    totals.calls > 0 ? (totals.errors / totals.calls) * 100 : 0;

  // ── headline table: per-DAY usage ──────────────────────────────────────
  const data: ReportData = {
    columns: [
      { key: "day", label: "วันที่", format: (v) => dateTh(v as string) },
      { key: "calls", label: "จำนวนครั้งที่เรียก API", align: "right", format: (v) => intTh(v as number) },
      { key: "errors", label: "เรียกไม่พบผล/ผิดพลาด", align: "right", format: (v) => intTh(v as number) },
      { key: "users", label: "ลูกค้าที่ใช้งาน (คน)", align: "right", format: (v) => intTh(v as number) },
    ],
    rows: byDay.map((r) => ({
      id: r.id,
      day: r.day,
      calls: r.calls,
      errors: r.errors,
      users: r.users,
    })),
    totals: {
      calls: intTh(totals.calls),
      errors: intTh(totals.errors),
      users: intTh(totals.users),
    },
  };

  const channelLabel =
    CHANNEL_OPTIONS.find((o) => o.value === channel)?.label ?? "ทุกช่องทาง";

  return (
    <div className="space-y-6">
      <ReportShell
        title="ยอดการใช้ API จีน"
        subtitle="จำนวนครั้งที่ลูกค้าเรียกใช้ระบบค้นหาสินค้าจีน (API จีน) — แยกตามวันและตามลูกค้า"
        range={range}
        pathname="/admin/reports/api-china"
        extraQuery={{ channel: channel !== "all" ? channel : undefined }}
        summary={[
          { label: "เรียก API ทั้งหมด", value: intTh(totals.calls), tone: "primary" },
          { label: "ลูกค้าที่ใช้งาน", value: intTh(totals.users) },
          { label: "ไม่พบผล/ผิดพลาด", value: intTh(totals.errors), tone: "red" },
          {
            label: "อัตราผิดพลาด",
            value: errorRate.toLocaleString("th-TH", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }) + "%",
            tone: errorRate > 20 ? "red" : "default",
          },
        ]}
        data={data}
        csvSlug="api-china-by-day"
        emptyLabel="ไม่มีการใช้ API จีนในช่วงเวลานี้"
        extraControls={
          <form
            method="GET"
            action="/admin/reports/api-china"
            className="flex items-end gap-2 flex-wrap"
          >
            <input type="hidden" name="from" value={range.from} />
            <input type="hidden" name="to" value={range.to} />
            <div>
              <label
                htmlFor="channel"
                className="block text-[10px] uppercase tracking-wide text-muted mb-1"
              >
                ช่องทางค้นหา
              </label>
              <select
                id="channel"
                name="channel"
                defaultValue={channel}
                className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt"
            >
              กรองช่องทาง
            </button>
          </form>
        }
        sourceNote={
          res.ok
            ? `แสดงช่องทาง: ${channelLabel} · Source: tb_search_history (ตัวบันทึกการค้นหาจีนที่ใช้งานจริง · ตาราง tb_history_key เดิมว่างใน prod) — port of report-api-china.php`
            : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
        }
      />

      {/* ── second cut: per-CUSTOMER usage ────────────────────────────── */}
      <section className="px-6 lg:px-8 pb-8">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold">ยอดการใช้ API จีน แยกตามลูกค้า</h2>
            <p className="mt-0.5 text-xs text-muted">
              เรียงตามจำนวนครั้งที่เรียกใช้มากที่สุด (สูงสุด 50 อันดับ)
            </p>
          </div>
          {byCustomer.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีข้อมูลลูกค้าในช่วงเวลานี้
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">รหัสสมาชิก</th>
                    <th className="px-4 py-3 whitespace-nowrap">ชื่อลูกค้า</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">จำนวนครั้ง</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">ไม่พบผล/ผิดพลาด</th>
                    <th className="px-4 py-3 whitespace-nowrap">เรียกใช้ล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {byCustomer.slice(0, 50).map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-surface-alt/30 align-top"
                    >
                      <td className="px-4 py-3 text-xs font-mono">{r.member_code}</td>
                      <td className="px-4 py-3 text-xs">{r.customer_name}</td>
                      <td className="px-4 py-3 text-xs text-right font-mono">{intTh(r.calls)}</td>
                      <td className="px-4 py-3 text-xs text-right font-mono">{intTh(r.errors)}</td>
                      <td className="px-4 py-3 text-xs">{dateTimeTh(r.last_call)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
