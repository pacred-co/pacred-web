import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getPeakExportBundle } from "@/actions/admin/peak-export";

/**
 * /admin/accounting/peak-export — PEAK / FlowAccount CSV export hub.
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.5 — Pacred has the full AR/AP
 * ledger; accountants need it as CSV importable into PEAK / FlowAccount /
 * Excel. This page bundles the 4 main datasets behind one date range:
 *
 *   1. รับชำระเงิน (Receipts)      ← tb_receipt + tb_users
 *   2. ใบรวมบิล (Combine bills)    ← tb_bill + tb_bill_item count
 *   3. เบิกค่าคอม Sales batches    ← tb_withdraw_comm_sale_h
 *   4. เบิกค่าคอมล่าม batches      ← tb_withdraw_comm_interpreter_h
 *
 * Default range = current month. Each dataset gets its own download button +
 * a row-count preview so accounting can spot if a window came up empty.
 *
 * Roles: super | accounting.
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

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AdminPeakExportPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const defaults = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : defaults.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : defaults.to;

  const bundle = await getPeakExportBundle({ dateFrom, dateTo });

  // ── CSV row mappers ──
  const receiptCsv: CsvRow[] = bundle.receipts.map((r) => ({
    "เลขใบเสร็จ":              r.rid,
    "วันที่ออก":               fmtDate(r.issuedate),
    "วันที่จ่าย":              fmtDate(r.rdate),
    "รหัสลูกค้า":              r.userid,
    "ชื่อลูกค้า":              r.customerName,
    "เลขผู้เสียภาษี":          r.taxId,
    "ประเภท":                  r.corporateType,
    "ยอดก่อน WHT (บาท)":       r.totalBeforeWithholding,
    "WHT (บาท)":               r.wht,
    "รับสุทธิ (บาท)":          r.ramount,
    "สถานะ rstatus":           r.rstatus,
  }));

  const billCsv: CsvRow[] = bundle.bills.map((b) => ({
    "เลขใบรวมบิล":            b.billid,
    "วันที่":                  fmtDate(b.date),
    "ผู้สร้าง (adminID)":      b.adminid,
    "พิมพ์แล้ว?":             b.printstatus === "1" ? "พิมพ์แล้ว" : "ยังไม่พิมพ์",
    "จำนวน item":             b.itemCount,
  }));

  function batchToCsv(rows: typeof bundle.saleBatches, kindLabel: string): CsvRow[] {
    return rows.map((b) => ({
      "ประเภท":              kindLabel,
      "Batch ID":           b.id,
      "วันที่":              fmtDate(b.date),
      "วันที่จ่าย":          fmtDate(b.dateupdate),
      "ผู้รับเงิน":          b.payee,
      "หัวข้อ":              b.title,
      "ค่าคอมก่อนหัก (บาท)":  b.commbefore,
      "หัก WHT (บาท)":        b.withholding,
      "รับสุทธิ (บาท)":       b.amount,
      "สถานะ":              b.status === "3" ? "จ่ายแล้ว" : b.status === "2" ? "รอจ่าย" : "สร้างแล้ว",
      "ธนาคารผู้รับ":         b.nameuserbank,
      "เลขที่บัญชี":          b.nouserbank,
    }));
  }
  const saleBatchCsv        = batchToCsv(bundle.saleBatches, "Sales rep");
  const interpreterBatchCsv = batchToCsv(bundle.interpreterBatches, "ล่าม");

  // W9 — CARGO tax-doc 3-number rollup (SELLING / COST / DECLARED) CSV.
  const taxDocCsv: CsvRow[] = bundle.taxDocRollup.map((t) => ({
    "งาน (Job ID)":           t.jobId,
    "ประเภท":                  t.source === "forwarder" ? "ฝากนำเข้า" : "ฝากสั่งซื้อ",
    "ออเดอร์":                 t.orderRef,
    "รหัสลูกค้า":              t.userid,
    "ตู้":                     t.cabinetNo,
    "โหมดเอกสาร":             t.docMode,
    "ราคาขาย SELLING (บาท)":   t.selling,
    "บัญชี GL (ขาย)":          t.glSelling || "(รอนักบัญชี)",
    "ต้นทุน COST (บาท)":       t.cost,
    "บัญชี GL (ต้นทุน)":       t.glCost || "(รอนักบัญชี)",
    "สำแดง DECLARED (บาท)":    t.declared,
    "บัญชี GL (สำแดง · memo)": t.glDeclared || "(memo)",
    "กำไรขั้นต้น (บาท)":       t.grossProfit,
    "สถานะ CS":               t.csStatus || "—",
    "สถานะ Pricing":          t.pricingStatus || "—",
    "สถานะ Docs":             t.docsStatus || "—",
    "สถานะ Account":          t.accountStatus || "—",
  }));

  // ── Headline summary totals ──
  const receiptSum = bundle.receipts.reduce((s, r) => s + r.ramount, 0);
  const saleSum    = bundle.saleBatches.reduce((s, b) => s + b.amount, 0);
  const interpSum  = bundle.interpreterBatches.reduce((s, b) => s + b.amount, 0);
  const taxDocSelling = bundle.taxDocRollup.reduce((s, t) => s + t.selling, 0);
  const taxDocCost    = bundle.taxDocRollup.reduce((s, t) => s + t.cost, 0);

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/peak-export" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · ส่งออก</p>
          <h1 className="mt-1 text-2xl font-bold">ส่งออก CSV (PEAK / FlowAccount / Excel)</h1>
          <p className="text-xs text-muted mt-1">
            ดาวน์โหลด AR/AP ledger ของ Pacred เป็น CSV ในช่วงวันที่ที่เลือก · นำไป import เข้า PEAK หรือ FlowAccount ได้ทันที
          </p>
          <p className="text-[11px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_receipt</code> + <code className="bg-surface-alt px-1 rounded">tb_bill</code> + <code className="bg-surface-alt px-1 rounded">tb_withdraw_comm_*_h</code> · brief §3.5
          </p>
        </header>

        {/* Date range filter */}
        <form method="GET" action="/admin/accounting/peak-export" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3">
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
            <Link href="/admin/accounting/peak-export" className="text-xs text-muted hover:text-foreground">
              ใช้เดือนนี้
            </Link>
          )}
          <p className="text-[11px] text-muted ml-auto">
            ช่วงปัจจุบัน {dateFrom} → {dateTo}
          </p>
        </form>

        {/* 4 datasets */}
        <div className="grid sm:grid-cols-2 gap-3">
          <ExportCard
            title="รับชำระเงิน (Receipts)"
            desc="tb_receipt + ลูกค้า"
            count={bundle.receipts.length}
            sumLabel={`รับสุทธิรวม ฿${thb(receiptSum)}`}
            rows={receiptCsv}
            cols={[
              "เลขใบเสร็จ", "วันที่ออก", "วันที่จ่าย", "รหัสลูกค้า", "ชื่อลูกค้า",
              "เลขผู้เสียภาษี", "ประเภท", "ยอดก่อน WHT (บาท)", "WHT (บาท)",
              "รับสุทธิ (บาท)", "สถานะ rstatus",
            ]}
            filename={`pacred-receipts-${dateFrom}-to-${dateTo}.csv`}
          />
          <ExportCard
            title="ใบรวมบิล (Combine Bills)"
            desc="tb_bill + จำนวน item"
            count={bundle.bills.length}
            sumLabel={`รวม ${bundle.bills.reduce((s, b) => s + b.itemCount, 0).toLocaleString("th-TH")} item ในใบรวม`}
            rows={billCsv}
            cols={["เลขใบรวมบิล", "วันที่", "ผู้สร้าง (adminID)", "พิมพ์แล้ว?", "จำนวน item"]}
            filename={`pacred-combine-bills-${dateFrom}-to-${dateTo}.csv`}
          />
          <ExportCard
            title="เบิกค่าคอม Sales (Batches)"
            desc="tb_withdraw_comm_sale_h"
            count={bundle.saleBatches.length}
            sumLabel={`รวมรับสุทธิ ฿${thb(saleSum)}`}
            rows={saleBatchCsv}
            cols={[
              "ประเภท", "Batch ID", "วันที่", "วันที่จ่าย", "ผู้รับเงิน", "หัวข้อ",
              "ค่าคอมก่อนหัก (บาท)", "หัก WHT (บาท)", "รับสุทธิ (บาท)", "สถานะ",
              "ธนาคารผู้รับ", "เลขที่บัญชี",
            ]}
            filename={`pacred-comm-sale-${dateFrom}-to-${dateTo}.csv`}
          />
          <ExportCard
            title="เบิกค่าคอมล่าม (Batches)"
            desc="tb_withdraw_comm_interpreter_h"
            count={bundle.interpreterBatches.length}
            sumLabel={`รวมรับสุทธิ ฿${thb(interpSum)}`}
            rows={interpreterBatchCsv}
            cols={[
              "ประเภท", "Batch ID", "วันที่", "วันที่จ่าย", "ผู้รับเงิน", "หัวข้อ",
              "ค่าคอมก่อนหัก (บาท)", "หัก WHT (บาท)", "รับสุทธิ (บาท)", "สถานะ",
              "ธนาคารผู้รับ", "เลขที่บัญชี",
            ]}
            filename={`pacred-comm-interpreter-${dateFrom}-to-${dateTo}.csv`}
          />
        </div>

        {/* W9 — CARGO tax-doc 3-number rollup (PEAK · SELLING/COST/DECLARED) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold text-sm">CARGO 3-ราคา รายงาน (ใบกำกับ/ใบขน · PEAK)</h2>
            <CsvButton
              rows={taxDocCsv}
              cols={Object.keys(taxDocCsv[0] ?? {
                "งาน (Job ID)": "", "ประเภท": "", "ออเดอร์": "", "รหัสลูกค้า": "", "ตู้": "",
                "โหมดเอกสาร": "", "ราคาขาย SELLING (บาท)": "", "บัญชี GL (ขาย)": "",
                "ต้นทุน COST (บาท)": "", "บัญชี GL (ต้นทุน)": "", "สำแดง DECLARED (บาท)": "",
                "บัญชี GL (สำแดง · memo)": "", "กำไรขั้นต้น (บาท)": "", "สถานะ CS": "",
                "สถานะ Pricing": "", "สถานะ Docs": "", "สถานะ Account": "",
              }).map((k) => ({ key: k, label: k }))}
              filename={`pacred-cargo-3number-${dateFrom}-to-${dateTo}.csv`}
            />
          </div>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <RollupStat label="งานในช่วงนี้" value={bundle.taxDocRollup.length.toLocaleString("th-TH")} />
            <RollupStat label="ราคาขายรวม (SELLING)" value={`฿${thb(taxDocSelling)}`} tone="blue" />
            <RollupStat label="ต้นทุนรวม (COST)" value={`฿${thb(taxDocCost)}`} tone="emerald" />
            <RollupStat label="กำไรขั้นต้น" value={`฿${thb(taxDocSelling - taxDocCost)}`} tone="green" />
          </div>
          {bundle.glAccounts.pending && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800">
              ⚠️ รหัสบัญชี GL (chart-of-accounts) ยังเป็นค่าว่าง — รอ นักบัญชี (NAT) ใส่ที่{" "}
              <code className="bg-white/60 px-1 rounded">business_config &gt; peak.gl_accounts</code>{" "}
              (selling / cost · declared = memo เฉยๆ ไม่มี GL posting). โครงสร้าง CSV พร้อมแล้ว — เติมรหัสแล้วใช้ได้ทันที.
            </div>
          )}
          <p className="text-[11px] text-muted">
            3 ราคาแยกกันเสมอ: ขาย (→ รายได้/AR + ใบกำกับ) ≠ ต้นทุน (→ COGS/stock-in) ≠ สำแดง (→ ใบขนรวม · memo).
            รายงานนี้สรุปต่องาน (tb_cargo_taxdoc_job) — ดูงานที่{" "}
            <Link href="/admin/pricing/taxdoc-workspace" className="text-primary-600 hover:underline">Tax-doc Workspace</Link>.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-2">
          <p className="font-medium">📌 หมายเหตุ Phase-C extensions (ยังไม่เปิด):</p>
          <ul className="list-disc list-inside text-muted space-y-1">
            <li>PEAK direct API import (ปัจจุบัน export เป็น CSV ไปใช้ใน PEAK)</li>
            <li>FlowAccount template-format export (ปัจจุบัน standard Pacred CSV)</li>
            <li>e-Tax XML (RD Code 86) export — ต่อจาก <Link href="/admin/tax-invoices" className="underline">/admin/tax-invoices</Link></li>
          </ul>
        </section>
      </main>
    </>
  );
}

function ExportCard({
  title,
  desc,
  count,
  sumLabel,
  rows,
  cols,
  filename,
}: {
  title:    string;
  desc:     string;
  count:    number;
  sumLabel: string;
  rows:     CsvRow[];
  cols:     string[];
  filename: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm flex flex-col gap-3">
      <div>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-[11px] text-muted mt-0.5">{desc}</p>
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted">ในช่วงที่เลือก</p>
        <p className="mt-1 font-mono font-bold text-primary-700 text-2xl">
          {count.toLocaleString("th-TH")} <span className="text-sm text-muted">แถว</span>
        </p>
        <p className="text-[11px] text-muted font-mono mt-0.5">{sumLabel}</p>
      </div>
      <div>
        <CsvButton
          rows={rows}
          cols={cols.map((k) => ({ key: k, label: k }))}
          filename={filename}
        />
      </div>
    </div>
  );
}

function RollupStat({ label, value, tone }: { label: string; value: string; tone?: "blue" | "emerald" | "green" }) {
  const cls =
    tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : tone === "green" ? "text-green-700" : "text-foreground";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 font-bold tabular-nums text-lg ${cls}`}>{value}</p>
    </div>
  );
}
