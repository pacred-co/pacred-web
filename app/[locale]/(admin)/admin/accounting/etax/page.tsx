import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getEtaxBundle, getShopEtaxBundle } from "@/actions/admin/etax-export";
import { buildEtaxXml } from "@/lib/etax/build-xml";
import { EtaxRowDownloads } from "./etax-row-downloads";
import { EtaxBulkDownload } from "./etax-bulk-download";

/**
 * /admin/accounting/etax — e-Tax (RD Code 86) export hub.
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.4 — Pacred has the per-class
 * WHT engine + RD-86-shaped tb_forwarder_tax_invoice (migration 0129); staff
 * need this hub for accounting-period reconciliation, RD e-Tax XML download,
 * and certificate (50-ทวิ) follow-up.
 *
 * MVP scope:
 *   - List issued tb_forwarder_tax_invoice in date range
 *   - Per-row XML download (Code 86 outline) + JSON preview
 *   - Bulk CSV export
 *
 * DEFERRED next sitting (per brief):
 *   - Full RD Code 86 XML xs:schema validation + XAdES-BES digital signature
 *   - Submit-to-RD via e-Tax-by-Email or API
 *   - 50-ทวิ certificate chasing UI for cert_status='pending'
 *
 * Roles per ADR-0006 §1.4: super | accounting.
 */

export const dynamic = "force-dynamic";

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// Destination account at issuance (mig 0236 · 3-account SOT). null = legacy row
// issued before the column existed.
const BANK_ACCT_LABEL: Record<"service" | "logistics" | "trading", string> = {
  service: "Service 204-1-55856-6",
  logistics: "Logistics 225-2-91144-0",
  trading: "Trading 232-1-07669-9",
};
function bankAcctLabel(key: "service" | "logistics" | "trading" | null): string {
  return key ? BANK_ACCT_LABEL[key] : "—";
}

export default async function AdminEtaxPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  // Roles per ADR-0006 §1.4: super | accounting. The Doc roles
  // (freight_export_doc / freight_import_doc) are included because the
  // World-A /admin/tax-invoices management surface — which the 2026-06-05
  // ops-workflow audit granted them — was consolidated into this live tb_*
  // hub (2026-06-09): /admin/tax-invoices now redirects here, so the Doc
  // roles must retain reach (§0d) to the issued ใบกำกับภาษี they document.
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const sp = await searchParams;
  const defaults = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : defaults.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : defaults.to;

  const [bundle, shopBundle] = await Promise.all([
    getEtaxBundle({ dateFrom, dateTo }),
    getShopEtaxBundle({ dateFrom, dateTo }),
  ]);

  // CSV rows — flatten the per-class buckets so accounting can pivot in Excel
  const csvRows: CsvRow[] = bundle.rows.map((r) => ({
    "เลขใบกำกับ":           r.serial_no ?? `TI-${r.id}`,
    "วันที่ออก":             fmtDate(r.issued_at),
    "สถานะ":                r.status === "issued" ? "ออกแล้ว" : "ยกเลิก",
    "รหัสลูกค้า":            r.userid,
    "ชื่อผู้ซื้อ":            r.buyer_name,
    "เลขผู้เสียภาษี":        r.buyer_tax_id,
    "ประเภท":                r.is_juristic ? "นิติบุคคล" : "ทั่วไป",
    "ค่าขนส่ง (1% WHT)":     r.base_transport,
    "ค่าขนส่งระหว่างปท. (VAT 0%)": r.base_transport_intl,
    "ค่าบริการ (3% WHT)":    r.base_service,
    "ค่าเช่า (5% WHT)":      r.base_rental,
    "สินค้า (0% WHT)":       r.base_goods,
    "ฐานรวม":               r.base_total,
    "ฐาน VAT":              r.vatable_base,
    "VAT (บาท)":            r.vat_amount,
    "VAT %":                r.vat_pct,
    "WHT รวม":              r.wht_total,
    "Gross ก่อน WHT":       r.gross_before_wht,
    "รับสุทธิ":              r.net_payable,
    "บัญชีรับเงิน":          bankAcctLabel(r.bank_account_key),
    "อ้างอิงใบเสร็จ rid":    r.rid ?? "",
    "ออกโดย":                r.issued_by,
  }));

  const csvCols = Object.keys(csvRows[0] ?? {});

  // Pre-build XMLs server-side so the client island just triggers downloads.
  const xmlByInvoiceId = new Map<number, string>(
    bundle.rows.map((r) => [r.id, buildEtaxXml(r)]),
  );

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/etax" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · e-Tax</p>
          <h1 className="mt-1 text-2xl font-bold">e-Tax (RD Code 86) Export</h1>
          <p className="text-xs text-muted mt-1">
            ดาวน์โหลด XML/CSV ของใบกำกับภาษีที่ออกในช่วงเวลาที่เลือก · เตรียมส่งกรมสรรพากร
          </p>
          <p className="text-[11px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_forwarder_tax_invoice</code> (migration 0129)
            · per-class WHT engine via <code className="bg-surface-alt px-1 rounded">lib/tax/wht.ts</code>
            · brief §3.4 (PEAK module sub-surface)
          </p>
        </header>

        {/* Date range form */}
        <form method="GET" action="/admin/accounting/etax" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted">ตั้งแต่</span>
            <input type="date" name="date_from" defaultValue={dateFrom} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted">ถึง</span>
            <input type="date" name="date_to" defaultValue={dateTo} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
          </label>
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
            อัพเดต
          </button>
          {(sp.date_from || sp.date_to) && (
            <Link href="/admin/accounting/etax" className="text-xs text-muted hover:text-foreground">
              ใช้เดือนนี้
            </Link>
          )}
          <p className="text-[11px] text-muted ml-auto">
            ช่วงปัจจุบัน {dateFrom} → {dateTo}
          </p>
        </form>

        {/* Summary */}
        <section className="grid sm:grid-cols-4 gap-3">
          <Stat label="ใบกำกับในช่วงนี้" value={bundle.rows.length.toLocaleString("th-TH")} sub={`ออกแล้ว ${bundle.totalIssued.count.toLocaleString("th-TH")}`} />
          <Stat label="ทั้งหมดในระบบ" value={(bundle.totalCount ?? 0).toLocaleString("th-TH")} sub="ทุกช่วง" />
          <Stat label="VAT รวม" value={`฿${thb(bundle.totalIssued.vat)}`} sub="ในช่วงที่ออกแล้ว" />
          <Stat label="รับสุทธิรวม" value={`฿${thb(bundle.totalIssued.net)}`} sub={`WHT ฿${thb(bundle.totalIssued.wht)}`} />
        </section>

        {/* Bulk CSV + XML downloads */}
        <div className="flex flex-wrap justify-end items-center gap-2">
          <EtaxBulkDownload
            xmls={bundle.rows.map((r) => ({
              serialNo: r.serial_no ?? `TI-${r.id}`,
              xml:      xmlByInvoiceId.get(r.id) ?? "",
            }))}
          />
          <CsvButton
            rows={csvRows}
            cols={csvCols.map((k) => ({ key: k, label: k }))}
            filename={`pacred-etax-${dateFrom}-to-${dateTo}.csv`}
          />
        </div>

        {/* Invoice list */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">📋 ใบกำกับภาษี ({bundle.rows.length.toLocaleString("th-TH")})</h2>
          </div>
          {bundle.rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีใบกำกับในช่วงที่เลือก · {bundle.totalCount === 0 ? "ยังไม่มี historical data" : "ลองเปลี่ยน filter"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">เลข</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">ผู้ซื้อ</th>
                    <th className="px-3 py-2 text-right">ฐานรวม</th>
                    <th className="px-3 py-2 text-right">VAT</th>
                    <th className="px-3 py-2 text-right">WHT</th>
                    <th className="px-3 py-2 text-right">รับสุทธิ</th>
                    <th className="px-3 py-2">บัญชีรับเงิน</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2 text-right">ดาวน์โหลด</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.serial_no ?? `TI-${r.id}`}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.issued_at)}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium">{r.buyer_name || r.userid}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {r.buyer_tax_id || "—"} · {r.is_juristic ? "นิติบุคคล" : "ทั่วไป"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.base_total)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.vat_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted">฿{thb(r.wht_total)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">฿{thb(r.net_payable)}</td>
                      <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                        {r.bank_account_key ? (
                          <span className={`rounded px-1.5 py-0.5 ${r.bank_account_key === "trading" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                            {bankAcctLabel(r.bank_account_key)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] border ${
                          r.status === "issued"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          {r.status === "issued" ? "ออกแล้ว" : "ยกเลิก"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <EtaxRowDownloads
                          invoiceId={r.id}
                          serialNo={r.serial_no ?? `TI-${r.id}`}
                          xml={xmlByInvoiceId.get(r.id) ?? ""}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* W9 — shop/yuan tax-invoice store (DORMANT · read-only) */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold text-sm">
              🧾 ใบกำกับ ฝากสั่งซื้อ / ฝากโอน ({shopBundle.rows.length.toLocaleString("th-TH")})
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] border ${
                shopBundle.enabled
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {shopBundle.enabled ? "เปิดออกเอกสารแล้ว" : "ยังไม่เปิด (DORMANT)"}
            </span>
          </div>
          <div className="px-5 py-3 border-b border-border text-[11px] text-muted space-y-1">
            <p>
              📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_shop_tax_invoice</code> (migration 0152 ·
              service_type = shop / yuan). การออกเอกสารถูกล็อกด้วย flag{" "}
              <code className="bg-surface-alt px-1 rounded">tax_invoice.shop_yuan_enabled</code>{" "}
              (default OFF) → store ว่างจนกว่า owner จะเปิด หลังทดสอบ money-loop + บัญชี sign-off ฐาน VAT ใบขน.
            </p>
            {shopBundle.rows.length > 0 && (
              <p>
                ออกแล้ว {shopBundle.total.count.toLocaleString("th-TH")} · VAT รวม ฿{thb(shopBundle.total.vat)} · รับสุทธิรวม ฿{thb(shopBundle.total.net)}
              </p>
            )}
          </div>
          {shopBundle.rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">
              {shopBundle.enabled
                ? "ยังไม่มีใบกำกับ ฝากสั่งซื้อ/ฝากโอน ในช่วงที่เลือก"
                : "ยังไม่เปิดการออกเอกสาร ฝากสั่งซื้อ/ฝากโอน — store ว่างตามที่ตั้งใจ (DORMANT)"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">เลข</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2">ผู้ซื้อ</th>
                    <th className="px-3 py-2 text-right">ฐานรวม</th>
                    <th className="px-3 py-2 text-right">VAT</th>
                    <th className="px-3 py-2 text-right">รับสุทธิ</th>
                    <th className="px-3 py-2">บัญชี</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {shopBundle.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.serial_no ?? `S-${r.id}`}</td>
                      <td className="px-3 py-2 text-[11px]">
                        {r.service_type === "shop" ? "ฝากสั่งซื้อ" : "ฝากโอน"}
                        <span className="block text-[11px] text-muted">{r.doc_mode === "customs" ? "ใบขน" : "ใบกำกับ"}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium">{r.buyer_name || r.userid}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {r.buyer_tax_id || "—"} · {r.is_juristic ? "นิติบุคคล" : "ทั่วไป"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.base_total)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(r.vat_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">฿{thb(r.net_payable)}</td>
                      <td className="px-3 py-2 text-[11px] whitespace-nowrap">{bankAcctLabel(r.bank_account_key)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] border ${
                          r.status === "issued"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          {r.status === "issued" ? "ออกแล้ว" : "ยกเลิก"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Phase-C note */}
        <section className="rounded-2xl border border-border bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-2">
          <p className="font-medium">📌 หมายเหตุ Phase-C extensions (ยังไม่เปิดใช้งาน):</p>
          <ul className="list-disc list-inside text-muted space-y-1">
            <li>RD Code 86 XML xs:schema validation + <strong>XAdES-BES digital signature</strong> envelope (XML นี้เป็น preview shape only · unsigned)</li>
            <li>Submit-to-RD via e-Tax-by-Email (RD-INET รับ XML) หรือ e-Tax API (RD-MAP) · ต้องมี RD API credentials</li>
            <li>50-ทวิ certificate chasing UI สำหรับ <code className="bg-surface-alt px-1 rounded">tb_forwarder_wht_entry.cert_status=&apos;pending&apos;</code> · juristic customers จะออก 50-ทวิ ให้</li>
            <li>PDF re-render — เชื่อมไปยัง <Link href="/admin/tax-invoices" className="underline">/admin/tax-invoices/[id]</Link> ของ World-A สำหรับ legacy invoices</li>
          </ul>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-bold font-mono text-foreground text-xl">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}
