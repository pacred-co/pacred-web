import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { getBatchDetail } from "@/actions/admin/withdraw-comm-batch";

/**
 * /admin/accounting/withdraw/comm-sale/[id] — Sales-rep batch detail.
 *
 * READ-ONLY · MVP per `docs/briefs/poom-wave-2026-06-01.md` §2. The slip upload
 * + pay action is DEFERRED next sitting (money-safe write needs ก๊อต co-sign).
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

export default async function AdminWithdrawCommSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Commission amounts (ก่อน WHT / WHT / รับสุทธิ / ค่าคอม 1%) = money-internal
  // (owner 2026-06-18): only ultra/accounting/pricing. Selling-price item columns
  // (ยอดขาย CHN / ส่วนลด / หลังหักลด) stay visible to all.
  const showMoney = canViewProfit(roles);
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const detail = await getBatchDetail("sale", id);
  if (!detail || detail.kind !== "sale") notFound();
  const { header, items, totals } = detail;

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/accounting/withdraw/comm-sale" />
      <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
        <nav className="text-xs text-muted">
          <Link href="/admin/accounting" className="hover:text-foreground">บัญชี</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting/withdraw/comm-sale" className="hover:text-foreground">เบิกค่าคอม Sales</Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">#{header.id}</span>
        </nav>

        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Batch #{header.id} · {header.title || "(ไม่มีหัวข้อ)"}</h1>
            <p className="text-xs text-muted mt-1">
              สร้างวันที่ {fmtDate(header.date)} โดย {header.adminidcreate} · อัพเดต {fmtDate(header.dateupdate)} โดย {header.adminidupdate || "—"}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
            {STATUS_LABEL[header.status] ?? header.status}
          </span>
        </header>

        {/* Money card — commission amounts only for cost-allowed viewers */}
        <section className={`grid gap-3 ${showMoney ? "sm:grid-cols-4" : "sm:grid-cols-1"}`}>
          <Stat label="ผู้รับเงิน (rep)" value={header.adminid} mono />
          {showMoney && <Stat label="ค่าคอม (ก่อน WHT)" value={thb(header.commbefore)} small />}
          {showMoney && <Stat label="หัก WHT" value={thb(header.withholding)} small />}
          {showMoney && <Stat label="รับสุทธิ" value={thb(header.amount)} />}
        </section>

        {/* Bank info */}
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
              <p className="text-[11px] text-muted mt-1">⚠️ Slip download/view เร็วๆ นี้ (storage path mapping)</p>
            </div>
          )}
        </section>

        {/* Items */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-sm">📦 รายการ forwarder ({totals.itemCount.toLocaleString("th-TH")})</h2>
            <p className="text-xs text-muted">
              Σ ยอดขาย CHN <span className="font-mono font-bold text-primary-700">{thb(totals.salePriceCHN)}</span>
              {showMoney && (
                <> · ค่าคอม 1% = <span className="font-mono font-bold">{thb(totals.salePriceCHN * 0.01)}</span></>
              )}
            </p>
          </div>
          {items.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[800px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-orange-500 text-left text-[11px] uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-3 py-2">Forwarder</th>
                    <th className="px-3 py-2">Tracking CHN</th>
                    <th className="px-3 py-2">วันที่สร้าง</th>
                    <th className="px-3 py-2 text-right">น้ำหนัก</th>
                    <th className="px-3 py-2 text-right">ปริมาตร</th>
                    <th className="px-3 py-2 text-right">ยอดขาย CHN</th>
                    <th className="px-3 py-2 text-right">ส่วนลด</th>
                    <th className="px-3 py-2 text-right">หลังหักลด</th>
                    <th className="px-3 py-2">fStatus</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/forwarders/${it.fid}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          #{it.fid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted whitespace-nowrap">
                        {it.forwarder?.ftrackingchn ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmtDate(it.forwarder?.fdate ?? null)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{it.forwarder ? it.forwarder.fweight.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{it.forwarder ? it.forwarder.fvolume.toFixed(5) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{it.forwarder ? thb(it.forwarder.ftotalprice) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted">{it.forwarder ? thb(it.forwarder.fdiscount) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                        {it.forwarder ? thb(it.forwarder.ftotalprice - it.forwarder.fdiscount) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-surface-alt text-foreground border border-border px-2 py-0.5 text-[11px]">
                          {it.forwarder?.fstatus ?? "—"}
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
          📌 MVP read-only (brief §2 · เก่า 0 Pacred reader) · CREATE batch + PAY slip DEFERRED — money-safe write ต้อง ก๊อต co-sign + ดู legacy
          <code className="bg-surface-alt px-1 rounded ml-1">withdraw-commission-sale.php</code> source ก่อน
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
