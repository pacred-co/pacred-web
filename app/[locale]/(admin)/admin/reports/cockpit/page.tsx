/**
 * Wave C BI — Exec cockpit (แดชบอร์ดผู้บริหาร).
 *
 * One at-a-glance screen of the headline numbers, ALL from LIVE tb_* tables
 * (NOT the rebuilt 0-row twins): MTD revenue + profit + orders · the orders-by-
 * status funnel · wallet system total · outstanding AR · open cold-leads · top
 * carriers/warehouses by volume. Cards + inline SVG bars (no chart lib · matches
 * profit-analytics).
 *
 * Read-only · createAdminClient (via the action) · force-dynamic · mobile-first.
 * Empty/error → ฿0 + banner, never crash (§0c).
 *
 * Reachability (AGENTS.md §0d): linked from the reports hub menubar
 * (reports/page.tsx → "BI / ผู้บริหาร" group) — ≤3 clicks from the sidebar.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCockpitReport } from "@/actions/admin/reports-cockpit";
import type {
  FunnelStage,
  VolumeRow,
  CockpitProfitRow,
  CockpitSlaSummary,
} from "@/actions/admin/reports-cockpit-types";
import { thb, intTh, decTh } from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

export default async function ExecCockpitPage() {
  await requireAdmin(["super", "accounting"]);

  const res = await getCockpitReport();
  const r = res.ok
    ? res.data
    : {
        monthStart: new Date().toISOString().slice(0, 10),
        mtdRevenue: 0,
        mtdProfit: 0,
        mtdOrders: 0,
        funnel: [],
        walletSystemTotal: 0,
        arTotal: 0,
        arOrders: 0,
        openLeads: 0,
        topCarriers: [],
        topWarehouses: [],
        profitByCarrier: [],
        profitByWarehouse: [],
        profitBySalesRep: [],
        sla: {
          cycleAvgDays: 0,
          cycleP90Days: 0,
          slowestStage: "",
          slowestStageLabel: "",
          slowestAvgDays: 0,
          stuckTotal: 0,
          stuckThresholdDays: 7,
          failed: true,
        } as CockpitSlaSummary,
        marginOverCount: 0,
        marginOverProfit: 0,
        marginCapThb: 15000,
        capped: false,
      };

  const marginPct = r.mtdRevenue > 0 ? (r.mtdProfit / r.mtdRevenue) * 100 : 0;
  const funnelMax = Math.max(1, ...r.funnel.map((f) => f.count));

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · REPORTS · BI
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">แดชบอร์ดผู้บริหาร (Exec cockpit)</h1>
          <p className="mt-1 text-sm text-muted">
            ภาพรวมธุรกิจแบบเรียลไทม์จากข้อมูลจริง (tb_*) · เดือนนี้เริ่ม {r.monthStart}
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {!res.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      )}

      {r.capped && res.ok && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ออเดอร์เดือนนี้แตะเพดาน {intTh(20000)} แถว — ยอด MTD / ปริมาณอาจต่ำกว่าจริง
        </div>
      )}

      {/* KPI cards row 1 — money */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="รายได้เดือนนี้ (MTD)" value={thb(r.mtdRevenue)} tone="primary" />
        <Stat label="กำไรเดือนนี้ (MTD)" value={thb(r.mtdProfit)} tone="primary" />
        <Stat label="มาร์จิ้น MTD" value={`${decTh(marginPct, 1)}%`} valueClass={marginPct < 0 ? "text-red-600" : marginPct < 15 ? "text-amber-600" : "text-emerald-600"} />
        <Stat label="ออเดอร์เดือนนี้" value={intTh(r.mtdOrders)} />
      </section>

      {/* KPI cards row 2 — liabilities + pipeline */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="ยอดค้างชำระ (AR)" value={thb(r.arTotal)} valueClass={r.arTotal > 0 ? "text-red-600" : undefined} sub={`${intTh(r.arOrders)} ออเดอร์`} />
        <Stat label="ยอดเงินในกระเป๋าลูกค้า" value={thb(r.walletSystemTotal)} sub="ภาระเงินฝากรวม" />
        <Stat label="ลีดที่ยังไม่ติดต่อ" value={intTh(r.openLeads)} sub="userActive='' + มีเบอร์" link="/admin/leads" />
        <Stat label="ดูลูกหนี้ตามอายุ" value="AR-aging →" link="/admin/accounting/ar-aging" small />
      </section>

      {/* Pricing-health soft advisory (CEO §4 · ≤15k/ตู้) — NEVER blocks, just a nudge */}
      {res.ok && (
        r.marginOverCount > 0 ? (
          <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="select-none">💡</span>
            <span>
              ออเดอร์ฝากนำเข้าที่กำไรเกินแนวทาง <b>฿{intTh(r.marginCapThb)}/ตู้</b> เดือนนี้:{" "}
              <b>{intTh(r.marginOverCount)}</b> ออเดอร์ (รวมกำไร {thb(r.marginOverProfit)}) — พิจารณาปรับให้ลูกค้าคุ้มค่ายิ่งขึ้น{" "}
              <span className="text-amber-600">(คำแนะนำ ไม่บังคับ)</span>
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
            ✓ เดือนนี้ยังไม่มีออเดอร์ที่กำไรเกินแนวทาง ฿{intTh(r.marginCapThb)}/ตู้
          </div>
        )
      )}

      {/* Orders funnel */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">ออเดอร์ฝากนำเข้าตามสถานะ (snapshot ปัจจุบัน)</h2>
        </div>
        <div className="p-4 space-y-2">
          {r.funnel.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {res.ok ? "ไม่มีข้อมูล" : "—"}
            </p>
          ) : (
            r.funnel.map((f) => <FunnelBar key={f.code} f={f} max={funnelMax} />)
          )}
        </div>
      </section>

      {/* Volume leaderboards */}
      <section className="grid lg:grid-cols-2 gap-4">
        <VolumeTable
          title="ขนส่งไทยยอดนิยม (MTD · ตามจำนวนออเดอร์)"
          rows={r.topCarriers}
          okEmpty={res.ok}
        />
        <VolumeTable
          title="โกดังจีนยอดนิยม (MTD · ตามจำนวนออเดอร์)"
          rows={r.topWarehouses}
          okEmpty={res.ok}
        />
      </section>

      {/* SLA dwell-time summary (derived from tb_forwarder fdatestatus2..7) */}
      <SlaSummary sla={r.sla} okEmpty={res.ok} />

      {/* Profit drill-down — by carrier / warehouse / sales-rep (MTD) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold">เจาะลึกกำไร &amp; มาร์จิ้น (MTD)</h2>
        <Link
          href="/admin/reports/profit-analytics"
          className="text-xs text-primary-600 hover:underline"
        >
          ดูรายงานกำไรเต็มรูปแบบ (เลือกช่วงเวลา/CSV) →
        </Link>
      </div>
      <section className="grid lg:grid-cols-2 gap-4">
        <ProfitTable
          title="กำไรตามขนส่งไทย (carrier)"
          firstColLabel="ขนส่ง"
          rows={r.profitByCarrier}
          okEmpty={res.ok}
        />
        <ProfitTable
          title="กำไรตามโกดังจีน (warehouse)"
          firstColLabel="โกดัง"
          rows={r.profitByWarehouse}
          okEmpty={res.ok}
        />
      </section>
      <ProfitTable
        title="กำไรตามเซลล์ผู้ดูแล (sales rep · จากเซลล์ที่ลูกค้าถูก assign)"
        firstColLabel="เซลล์"
        rows={r.profitBySalesRep}
        okEmpty={res.ok}
        repNote
        // Drill into the rep's customers → click a customer → edit sales/CS on the
        // detail page. "(ไม่มีเซลล์)" → the no-rep queue so staff can assign one.
        linkFor={(key) =>
          key === "(ไม่มีเซลล์)"
            ? "/admin/customers?adminidsale=__none__"
            : `/admin/customers?adminidsale=${encodeURIComponent(key)}`
        }
      />

      <p className="text-[11px] text-muted">
        MTD = ตั้งแต่ต้นเดือนถึงปัจจุบัน · รายได้ = ยอดขาย+ค่าขนส่ง+ปรับราคา ·
        กำไร = fprofittotal (หรือ ยอดขาย−ส่วนลด−ต้นทุน) · funnel = นับออเดอร์ทุกสถานะ
        ปัจจุบัน · AR/wallet/leads อ่านสด · ไม่นับ fstatus=99 (ยกเลิก)
      </p>
    </main>
  );
}

// ── components ──────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
  valueClass,
  sub,
  link,
  small,
}: {
  label: string;
  value: string;
  tone?: "primary";
  valueClass?: string;
  sub?: string;
  link?: string;
  small?: boolean;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 font-bold font-mono ${small ? "text-base" : "text-lg sm:text-xl"} ${
          valueClass ?? (tone === "primary" ? "text-primary-700" : "text-foreground")
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </>
  );
  const cls = `rounded-2xl border p-4 shadow-sm ${
    tone === "primary"
      ? "border-primary-200 bg-primary-50/60 dark:bg-primary-950/20"
      : "border-border bg-white dark:bg-surface"
  } ${link ? "hover:bg-surface-alt transition-colors" : ""}`;
  return link ? (
    <Link href={link} className={`block ${cls}`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function FunnelBar({ f, max }: { f: FunnelStage; max: number }) {
  const pct = max > 0 ? Math.max(0, (f.count / max) * 100) : 0;
  // Awaiting-payment (5) is the cash-waiting stage → amber accent.
  const barCls = f.code === "5" ? "bg-amber-500" : "bg-primary-500";
  // Drill into the orders of this status (ดูที่มา/รายละเอียดของงาน · owner ask).
  return (
    <Link
      href={`/admin/forwarders?status=${encodeURIComponent(f.code)}`}
      className="flex items-center gap-3 rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-alt transition-colors group"
      title={`ดูออเดอร์: ${f.label}`}
    >
      <span className="w-32 shrink-0 text-xs text-muted truncate group-hover:text-primary-700">{f.label}</span>
      <div className="flex-1 h-5 rounded-md bg-surface-alt overflow-hidden">
        <div
          className={`h-full rounded-md ${barCls} flex items-center justify-end pr-2`}
          style={{ width: `${Math.max(pct, f.count > 0 ? 6 : 0)}%` }}
        >
          {pct >= 18 && <span className="text-[11px] font-semibold text-white">{intTh(f.count)}</span>}
        </div>
      </div>
      {pct < 18 && <span className="w-12 shrink-0 text-right font-mono text-xs">{intTh(f.count)}</span>}
    </Link>
  );
}

/** Margin-% tone: green ≥15%, amber 0–15%, red < 0 (loss). */
function marginTone(pct: number): string {
  if (pct < 0) return "text-red-600";
  if (pct < 15) return "text-amber-600";
  return "text-emerald-600";
}

function SlaSummary({ sla, okEmpty }: { sla: CockpitSlaSummary; okEmpty: boolean }) {
  const hasData = !sla.failed && (sla.cycleAvgDays > 0 || sla.slowestStage !== "" || sla.stuckTotal > 0);
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">เวลาดำเนินงาน (SLA · MTD)</h2>
        <Link href="/admin/reports/sla-cycle-time" className="text-xs text-primary-600 hover:underline">
          ดู SLA เต็ม + ออเดอร์ค้างสเตจ →
        </Link>
      </div>
      <div className="p-4">
        {!hasData ? (
          <p className="py-6 text-center text-sm text-muted">
            {okEmpty ? (sla.failed ? "โหลดข้อมูล SLA ไม่สำเร็จ" : "ยังไม่มีข้อมูลรอบเดือนนี้") : "—"}
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="รอบงานเฉลี่ย (สร้าง→ส่ง)" value={`${decTh(sla.cycleAvgDays, 1)} วัน`} />
            <Stat label="รอบงาน p90 (ช้าสุด 10%)" value={`${decTh(sla.cycleP90Days, 1)} วัน`} valueClass={sla.cycleP90Days > sla.cycleAvgDays * 2 ? "text-amber-600" : undefined} />
            <Stat
              label="สเตจที่ช้าที่สุด"
              value={sla.slowestStage ? sla.slowestStageLabel : "—"}
              sub={sla.slowestStage ? `เฉลี่ย ${decTh(sla.slowestAvgDays, 1)} วัน` : undefined}
              small
            />
            <Stat
              label={`ค้างเกิน ${sla.stuckThresholdDays} วัน`}
              value={intTh(sla.stuckTotal)}
              valueClass={sla.stuckTotal > 0 ? "text-red-600" : "text-emerald-600"}
              link="/admin/reports/sla-cycle-time"
              sub="ออเดอร์ค้างสเตจ"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ProfitTable({
  title,
  firstColLabel,
  rows,
  okEmpty,
  repNote,
  linkFor,
}: {
  title: string;
  firstColLabel: string;
  rows: CockpitProfitRow[];
  okEmpty: boolean;
  repNote?: boolean;
  /** Optional drill-down: row key → URL of the underlying customers/orders.
   *  Return null for a non-linkable row. Makes the cockpit actionable
   *  (ดูที่มา + แก้ sales/cs · owner ask 2026-06-14). */
  linkFor?: (key: string) => string | null;
}) {
  const maxProfit = Math.max(0, ...rows.map((x) => x.profit));
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[11px] text-muted">
            <tr>
              <th className="px-3 py-2.5">{firstColLabel}</th>
              <th className="px-3 py-2.5 text-right">ออเดอร์</th>
              <th className="px-3 py-2.5 text-right">ยอดขาย</th>
              <th className="px-3 py-2.5 text-right">กำไร</th>
              <th className="px-3 py-2.5 text-right">มาร์จิ้น</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">
                  {okEmpty ? "ไม่มีรายการในเดือนนี้" : "—"}
                </td>
              </tr>
            ) : (
              rows.map((x) => {
                const pct = maxProfit > 0 ? Math.max(0, (x.profit / maxProfit) * 100) : 0;
                const href = linkFor?.(x.key) ?? null;
                return (
                  <tr key={x.key} className="border-t border-border">
                    <td className="px-3 py-2">
                      {href ? (
                        <Link href={href} className="font-medium text-primary-700 hover:underline inline-flex items-center gap-1">
                          {x.label}<span aria-hidden="true" className="opacity-60">→</span>
                        </Link>
                      ) : (
                        <div className="font-medium">{x.label}</div>
                      )}
                      <div className="mt-1 h-1.5 w-full max-w-[140px] rounded-full bg-surface-alt overflow-hidden">
                        <div
                          className={`h-full rounded-full ${x.profit < 0 ? "bg-red-400" : "bg-primary-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{intTh(x.count)}</td>
                    <td className="px-3 py-2 text-right font-mono">{thb(x.revenue)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{thb(x.profit)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${marginTone(x.margin_pct)}`}>
                      {decTh(x.margin_pct, 1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {repNote && (
        <p className="px-4 py-2 text-[11px] text-muted border-t border-border">
          เซลล์ = เซลล์ที่ลูกค้าถูก assign (tb_users.adminIDSale) · ออเดอร์ที่ลูกค้ายังไม่มีเซลล์รวมอยู่ใน &quot;(ไม่มีเซลล์)&quot;
        </p>
      )}
    </section>
  );
}

function VolumeTable({
  title,
  rows,
  okEmpty,
}: {
  title: string;
  rows: VolumeRow[];
  okEmpty: boolean;
}) {
  const max = Math.max(1, ...rows.map((x) => x.count));
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4 space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{okEmpty ? "ไม่มีข้อมูลเดือนนี้" : "—"}</p>
        ) : (
          rows.map((x) => {
            const pct = Math.max(0, (x.count / max) * 100);
            return (
              <div key={x.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs truncate" title={x.label}>
                  {x.label}
                </span>
                <div className="flex-1 h-4 rounded-md bg-surface-alt overflow-hidden">
                  <div className="h-full rounded-md bg-primary-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-xs">{intTh(x.count)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
