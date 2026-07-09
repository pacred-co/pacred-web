import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { getBatchDetail } from "@/actions/admin/withdraw-comm-batch";

/**
 * /admin/accounting/withdraw/comm-interpreter/[id] — Interpreter batch detail.
 *
 * READ-ONLY · MVP per brief §2. CREATE + PAY DEFERRED next sitting.
 */

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "สร้างแล้ว · รอแนบสลิป",
  "2": "รอจ่าย (slip uploaded)",
  "3": "จ่ายแล้ว",
};
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-slate-100 text-slate-700 border border-slate-300",
  "2": "bg-amber-50 text-amber-700 border border-amber-200",
  "3": "bg-green-50 text-green-700 border border-green-200",
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function AdminWithdrawCommInterpreterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Commission amounts (ก่อน WHT / WHT / รับสุทธิ) + ส่วนต่างหยวน (yuan margin
  // the commission derives from) = money-internal (owner 2026-06-18): only
  // ultra/accounting/pricing.
  const showMoney = canViewProfit(roles);
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const detail = await getBatchDetail("interpreter", id);
  if (!detail || detail.kind !== "interpreter") notFound();
  const { header, items, totals } = detail;

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/accounting/withdraw/comm-interpreter" />
      <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
        <nav className="text-xs text-muted">
          <Link href="/admin/accounting" className="hover:text-foreground">บัญชี</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting/withdraw/comm-interpreter" className="hover:text-foreground">เบิกค่าคอมล่าม</Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">#{header.id}</span>
        </nav>

        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Batch #{header.id} · {header.title || "(ไม่มีหัวข้อ)"}</h1>
            <p className="text-xs text-muted mt-1">
              สร้าง {fmtDate(header.date)} โดย {header.adminidcreate} · อัพเดต {fmtDate(header.dateupdate)} โดย {header.adminidupdate || "—"}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
            {STATUS_LABEL[header.status] ?? header.status}
          </span>
        </header>

        <section className={`grid gap-3 ${showMoney ? "sm:grid-cols-4" : "sm:grid-cols-1"}`}>
          <Stat label="ผู้รับเงิน (ล่าม)" value={header.adminid} mono />
          {showMoney && <Stat label="ค่าคอม (ก่อน WHT)" value={thb(header.commbefore)} small />}
          {showMoney && <Stat label="หัก WHT" value={thb(header.withholding)} small />}
          {showMoney && <Stat label="รับสุทธิ" value={thb(header.amount)} />}
        </section>

        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">🏦 ข้อมูลธนาคารผู้รับ</h2>
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted">ธนาคาร</p>
              <p className="mt-1 font-medium">{header.nameuserbank || "—"}</p>
            </div>
            <div>
              <p className="text-muted">เลขที่บัญชี</p>
              <p className="mt-1 font-mono">{header.nouserbank || "—"}</p>
            </div>
            <div>
              <p className="text-muted">บัญชีจ่าย (tb_account_pcs key)</p>
              <p className="mt-1 font-mono">{header.namebank || "—"}</p>
            </div>
          </div>
          {header.imagesslip && (
            <div className="mt-4 text-xs">
              <p className="text-muted">สลิปจ่ายเงิน</p>
              <p className="mt-1 font-mono break-all">{header.imagesslip}</p>
              <p className="text-[11px] text-muted mt-1">⚠️ Slip download เร็วๆ นี้</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-sm">📦 รายการ ฝากโอนหยวน ({totals.itemCount.toLocaleString("th-TH")})</h2>
            {showMoney && (
              <p className="text-xs text-muted">
                Σ ส่วนต่างหยวน <span className="font-mono font-bold text-primary-700">¥{totals.yuanMargin.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[700px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-orange-500 text-left text-[11px] uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-3 py-2">hno</th>
                    <th className="px-3 py-2">วันที่สั่งจ่าย</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    {showMoney && <th className="px-3 py-2 text-right">ส่วนต่างหยวน</th>}
                    <th className="px-3 py-2">hStatus</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/yuan-payments/${it.hno}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          {it.hno}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmtDate(it.order?.hdate ?? null)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{it.order?.userid ?? "—"}</td>
                      {showMoney && (
                        <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                          ¥{it.diffyaun.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-surface-alt text-foreground border border-border px-2 py-0.5 text-[11px]">
                          {it.order?.hstatus ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[11px] text-muted">
          📌 MVP read-only · CREATE + PAY DEFERRED — ต้อง ก๊อต co-sign + ดู legacy
          <code className="bg-surface-alt px-1 rounded ml-1">withdraw-commission-interpreter.php</code> ก่อน
        </p>
      </main>
    </>
  );
}

function Stat({ label, value, small, mono }: { label: string; value: string; small?: boolean; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold text-foreground ${mono ? "font-mono" : ""} ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
