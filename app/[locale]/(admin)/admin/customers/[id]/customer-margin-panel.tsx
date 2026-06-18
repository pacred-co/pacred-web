/**
 * customer-margin-panel.tsx — per-customer margin baseline tracker.
 *
 * 2026-06-05 (ภูม lane · CEO directive CRM-activation):
 *   "ลูกค้าประจำควรได้ราคาดีกว่า cap"
 *
 * Surfaces margin history of THIS customer on /admin/customers/[id]:
 *   · Big number: avg margin per ตู้ (with cap-policy tone)
 *   · Stats: total delivered ตู้ · total revenue · over-cap count · loss count
 *   · Recent 10 delivered ตู้ table with per-row margin + bucket badge
 *   · CTA: filter Margin Monitor + forwarders list to this customer
 *
 * Server-rendered · no JS state · reuses CustomerMarginSummary type.
 */

import { Link } from "@/i18n/navigation";
import type {
  CustomerMarginSummary,
  CustomerMarginBucket,
} from "@/actions/admin/customer-margin";
import { TrendingUp, AlertTriangle, CircleAlert, BarChart3 } from "lucide-react";
// Cost-reveal blur gate (owner ภูม 2026-06-16) — blur margin/ต้นทุน until the PIN.
import { CostRevealRegion, CostRevealToggle } from "@/components/admin/cost-reveal";

const BUCKET_LABEL: Record<CustomerMarginBucket, string> = {
  "negative": "ขาดทุน",
  "0-5k":     "ต่ำ",
  "5-10k":    "กลาง",
  "10-15k":   "ดี",
  "15k+":     "เกิน cap",
};

const BUCKET_CLS: Record<CustomerMarginBucket, string> = {
  "negative": "bg-red-100 text-red-700 border-red-200",
  "0-5k":     "bg-slate-100 text-slate-700 border-slate-200",
  "5-10k":    "bg-blue-100 text-blue-700 border-blue-200",
  "10-15k":   "bg-emerald-100 text-emerald-700 border-emerald-200",
  "15k+":     "bg-amber-100 text-amber-800 border-amber-300",
};

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function CustomerMarginPanel({
  summary,
  canViewCostProfit,
}: {
  summary: CustomerMarginSummary;
  /**
   * Money-internal gate (owner 2026-06-18). This panel exposes per-ตู้ ต้นทุน
   * (fcosttotalprice) + margin — visible only to ultra/accounting/pricing. The
   * PARENT (customers/[id]/legacy-view.tsx) already omits the whole panel (and
   * thus the cost data) when this is false; the early-return here is a
   * defense-in-depth net so the cost/margin data can never render if a future
   * caller mounts the panel unconditionally. (CostRevealRegion is CSS-only and
   * is NEVER the access boundary.)
   */
  canViewCostProfit: boolean;
}) {
  // DATA-LAYER guard — bail before reading any cost/margin field.
  if (!canViewCostProfit) return null;

  const { userid, totalDelivered, totalRevenue, totalMargin, avgMargin,
    overCapCount, overCapSumMargin, negativeCount, negativeSumMargin, recent } = summary;

  // Tone the avg-margin number per CEO policy (≤15k/ตู้).
  // 15k+ → amber (review · ลูกค้าควรได้ราคาดีกว่า)
  // 10-15k → emerald (ดี · ตามเป้า)
  // 0-10k → slate (low margin · sales rep watch)
  // < 0 → red (ขาดทุน)
  const avgTone =
    avgMargin > 15_000 ? { fg: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", label: "🚨 เกิน cap — ลูกค้าควรได้ราคาดีกว่า" } :
    avgMargin > 10_000 ? { fg: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", label: "✅ ตามเป้า cap policy" } :
    avgMargin > 0      ? { fg: "text-slate-700", bg: "bg-slate-50", border: "border-slate-300", label: "📉 ต่ำกว่าเป้า — review ราคา" } :
                         { fg: "text-red-700", bg: "bg-red-50", border: "border-red-300", label: "🔴 ขาดทุนเฉลี่ย — เช็ค rate sheet" };

  return (
    <section
      aria-labelledby="customer-margin-h"
      className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 id="customer-margin-h" className="flex items-center gap-2 text-sm font-bold text-foreground">
          <BarChart3 className="h-4 w-4 text-primary-600" />
          Margin Profile ของลูกค้านี้
          <span className="text-[10px] font-normal text-muted">
            (CEO policy ≤ ฿15k/ตู้)
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <CostRevealToggle />
          <Link
            href={`/admin/forwarders?q=${encodeURIComponent(userid)}`}
            className="text-[10px] text-primary-600 hover:underline"
          >
            ดูฝากนำเข้าทั้งหมด →
          </Link>
          <Link
            href="/admin/accounting/margin-monitor"
            className="text-[10px] text-primary-600 hover:underline"
          >
            Margin Monitor (รวม) →
          </Link>
        </div>
      </div>

      {/* Blur gate (owner ภูม 2026-06-16) — margin/ต้นทุน blurred until PIN. */}
      <CostRevealRegion className="space-y-4">
      {totalDelivered === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-xs text-muted">
          ยังไม่เคยมีตู้ส่งสำเร็จ (fstatus=7) ของลูกค้านี้
          <p className="mt-1 text-[10px]">
            ระบบจะแสดง margin profile เมื่อมีตู้แรกส่งสำเร็จ
          </p>
        </div>
      ) : (
        <>
          {/* Headline avg-margin + policy tone */}
          <div className={`rounded-xl border ${avgTone.border} ${avgTone.bg} p-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              กำไรเฉลี่ย / ตู้
            </p>
            <p className={`mt-1 font-mono text-3xl font-bold ${avgTone.fg}`}>
              ฿{thb(avgMargin)}
            </p>
            <p className={`mt-1 text-xs ${avgTone.fg}`}>
              {avgTone.label}
            </p>
          </div>

          {/* Stats grid — 4 mini-cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <MiniStat
              label="ตู้ส่งสำเร็จ"
              value={totalDelivered.toLocaleString("th-TH")}
              sub="fstatus=7"
            />
            <MiniStat
              label="ยอดขายรวม"
              value={`฿${thb(totalRevenue)}`}
              sub={`กำไรรวม ฿${thb(totalMargin)}`}
              mono
            />
            <MiniStat
              label="ตู้ที่กำไรเกิน cap"
              value={overCapCount.toLocaleString("th-TH")}
              sub={overCapCount > 0 ? `รวม ฿${thb(overCapSumMargin)}` : "—"}
              tone={overCapCount > 0 ? "amber" : "neutral"}
              Icon={overCapCount > 0 ? AlertTriangle : undefined}
            />
            <MiniStat
              label="ตู้ขาดทุน"
              value={negativeCount.toLocaleString("th-TH")}
              sub={negativeCount > 0 ? `รวม ฿${thb(negativeSumMargin)}` : "—"}
              tone={negativeCount > 0 ? "red" : "neutral"}
              Icon={negativeCount > 0 ? CircleAlert : undefined}
            />
          </div>

          {/* Recent 10 ตู้ */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-surface-alt/50 px-3 py-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                ตู้ล่าสุด {Math.min(10, recent.length)} รายการ
              </p>
              <p className="text-[10px] text-muted">
                จากทั้งหมด {totalDelivered.toLocaleString("th-TH")} ตู้
              </p>
            </div>
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-surface-alt/30 text-left text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Forwarder</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">Cabinet</th>
                    <th className="px-3 py-2 text-right">ราคาขาย</th>
                    <th className="px-3 py-2 text-right">ต้นทุน</th>
                    <th className="px-3 py-2 text-right">กำไร</th>
                    <th className="px-3 py-2 text-center">เกรด</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.fid} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/admin/forwarders/${r.fid}`}
                          className="font-mono text-[11px] text-primary-600 hover:underline"
                        >
                          #{r.fid}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-[11px]">
                        {fmtDate(r.fdate)}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-muted">
                        {r.fcabinetnumber ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[11px]">
                        ฿{thb(r.ftotalprice)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted">
                        ฿{thb(r.fcosttotalprice)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono text-[11px] font-bold ${
                        r.margin < 0 ? "text-red-700" :
                        r.margin > 15_000 ? "text-amber-700" :
                        "text-foreground"
                      }`}>
                        ฿{thb(r.margin)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold border ${BUCKET_CLS[r.bucket]}`}>
                          {BUCKET_LABEL[r.bucket]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </CostRevealRegion>
    </section>
  );
}

// Internal helper — mini stat card.
function MiniStat({
  label,
  value,
  sub,
  mono,
  tone = "neutral",
  Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  tone?: "neutral" | "amber" | "red";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneCls =
    tone === "amber" ? "border-amber-200 bg-amber-50" :
    tone === "red"   ? "border-red-200 bg-red-50" :
                       "border-border bg-white dark:bg-surface";
  const fgCls =
    tone === "amber" ? "text-amber-800" :
    tone === "red"   ? "text-red-800" :
                       "text-foreground";
  return (
    <div className={`rounded-lg border ${toneCls} p-2.5`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted flex items-center gap-1">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
      </p>
      <p className={`mt-0.5 ${mono ? "font-mono" : ""} text-base font-bold ${fgCls}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-muted font-mono">{sub}</p>}
    </div>
  );
}
