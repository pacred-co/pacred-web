import { Link } from "@/i18n/navigation";
import { signReceiptToken } from "@/lib/receipt/receipt-token";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";

import { getWhtCertQueue } from "@/actions/admin/wht-cert";
import { getReceiptCertQueue } from "@/actions/receipt-wht-cert";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportWhtCertsAll } from "@/actions/admin/export/acc-wht-certs";
import { WhtCertRowActions } from "./wht-cert-row-actions";
import { ReceiptCertRowActions } from "./receipt-cert-row-actions";

/**
 * /admin/accounting/wht-certs — 50-ทวิ certificate tracking queue.
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.4 Phase-C: Pacred RECEIVES
 * 50-ทวิ certs from juristic customers (they withhold tax from our invoice
 * + send the cert). This page surfaces the pending queue + per-customer
 * top followups + admin actions to mark received or waive.
 *
 * Roles per ADR-0006 §1.4: super | accounting.
 */

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending:  "รอ cert",
  received: "ได้รับแล้ว",
  waived:   "ยกเว้น",
};
const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-green-50 text-green-700 border-green-200",
  waived:   "bg-slate-50 text-slate-600 border-slate-200",
};

const CLASS_LABEL: Record<string, string> = {
  transport: "ค่าขนส่ง (1%)",
  service:   "ค่าบริการ (3%)",
  rental:    "ค่าเช่า (5%)",
  goods:     "สินค้า (0%)",
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

export default async function AdminWhtCertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; userid?: string }>;
}) {
  // owner 2026-07-24: "sales cs สามารถปริ้นได้" — ดู+พิมพ์ฟอร์ม 50 ทวิ เปิดให้ sales/CS
  // แต่ปุ่ม "ตรวจรับ/ยกเว้น" (mutate) ยัง gate super/accounting ใน action ของมันเอง
  await requireAdmin(["super", "accounting", "sales", "sales_admin", "ops"]);
  const sp = await searchParams;
  const status = sp.status === "received" || sp.status === "waived" || sp.status === "all" ? sp.status : "pending";
  const userid = (sp.userid ?? "").trim() || undefined;

  const queue = await getWhtCertQueue({ status: status === "all" ? "all" : status, userid, limit: 500 });
  // ภูม flag 2026-06-10 — receipts whose customer uploaded a 50-ทวิ and is
  // waiting for admin approval (the print-gate queue · migration 0173).
  const receiptCertQueue = await getReceiptCertQueue();
  const totalEntries = queue.pending.length + queue.received.length + queue.waived.length;
  const pendingAmountTotal = queue.byCustomer.reduce((s, c) => s + c.pendingAmount, 0);

  // Picking which list to show in the main table based on filter
  const visible =
    status === "received" ? queue.received :
    status === "waived"   ? queue.waived   :
    status === "all"      ? [...queue.pending, ...queue.received, ...queue.waived] :
    queue.pending;

  // CSV export — mirror the on-screen table columns (money/rate as the same
  // formatted strings, dates sliced, codes as-is).
  const csvCols: CsvCol[] = [
    { key: "userid",      label: "รหัสลูกค้า" },
    { key: "invoice",     label: "ใบกำกับ" },
    { key: "wht_class",   label: "ประเภท WHT" },
    { key: "base_thb",    label: "ฐาน (บาท)" },
    { key: "rate_pct",    label: "อัตรา (%)" },
    { key: "wht_thb",     label: "WHT (บาท)" },
    { key: "cert_status", label: "สถานะ" },
    { key: "cert_number", label: "cert#" },
    { key: "created_at",  label: "ลงทะเบียน" },
  ];
  const csvRows: CsvRow[] = visible.map((e) => ({
    userid:      e.userid,
    invoice:     e.invoiceSerial ?? (e.invoiceId ? `TI-${e.invoiceId}` : "—"),
    wht_class:   CLASS_LABEL[e.whtClass] ?? e.whtClass,
    base_thb:    e.whtBaseThb.toFixed(2),
    rate_pct:    e.whtRatePct.toFixed(2),
    wht_thb:     e.whtAmountThb.toFixed(2),
    cert_status: STATUS_LABEL[e.certStatus] ?? e.certStatus,
    cert_number: e.certNumber ?? "",
    created_at:  e.createdAt ? e.createdAt.slice(0, 10) : "",
  }));

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/wht-certs" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · 50-ทวิ</p>
          <h1 className="mt-1 text-2xl font-bold">50-ทวิ Certificate Tracking</h1>
          <p className="text-xs text-muted mt-1">
            ลูกค้านิติบุคคลหัก ณ ที่จ่าย + ต้องส่ง 50-ทวิ มาให้ Pacred · หน้านี้ติดตามว่าได้รับ cert ครบรึยัง
          </p>
          <p className="text-[11px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_forwarder_wht_entry</code> (migration 0129) ·
            แอดมินกดยืนยันรับ cert (status pending→received) หรือ waive (รับไม่ได้แล้ว · ลูกค้าตัวเล็ก)
          </p>
        </header>

        {/* ใบเสร็จรออนุมัติ 50 ทวิ (ภูม flag 2026-06-10) — the customer uploaded a
            cert on /r/<token> and is BLOCKED from printing until an admin approves.
            High-priority queue surfaced above the chase list. */}
        {receiptCertQueue.length > 0 && (
          <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-emerald-200 bg-emerald-100/50">
              <h2 className="font-bold text-sm">🔓 ใบเสร็จรออนุมัติ 50 ทวิ ({receiptCertQueue.length}) — ลูกค้าแนบแล้ว · รอกดอนุมัติเพื่อปลดล็อกการพิมพ์</h2>
            </div>
            <div className="overflow-x-auto scrollbar-x-visible bg-white dark:bg-surface">
              <table className="w-full min-w-[640px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">เลขที่ใบเสร็จ</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">เลขที่ 50 ทวิ</th>
                    <th className="px-3 py-2">แนบเมื่อ</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptCertQueue.map((r) => (
                    <tr key={r.id} className="border-t border-emerald-100 dark:border-emerald-900/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.rid}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`/admin/customers/${r.userid}`} className="text-primary-600 hover:underline">{r.userid}</Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">{r.certNo || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmtDate(r.uploadedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {/* ฟอร์ม 50 ทวิ กรอกให้แล้ว — เปิดส่ง/พิมพ์ให้ลูกค้าได้จากคิวตรวจเลย
                              (owner 2026-07-24 "อำนวยทั้งลูกค้าและพนักงาน · ไม่ใช่หาใช้กันไม่เจอ") */}
                          <a
                            href={`/r/${signReceiptToken(r.id)}/wht-form`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap rounded-full border border-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            📄 ฟอร์ม 50 ทวิ
                          </a>
                          <ReceiptCertRowActions receiptId={r.id} certNo={r.certNo} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Summary cards */}
        <section className="grid sm:grid-cols-4 gap-3">
          <Stat label="รอ cert" value={queue.pending.length.toLocaleString("th-TH")} highlight />
          <Stat label="ได้รับแล้ว" value={queue.received.length.toLocaleString("th-TH")} />
          <Stat label="ยกเว้น" value={queue.waived.length.toLocaleString("th-TH")} />
          <Stat label="ยอด WHT รอ" value={`฿${thb(pendingAmountTotal)}`} small />
        </section>

        {/* Top customers to chase */}
        {queue.byCustomer.length > 0 && (
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <h2 className="font-bold text-sm mb-3">🎯 ลูกค้าที่ค้าง cert มากที่สุด (top {queue.byCustomer.length})</h2>
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[500px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">รหัสลูกค้า</th>
                    <th className="px-3 py-2 text-right">รอ cert (รายการ)</th>
                    <th className="px-3 py-2 text-right">ยอด WHT รวม</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.byCustomer.map((c, idx) => (
                    <tr key={c.userid} className="border-t border-border">
                      <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`/admin/accounting/wht-certs?userid=${c.userid}`} className="text-primary-600 hover:underline">
                          {c.userid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{c.pendingCount.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-amber-700">฿{thb(c.pendingAmount)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/admin/customers/${c.userid}`} className="text-[11px] text-muted hover:text-foreground">
                          ดูข้อมูลลูกค้า →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Status filter chips + customer clear + CSV export */}
        <nav className="flex flex-wrap gap-2 items-center">
          <div className="ml-auto order-last sm:order-none">
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename="wht-certs-50ทวิ.csv"
              fetchAll={async () => {
                "use server";
                return exportWhtCertsAll({ status, userid });
              }}
            />
          </div>
          {(["pending", "received", "waived", "all"] as const).map((s) => {
            const count =
              s === "pending"  ? queue.pending.length :
              s === "received" ? queue.received.length :
              s === "waived"   ? queue.waived.length :
              totalEntries;
            return (
              <Link
                key={s}
                href={`/admin/accounting/wht-certs?status=${s}${userid ? `&userid=${userid}` : ""}`}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  s === status
                    ? STATUS_BADGE[s] ?? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-foreground border-border hover:bg-surface-alt"
                }`}
              >
                {s === "all" ? "ทั้งหมด" : STATUS_LABEL[s]} <span className="ml-1 text-[11px] opacity-75">({count})</span>
              </Link>
            );
          })}
          {userid && (
            <span className="text-xs text-muted ml-2">
              กรอง userid={userid} <Link href={`/admin/accounting/wht-certs?status=${status}`} className="underline ml-1">ล้าง</Link>
            </span>
          )}
        </nav>

        {/* Entries table */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">📋 รายการ ({visible.length.toLocaleString("th-TH")})</h2>
          </div>
          {visible.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มี cert ในเงื่อนไขที่เลือก · {totalEntries === 0 ? "ยังไม่มี tb_forwarder_wht_entry rows" : "ลองเปลี่ยน filter"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[1000px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">ใบกำกับ</th>
                    <th className="px-3 py-2">ประเภท WHT</th>
                    <th className="px-3 py-2 text-right">ฐาน</th>
                    <th className="px-3 py-2 text-right">อัตรา</th>
                    <th className="px-3 py-2 text-right">WHT</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2">cert#</th>
                    <th className="px-3 py-2">ลงทะเบียน</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`/admin/customers/${e.userid}`} className="text-primary-600 hover:underline">
                          {e.userid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">
                        {e.invoiceSerial ?? (e.invoiceId ? `TI-${e.invoiceId}` : "—")}
                      </td>
                      <td className="px-3 py-2 text-xs">{CLASS_LABEL[e.whtClass] ?? e.whtClass}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">฿{thb(e.whtBaseThb)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{e.whtRatePct.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-amber-700">฿{thb(e.whtAmountThb)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_BADGE[e.certStatus]}`}>
                          {STATUS_LABEL[e.certStatus] ?? e.certStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">{e.certNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                      <td className="px-3 py-2">
                        {e.certStatus === "pending" ? (
                          <WhtCertRowActions entryId={e.id} />
                        ) : (
                          <span className="text-[11px] text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[11px] text-muted">
          📌 50-ทวิ = ใบรับรองหัก ณ ที่จ่าย · ออกโดยลูกค้านิติบุคคลที่หักภาษีจาก Pacred · ใช้ลดหย่อนภาษีตอนยื่นแบบ ภ.ง.ด.
        </p>
      </main>
    </>
  );
}

function Stat({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${
      highlight
        ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
        : "border-border bg-white dark:bg-surface"
    }`}>
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono ${highlight ? "text-amber-800" : "text-foreground"} ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
