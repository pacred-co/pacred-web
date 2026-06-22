import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getFreightLedger } from "./ledger-data";

/**
 * /admin/accounting/freight/ledger — Freight รายการเดินบัญชี (statement).
 *
 * READ-ONLY money-movement view, faithful to the legacy `acc-system.php`
 * Freight ledger (ประวัติ / เงินเข้า / เงินออก):
 *
 *   เงินเข้า (รายรับ)  ← freight_invoice_payments (recorded settlements)
 *   เงินออก (รายจ่าย)  ← freight_shipments.cost_total_thb (cost snapshot)
 *   สุทธิ (กำไร)        ← เงินเข้า − เงินออก in the date window
 *
 * It SURFACES the existing freight money tables — it does NOT mutate them.
 * Recording / voiding a payment lives on the shipment detail page (the
 * actions in actions/admin/freight-invoice-payments.ts). §0e: the cost/margin
 * figures are the internal SELL−COST analytics snapshot (mig 0165), never the
 * customer-visible DECLARED (สำแดง) value.
 *
 * Roles: super, accounting.
 */

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  cash:          "เงินสด",
  bank_transfer: "โอนธนาคาร",
  wallet:        "ตัด Wallet",
};

const STATUS_LABEL: Record<string, string> = {
  draft:       "ร่าง",
  confirmed:   "ยืนยันแล้ว",
  in_progress: "ดำเนินการ",
  cleared:     "เคลียร์แล้ว",
  delivered:   "ส่งมอบแล้ว",
};

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function defaultDateRange(): { from: string; to: string } {
  const to   = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000); // last 90 days
  const pad  = (n: number) => n.toString().padStart(2, "0");
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to:   `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  };
}

export default async function AdminFreightLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp       = await searchParams;
  const defaults = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : defaults.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : defaults.to;

  const res = await getFreightLedger({ dateFrom, dateTo });
  const data = res.ok ? res.data! : null;

  // CSV — combined statement (sign-bearing) for the accountant
  const csvRows: CsvRow[] = data
    ? [
        ...data.inflows.map((r) => ({
          "ประเภท":   "เงินเข้า",
          "วันที่":    fmtDate(r.paid_at),
          "Job":      r.job_no ?? "",
          "เลขที่เอกสาร": r.invoice_no ?? "",
          "ลูกค้า":    r.customer,
          "ช่องทาง":   METHOD_LABEL[r.method] ?? r.method,
          "เงินเข้า (บาท)": r.amount_thb,
          "เงินออก (บาท)": "",
          "อ้างอิง":   r.bank_ref ?? "",
        })),
        ...data.outflows.map((r) => ({
          "ประเภท":   "เงินออก (ต้นทุน)",
          "วันที่":    fmtDate(r.ref_at),
          "Job":      r.job_no ?? "",
          "เลขที่เอกสาร": "",
          "ลูกค้า":    r.customer,
          "ช่องทาง":   STATUS_LABEL[r.status] ?? r.status,
          "เงินเข้า (บาท)": "",
          "เงินออก (บาท)": r.cost_total_thb,
          "อ้างอิง":   r.profit_margin_thb == null ? "" : `กำไร ${thb(r.profit_margin_thb)}`,
        })),
      ]
    : [];
  const csvCols = csvRows.length
    ? Object.keys(csvRows[0]).map((k) => ({ key: k, label: k }))
    : [];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · บัญชี · FREIGHT
        </p>
        <h1 className="mt-1 text-2xl font-bold">รายการเดินบัญชี Freight</h1>
        <p className="mt-1 text-sm text-muted">
          ประวัติเงินเข้า–เงินออก ฝั่ง Freight — เงินเข้าจากการชำระใบแจ้งหนี้ · เงินออกคือต้นทุน shipment ·
          สุทธิ = กำไรในช่วงที่เลือก
        </p>
        <p className="mt-1 text-[11px] text-muted">
          📊 เงินเข้า ←{" "}
          <code className="bg-surface-alt px-1 rounded">freight_invoice_payments</code> (recorded) ·
          เงินออก ←{" "}
          <code className="bg-surface-alt px-1 rounded">freight_shipments.cost_total_thb</code>{" "}
          (สแนปช็อตต้นทุนภายใน · ไม่ใช่มูลค่าสำแดง) · อ่านอย่างเดียว
        </p>
      </header>

      {/* Breadcrumb back to the freight accounting hub */}
      <nav className="text-xs text-muted">
        <Link href="/admin/accounting/freight" className="hover:text-foreground hover:underline">
          ← ระบบบัญชี Freight
        </Link>
      </nav>

      {/* Date-range filter */}
      <form
        method="GET"
        action="/admin/accounting/freight/ledger"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted">ตั้งแต่</span>
          <input
            type="date"
            name="date_from"
            defaultValue={dateFrom}
            className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted">ถึง</span>
          <input
            type="date"
            name="date_to"
            defaultValue={dateTo}
            className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
        >
          อัพเดต
        </button>
        {(sp.date_from || sp.date_to) && (
          <Link
            href="/admin/accounting/freight/ledger"
            className="text-xs text-muted hover:text-foreground"
          >
            ใช้ default
          </Link>
        )}
        <div className="ml-auto flex items-center gap-3">
          <p className="text-[11px] text-muted">
            {dateFrom} → {dateTo} · default = 90 วันล่าสุด
          </p>
          {csvRows.length > 0 && (
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename={`pacred-freight-ledger-${dateFrom}-to-${dateTo}.csv`}
            />
          )}
        </div>
      </form>

      {!data ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-6 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ ({res.ok ? "ไม่มีข้อมูล" : res.error}) — ลองเลือกช่วงวันใหม่อีกครั้ง
        </div>
      ) : (
        <>
          {/* Totals — เข้า / ออก / สุทธิ */}
          <section className="grid sm:grid-cols-3 gap-3">
            <Stat
              label="เงินเข้า (รายรับ)"
              value={`฿${thb(data.totalIn)}`}
              tone="in"
              sub={`${data.inflows.length.toLocaleString("th-TH")} รายการ`}
            />
            <Stat
              label="เงินออก (ต้นทุน)"
              value={`฿${thb(data.totalOut)}`}
              tone="out"
              sub={`${data.outflows.length.toLocaleString("th-TH")} shipment`}
            />
            <Stat
              label="สุทธิ (กำไร)"
              value={`฿${thb(data.net)}`}
              tone={data.net < 0 ? "out" : "net"}
              sub={data.net < 0 ? "ขาดทุนในช่วงนี้" : "เข้า − ออก"}
            />
          </section>

          {(data.inflowsTruncated || data.outflowsTruncated) && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-xs text-amber-800">
              ⚠️ ข้อมูลในช่วงนี้มีจำนวนมาก — แสดง/รวมเฉพาะ 1,000 รายการล่าสุดต่อฝั่ง กรุณากรองช่วงวันให้แคบลงเพื่อยอดที่ครบถ้วน
            </p>
          )}

          {/* เงินเข้า table */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-emerald-50/40 dark:bg-emerald-950/10 flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-sm text-emerald-800 dark:text-emerald-300">
                ⬇ เงินเข้า — การชำระใบแจ้งหนี้ Freight
              </h2>
              <p className="text-xs text-muted">รวม ฿{thb(data.totalIn)}</p>
            </div>
            {data.inflows.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted">ไม่มีเงินเข้าในช่วงนี้</p>
            ) : (
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">วันที่</th>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">เลขที่ใบแจ้งหนี้</th>
                      <th className="px-3 py-2">ลูกค้า</th>
                      <th className="px-3 py-2">ช่องทาง</th>
                      <th className="px-3 py-2">อ้างอิง</th>
                      <th className="px-3 py-2 text-right">เงินเข้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inflows.map((r) => (
                      <tr key={r.payment_id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.paid_at)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted">{r.job_no ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{r.invoice_no ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{r.customer}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{METHOD_LABEL[r.method] ?? r.method}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted">{r.bank_ref ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          ฿{thb(r.amount_thb)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-surface-alt/40">
                      <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-muted">
                        รวมเงินเข้า
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        ฿{thb(data.totalIn)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* เงินออก table */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-rose-50/40 dark:bg-rose-950/10 flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-sm text-rose-800 dark:text-rose-300">
                ⬆ เงินออก — ต้นทุน shipment (China freight + local)
              </h2>
              <p className="text-xs text-muted">รวม ฿{thb(data.totalOut)}</p>
            </div>
            {data.outflows.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted">ไม่มีต้นทุน shipment ในช่วงนี้</p>
            ) : (
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">วันที่</th>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">สถานะ</th>
                      <th className="px-3 py-2">ลูกค้า</th>
                      <th className="px-3 py-2 text-right">ต้นทุนจีน</th>
                      <th className="px-3 py-2 text-right">ต้นทุนในไทย</th>
                      <th className="px-3 py-2 text-right">รวมต้นทุน</th>
                      <th className="px-3 py-2 text-right">กำไร (snapshot)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outflows.map((r) => (
                      <tr key={r.shipment_id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.ref_at)}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/freight/shipments/${r.shipment_id}`}
                            className="font-mono text-[11px] text-primary-600 hover:underline"
                          >
                            {r.job_no ?? `#${r.shipment_id.slice(0, 8)}`}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{STATUS_LABEL[r.status] ?? r.status}</td>
                        <td className="px-3 py-2 text-xs">{r.customer}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-muted">฿{thb(r.cost_china_thb)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-muted">฿{thb(r.cost_local_thb)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-rose-700 dark:text-rose-400">
                          ฿{thb(r.cost_total_thb)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px]">
                          {r.profit_margin_thb == null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className={r.profit_margin_thb < 0 ? "text-red-600 font-semibold" : "text-foreground"}>
                              ฿{thb(r.profit_margin_thb)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-surface-alt/40">
                      <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-muted">
                        รวมเงินออก (ต้นทุน)
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-rose-700 dark:text-rose-400">
                        ฿{thb(data.totalOut)}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Footnote */}
          <section className="rounded-2xl border border-border bg-surface-alt/40 p-4 text-xs text-muted space-y-1">
            <p>
              <strong className="text-foreground">เงินเข้า</strong> = ยอดที่บันทึกรับชำระจริงต่อใบแจ้งหนี้ Freight
              (สถานะ recorded · ไม่รวมรายการที่ void)
            </p>
            <p>
              <strong className="text-foreground">เงินออก</strong> = สแนปช็อตต้นทุนภายในของ shipment
              (ค่าเฟรทจีน + ต้นทุนในไทย) ที่ frozen ตอนแปลงใบเสนอราคา → shipment · ใช้เพื่อวิเคราะห์กำไรเท่านั้น
              ไม่ใช่มูลค่าสำแดงศุลกากร และไม่ใช่ยอดที่ลูกค้าเห็น
            </p>
            <p>
              บันทึก/ยกเลิกการรับชำระ ทำได้ที่หน้า{" "}
              <Link href="/admin/freight/shipments" className="text-primary-600 hover:underline">
                การขนส่ง (Shipments)
              </Link>{" "}
              — หน้านี้เป็นมุมมองอ่านอย่างเดียว
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "in" | "out" | "net";
}) {
  const toneCls =
    tone === "in"
      ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20"
      : tone === "out"
        ? "border-rose-200 bg-rose-50 dark:bg-rose-950/20"
        : "border-primary-200 bg-primary-50 dark:bg-primary-950/20";
  const valueCls =
    tone === "in"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "out"
        ? "text-rose-700 dark:text-rose-400"
        : "text-primary-700 dark:text-primary-400";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneCls}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${valueCls}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
