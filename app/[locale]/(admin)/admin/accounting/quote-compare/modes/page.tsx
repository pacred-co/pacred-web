import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";

import {
  getMultiModeQuote,
  type MultiModeBasis,
  type ModeLine,
} from "@/actions/admin/quote-multimode";
import type { MinSellWarehouse } from "@/lib/pricing/min-sell";

/**
 * /admin/accounting/quote-compare/modes — Lane C #3 (global-trade-group §5):
 * compare รถ/เรือ/แอร์ + add-on services side-by-side for a customer quote.
 *
 * Sibling of /admin/accounting/quote-compare (which compares 9 CARRIERS for
 * ONE transport mode). This one compares the 3 TRANSPORT MODES so the rep can
 * present "รถ vs เรือ vs แอร์" with the all-in price, the per-route min-sell
 * floor, and the CEO profit-cap advisory each.
 *
 * Inputs via GET query → the URL is a sharable quote link.
 * Roles per ADR-0006 §1.4: super | accounting | sales_admin.
 */

export const dynamic = "force-dynamic";

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type RawSp = Record<string, string | undefined>;

function parseQuery(sp: RawSp) {
  const wh = (sp.warehouse === "2" ? "2" : "1") as MinSellWarehouse;
  const ptN = Number(sp.productType);
  const pt = (ptN >= 1 && ptN <= 4 ? ptN : 1) as 1 | 2 | 3 | 4;
  const bs = (sp.basis === "kg" ? "kg" : sp.basis === "cbm" ? "cbm" : "auto") as MultiModeBasis;
  return {
    warehouse: wh,
    productType: pt,
    basis: bs,
    weightKg: Math.max(0, Number(sp.weight ?? "0") || 0),
    volumeCbm: Math.max(0, Number(sp.volume ?? "0") || 0),
    customerUserid: (sp.userid ?? "").trim() || undefined,
    addons: {
      crate: Math.max(0, Number(sp.crate ?? "0") || 0),
      qc: Math.max(0, Number(sp.qc ?? "0") || 0),
      domesticChinaThb: Math.max(0, Number(sp.cn ?? "0") || 0),
      thailandDeliveryThb: Math.max(0, Number(sp.th ?? "0") || 0),
      other: Math.max(0, Number(sp.other ?? "0") || 0),
    },
    estimatedCostThb:
      sp.cost != null && sp.cost !== "" ? Math.max(0, Number(sp.cost) || 0) : undefined,
    // Owner-locked doc-tier discount (ใบกำกับ/ใบขน → −฿X/CBM).
    docTier: sp.docTier === "1",
  };
}

export default async function AdminQuoteCompareModesPage({
  searchParams,
}: {
  searchParams: Promise<RawSp>;
}) {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const sp = await searchParams;
  const input = parseQuery(sp);

  const hasDims = input.weightKg > 0 || input.volumeCbm > 0;
  const report = hasDims ? await getMultiModeQuote(input) : null;

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/quote-compare/modes" />
      <main className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · SALES</p>
          <h1 className="mt-1 text-2xl font-bold">เทียบราคา รถ / เรือ / แอร์</h1>
          <p className="text-xs text-muted mt-1">
            เปรียบเทียบ 3 รูปแบบขนส่ง + ค่าบริการเสริม สำหรับเสนอลูกค้า · all-in price ต่อ mode · พร้อมราคาขายขั้นต่ำ + กรอบกำไร CEO
          </p>
          <p className="text-[11px] text-muted mt-1">
            เทียบ 9 carriers ของ mode เดียว ดูที่{" "}
            <Link href="/admin/accounting/quote-compare" className="text-primary-600 underline">Sales Quote Comparison</Link>
            {" · "}กำไรเฉลี่ย/ตู้{" "}
            <Link href="/admin/accounting/margin-monitor" className="text-primary-600 underline">Margin Monitor</Link>
            {" · "}ตั้งราคาขั้นต่ำ{" "}
            <Link href="/admin/settings/business-config" className="text-primary-600 underline">pricing.min_sell_floor</Link>
          </p>
        </header>

        {/* Input form */}
        <form method="GET" action="/admin/accounting/quote-compare/modes" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="โกดังจีน">
              <select name="warehouse" defaultValue={input.warehouse} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="1">1 · กวางโจว</option>
                <option value="2">2 · อี้อู</option>
              </select>
            </Field>
            <Field label="ประเภทสินค้า">
              <select name="productType" defaultValue={String(input.productType)} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="1">1 · ทั่วไป</option>
                <option value="2">2 · มอก.</option>
                <option value="3">3 · อย./น้ำยา</option>
                <option value="4">4 · พิเศษ</option>
              </select>
            </Field>
            <Field label="คิดราคาตาม (ค่าเทียบ)">
              <select name="basis" defaultValue={input.basis} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
                <option value="auto">อัตโนมัติ (ราคามากสุด)</option>
                <option value="cbm">CBM (คิว)</option>
                <option value="kg">น้ำหนัก (กิโล)</option>
              </select>
            </Field>
            <Field label="รหัสลูกค้า (optional)">
              <input type="text" name="userid" defaultValue={input.customerUserid ?? ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="PR1234 (ว่าง = general)" />
            </Field>
          </div>

          {/* Owner-locked doc-tier discount toggle (owner 2026-06-16) */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="docTier" value="1" defaultChecked={input.docTier} className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500" />
            <span className="font-medium">เปิดใบกำกับ/ใบขน + โอนหยวน/ฝากนำเข้า</span>
            <span className="text-[11px] text-emerald-700">→ ลดค่าขนส่ง ฿800/คิว (เรือ 2,900 · รถ 4,900)</span>
          </label>

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="น้ำหนัก (กก.)">
              <input type="number" step="0.01" name="weight" defaultValue={input.weightKg || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" />
            </Field>
            <Field label="ปริมาตร (CBM)">
              <input type="number" step="0.01" name="volume" defaultValue={input.volumeCbm || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" />
            </Field>
            <Field label="ต้นทุนประเมิน/งาน (กรอบกำไร)">
              <input type="number" step="0.01" name="cost" defaultValue={input.estimatedCostThb ?? ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="(optional)" />
            </Field>
          </div>

          <fieldset className="rounded-xl border border-border p-3">
            <legend className="px-1 text-[11px] uppercase tracking-wider text-muted">ค่าบริการเสริม (บวกทุก mode)</legend>
            <div className="grid sm:grid-cols-5 gap-2">
              <Field label="ตีลัง"><input type="number" step="0.01" name="crate" defaultValue={input.addons.crate || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" /></Field>
              <Field label="QC"><input type="number" step="0.01" name="qc" defaultValue={input.addons.qc || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" /></Field>
              <Field label="ขนส่งในจีน"><input type="number" step="0.01" name="cn" defaultValue={input.addons.domesticChinaThb || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" /></Field>
              <Field label="ส่งในไทย"><input type="number" step="0.01" name="th" defaultValue={input.addons.thailandDeliveryThb || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" /></Field>
              <Field label="อื่นๆ"><input type="number" step="0.01" name="other" defaultValue={input.addons.other || ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" placeholder="0" /></Field>
            </div>
          </fieldset>

          <div className="flex items-center gap-2">
            <button type="submit" className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
              เทียบ 3 mode
            </button>
            {hasDims && (
              <Link href="/admin/accounting/quote-compare/modes" className="text-xs text-muted hover:text-foreground">
                เริ่มใหม่
              </Link>
            )}
          </div>
        </form>

        {/* Report */}
        {!report ? (
          <section className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-8 text-center text-sm text-muted">
            กรอกน้ำหนัก/ปริมาตร → กดเทียบ · ระบบจะเทียบ รถ / เรือ / แอร์ ให้
          </section>
        ) : (
          <>
            <p className="text-[11px] text-muted">
              เรท: <span className="font-medium">{report.rateContextNote}</span>
              {report.belowFloorCount > 0 && (
                <span className="ml-2 text-amber-700">· ⚠️ {report.belowFloorCount} mode ต่ำกว่าราคาขั้นต่ำ</span>
              )}
            </p>

            {/* Mode cards */}
            <section className="grid sm:grid-cols-3 gap-3">
              {report.modes.map((m) => (
                <ModeCard key={m.transport} mode={m} cheapest={report.cheapest?.transport === m.transport} />
              ))}
            </section>

            {/* Detail table */}
            <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="font-bold text-sm">รายละเอียดเทียบ mode</h2>
                <p className="text-xs text-muted mt-0.5">🟢 = ถูกสุด · 🔻 = ต่ำกว่าราคาขายขั้นต่ำ · 🚨 = กำไรเกิน cap</p>
              </div>
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full min-w-[760px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                  <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">ขนส่ง</th>
                      <th className="px-3 py-2">คิดตาม</th>
                      <th className="px-3 py-2 text-right">เรท</th>
                      <th className="px-3 py-2 text-right">ค่าขนส่ง</th>
                      <th className="px-3 py-2 text-right">+ เสริม</th>
                      <th className="px-3 py-2 text-right">รวม</th>
                      <th className="px-3 py-2 text-right">ขั้นต่ำ</th>
                      <th className="px-3 py-2 text-right">กำไร</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.modes.map((m) => (
                      <tr key={m.transport} className={`border-t border-border ${m.hasRate ? "" : "opacity-50"}`}>
                        <td className="px-3 py-2 font-medium">
                          {m.transportLabel}
                          {report.cheapest?.transport === m.transport && <span className="ml-1">🟢</span>}
                          {!m.hasRate && <span className="ml-2 text-[11px] text-muted">(no rate)</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">{m.basisUsed === "cbm" ? "CBM" : "KG"} · {m.rateSource}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {m.unitRate > 0 ? `฿${thb(m.unitRate)}` : "—"}
                          {m.docDiscountApplied > 0 && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-bold text-emerald-700">−฿{thb(m.docDiscountApplied)}/คิว</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-muted">{m.hasRate ? `฿${thb(m.transportSubtotal)}` : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-muted">฿{thb(m.addonsTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-bold">{m.hasRate ? `฿${thb(m.grandTotal)}` : "—"}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${m.minSell.level === "below" ? "text-amber-700 font-bold" : "text-muted"}`}>
                          {m.minSell.floorThb > 0 ? `฿${thb(m.minSell.floorThb)}${m.minSell.level === "below" ? " 🔻" : ""}` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${
                          m.projectedProfit == null ? "text-muted" :
                          m.projectedProfit < 0 ? "text-red-700 font-bold" :
                          m.margin?.level === "over" ? "text-amber-700 font-bold" : "text-emerald-700"
                        }`}>
                          {m.projectedProfit == null ? "—" : `฿${thb(m.projectedProfit)}${m.margin?.level === "over" ? " 🚨" : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Advisory */}
            <section className="rounded-2xl border border-border bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-2">
              <p className="font-medium">💡 คำแนะนำ Sales:</p>
              <ul className="list-disc list-inside text-muted space-y-1">
                {report.cheapest && (
                  <li><strong>ถูกสุด: <span className="text-primary-700">{report.cheapest.transportLabel}</span></strong> — รวม ฿{thb(report.cheapest.grandTotal)} (คิดตาม{report.cheapest.basisUsed === "cbm" ? "CBM" : "KG"})</li>
                )}
                {report.belowFloorCount > 0 && (
                  <li><strong>🔻 {report.belowFloorCount} mode ต่ำกว่าราคาขายขั้นต่ำ</strong> — ทบทวน/ขออนุมัติก่อนเสนอ · ราคาขั้นต่ำ = นโยบายฝ่ายขาย (per route)</li>
                )}
                {report.modes.some((m) => m.margin?.level === "over") && (
                  <li><strong>🚨 บาง mode กำไรเกิน cap ฿15k/ตู้</strong> — ตามนโยบาย CEO ลูกค้าควรได้ราคาดีกว่า (คำแนะนำ ไม่บังคับ)</li>
                )}
                {report.modes.every((m) => !m.hasRate) && (
                  <li>ยังไม่มีเรทขนส่งสำหรับ route นี้ — ตั้งเรทที่{" "}<Link href="/admin/rates" className="text-primary-600 underline">อัตราค่าบริการ</Link></li>
                )}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function ModeCard({ mode, cheapest }: { mode: ModeLine; cheapest: boolean }) {
  const ring = cheapest
    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
    : mode.minSell.level === "below"
      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
      : "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${ring}`}>
      <div className="flex items-baseline justify-between">
        <p className="font-bold text-sm">{mode.transportLabel}{cheapest && " 🟢"}</p>
        <span className="text-[11px] text-muted">{mode.basisUsed === "cbm" ? "CBM" : "KG"}</span>
      </div>
      {mode.hasRate ? (
        <>
          <p className="mt-1 text-2xl font-bold font-mono">฿{thb(mode.grandTotal)}</p>
          <p className="text-[11px] text-muted">ขนส่ง ฿{thb(mode.transportSubtotal)} + เสริม ฿{thb(mode.addonsTotal)}</p>
          {mode.minSell.level === "below" && (
            <p className="mt-1 text-[11px] text-amber-700 font-medium">🔻 ต่ำกว่าขั้นต่ำ ฿{thb(mode.minSell.floorThb)}</p>
          )}
          {mode.projectedProfit != null && (
            <p className={`mt-1 text-[11px] ${mode.projectedProfit < 0 ? "text-red-700" : mode.margin?.level === "over" ? "text-amber-700" : "text-emerald-700"}`}>
              กำไร ฿{thb(mode.projectedProfit)}{mode.margin?.level === "over" ? " 🚨 เกิน cap" : ""}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">ยังไม่มีเรทขนส่งสำหรับ route นี้</p>
      )}
    </div>
  );
}
