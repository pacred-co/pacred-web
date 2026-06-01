import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import {
  getQuoteComparison,
  type QuoteWarehouse,
  type QuoteTransport,
  type QuoteProduct,
  type QuoteBasis,
  type QuoteCarrierLine,
} from "@/actions/admin/quote-comparison";

/**
 * /admin/accounting/quote-compare — Sales forward-looking pricing tool.
 *
 * CEO directive 2026-06-01 (per CLAUDE.md PM section):
 *   "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"
 *
 * This is the FORWARD-LOOKING pair to /admin/accounting/margin-monitor
 * (retrospective). Sales reps use this BEFORE committing — given a
 * customer's quote spec, see which of 9 carriers gives Pacred the best
 * margin (and flag over-cap / loss scenarios).
 *
 * Inputs come via GET query params so the URL is a sharable quote link.
 * Default form opens with example numbers so reps can adjust + iterate.
 *
 * Roles per ADR-0006 §1.4: super | accounting | sales_admin.
 */

export const dynamic = "force-dynamic";

const BUCKET_COLOR: Record<QuoteCarrierLine["bucket"], string> = {
  "negative": "bg-red-50 text-red-700 border-red-200",
  "low":      "bg-slate-50 text-slate-700 border-slate-200",
  "mid":      "bg-blue-50 text-blue-700 border-blue-200",
  "good":     "bg-emerald-50 text-emerald-700 border-emerald-200",
  "over_cap": "bg-amber-50 text-amber-800 border-amber-300",
};
const BUCKET_LABEL: Record<QuoteCarrierLine["bucket"], string> = {
  "negative": "ขาดทุน 🔴",
  "low":      "ต่ำ (0-5k)",
  "mid":      "กลาง (5-10k)",
  "good":     "ดี (10-15k)",
  "over_cap": "เกิน cap 🚨",
};

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseQuery(sp: Awaited<ReturnType<typeof asAwaited>>) {
  const wh   = (sp.warehouse === "2" ? "2" : "1") as QuoteWarehouse;
  const tt   = (sp.transport === "2" ? "2" : "1") as QuoteTransport;
  const ptN  = Number(sp.productType);
  const pt   = (ptN >= 1 && ptN <= 4 ? ptN : 1) as QuoteProduct;
  const bs   = (sp.basis === "kg" ? "kg" : "cbm") as QuoteBasis;
  const w    = Math.max(0, Number(sp.weight ?? "0") || 0);
  const v    = Math.max(0, Number(sp.volume ?? "0") || 0);
  const cust = (sp.userid ?? "").trim();
  return {
    warehouse:       wh,
    transport:       tt,
    productType:     pt,
    basis:           bs,
    weightKg:        w,
    volumeCbm:       v,
    customerUserid:  cust || undefined,
  };
}
type RawSp = Record<string, string | undefined>;
async function asAwaited(p: Promise<RawSp>): Promise<RawSp> { return p; }

export default async function AdminQuoteComparePage({
  searchParams,
}: {
  searchParams: Promise<RawSp>;
}) {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const sp    = await searchParams;
  const input = parseQuery(sp);

  // Only run the report when we have at least one real dimension.
  const hasDims = (input.basis === "kg" ? input.weightKg > 0 : input.volumeCbm > 0);
  const report = hasDims ? await getQuoteComparison(input) : null;

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/quote-compare" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · SALES · CEO</p>
          <h1 className="mt-1 text-2xl font-bold">Sales Quote Comparison</h1>
          <p className="text-xs text-muted mt-1">
            เปรียบเทียบกำไรของ Pacred ใน 9 partner carriers · forward-looking · ใช้ pitch ลูกค้า + ตัดสินใจ route
          </p>
          <p className="text-[10px] text-muted mt-1">
            📊 SALE rate จาก <code className="bg-surface-alt px-1 rounded">tb_rate_g_*</code> / <code className="bg-surface-alt px-1 rounded">tb_rate_vip_*</code> / <code className="bg-surface-alt px-1 rounded">tb_rate_custom_*</code> waterfall (resolve-rate.ts)
            · COST จาก <code className="bg-surface-alt px-1 rounded">tb_settings.fcost*</code> 144 cells (forwarder-costs/costs-model.ts)
            · กำไรเฉลี่ย/ตู้ ดูที่ <Link href="/admin/accounting/margin-monitor" className="text-primary-600 underline">Margin Monitor</Link>
          </p>
        </header>

        {/* Input form */}
        <form method="GET" action="/admin/accounting/quote-compare" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">โกดังจีน</span>
              <select name="warehouse" defaultValue={input.warehouse} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="1">1 · กวางโจว</option>
                <option value="2">2 · อี้อู</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">ขนส่ง</span>
              <select name="transport" defaultValue={input.transport} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="1">1 · ทางรถ</option>
                <option value="2">2 · ทางเรือ</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">ประเภทสินค้า</span>
              <select name="productType" defaultValue={String(input.productType)} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="1">1 · ทั่วไป</option>
                <option value="2">2 · มอก.</option>
                <option value="3">3 · อย./น้ำยา</option>
                <option value="4">4 · พิเศษ</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">คิดราคาตาม</span>
              <select name="basis" defaultValue={input.basis} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="cbm">CBM (คิว)</option>
                <option value="kg">น้ำหนัก (กิโล)</option>
              </select>
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">น้ำหนัก (กก.)</span>
              <input type="number" step="0.01" name="weight" defaultValue={input.weightKg || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">ปริมาตร (CBM)</span>
              <input type="number" step="0.01" name="volume" defaultValue={input.volumeCbm || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">รหัสลูกค้า (optional · VIP/SVIP)</span>
              <input type="text" name="userid" defaultValue={input.customerUserid ?? ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="PR1234 (ปล่อยว่าง = general)" />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
              คำนวณเปรียบเทียบ
            </button>
            {hasDims && (
              <Link href="/admin/accounting/quote-compare" className="text-xs text-muted hover:text-foreground">
                เริ่มใหม่
              </Link>
            )}
          </div>
        </form>

        {/* Report */}
        {!report ? (
          <section className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-8 text-center text-sm text-muted">
            กรอกข้อมูลด้านบน → กดคำนวณ · ระบบจะเทียบ 9 carriers ให้
          </section>
        ) : (
          <>
            {/* SALE summary */}
            <section className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/20 p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-widest text-primary-700">PACRED · ราคาขายลูกค้า</p>
                  <p className="mt-1 text-3xl font-bold font-mono text-primary-700">
                    ฿{thb(report.saleSubtotal)}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    ฿{thb(report.saleRate)}/{report.input.basis === "kg" ? "กก." : "CBM"} × {report.billableValue.toLocaleString("th-TH")} = ฿{thb(report.saleSubtotal)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted">ประเภท rate</p>
                  <p className="font-mono text-sm font-medium">
                    {report.saleSource === "general"  && "🟦 General (PCS tiered)"}
                    {report.saleSource === "vip"      && "🟣 VIP (กลุ่ม)"}
                    {report.saleSource === "svip"     && "🟢 SVIP (per-user)"}
                    {report.saleSource === "manual"   && "✏️ Manual override"}
                    {report.saleSource === "missing"  && "🔴 No rate"}
                  </p>
                  <p className="text-[10px] text-muted mt-1 max-w-xs">{report.saleNote}</p>
                </div>
              </div>
            </section>

            {/* Headline counters */}
            <section className="grid sm:grid-cols-4 gap-3">
              <Stat label="ตู้ active carriers" value={report.carriers.filter((c) => c.hasRate).length.toLocaleString("th-TH")} sub={`จาก 9 carriers ทั้งหมด`} />
              <Stat label="กำไรสูงสุด" value={report.bestCarrier ? `฿${thb(report.bestCarrier.margin)}` : "—"} sub={report.bestCarrier?.carrierLabel ?? ""} highlight={report.bestCarrier && report.bestCarrier.margin > 15_000 ? "warn" : "ok"} />
              <Stat label="กำไรต่ำสุด" value={report.worstCarrier ? `฿${thb(report.worstCarrier.margin)}` : "—"} sub={report.worstCarrier?.carrierLabel ?? ""} highlight={report.worstCarrier && report.worstCarrier.margin < 0 ? "err" : "ok"} />
              <Stat label="เตือน" value={`${report.capWarnings} cap · ${report.lossWarnings} loss`} sub={report.capWarnings + report.lossWarnings === 0 ? "ทุก carrier ปกติ" : "เช็คก่อน pitch"} highlight={(report.capWarnings + report.lossWarnings) > 0 ? "warn" : "ok"} />
            </section>

            {/* Per-carrier comparison */}
            <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="font-bold text-sm">เทียบ 9 partner carriers</h2>
                <p className="text-xs text-muted mt-0.5">เรียงตามกำไรสูง → ต่ำ · 🚨 = เกิน cap (&gt;15k) · 🔴 = ขาดทุน</p>
              </div>
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Carrier</th>
                      <th className="px-3 py-2 text-right">Cost rate</th>
                      <th className="px-3 py-2 text-right">ต้นทุน Pacred</th>
                      <th className="px-3 py-2 text-right">ขายลูกค้า</th>
                      <th className="px-3 py-2 text-right">กำไร</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.carriers]
                      .sort((a, b) => {
                        // active first, then by margin desc
                        if (a.hasRate !== b.hasRate) return a.hasRate ? -1 : 1;
                        return b.margin - a.margin;
                      })
                      .map((c) => (
                        <tr key={c.carrierKey || "ctt"} className={`border-t border-border ${c.hasRate ? "hover:bg-surface-alt/30" : "opacity-50"}`}>
                          <td className="px-3 py-2 font-medium">
                            {c.carrierLabel}
                            {!c.hasRate && <span className="ml-2 text-[10px] text-muted">(no rate)</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{c.costRate > 0 ? `฿${thb(c.costRate)}` : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted">{c.hasRate ? `฿${thb(c.costSubtotal)}` : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted">฿{thb(report.saleSubtotal)}</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${
                            c.bucket === "negative"  ? "text-red-700" :
                            c.bucket === "over_cap"  ? "text-amber-700" :
                            c.bucket === "good"      ? "text-emerald-700" :
                            "text-foreground"
                          }`}>
                            {c.hasRate ? `฿${thb(c.margin)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                            {c.hasRate ? `${c.marginPct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {c.hasRate && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] border ${BUCKET_COLOR[c.bucket]}`}>
                                {BUCKET_LABEL[c.bucket]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Sales advisory */}
            <section className="rounded-2xl border border-border bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-2">
              <p className="font-medium">💡 คำแนะนำ Sales (CEO policy):</p>
              <ul className="list-disc list-inside text-muted space-y-1">
                {report.lossWarnings > 0 && (
                  <li><strong>🔴 {report.lossWarnings} carrier ขาดทุน</strong> — ห้าม route ผ่าน · ต้องเช็ค rate sheet ก่อน pitch (อาจมี typo บน tb_settings)</li>
                )}
                {report.capWarnings > 0 && (
                  <li><strong>🚨 {report.capWarnings} carrier เกิน cap (&gt;฿15k)</strong> — ตามนโยบาย CEO 2026-06-01 ลูกค้ารายนี้ควรได้ราคาดีกว่า · ปรับ rate ลงหรือออก deal</li>
                )}
                {report.lossWarnings === 0 && report.capWarnings === 0 && report.bestCarrier && (
                  <li><strong>✅ Recommend route: <span className="text-primary-700">{report.bestCarrier.carrierLabel}</span></strong> — กำไร ฿{thb(report.bestCarrier.margin)} ({report.bestCarrier.marginPct.toFixed(1)}%) · อยู่ในกรอบ CEO policy ดี</li>
                )}
                {!report.bestCarrier && (
                  <li>ไม่มี carrier active สำหรับ route นี้ · เช็ค <Link href="/admin/settings/forwarder-costs" className="text-primary-600 underline">forwarder-costs settings</Link> · ตั้ง rate ก่อน</li>
                )}
                <li>กรอก <code className="bg-surface-alt px-1 rounded">รหัสลูกค้า</code> ด้านบน → ระบบจะใช้ VIP/SVIP rate (ถ้ามี) · ปล่อยว่าง = General PCS</li>
              </ul>
            </section>

            {/* Pre-built share URL */}
            <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 text-xs">
              <p className="font-medium mb-2">🔗 Share this quote</p>
              <p className="text-muted">
                URL ปัจจุบันใช้ bookmark/forward ใน LINE ได้เลย — admin ที่เปิดจะเห็น quote เดียวกัน (ข้อมูล computed real-time ตาม rate ปัจจุบัน)
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "ok" | "warn" | "err";
}) {
  const ringCls =
    highlight === "warn" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" :
    highlight === "err"  ? "border-red-300 bg-red-50 dark:bg-red-950/20" :
    "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${ringCls}`}>
      <p className="text-[10px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-bold font-mono text-foreground text-lg">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
